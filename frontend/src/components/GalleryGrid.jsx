import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, Plus } from "lucide-react";
import { buildFileUrl } from "./ImageUpload";

/**
 * Public gallery grid: 3 cols × 9 visible. Last cell shows "+N more" when overflow.
 * Lightbox supports arrow navigation (mouse + keyboard).
 */
export default function GalleryGrid({ items = [], testid = "gallery-grid" }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const sorted = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const visibleCount = 9;
  const visible = sorted.slice(0, visibleCount);
  const overflow = Math.max(0, sorted.length - visibleCount);

  const openAt = (i) => { setIdx(i); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") setIdx(i => (i - 1 + sorted.length) % sorted.length);
      if (e.key === "ArrowRight") setIdx(i => (i + 1) % sorted.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sorted.length]);

  if (sorted.length === 0) return null;

  return (
    <>
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

      {open && (
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

          {sorted.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx((idx - 1 + sorted.length) % sorted.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                data-testid={`${testid}-prev`}
                aria-label="Anterior"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx((idx + 1) % sorted.length); }}
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
              src={buildFileUrl(sorted[idx].url)}
              alt={sorted[idx].caption || ""}
              className="max-w-full max-h-[85vh] rounded-2xl object-contain"
            />
            <div className="mt-3 text-center text-white/80 text-sm">
              {idx + 1} / {sorted.length}
              {sorted[idx].caption && <span className="ml-3 italic">{sorted[idx].caption}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
