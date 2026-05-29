import { useEffect, useState, useRef } from "react";
import { Plus, X, Loader2, Image as ImageIcon, GripVertical } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { toast } from "sonner";

const MAX_ITEMS = 12;

/**
 * Portfolio — Section 89 v4.
 *
 * Two modes:
 *   · editable (dashboard) — own provider can add/remove/reorder up to 12 photos.
 *   · readOnly (public eCard) — receives `items` from parent and renders a grid only.
 *
 * Server contract:
 *   GET    /api/providers/me/portfolio
 *   POST   /api/providers/me/portfolio          { image_url, caption? }
 *   PATCH  /api/providers/me/portfolio/{id}     { caption?, sort_order? }
 *   DELETE /api/providers/me/portfolio/{id}
 *
 * Image upload reuses the existing /api/upload endpoint (returns
 * `{ url: "/api/files/<id>" }`).
 *
 * Note on drag-and-drop: we keep this MVP simple with up-arrow / down-arrow
 * buttons. HTML5 drag-and-drop is flaky on touch devices; arrow buttons
 * are universally accessible.
 */
export default function Portfolio({ readOnly = false, items: itemsProp = null }) {
  const { lang } = useI18n();
  const [items, setItems] = useState(itemsProp || []);
  const [loading, setLoading] = useState(!readOnly);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (readOnly && itemsProp !== null) {
      setItems(itemsProp);
      return;
    }
    if (readOnly) return;
    let alive = true;
    api.get("/providers/me/portfolio")
      .then(r => { if (alive) { setItems(r.data || []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [readOnly, itemsProp]);

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error(lang === "en" ? "Max 8MB" : "Máx 8MB");
      return;
    }
    if (items.length >= MAX_ITEMS) {
      toast.error(lang === "en" ? `Max ${MAX_ITEMS} photos` : `Máx ${MAX_ITEMS} fotos`);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const upRes = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const image_url = upRes.data.url;
      const { data: newItem } = await api.post("/providers/me/portfolio", { image_url });
      setItems(prev => [...prev, newItem]);
      toast.success(lang === "en" ? "Photo added" : "Foto agregada");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id) => {
    const prev = items;
    setItems(prev.filter(it => it.id !== id));  // optimistic
    try {
      await api.delete(`/providers/me/portfolio/${id}`);
      toast.success(lang === "en" ? "Photo removed" : "Foto eliminada");
    } catch (err) {
      setItems(prev);
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  const reorder = async (id, direction) => {
    const idx = items.findIndex(it => it.id === id);
    const newIdx = idx + (direction === "up" ? -1 : 1);
    if (newIdx < 0 || newIdx >= items.length) return;
    const swapped = [...items];
    [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];
    setItems(swapped);  // optimistic
    try {
      await Promise.all(swapped.map((it, i) =>
        i === idx || i === newIdx
          ? api.patch(`/providers/me/portfolio/${it.id}`, { sort_order: i })
          : null
      ).filter(Boolean));
    } catch (err) {
      toast.error("Reorder failed");
    }
  };

  // ─── Read-only grid (public eCard) ──────────────────────────────
  if (readOnly) {
    if (!items || items.length === 0) return null;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="portfolio-grid">
        {items.map(it => (
          <a
            key={it.id}
            href={it.image_url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group"
            data-testid={`portfolio-item-${it.id}`}
          >
            <img
              src={it.image_url}
              alt={it.caption || "Portfolio photo"}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {it.caption && (
              <span
                className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-white truncate"
                style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.6), transparent)" }}
              >
                {it.caption}
              </span>
            )}
          </a>
        ))}
      </div>
    );
  }

  // ─── Editable grid (dashboard) ──────────────────────────────────
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5" data-testid="portfolio-editor">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-bold text-[#03045E] text-lg">
            {lang === "en" ? "Portfolio" : "Portafolio"}
          </h3>
          <p className="text-xs text-slate-500">
            {items.length} / {MAX_ITEMS} {lang === "en" ? "photos" : "fotos"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || items.length >= MAX_ITEMS}
          className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-white text-sm font-bold transition active:scale-95 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #0077B6 0%, #00B4D8 100%)" }}
          data-testid="portfolio-add-btn"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {uploading
            ? (lang === "en" ? "Uploading…" : "Subiendo…")
            : (lang === "en" ? "Add photo" : "Agregar foto")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files?.[0])}
          data-testid="portfolio-file-input"
        />
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#0077B6]" />
        </div>
      ) : items.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full py-10 rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#0077B6] hover:bg-[#F0F9FF] active:scale-[0.99] transition flex flex-col items-center justify-center text-slate-400 hover:text-[#0077B6]"
          data-testid="portfolio-empty-state"
        >
          <ImageIcon className="w-10 h-10 mb-2" />
          <p className="text-sm font-semibold">
            {lang === "en" ? "Add your first photo" : "Agrega tu primera foto"}
          </p>
          <p className="text-xs mt-1">
            {lang === "en" ? `Showcase up to ${MAX_ITEMS} of your best works` : `Muestra hasta ${MAX_ITEMS} de tus mejores trabajos`}
          </p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="portfolio-grid-edit">
          {items.map((it, i) => (
            <div
              key={it.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group"
              data-testid={`portfolio-edit-item-${it.id}`}
            >
              <img src={it.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              {/* Hover/touch controls */}
              <div className="absolute inset-0 flex flex-col justify-between p-1.5 opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity" style={{ background: "rgba(3,4,94,0.55)" }}>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/95 text-[#03045E] text-xs font-bold cursor-grab">
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(it.id)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/95 text-rose-500 hover:bg-rose-50 active:scale-90 transition"
                    data-testid={`portfolio-delete-${it.id}`}
                    aria-label={lang === "en" ? "Delete" : "Eliminar"}
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={3} />
                  </button>
                </div>
                <div className="flex gap-1 justify-center">
                  <button
                    type="button"
                    onClick={() => reorder(it.id, "up")}
                    disabled={i === 0}
                    className="px-2 h-7 rounded-full bg-white/95 text-[#03045E] text-[10px] font-bold disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => reorder(it.id, "down")}
                    disabled={i === items.length - 1}
                    className="px-2 h-7 rounded-full bg-white/95 text-[#03045E] text-[10px] font-bold disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
