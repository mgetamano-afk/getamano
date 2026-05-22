import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

/**
 * CityAutocomplete — Google Places-powered city/state input.
 *
 * Section 18B. Waits for window.google.maps.places to load (loaded async from index.html),
 * falls back to plain text input if Google JS hasn't loaded yet (graceful degradation).
 *
 * Props:
 *   - value (string): initial display value (e.g. "Dallas, TX")
 *   - onSelect ({city, state, displayName, lat, lng}): fires when a place is chosen
 *   - placeholder (string)
 *   - testid (string)
 */
export default function CityAutocomplete({ value = "", onSelect, placeholder = "Ciudad, Estado", testid }) {
  const inputRef = useRef(null);
  const acRef = useRef(null);
  const [query, setQuery] = useState(value);
  const [ready, setReady] = useState(false);

  useEffect(() => { setQuery(value); }, [value]);

  // Wait for Google Maps to be loaded (it's async in index.html)
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      if (window.google?.maps?.places?.Autocomplete) {
        setReady(true);
      } else {
        setTimeout(check, 300);
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  // Attach Google Places Autocomplete once the library is ready
  useEffect(() => {
    if (!ready || !inputRef.current || acRef.current) return;
    try {
      acRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ["(cities)"],
        componentRestrictions: { country: "us" },
        fields: ["formatted_address", "geometry", "address_components", "name"],
      });
      acRef.current.addListener("place_changed", () => {
        const place = acRef.current.getPlace();
        if (!place || !place.geometry) return;
        const comps = place.address_components || [];
        const cityComp = comps.find(c => c.types.includes("locality"))
          || comps.find(c => c.types.includes("postal_town"))
          || comps.find(c => c.types.includes("sublocality"));
        const stateComp = comps.find(c => c.types.includes("administrative_area_level_1"));
        const city = cityComp?.long_name || place.name || "";
        const state = stateComp?.short_name || "";
        const lat = typeof place.geometry.location?.lat === "function" ? place.geometry.location.lat() : null;
        const lng = typeof place.geometry.location?.lng === "function" ? place.geometry.location.lng() : null;
        const displayName = city && state ? `${city}, ${state}` : (place.formatted_address || place.name || "");
        setQuery(displayName);
        if (onSelect) onSelect({ city, state, displayName, lat, lng });
      });
    } catch (e) {
      console.warn("CityAutocomplete init failed:", e);
    }
  }, [ready, onSelect]);

  return (
    <div className="relative">
      <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none text-sm"
        data-testid={testid}
      />
      {!ready && (
        <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 animate-spin" />
      )}
    </div>
  );
}
