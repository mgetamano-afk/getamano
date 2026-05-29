import { useRef, useState } from "react";
import { Search, MapPin, X, Loader2, Navigation } from "lucide-react";
import useCitySearch from "../hooks/useCitySearch";
import { getCitiesByState } from "../data/usLocations";

// Top-5 latino-population US cities, used as the chip set when the input
// has no state filter (e.g. on the public /buscar page).
const TOP_US_CITIES = [
  { city: "Houston", state: "Texas", stateAbbr: "TX" },
  { city: "Los Angeles", state: "California", stateAbbr: "CA" },
  { city: "Miami", state: "Florida", stateAbbr: "FL" },
  { city: "New York City", state: "New York", stateAbbr: "NY" },
  { city: "Chicago", state: "Illinois", stateAbbr: "IL" },
];

/**
 * CitySearchInput — Section 42.
 *
 * Reemplaza el viejo `<select>` de ciudad con búsqueda inteligente:
 *  · escribe "Tul" → aparece "Tulsa, OK" (Google Places, debounced 300ms)
 *  · si no escribió nada y hay estado seleccionado → chips de ciudades populares del estado
 *  · si no escribió nada y NO hay estado → chips de top 5 US (Houston, LA, Miami, NYC, Chicago)
 *  · si Google Places falla → fallback al listado estático
 *
 * Props:
 *   stateFilter  string?  · abreviación del estado (ej. "OK") — opcional
 *   stateName    string?  · nombre completo (ej. "Oklahoma") — opcional
 *   value        string   · ciudad actual
 *   onChange     (city, stateName, stateAbbr) => void
 *   placeholder  string?  · opcional
 *   showConfirm  boolean? · si false, no renderiza el chip de confirmación (caso /buscar)
 *   compact      boolean? · si true, oculta el label "Ciudades populares" arriba
 */
export default function CitySearchInput({
  stateFilter,
  stateName,
  value,
  onChange,
  placeholder,
  compact = false,
  onUseGeolocation,
  geoActive = false,
  geoLoading = false,
}) {
  const { query, handleQueryChange, results, loading, clear, isFallback } = useCitySearch(stateName);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  // Chips: if a state filter is provided show ciudades populares del estado,
  // otherwise fall back to the top-5 US latino cities so the user still has
  // a fast-path to common destinations on /buscar.
  const popularCities = stateFilter
    ? getCitiesByState(stateFilter)
        .slice(0, 8)
        .map((city) => ({ city, state: stateName || "", stateAbbr: stateFilter }))
    : TOP_US_CITIES;
  const popularLabel = stateFilter
    ? `Ciudades populares${stateName ? ` en ${stateName}` : ""}`
    : "Ciudades populares en USA";

  const handleSelect = (result) => {
    onChange(result.city, result.state, result.stateAbbr);
    clear();
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onChange("", stateName || "", stateFilter || "");
    clear();
    inputRef.current?.focus();
  };

  const showDropdown =
    isFocused &&
    (results.length > 0 ||
      (query.length === 0 && (popularCities.length > 0 || onUseGeolocation)));
  const showEmpty = isFocused && query.length >= 2 && !loading && results.length === 0;

  const handleGeolocationClick = () => {
    if (!onUseGeolocation || geoLoading) return;
    onUseGeolocation();
    setIsFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full" data-testid="city-search-input">
      <div
        className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-white transition-all duration-150 ${
          isFocused ? "border-teal-600 ring-2 ring-teal-600/20" : "border-slate-200"
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 text-teal-500 animate-spin flex-shrink-0" />
        ) : (
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={value && !isFocused ? value : query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder={
            placeholder ||
            (stateName ? `Busca ciudad o pueblo en ${stateName}...` : "Busca tu ciudad o pueblo...")
          }
          className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent outline-none min-w-0"
          autoComplete="off"
          data-testid="city-search-input-field"
        />
        {(value || query) && (
          <button
            type="button"
            onClick={handleClear}
            className="text-slate-400 hover:text-slate-600 flex-shrink-0"
            aria-label="Limpiar"
            data-testid="city-search-clear"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden"
          data-testid="city-search-dropdown"
        >
          {/* Geolocation chip — shown only when no query yet, as the primary CTA */}
          {query.length === 0 && onUseGeolocation && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleGeolocationClick(); }}
              disabled={geoLoading}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b border-slate-100 ${
                geoActive
                  ? "bg-teal-50 hover:bg-teal-100"
                  : "hover:bg-teal-50"
              } disabled:opacity-60`}
              data-testid="city-near-me"
              aria-label="Usar mi ubicación"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: geoActive ? "#03045E" : "#E1F5EE" }}
              >
                {geoLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: geoActive ? "white" : "#03045E" }} />
                ) : (
                  <Navigation className="w-3.5 h-3.5" style={{ color: geoActive ? "white" : "#03045E" }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#03045E" }}>
                  Cerca de mí
                </p>
                <p className="text-[11px] text-slate-500">
                  {geoActive ? "Ubicación activa — toca para refrescar" : "Encuentra proveedores en tu zona"}
                </p>
              </div>
              {geoActive && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">ON</span>
              )}
            </button>
          )}

          {results.length > 0 && (
            <ul>
              {results.map((result, idx) => (
                <li key={`${result.city}-${idx}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(result); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-teal-50 transition-colors text-left"
                    data-testid={`city-result-${idx}`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-900">{result.city}</span>
                    <span className="text-sm text-slate-400">{result.stateAbbr}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {query.length === 0 && popularCities.length > 0 && (
            <div className="px-4 py-3">
              {!compact && (
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-2">
                  {popularLabel}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {popularCities.map((entry) => (
                  <button
                    key={`${entry.city}-${entry.stateAbbr}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect({
                        city: entry.city,
                        state: entry.state,
                        stateAbbr: entry.stateAbbr,
                        fullLabel: `${entry.city}, ${entry.stateAbbr}`,
                      });
                    }}
                    className="text-xs bg-slate-100 hover:bg-teal-100 hover:text-teal-700 text-slate-600 px-2.5 py-1 rounded-full transition-colors"
                    data-testid={`city-popular-${entry.city.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                  >
                    {entry.city}{!stateFilter && entry.stateAbbr ? `, ${entry.stateAbbr}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showEmpty && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 px-4 py-3 text-sm text-slate-400 text-center" data-testid="city-search-empty">
          No encontramos "{query}" — prueba con otro nombre
        </div>
      )}

      {isFallback && stateName && (
        <p className="text-[10px] text-amber-600 mt-1">
          Modo offline — sólo ciudades populares de {stateName}
        </p>
      )}
    </div>
  );
}
