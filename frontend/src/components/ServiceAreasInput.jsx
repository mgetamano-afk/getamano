import { useState, useRef, useEffect } from "react";
import { MapPin, X, Loader2, Plus, Search } from "lucide-react";
import useCitySearch from "../hooks/useCitySearch";

/**
 * ServiceAreasInput — Section 53.
 *
 * Reemplaza el viejo input de texto libre "Sallisaw OK, Muldrow OK..." con
 * autocompletado inteligente:
 *  - El proveedor escribe "Sall..." → aparecen ciudades reales del estado/país
 *  - Selecciona una → se añade como chip (formato "Ciudad, ST")
 *  - Click en X para quitar una zona
 *  - Persiste el array como antes (strings tipo "Sallisaw, OK")
 *
 * Props:
 *   value:        string[]  · zonas actuales ej. ["Sallisaw, OK", "Muldrow, OK"]
 *   onChange:     (string[]) => void
 *   stateFilter:  string?   · estado del proveedor para priorizar resultados
 *   stateName:    string?   · nombre completo del estado
 *   max:          number?   · máximo de zonas (default 15)
 *   testid:       string?
 */
export default function ServiceAreasInput({
  value = [],
  onChange,
  stateFilter,
  stateName,
  max = 15,
  testid = "service-areas-input",
}) {
  const { query, handleQueryChange, results, loading, clear, isFallback } = useCitySearch(stateName);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const addZone = (label) => {
    const v = (label || "").trim();
    if (!v) return;
    if (value.includes(v)) return;
    if (value.length >= max) return;
    onChange([...value, v]);
    handleQueryChange("");
    clear();
    inputRef.current?.focus();
  };

  const handleSelect = (result) => {
    const label = `${result.city}, ${result.stateAbbr || result.state || ""}`.replace(/, $/, "");
    addZone(label);
  };

  const handleManualAdd = () => {
    // Permite agregar manualmente si el resultado no aparece (fallback)
    if (query.trim().length >= 2) {
      addZone(query.trim());
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0) handleSelect(results[0]);
      else handleManualAdd();
    } else if (e.key === "Backspace" && !query && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (idx) => onChange(value.filter((_, i) => i !== idx));

  const showDropdown = isFocused && (results.length > 0 || (query.length >= 2 && !loading));

  return (
    <div className="relative" ref={wrapRef} data-testid={testid}>
      {/* Chips de zonas seleccionadas */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2" data-testid={`${testid}-chips`}>
          {value.map((zone, i) => (
            <span
              key={`${zone}-${i}`}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-teal-50 text-teal-800 text-sm border border-teal-100"
              data-testid={`${testid}-chip-${i}`}
            >
              <MapPin className="w-3 h-3" />
              {zone}
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-0.5 w-5 h-5 rounded-full hover:bg-teal-200 flex items-center justify-center"
                data-testid={`${testid}-chip-remove-${i}`}
                aria-label={`Quitar ${zone}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input con autocompletado */}
      <div
        className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-white transition-all ${
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
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={onKey}
          placeholder={
            value.length >= max
              ? `Máximo ${max} zonas alcanzado`
              : value.length === 0
                ? "Busca una ciudad (ej. Sallisaw, OK)..."
                : "Añadir otra ciudad..."
          }
          disabled={value.length >= max}
          className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent outline-none min-w-0 disabled:bg-transparent disabled:cursor-not-allowed"
          autoComplete="off"
          data-testid={`${testid}-field`}
        />
        {query.length >= 2 && (
          <button
            type="button"
            onClick={handleManualAdd}
            className="flex-shrink-0 text-xs text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
            data-testid={`${testid}-manual-add`}
          >
            <Plus className="w-3 h-3" /> Añadir
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-1">
        {value.length}/{max} zonas · escribe el nombre y selecciona de la lista
      </p>

      {showDropdown && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden max-h-72 overflow-y-auto"
          data-testid={`${testid}-dropdown`}
        >
          {results.length > 0 ? (
            <ul>
              {results.map((result, idx) => {
                const label = `${result.city}, ${result.stateAbbr || result.state || ""}`.replace(/, $/, "");
                const alreadyAdded = value.includes(label);
                return (
                  <li key={`${result.city}-${idx}`}>
                    <button
                      type="button"
                      disabled={alreadyAdded}
                      onMouseDown={(e) => { e.preventDefault(); handleSelect(result); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        alreadyAdded ? "opacity-50 cursor-not-allowed bg-slate-50" : "hover:bg-teal-50"
                      }`}
                      data-testid={`${testid}-result-${idx}`}
                    >
                      <MapPin className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-900 flex-1">{result.city}</span>
                      <span className="text-sm text-slate-400">{result.stateAbbr}</span>
                      {alreadyAdded && <span className="text-[10px] text-teal-600 font-semibold">✓ Añadida</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">
              No encontramos "{query}" — toca <strong>Añadir</strong> para guardarla como está.
            </div>
          )}
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
