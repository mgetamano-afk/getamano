import { useRef, useState } from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import useCitySearch from "../hooks/useCitySearch";
import { getCitiesByState } from "../data/usLocations";

/**
 * CitySearchInput — Section 42.
 *
 * Reemplaza el viejo `<select>` de ciudad con búsqueda inteligente:
 *  · escribe "Tul" → aparece "Tulsa, OK" (Google Places, debounced 300ms)
 *  · si no escribió nada y hay estado seleccionado → chips de ciudades populares
 *  · si Google Places falla → fallback al listado estático
 *
 * Props:
 *   stateFilter  string  · abreviación del estado (ej. "OK")
 *   stateName    string  · nombre completo del estado (ej. "Oklahoma")
 *   value        string  · ciudad actual
 *   onChange     (city, stateName, stateAbbr) => void
 *   placeholder  string  · opcional
 */
export default function CitySearchInput({
  stateFilter,
  stateName,
  value,
  onChange,
  placeholder,
}) {
  const { query, handleQueryChange, results, loading, clear, isFallback } = useCitySearch(stateName);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  const popularCities = stateFilter ? getCitiesByState(stateFilter).slice(0, 8) : [];

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
    isFocused && (results.length > 0 || (query.length === 0 && popularCities.length > 0));
  const showEmpty = isFocused && query.length >= 2 && !loading && results.length === 0;

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
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-2">
                Ciudades populares{stateName ? ` en ${stateName}` : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {popularCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect({
                        city,
                        state: stateName || "",
                        stateAbbr: stateFilter || "",
                        fullLabel: `${city}, ${stateFilter || ""}`,
                      });
                    }}
                    className="text-xs bg-slate-100 hover:bg-teal-100 hover:text-teal-700 text-slate-600 px-2.5 py-1 rounded-full transition-colors"
                    data-testid={`city-popular-${city.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                  >
                    {city}
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
