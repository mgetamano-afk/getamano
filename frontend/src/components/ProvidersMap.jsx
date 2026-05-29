import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ShieldCheck, Star, MapPin as MapPinIcon, Search as SearchIcon } from "lucide-react";
import OwnerIdentityBadge from "./OwnerIdentityBadge";

// Custom teardrop marker in Scooter teal. Inline SVG so no asset fetch needed.
const buildMarkerIcon = ({ isLatino = false, isAmerican = false, highlighted = false } = {}) => {
  const accent = isLatino ? "#03045E" : isAmerican ? "#185FA5" : "#0077B6";
  const scale = highlighted ? 1.25 : 1;
  const w = Math.round(34 * scale);
  const h = Math.round(44 * scale);
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 34 44'>
      <defs>
        <filter id='s' x='-20%' y='-20%' width='140%' height='140%'>
          <feDropShadow dx='0' dy='${highlighted ? 3 : 1.5}' stdDeviation='${highlighted ? 2.5 : 1.2}' flood-color='#03045E' flood-opacity='${highlighted ? 0.5 : 0.35}'/>
        </filter>
      </defs>
      <path filter='url(#s)' fill='${accent}' stroke='${highlighted ? "#F59E0B" : "white"}' stroke-width='${highlighted ? 3 : 2}'
            d='M17 1 C 8 1 2 8 2 16 c 0 11 15 26 15 26 s 15 -15 15 -26 c 0 -8 -6 -15 -15 -15 z'/>
      <circle cx='17' cy='16' r='5' fill='white'/>
    </svg>`;
  return L.divIcon({
    className: `getamano-marker${highlighted ? " getamano-marker-active" : ""}`,
    html: svg,
    iconSize: [w, h],
    iconAnchor: [w / 2, h - 2],
    popupAnchor: [0, -h + 6],
  });
};

const FitToMarkers = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 12, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
  }, [map, points]);
  return null;
};

// Helper that pans to a marker when highlightedId changes externally (from list hover/click)
const PanToHighlighted = ({ points, highlightedId, openPopup }) => {
  const map = useMap();
  useEffect(() => {
    if (!highlightedId) return;
    const p = points.find(x => x.provider_id === highlightedId);
    if (!p) return;
    map.panTo([p.lat, p.lng], { animate: true, duration: 0.4 });
    if (openPopup) {
      // Wait for icon update then trigger popup
      setTimeout(() => openPopup(), 220);
    }
    // eslint-disable-next-line
  }, [highlightedId]);
  return null;
};

// Bridges map events to parent state. Used for the 'Buscar en esta zona' floating button.
const MapMoveBridge = ({ onMove }) => {
  const map = useMap();
  useEffect(() => {
    const handler = () => onMove(map);
    map.on("moveend zoomend", handler);
    return () => map.off("moveend zoomend", handler);
  }, [map, onMove]);
  return null;
};

export default function ProvidersMap({ providers, loading, highlightedId, onMarkerHover, onMarkerClick, onSearchArea, userPosition = null, radiusMiles = null }) {
  const markerRefs = useRef({});
  const lastFetchCenterRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [showSearchArea, setShowSearchArea] = useState(false);

  const items = useMemo(() => (providers || []).filter(p => p.lat != null && p.lng != null), [providers]);

  // Reset "search area" prompt when new providers arrive (parent re-fetched)
  useEffect(() => {
    if (mapInstanceRef.current) {
      lastFetchCenterRef.current = mapInstanceRef.current.getCenter();
    }
    setShowSearchArea(false);
  }, [providers]);

  const handleMapMove = (map) => {
    mapInstanceRef.current = map;
    if (!lastFetchCenterRef.current) {
      lastFetchCenterRef.current = map.getCenter();
      return;
    }
    const dist = map.getCenter().distanceTo(lastFetchCenterRef.current);
    const b = map.getBounds();
    const diag = b.getNorthEast().distanceTo(b.getSouthWest());
    const ratio = diag > 0 ? dist / diag : 0;
    // Show button when user has panned at least 15% of the visible diagonal
    setShowSearchArea(ratio > 0.15);
  };

  const triggerSearchArea = () => {
    if (!mapInstanceRef.current || !onSearchArea) return;
    const b = mapInstanceRef.current.getBounds();
    onSearchArea({
      min_lat: b.getSouth(),
      max_lat: b.getNorth(),
      min_lng: b.getWest(),
      max_lng: b.getEast(),
    });
    lastFetchCenterRef.current = mapInstanceRef.current.getCenter();
    setShowSearchArea(false);
  };

  const center = useMemo(() => {
    if (items.length > 0) return [items[0].lat, items[0].lng];
    return [39.8283, -98.5795];
  }, [items]);

  const openPopupForHighlighted = () => {
    if (!highlightedId) return;
    const ref = markerRefs.current[highlightedId];
    if (ref) ref.openPopup();
  };

  return (
    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "#BCC5CC" }} data-testid="providers-map-container">
      <div className="relative" style={{ height: "min(78vh, 760px)" }}>
        {loading && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none">
            <div className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: "rgba(247,246,242,0.92)", color: "#03045E", border: "1px solid #BCC5CC" }}>
              Cargando mapa…
            </div>
          </div>
        )}

        {items.length === 0 && !loading && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none">
            <div className="text-sm px-4 py-2 rounded-xl text-center" style={{ backgroundColor: "rgba(247,246,242,0.95)", color: "#03045E", border: "1px solid #BCC5CC" }} data-testid="map-empty-state">
              No hay proveedores con ubicación que coincidan con tus filtros.
            </div>
          </div>
        )}

        <MapContainer
          center={center}
          zoom={items.length > 0 ? 6 : 4}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
          attributionControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <FitToMarkers points={items} />
          <PanToHighlighted points={items} highlightedId={highlightedId} openPopup={openPopupForHighlighted} />

          {/* Section 18F — Coverage radius circle when "Cerca de mí" is active */}
          {userPosition && radiusMiles && (
            <>
              <Circle
                center={[userPosition.lat, userPosition.lng]}
                radius={radiusMiles * 1609.34 /* miles → meters */}
                pathOptions={{
                  color: "#03045E",
                  fillColor: "#0077B6",
                  fillOpacity: 0.10,
                  weight: 1.5,
                  dashArray: "6 4",
                }}
              />
              <CircleMarker
                center={[userPosition.lat, userPosition.lng]}
                radius={8}
                pathOptions={{
                  color: "#FFFFFF",
                  weight: 3,
                  fillColor: "#0077B6",
                  fillOpacity: 1,
                }}
              >
                <Tooltip permanent direction="top" offset={[0, -10]} className="getamano-user-tooltip">
                  Tú estás aquí · {radiusMiles} mi
                </Tooltip>
              </CircleMarker>
            </>
          )}

          {items.map(p => {
            const isHighlighted = highlightedId === p.provider_id;
            return (
              <Marker
                key={p.provider_id}
                position={[p.lat, p.lng]}
                icon={buildMarkerIcon({
                  isLatino: p.owner_identity === "latino",
                  isAmerican: p.owner_identity === "american",
                  highlighted: isHighlighted,
                })}
                zIndexOffset={isHighlighted ? 1000 : 0}
                ref={ref => { if (ref) markerRefs.current[p.provider_id] = ref; }}
                eventHandlers={{
                  click: () => onMarkerClick && onMarkerClick(p.provider_id),
                  mouseover: () => onMarkerHover && onMarkerHover(p.provider_id),
                  mouseout: () => onMarkerHover && onMarkerHover(null),
                }}
              >
                <Popup>
                  <div style={{ minWidth: 220 }} data-testid={`map-popup-${p.slug}`}>
                    {p.cover_url && (
                      <div className="w-full h-20 rounded-lg overflow-hidden mb-2" style={{ backgroundColor: "#F8FCFD" }}>
                        <img src={p.cover_url} alt={p.business_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    )}
                    <h4 className="font-display font-bold text-base mb-0.5" style={{ color: "#03045E" }}>{p.business_name}</h4>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                      <MapPinIcon className="w-3 h-3" /> {p.city}{p.state ? `, ${p.state}` : ""}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {p.verified && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#EBF8F7", color: "#03045E", border: "1px solid #A6E1DA" }}>
                          <ShieldCheck className="w-2.5 h-2.5" /> Verificado
                        </span>
                      )}
                      {p.rating_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: "#03045E" }}>
                          <Star className="w-3 h-3 fill-current" style={{ color: "#F59E0B" }} /> {Number(p.rating_avg).toFixed(1)}
                        </span>
                      )}
                      <OwnerIdentityBadge identity={p.owner_identity} size="sm" />
                    </div>
                    <Link
                      to={`/provider/${p.slug}`}
                      className="inline-block w-full text-center text-xs font-semibold px-3 py-1.5 rounded-full transition"
                      style={{ backgroundColor: "#0077B6", color: "white" }}
                      data-testid={`map-popup-cta-${p.slug}`}
                    >
                      Ver perfil
                    </Link>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {items.length > 0 && (
          <div className="absolute top-3 left-3 z-[400] text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(247,246,242,0.92)", color: "#03045E", border: "1px solid #BCC5CC" }} data-testid="map-count-badge">
            {items.length} {items.length === 1 ? "proveedor" : "proveedores"} en el mapa
          </div>
        )}

        {/* Floating 'Search this area' button — appears when user pans/zooms */}
        {showSearchArea && onSearchArea && (
          <button
            type="button"
            onClick={triggerSearchArea}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow-lg transition hover:scale-105"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#03045E",
              border: "1.5px solid #0077B6",
              boxShadow: "0 8px 24px -8px rgba(2,95,103,0.4)",
            }}
            data-testid="map-search-area-btn"
          >
            <SearchIcon className="w-4 h-4" />
            Buscar en esta zona
          </button>
        )}
      </div>
      <style>{`
        .leaflet-container { font-family: inherit; }
        .leaflet-popup-content-wrapper { border-radius: 14px; padding: 4px; }
        .leaflet-popup-content { margin: 10px 12px; line-height: 1.4; }
        .leaflet-popup-tip { background: white; }
        .getamano-marker { background: transparent !important; border: none !important; transition: transform 180ms ease; }
        .getamano-marker-active { z-index: 1000 !important; }
        .getamano-user-tooltip {
          background: #03045E !important;
          color: white !important;
          border: none !important;
          border-radius: 9999px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          padding: 3px 10px !important;
          box-shadow: 0 4px 12px -4px rgba(2,95,103,0.4) !important;
        }
        .getamano-user-tooltip::before { border-top-color: #03045E !important; }
      `}</style>
    </div>
  );
}
