import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { Crown, Loader2 } from "lucide-react";

export default function AdminFounders() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/admin/founders")
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout title="Founding Members">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4" data-testid="admin-founders-page">
        <h2 className="font-display font-bold inline-flex items-center gap-2 mb-1">
          <Crown className="w-5 h-5 text-amber-400" />
          {loading ? "Cargando…" : `Founding Members · ${data?.slots_used || 0}/${data?.slots_total || 100}`}
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Primeros {data?.slots_total || 100} proveedores con slot vitalicio + plan Verificado gratis.
        </p>
        {loading ? (
          <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : !data?.members?.length ? (
          <p className="text-sm text-slate-500">Aún no hay founders.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {data.members.map((m, i) => (
              <li key={m.provider_id} className="py-2 flex items-center gap-2 text-sm" data-testid={`admin-founder-${m.provider_id}`}>
                <span className="font-mono text-[10px] text-slate-500">#{String(i + 1).padStart(3, "0")}</span>
                <Link to={`/p/${m.slug}`} target="_blank" className="font-semibold flex-1 truncate text-slate-100 hover:underline">
                  {m.business_name}
                </Link>
                <span className="text-[11px] text-slate-500">{m.city}</span>
                {m.getamano_code && <span className="font-mono text-[10px] font-bold text-amber-300">{m.getamano_code}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}
