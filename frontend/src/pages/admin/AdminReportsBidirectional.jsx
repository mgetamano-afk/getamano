import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import AdminLayout from "../../components/AdminLayout";
import { toast } from "sonner";
import { AlertTriangle, Shield, Clock, User, Flag, CheckCircle, X, MessageSquare } from "lucide-react";

const STATUS_STYLES = {
  pending: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A", label: "Pendiente" },
  resolved: { bg: "#D1FAE5", color: "#065F46", border: "#A7F3D0", label: "Resuelto" },
  dismissed: { bg: "#F1F5F9", color: "#475569", border: "#CBD5E1", label: "Desestimado" },
};

const ACTION_STYLES = {
  warn: { bg: "#FEF3C7", color: "#92400E", label: "Advertencia" },
  suspend: { bg: "#FEE2E2", color: "#991B1B", label: "Suspendido" },
  delete: { bg: "#1E293B", color: "#FFFFFF", label: "Eliminado" },
  dismiss: { bg: "#F1F5F9", color: "#475569", label: "Desestimado" },
};

export default function AdminReports() {
  const [data, setData] = useState({ items: [], pending: 0, total_90d: 0, flagged_users: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [filterTarget, setFilterTarget] = useState("");
  const [actionModal, setActionModal] = useState(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actionType, setActionType] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const qs = {};
      if (filterStatus) qs.status = filterStatus;
      if (filterTarget) qs.target_role = filterTarget;
      const { data: d } = await api.get("/admin/reports", { params: qs });
      setData(d);
    } catch (e) {
      toast.error("Error al cargar reportes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterStatus, filterTarget]);

  const handleAction = async () => {
    if (!actionModal || !actionType) return;
    try {
      await api.put(`/admin/reports/${actionModal.report_id}`, { action: actionType, admin_notes: actionNotes });
      toast.success("Acción aplicada");
      setActionModal(null); setActionNotes(""); setActionType("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al aplicar acción");
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="admin-reports-page">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white">Reportes</h1>
          <p className="text-slate-400 text-sm">Sistema bidireccional de reportes — clientes ↔ proveedores</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={Clock} label="Pendientes" value={data.pending} color="#F59E0B" testid="stat-pending" />
          <StatCard icon={AlertTriangle} label="Últimos 90 días" value={data.total_90d} color="#2F9D94" testid="stat-90d" />
          <StatCard icon={Flag} label="Usuarios marcados" value={data.flagged_users} color="#DC2626" testid="stat-flagged" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Filtros:</span>
          {["pending", "resolved", "dismissed", ""].map(s => (
            <button key={s || "all"} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${filterStatus === s ? "bg-white text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`} data-testid={`filter-status-${s || "all"}`}>
              {s ? STATUS_STYLES[s].label : "Todos"}
            </button>
          ))}
          <span className="mx-2 text-slate-600">|</span>
          {[["", "Todos"], ["client", "Cliente"], ["provider", "Proveedor"]].map(([v, lbl]) => (
            <button key={v || "all"} onClick={() => setFilterTarget(v)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${filterTarget === v ? "bg-white text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`} data-testid={`filter-target-${v || "all"}`}>
              Reportado: {lbl}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <p className="text-slate-400 text-center py-12">Cargando...</p>
        ) : data.items.length === 0 ? (
          <div className="bg-slate-800 rounded-2xl p-12 text-center" data-testid="reports-empty">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-500" />
            <p className="text-slate-400">Sin reportes en este filtro.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.items.map(r => {
              const st = STATUS_STYLES[r.status] || STATUS_STYLES.pending;
              const at = r.action_taken ? ACTION_STYLES[r.action_taken] : null;
              return (
                <div key={r.report_id} className="bg-slate-800 rounded-2xl p-5 border border-slate-700" data-testid={`report-${r.report_id}`}>
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
                      <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</span>
                      {at && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: at.bg, color: at.color }}>{at.label}</span>}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{r.report_id}</div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <div className="text-sm">
                      <div className="text-xs text-slate-400 mb-0.5">Reportado por ({r.reporter_role})</div>
                      <div className="text-white flex items-center gap-1"><User className="w-3 h-3" /> {r.reporter_name || "—"}</div>
                      <div className="text-slate-500 text-xs">{r.reporter_email}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-xs text-slate-400 mb-0.5">Reportado ({r.target_role})</div>
                      <div className="text-white flex items-center gap-1"><User className="w-3 h-3" /> {r.target_name || "—"}</div>
                      <div className="text-slate-500 text-xs">{r.target_email}</div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-slate-400 mb-1">Motivo</div>
                    <div className="text-sm text-white">{r.reason_label}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-slate-400 mb-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Descripción</div>
                    <div className="text-sm text-slate-300 bg-slate-900 rounded-lg p-3 whitespace-pre-wrap">{r.description}</div>
                  </div>
                  {r.admin_notes && (
                    <div className="mb-3">
                      <div className="text-xs text-slate-400 mb-1">Notas del admin</div>
                      <div className="text-sm text-slate-300 italic">{r.admin_notes}</div>
                    </div>
                  )}
                  {r.status === "pending" && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700">
                      {["dismiss", "warn", "suspend", "delete"].map(a => (
                        <button key={a} onClick={() => { setActionModal(r); setActionType(a); setActionNotes(""); }} className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: ACTION_STYLES[a].bg, color: ACTION_STYLES[a].color }} data-testid={`action-${a}-${r.report_id}`}>
                          {ACTION_STYLES[a].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action confirmation modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setActionModal(null)} data-testid="action-modal">
          <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6 border border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-display font-bold text-lg text-white">Confirmar acción: {ACTION_STYLES[actionType]?.label}</h3>
              <button onClick={() => setActionModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-300 mb-4">Vas a aplicar <strong style={{ color: ACTION_STYLES[actionType]?.color === "#FFFFFF" ? "#fff" : ACTION_STYLES[actionType]?.color }}>{ACTION_STYLES[actionType]?.label}</strong> al reporte sobre <strong className="text-white">{actionModal.target_name}</strong> ({actionModal.target_role}).</p>
            <textarea
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              rows={3}
              placeholder="Notas internas (opcional)..."
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm outline-none"
              data-testid="action-notes-input"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setActionModal(null)} className="px-4 py-2 rounded-full bg-slate-700 text-white text-sm">Cancelar</button>
              <button onClick={handleAction} className="px-4 py-2 rounded-full text-sm font-semibold inline-flex items-center gap-1" style={{ backgroundColor: "#2F9D94", color: "white" }} data-testid="action-confirm-btn">
                <CheckCircle className="w-4 h-4" /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function StatCard({ icon: Icon, label, value, color, testid }) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{label}</div>
          <div className="font-display text-3xl font-bold text-white mt-1">{value}</div>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}22` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </div>
  );
}
