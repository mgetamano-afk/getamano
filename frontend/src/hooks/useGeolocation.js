import { useCallback, useState } from "react";
import { toast } from "sonner";

/**
 * Section 18F — Browser geolocation + reverse mapping helper.
 * Returns { position, loading, error, requestLocation, clear }.
 *
 *   const { position, loading, requestLocation } = useGeolocation();
 *   <button onClick={requestLocation}>Cerca de mí</button>
 *   // position === { lat, lng, accuracy } or null
 */
export default function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Tu navegador no soporta geolocalización");
      return;
    }
    setLoading(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLoading(false);
      },
      (err) => {
        const msg = err.code === 1 ? "Permiso denegado. Activa la ubicación para ver proveedores cerca."
                   : err.code === 2 ? "No pudimos obtener tu ubicación."
                   : "Timeout obteniendo ubicación.";
        setError(msg);
        toast.error(msg);
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  const clear = () => { setPosition(null); setError(null); };

  return { position, loading, error, requestLocation, clear };
}
