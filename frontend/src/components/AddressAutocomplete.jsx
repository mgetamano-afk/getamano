import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";

// Uses OpenStreetMap Nominatim (free, no API key required).
// Restricted to United States. Debounced.
export default function AddressAutocomplete({ value, onSelect, placeholder = "Buscar dirección...", testid }) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const search = (q) => {
    if (q.length < 3) { setResults([]); return; }
    setLoading(true);
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&countrycodes=us&limit=5`, {
      headers: { "Accept": "application/json" }
    })
      .then(r => r.json())
      .then(data => { setResults(data); setOpen(true); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const onChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 400);
  };

  const pick = (r) => {
    const a = r.address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    onSelect({
      address: street || r.display_name.split(",")[0],
      city: a.city || a.town || a.village || a.hamlet || "",
      state: a.state_code || a.state || "",
      zip_code: a.postcode || "",
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      full: r.display_name,
    });
    setQuery(street || r.display_name.split(",")[0]);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex items-center gap-2 px-3 rounded-xl border border-slate-200 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 bg-white">
        <MapPin className="w-4 h-4 text-slate-400" />
        <input
          value={query}
          onChange={onChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full h-12 outline-none"
          data-testid={testid || "address-autocomplete-input"}
          autoComplete="off"
        />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-auto" data-testid="address-results-list">
          {results.map(r => (
            <li key={r.place_id}>
              <button type="button" onClick={() => pick(r)} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0" data-testid={`address-result-${r.place_id}`}>
                <div className="text-sm font-medium text-slate-900 truncate">{r.display_name.split(",").slice(0, 2).join(", ")}</div>
                <div className="text-xs text-slate-500 truncate">{r.display_name}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
