import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X, Search as SearchIcon } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * CategoryTreePicker — Section 79 (hierarchical service picker).
 *
 * Bottom-sheet modal that walks the user through:
 *   1. Pick a SECTOR (top-level category — 14 emoji-coded buckets)
 *   2. Pick a SUBCATEGORY (the actual service to search for)
 *
 * Why a bottom sheet and not a dropdown?
 * ───────────────────────────────────────
 * Mobile-first. A dropdown with 14 sectors × ~13 children = 188 lines is
 * unusable on a phone. A sheet gives us 90vh of canvas, full-text search,
 * back navigation, and a tactile feel.
 *
 * Props
 * ─────
 *   open     : boolean       — whether to render the sheet
 *   onClose  : () => void
 *   onSelect : (subcategory) => void   // subcategory = {slug, name_es, emoji, ...}
 *   value    : string|null    — current selected slug (for visual checkmark)
 */
export default function CategoryTreePicker({ open, onClose, onSelect, value }) {
  const { lang } = useI18n();
  const [tree, setTree] = useState(null); // [] of sector nodes
  const [activeSector, setActiveSector] = useState(null); // sector object
  const [query, setQuery] = useState("");

  // Fetch the tree once when first opened
  useEffect(() => {
    if (!open || tree) return;
    let alive = true;
    api.get("/categories/tree")
      .then(r => { if (alive) setTree(r.data || []); })
      .catch(() => { if (alive) setTree([]); });
    return () => { alive = false; };
  }, [open, tree]);

  // Reset deep navigation each time the sheet opens
  useEffect(() => {
    if (open) {
      setActiveSector(null);
      setQuery("");
    }
  }, [open]);

  // Flatten subcategories for search (across all sectors)
  const flatChildren = useMemo(() => {
    if (!tree) return [];
    return tree.flatMap(s => s.children.map(c => ({ ...c, sector: s.sector, sectorLabel: s.label_es, sectorEmoji: s.emoji })));
  }, [tree]);

  const searching = query.trim().length >= 2;
  const filteredChildren = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    return flatChildren
      .filter(c =>
        (c.name_es || "").toLowerCase().includes(q) ||
        (c.name_en || "").toLowerCase().includes(q) ||
        (c.slug || "").toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [searching, query, flatChildren]);

  if (!open) return null;

  const pick = (sub) => {
    onSelect?.(sub);
    onClose?.();
  };

  return createPortal((
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/55"
      onClick={onClose}
      data-testid="category-tree-picker"
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
          {activeSector ? (
            <button
              type="button"
              onClick={() => setActiveSector(null)}
              className="w-9 h-9 -ml-1 rounded-full hover:bg-slate-100 flex items-center justify-center"
              aria-label={lang === "en" ? "Back" : "Volver"}
              data-testid="category-picker-back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : null}
          <h2 className="font-display text-lg font-bold text-slate-900 flex-1 truncate">
            {activeSector ? `${activeSector.emoji} ${activeSector.label_es}` : (lang === "en" ? "What service?" : "¿Qué servicio?")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center"
            aria-label="Close"
            data-testid="category-picker-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang === "en" ? "Search services…" : "Busca servicios…"}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              data-testid="category-picker-search"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" data-testid="category-picker-body">
          {tree === null && (
            <div className="px-4 py-10 text-center text-slate-400 text-sm">
              {lang === "en" ? "Loading services…" : "Cargando servicios…"}
            </div>
          )}

          {/* Full-text search results — across all sectors */}
          {searching && (
            <ul className="px-2 py-2">
              {filteredChildren.length === 0 ? (
                <li className="px-3 py-8 text-center text-slate-400 text-sm">
                  {lang === "en" ? "No matches." : "Sin coincidencias."}
                </li>
              ) : filteredChildren.map(sub => (
                <SubRow key={sub.slug} sub={sub} selected={sub.slug === value} onClick={() => pick(sub)} showSector />
              ))}
            </ul>
          )}

          {/* Sector list (default view) */}
          {!searching && !activeSector && Array.isArray(tree) && (
            <ul className="px-2 py-2" data-testid="category-picker-sector-list">
              {tree.map(s => (
                <li key={s.sector}>
                  <button
                    type="button"
                    onClick={() => setActiveSector(s)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition text-left"
                    data-testid={`category-picker-sector-${s.sector}`}
                  >
                    <span
                      className="flex items-center justify-center w-12 h-12 rounded-2xl text-2xl shadow-sm"
                      style={{ backgroundColor: `${s.color}15` }}
                    >
                      {s.emoji}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-slate-900 truncate">{s.label_es}</span>
                      <span className="block text-xs text-slate-500">{s.count} {lang === "en" ? "services" : "servicios"}</span>
                    </span>
                    <ChevronLeft className="w-4 h-4 text-slate-400 rotate-180" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Subcategory list (inside a sector) */}
          {!searching && activeSector && (
            <ul className="px-2 py-2" data-testid="category-picker-sub-list">
              {activeSector.children.map(sub => (
                <SubRow key={sub.slug} sub={sub} selected={sub.slug === value} onClick={() => pick(sub)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

function SubRow({ sub, selected, onClick, showSector }) {
  const license = sub.license_flag || "green";
  const licColor = license === "red" ? "bg-rose-500" : license === "yellow" ? "bg-amber-400" : "bg-emerald-500";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${selected ? "bg-teal-50 ring-1 ring-teal-200" : "hover:bg-slate-50"}`}
        data-testid={`category-picker-sub-${sub.slug}`}
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 text-lg">
          {sub.emoji}
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block font-medium text-sm truncate ${selected ? "text-teal-700" : "text-slate-900"}`}>{sub.name_es}</span>
          {showSector && (
            <span className="block text-[11px] text-slate-400 truncate">{sub.sectorEmoji} {sub.sectorLabel}</span>
          )}
        </span>
        <span className={`w-2 h-2 rounded-full ${licColor}`} title={license} aria-hidden="true" />
      </button>
    </li>
  );
}
