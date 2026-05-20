import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { ExternalLink, Check, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const STATUSES = [
  { value: "pending", label: "Pendiente" },
  { value: "in_review", label: "En revisión" },
  { value: "needs_info", label: "Requiere info" },
];

export default function AdminQueue() {
  const [filter, setFilter] = useState("pending");
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [filter]);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/providers", { params: { status: filter } });
      setProviders(data);
    } finally { setLoading(false); }
  };

  const act = async (pid, status) => {
    try {
      await api.post(`/admin/providers/${pid}/verify`, { status });
      toast.success("Actualizado");
      refresh();
    } catch { toast.error("Error"); }
  };

  return (
    <AdminLayout title="Cola de verificación">
      <div className="flex flex-wrap gap-2 mb-5" data-testid="queue-filters">
        {STATUSES.map(s => (
          <button key={s.value} onClick={() => setFilter(s.value)} className={`px-4 py-2 rounded-full text-sm ${filter === s.value ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`} data-testid={`queue-filter-${s.value}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">Cargando...</div>
        ) : providers.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Sin resultados en esta cola.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {providers.map(p => (
              <div key={p.provider_id} className="p-5 flex flex-wrap items-start gap-4" data-testid={`queue-item-${p.slug}`}>
                <div className="w-12 h-12 rounded-xl bg-slate-800 overflow-hidden flex-shrink-0">
                  {p.logo_url && <img src={p.logo_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{p.business_name}</div>
                  <div className="text-xs text-slate-400 truncate">{p.city}, {p.state} · {p.phone || "sin teléfono"} · {p.email || "sin email"}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(p.services || []).slice(0, 4).map((s, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{s}</span>)}
                  </div>
                </div>
                <a href={`/services/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm flex items-center gap-1 hover:underline" data-testid={`queue-view-${p.slug}`}>
                  Ver eCard <ExternalLink className="w-3 h-3" />
                </a>
                <div className="flex gap-2 w-full md:w-auto">
                  <button onClick={() => act(p.provider_id, "approved")} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white" data-testid={`queue-approve-${p.slug}`}>
                    <Check className="w-3.5 h-3.5" /> Aprobar
                  </button>
                  <button onClick={() => act(p.provider_id, "needs_info")} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white" data-testid={`queue-needsinfo-${p.slug}`}>
                    <AlertCircle className="w-3.5 h-3.5" /> Pedir info
                  </button>
                  <button onClick={() => act(p.provider_id, "rejected")} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white" data-testid={`queue-reject-${p.slug}`}>
                    <X className="w-3.5 h-3.5" /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
