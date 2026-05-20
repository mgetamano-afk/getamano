import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Inbox, Phone, Calendar, MessageSquare, Check, X as XIcon, CheckCheck } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLOR = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  accepted: "bg-blue-50 text-blue-700 border-blue-200",
  declined: "bg-red-50 text-red-700 border-red-200",
  completed: "bg-green-50 text-green-700 border-green-200",
};
const STATUS_LABEL = { pending: "Pendiente", accepted: "Aceptada", declined: "Rechazada", completed: "Completada" };

export default function ServiceRequests() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    refresh();
    // eslint-disable-next-line
  }, [user, authLoading]);

  const refresh = async () => {
    setLoading(true);
    const { data } = await api.get("/service-requests");
    setRequests(data); setLoading(false);
  };

  const updateStatus = async (id, status) => {
    try { await api.put(`/service-requests/${id}/status`, { status }); toast.success("Actualizado"); refresh(); }
    catch { toast.error("Error"); }
  };

  const isProvider = user?.role === "provider";
  const filtered = requests.filter(r => filter === "all" || r.status === filter);

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8" data-testid="service-requests-page">
        <h1 className="font-display text-3xl font-bold text-slate-900">{isProvider ? "Solicitudes recibidas" : "Mis solicitudes"}</h1>
        <p className="text-slate-500 mt-1">{isProvider ? "Cotizaciones que te han enviado." : "Cotizaciones que has enviado."}</p>

        <div className="flex flex-wrap gap-2 mt-6" data-testid="requests-filters">
          {["all", "pending", "accepted", "declined", "completed"].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-sm ${filter === s ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-700"}`} data-testid={`requests-filter-${s}`}>
              {s === "all" ? "Todas" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {loading ? <p className="text-slate-500">Cargando...</p>
          : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500" data-testid="requests-empty">
              <Inbox className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p>Sin solicitudes en este filtro.</p>
            </div>
          ) : filtered.map(r => (
            <div key={r.request_id} className="bg-white rounded-2xl border border-slate-200 p-5" data-testid={`request-${r.request_id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isProvider ? (
                      <span className="font-medium text-slate-900">{r.client_name}</span>
                    ) : (
                      <Link to={`/services/${r.slug}`} className="font-medium text-blue-600 hover:underline">{r.business_name}</Link>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  {r.service_type && <div className="text-xs text-slate-500 mt-1">Servicio: <span className="text-slate-700">{r.service_type}</span></div>}
                  <p className="mt-2 text-sm text-slate-700">{r.message}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    {r.client_phone && isProvider && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {r.client_phone}</span>}
                    {r.preferred_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {r.preferred_date}</span>}
                    <span>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {isProvider && r.status === "pending" && (
                  <div className="flex gap-1">
                    <button onClick={() => updateStatus(r.request_id, "accepted")} className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs flex items-center gap-1" data-testid={`request-accept-${r.request_id}`}>
                      <Check className="w-3 h-3" /> Aceptar
                    </button>
                    <button onClick={() => updateStatus(r.request_id, "declined")} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-xs flex items-center gap-1" data-testid={`request-decline-${r.request_id}`}>
                      <XIcon className="w-3 h-3" /> Rechazar
                    </button>
                  </div>
                )}
                {isProvider && r.status === "accepted" && (
                  <button onClick={() => updateStatus(r.request_id, "completed")} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs flex items-center gap-1" data-testid={`request-complete-${r.request_id}`}>
                    <CheckCheck className="w-3 h-3" /> Marcar completada
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
