import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * SmartServiceSearch — fuzzy + synonym-aware autocomplete.
 *
 * Section 27 requirements:
 *   • As the user types, hits /api/search/autocomplete with 200ms debounce
 *   • Shows up to 8 matching canonical service names in a dropdown
 *   • Matches "limpesa" → Limpieza, "plumer" → Plomería, etc.
 *   • Bilingual: shows ES label primarily, EN below in small text
 *   • Arrow keys + Enter navigate the dropdown
 *   • Clear (X) button when there's text
 *   • Falls back gracefully if backend is offline
 *
 * Props:
 *   value, onChange       — controlled input
 *   onSelect(match)       — called when user picks a dropdown item or hits Enter
 *   onSubmit(q)           — called when user hits Enter with no selection (free-text search)
 *   placeholder?
 *   testid?               — prefix for data-testids (default: "smart-service-search")
 */
const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

export default function SmartServiceSearch({
  value,
  onChange,
  onSelect,
  onSubmit,
  placeholder,
  testid = "smart-service-search",
  autoFocus = false,
  className = "",
}) {
  const { lang } = useI18n();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const T = lang === "en" ? {
    placeholder: placeholder || "What service do you need?",
    noResults: "No matches — try a different word.",
    clear: "Clear",
  } : {
    placeholder: placeholder || "¿Qué servicio necesitas?",
    noResults: "Sin coincidencias — intenta con otra palabra.",
    clear: "Limpiar",
  };

  // Debounced fetch
  useEffect(() => {
    if (!value || value.trim().length < MIN_CHARS) {
      setMatches([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await api.get("/search/autocomplete", { params: { q: value, lang } });
        setMatches(r.data?.matches || []);
      } catch (_e) {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, lang]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Keyboard nav
  const onKeyDown = (e) => {
    if (!open || matches.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit?.(value);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && matches[activeIdx]) {
        pick(matches[activeIdx]);
      } else {
        onSubmit?.(value);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const pick = (match) => {
    setOpen(false);
    setActiveIdx(-1);
    onSelect?.(match);
  };

  const clear = () => {
    onChange?.("");
    setMatches([]);
    inputRef.current?.focus();
  };

  const hasMatches = matches.length > 0;
  const showDropdown = open && (loading || hasMatches);

  return (
    <div ref={wrapRef} className={`relative ${className}`} data-testid={testid}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          autoFocus={autoFocus}
          value={value || ""}
          onChange={(e) => { onChange?.(e.target.value); setOpen(true); setActiveIdx(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={T.placeholder}
          autoComplete="off"
          spellCheck={false}
          className="w-full h-12 pl-12 pr-12 rounded-2xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-[15px] transition"
          data-testid={`${testid}-input`}
        />
        {loading && (
          <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 animate-spin" />
        )}
        {value && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-slate-100 transition"
            aria-label={T.clear}
            data-testid={`${testid}-clear`}
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      {showDropdown && (
        <ul
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-2 max-h-80 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl scroll-touch animate-in fade-in slide-in-from-top-1"
          data-testid={`${testid}-dropdown`}
        >
          {hasMatches ? matches.map((m, i) => {
            const primary = lang === "en" ? (m.label_en || m.label) : m.label;
            const secondary = lang === "en" ? m.label : m.label_en;
            const showSecondary = secondary && secondary !== primary;
            return (
              <li key={`${m.label}-${i}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault() /* avoid losing focus before click */}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => pick(m)}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition ${activeIdx === i ? "bg-teal-50" : "hover:bg-slate-50"}`}
                  data-testid={`${testid}-item-${i}`}
                  role="option"
                  aria-selected={activeIdx === i}
                >
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-slate-900 truncate">{primary}</span>
                    {showSecondary && <span className="text-xs text-slate-500 truncate">{secondary}</span>}
                  </span>
                  <Search className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                </button>
              </li>
            );
          }) : (
            <li className="px-4 py-3 text-sm text-slate-500" data-testid={`${testid}-empty`}>{T.noResults}</li>
          )}
        </ul>
      )}
    </div>
  );
}
