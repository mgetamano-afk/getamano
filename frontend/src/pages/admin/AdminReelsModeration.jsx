import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { Eye, EyeOff, Film, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminReelsModeration() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get("/admin/reels"); setItems(r.data || []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toggle = async (reel_id) => {
    try { await api.patch(`/admin/reels/${reel_id}/visibility`); refresh(); }
    catch { toast.error("Error"); }
  };

  return (
    <AdminLayout title="Reels (moderación)">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4" data-testid="admin-reels-mod-page">
        <h2 className="font-display font-bold inline-flex items-center gap-2 mb-3">
          <Film className="w-5 h-5 text-pink-400" /> Reels publicados
        </h2>
        {loading ? (
          <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Sin reels.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {items.map(r => (
              <li key={r.reel_id} className="py-2 text-sm flex items-center gap-2" data-testid={`admin-reel-${r.reel_id}`}>
                <span className={`w-2 h-2 rounded-full ${r.is_public ? "bg-emerald-400" : "bg-slate-600"}`} />
                <span className="font-semibold text-slate-100 flex-1 truncate">{r.business_name}</span>
                <span className="text-[11px] text-slate-500">{r.likes_count}❤ · {r.views_count}👁</span>
                <button
                  type="button"
                  onClick={() => toggle(r.reel_id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
                  data-testid={`admin-reel-toggle-${r.reel_id}`}
                >
                  {r.is_public ? <><Eye className="w-3 h-3" /> Ocultar</> : <><EyeOff className="w-3 h-3" /> Mostrar</>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}
