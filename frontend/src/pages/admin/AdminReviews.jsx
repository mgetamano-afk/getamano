import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { Flag, Trash2, Star, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const params = flaggedOnly ? { flagged: true } : {};
    const { data } = await api.get("/admin/reviews", { params });
    setReviews(data); setLoading(false);
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [flaggedOnly]);

  const flag = async (id) => {
    try { await api.post(`/admin/reviews/${id}/flag`); toast.success("Marcada"); refresh(); }
    catch { toast.error("Error"); }
  };
  const del = async (id) => {
    if (!confirm("¿Eliminar esta reseña? Esta acción no se puede deshacer.")) return;
    try { await api.delete(`/admin/reviews/${id}`); toast.success("Eliminada"); refresh(); }
    catch { toast.error("Error"); }
  };

  return (
    <AdminLayout title="Moderación de reseñas">
      <label className="inline-flex items-center gap-2 mb-5 text-sm text-slate-300 cursor-pointer" data-testid="reviews-flagged-toggle">
        <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} />
        Solo marcadas como sospechosas
      </label>

      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? <div className="p-8 text-slate-500 text-center">Cargando...</div>
        : reviews.length === 0 ? <div className="p-8 text-slate-500 text-center">Sin reseñas.</div>
        : (
          <div className="divide-y divide-slate-800">
            {reviews.map(r => (
              <div key={r.review_id} className="p-5 flex flex-wrap gap-4" data-testid={`review-row-${r.review_id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{r.user_name}</span>
                    <div className="flex">{[...Array(r.rating)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-orange-400 text-orange-400" />)}</div>
                    {r.is_flagged && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900 text-red-300">FLAG</span>}
                    {r.provider && <a href={`/provider/${r.provider.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 ml-auto">{r.provider.business_name} <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-slate-300">{r.comment}</p>}
                  <div className="text-[10px] text-slate-500 mt-1">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-1">
                  {!r.is_flagged && <button onClick={() => flag(r.review_id)} className="p-2 hover:bg-slate-800 rounded-lg text-yellow-400" data-testid={`review-flag-${r.review_id}`} title="Marcar"><Flag className="w-4 h-4" /></button>}
                  <button onClick={() => del(r.review_id)} className="p-2 hover:bg-red-900 rounded-lg text-red-400" data-testid={`review-delete-${r.review_id}`} title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
