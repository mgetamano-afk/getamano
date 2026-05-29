import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, Plus } from "lucide-react";
import { buildFileUrl } from "./ImageUpload";

const CATEGORY_LABELS = {
  trabajo_terminado: "Trabajo terminado",
  antes_despues: "Antes y después",
  equipo: "Mi equipo",
  herramientas: "Mis herramientas",
  negocio: "Mi negocio / local",
  otro: "Otro",
};

/**
 * Public gallery grid: 3 cols × 9 visible. Last visible cell shows "+N more" when overflow.
 * If the provider tagged at least one photo with a category, a tab bar appears to filter.
 * Lightbox supports arrow navigation (mouse + keyboard).
 */
export default function GalleryGrid({ items = [], testid = "gallery-grid" }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [filter, setFilter] = useState("all");

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [items]
  );

  // Unique categories present (preserve display order from CATEGORY_LABELS)
  const presentCategories = useMemo(() => {
    const set = new Set(sorted.map(g => g.category).filter(Boolean));
    return Object.keys(CATEGORY_LABELS).filter(k => set.has(k));
  }, [sorted]);

  const filtered = useMemo(
    () => filter === "all" ? sorted : sorted.filter(g => g.category === filter),
    [sorted, filter]
  );

  const visibleCount = 9;
  const visible = filtered.slice(0, visibleCount);
  const overflow = Math.max(0, filtered.length - visibleCount);

  const openAt = (i) => { setIdx(i); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") setIdx(i => (i - 1 + filtered.length) % filtered.length);
      if (e.key === "ArrowRight") setIdx(i => (i + 1) % filtered.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered.length]);

  if (sorted.length === 0) return null;

  return (
    <>
      {presentCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4" data-testid={`${testid}-filters`}>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${filter === "all" ? "text-white" : "text-slate-700 bg-white hover:bg-slate-50"}`}
            style={{
              borderColor: filter === "all" ? "#03045E" : "#BCC5CC",
              backgroundColor: filter === "all" ? "#03045E" : undefined,
            }}
            data-testid={`${testid}-filter-all`}
          >
            Todas ({sorted.length})
          </button>
          {presentCategories.map(cat => {
            const count = sorted.filter(g => g.category === cat).length;
            const active = filter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${active ? "text-white" : "text-slate-700 bg-white hover:bg-slate-50"}`}
                style={{
                  borderColor: active ? "#03045E" : "#BCC5CC",
                  backgroundColor: active ? "#03045E" : undefined,
                }}
                data-testid={`${testid}-filter-${cat}`}
              >
                {CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2" data-testid={testid}>
        {visible.map((g, i) => {
          const isLastVisible = i === visibleCount - 1 && overflow > 0;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => openAt(i)}
              className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 hover:opacity-95 transition group"
              data-testid={`${testid}-thumb-${i}`}
            >
              <img src={buildFileUrl(g.url)} alt={g.caption || ""} className="absolute inset-0 w-full h-full object-cover" />
              {isLastVisible && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white" data-testid={`${testid}-overflow`}>
                  <Plus className="w-6 h-6 mb-1" />
                  <span className="text-sm font-semibold">Ver {overflow} foto{overflow > 1 ? "s" : ""} más</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {open && filtered[idx] && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          data-testid={`${testid}-lightbox`}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            data-testid={`${testid}-close`}
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>

          {filtered.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx((idx - 1 + filtered.length) % filtered.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                data-testid={`${testid}-prev`}
                aria-label="Anterior"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx((idx + 1) % filtered.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                data-testid={`${testid}-next`}
                aria-label="Siguiente"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <div className="max-w-5xl max-h-full" onClick={e => e.stopPropagation()}>
            <img
              src={buildFileUrl(filtered[idx].url)}
              alt={filtered[idx].caption || ""}
              className="max-w-full max-h-[85vh] rounded-2xl object-contain"
            />
            <div className="mt-3 text-center text-white/80 text-sm">
              {idx + 1} / {filtered.length}
              {filtered[idx].caption && <span className="ml-3 italic">{filtered[idx].caption}</span>}
              {filtered[idx].category && CATEGORY_LABELS[filtered[idx].category] && (
                <span className="ml-3 px-2 py-0.5 rounded-full bg-white/15 text-white/90 text-xs">
                  {CATEGORY_LABELS[filtered[idx].category]}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
