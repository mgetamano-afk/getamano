import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { GalleryUpload, buildFileUrl } from "./ImageUpload";
import { Pin, GripVertical, Trash2, Image as ImageIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";

const PLAN_LABEL = { free: "Gratis", basic: "Básico", pro: "Pro", premium: "Premium" };

/**
 * Provider dashboard gallery tab.
 * - Shows plan-aware limit info + "limit reached" upgrade banner for Free
 * - Multi-file upload with progress (via GalleryUpload)
 * - Drag & drop reorder (HTML5 native, persists via PUT /providers/me/gallery/reorder)
 * - First photo highlighted with "📌 Foto principal" badge
 */
export default function DashboardGallery({ profile, setProfile }) {
  const [limit, setLimit] = useState(null);
  const [dragId, setDragId] = useState(null);

  const sorted = useMemo(
    () => [...(profile.gallery || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [profile.gallery]
  );

  const loadLimit = async () => {
    try {
      const { data } = await api.get("/providers/me/gallery/limit");
      setLimit(data);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadLimit(); /* eslint-disable-next-line */ }, [profile.gallery?.length, profile.plan]);

  const onUploaded = (item) => {
    setProfile(p => ({ ...p, gallery: [...(p.gallery || []), item] }));
  };

  const remove = async (id) => {
    try {
      await api.delete(`/providers/me/gallery/${id}`);
      setProfile(p => ({ ...p, gallery: p.gallery.filter(g => g.id !== id) }));
      toast.success("Foto eliminada");
    } catch { toast.error("Error al eliminar"); }
  };

  const persistOrder = async (newOrder) => {
    try {
      await api.put("/providers/me/gallery/reorder", { order: newOrder.map(g => g.id) });
    } catch { toast.error("No se pudo guardar el orden"); }
  };

  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  const onDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const arr = [...sorted];
    const fromIdx = arr.findIndex(g => g.id === dragId);
    const toIdx = arr.findIndex(g => g.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); return; }
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    const withOrder = arr.map((g, i) => ({ ...g, sort_order: i }));
    setProfile(p => ({ ...p, gallery: withOrder }));
    persistOrder(withOrder);
    setDragId(null);
  };

  const onDragEnd = () => setDragId(null);

  const planLabel = PLAN_LABEL[limit?.plan] || "Gratis";
  const isFreeLimitReached = limit && limit.max !== null && !limit.can_upload;

  return (
    <div data-testid="dashboard-gallery">
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-lg text-slate-900">Galería de trabajos</h3>
          <p className="text-sm text-slate-500">
            Muestra a tus clientes lo que sabes hacer. Arrastra para reordenar — la primera foto es la principal.
          </p>
          {limit && (
            <p className="text-xs text-slate-500 mt-1" data-testid="gallery-limit-text">
              Plan <strong>{planLabel}</strong> · {limit.used} foto{limit.used === 1 ? "" : "s"}
              {limit.max === null ? " · ilimitadas" : ` de ${limit.max}`}
            </p>
          )}
        </div>
        <GalleryUpload
          onUploaded={onUploaded}
          disabled={isFreeLimitReached}
          remaining={limit?.remaining}
          testid="gallery-upload-button"
        />
      </div>

      {isFreeLimitReached && (
        <div
          className="rounded-xl p-4 mb-5 flex items-start gap-3"
          style={{ backgroundColor: "#FFF8E1", borderLeft: "4px solid #2F9D94" }}
          data-testid="gallery-limit-banner"
        >
          <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#025F67" }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: "#025F67" }}>
              📸 Has llegado al límite de {limit.max} fotos del plan Gratis.
            </p>
            <p className="text-sm text-slate-700 mt-1">
              Actualiza a cualquier plan de pago para subir fotos ilimitadas y mostrar todo tu trabajo a los clientes.
            </p>
            <Link
              to="/plans"
              className="inline-block mt-3 px-4 py-2 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: "#2F9D94" }}
              data-testid="gallery-limit-cta"
            >
              Ver planes
            </Link>
          </div>
        </div>
      )}

      {sorted.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="gallery-items-grid">
          {sorted.map((g, idx) => (
            <div
              key={g.id}
              draggable
              onDragStart={(e) => onDragStart(e, g.id)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, g.id)}
              onDragEnd={onDragEnd}
              className={`relative aspect-square rounded-2xl overflow-hidden bg-slate-100 group cursor-move transition ${dragId === g.id ? "opacity-40 scale-95" : ""}`}
              data-testid={`gallery-item-${g.id}`}
            >
              <img src={buildFileUrl(g.url)} alt={g.caption || ""} className="w-full h-full object-cover pointer-events-none" />

              {idx === 0 && (
                <span
                  className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: "#025F67" }}
                  data-testid={`gallery-main-badge-${g.id}`}
                >
                  <Pin className="w-3 h-3" /> Foto principal
                </span>
              )}

              <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none">
                <GripVertical className="w-4 h-4 text-slate-600" />
              </div>

              <button
                onClick={() => remove(g.id)}
                className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white/90 hover:bg-red-50 hover:text-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                data-testid={`gallery-remove-${g.id}`}
                aria-label="Eliminar foto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-500" data-testid="gallery-empty">
          <ImageIcon className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p>Aún no tienes fotos en tu galería.</p>
          <p className="text-xs mt-2">Sube varias a la vez — la primera será tu foto principal.</p>
        </div>
      )}
    </div>
  );
}
