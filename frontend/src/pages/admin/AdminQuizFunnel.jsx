import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import AdminLayout from "../../components/AdminLayout";
import { TrendingUp, Mail, Users, ArrowDownRight, RefreshCw, Award, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * AdminQuizFunnel — visualizes the Plan Recommender funnel and lists captured
 * lead emails (for manual outreach until Resend is wired).
 */
export default function AdminQuizFunnel() {
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const [funnelRes, leadsRes] = await Promise.all([
        api.get("/admin/quiz-funnel"),
        api.get("/admin/lead-recoveries"),
      ]);
      setData(funnelRes.data);
      setLeads(leadsRes.data.items || []);
    } catch (e) {
      toast.error("Error cargando funnel");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copyAllEmails = () => {
    const emails = leads.map(l => l.email).join(", ");
    navigator.clipboard.writeText(emails);
    setCopied(true);
    toast.success(`${leads.length} emails copiados al portapapeles`);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <AdminLayout active="quiz-funnel">
        <div className="py-20 text-center text-slate-500">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const t = data?.totals || {};
  const r = data?.rates || {};
  const plan = data?.plan_distribution || {};
  const funnelSteps = [
    { label: "Quiz abierto", count: t.started, key: "started" },
    { label: "Pregunta 1", count: t.q1, key: "q1" },
    { label: "Pregunta 2", count: t.q2, key: "q2" },
    { label: "Pregunta 3", count: t.q3, key: "q3" },
    { label: "Pregunta 4", count: t.q4, key: "q4" },
    { label: "Completado", count: t.completed, key: "completed" },
    { label: "Click en CTA", count: t.cta_clicked, key: "cta" },
  ];
  const maxCount = Math.max(...funnelSteps.map(s => s.count || 0), 1);

  return (
    <AdminLayout active="quiz-funnel">
      <div className="space-y-6" data-testid="admin-quiz-funnel">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-orange-500" /> Quiz funnel & rescate de leads
            </h1>
            <p className="text-sm text-slate-500 mt-1">PlanRecommender en /planes — abandono, conversión y captura de emails.</p>
          </div>
          <button onClick={load} disabled={refreshing} className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-white border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refrescar
          </button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={Users} label="Sesiones" value={t.sessions || 0} color="#025F67" />
          <Kpi icon={Award} label="Completaron" value={t.completed || 0} sub={`${r.completion_rate_pct || 0}% de conversión`} color="#2F9D94" />
          <Kpi icon={ArrowDownRight} label="Abandonos" value={t.abandoned || 0} sub={`${t.q2 - t.completed} pasaron Q2 sin terminar`} color="#F59E0B" />
          <Kpi icon={Mail} label="Emails rescatados" value={t.email_captured || 0} sub={`${r.recovery_rate_pct || 0}% de los abandonos`} color="#7C3AED" />
        </div>

        {/* Funnel bars */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Embudo paso a paso</h3>
          <div className="space-y-2">
            {funnelSteps.map((s, i) => {
              const w = Math.max(((s.count || 0) / maxCount) * 100, 4);
              const dropoff = i > 0 ? (funnelSteps[i - 1].count - s.count) : 0;
              return (
                <div key={s.key} className="flex items-center gap-3" data-testid={`funnel-step-${s.key}`}>
                  <span className="text-xs font-medium text-slate-700 w-28 flex-shrink-0">{s.label}</span>
                  <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden">
                    <div className="h-full flex items-center justify-end px-3 transition-all duration-700"
                         style={{ width: `${w}%`, background: `linear-gradient(90deg, #025F67 0%, #2F9D94 100%)` }}>
                      <span className="text-xs font-bold text-white">{s.count || 0}</span>
                    </div>
                  </div>
                  {dropoff > 0 && (
                    <span className="text-[10px] text-amber-600 font-medium w-12 text-right">-{dropoff}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Plan distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Distribución de planes recomendados</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries({
              free: { name: "Free", color: "#64748B" },
              basic: { name: "Basic", color: "#3B82F6" },
              pro: { name: "Pro", color: "#F97316" },
              premium: { name: "Premium", color: "#7C3AED" },
            }).map(([key, meta]) => (
              <div key={key} className="rounded-xl border border-slate-200 p-3" data-testid={`plan-dist-${key}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{meta.name}</span>
                  <span className="text-xs font-bold" style={{ color: meta.color }}>{plan[key] || 0}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div className="h-full rounded-full" style={{
                    width: `${(plan[key] || 0) / Math.max(t.completed, 1) * 100}%`,
                    backgroundColor: meta.color,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leads list */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">Leads capturados ({leads.length})</h3>
            <button onClick={copyAllEmails} disabled={!leads.length} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-30" data-testid="copy-all-emails">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado" : "Copiar todos"}
            </button>
          </div>
          {leads.length === 0 ? (
            <div className="p-6 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 text-center text-sm text-slate-500">
              Todavía no hay leads capturados. Aparecerán aquí cuando un visitante abandone el quiz y deje su email.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Plan sugerido</th>
                    <th className="py-2 pr-3">Idioma</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2">Capturado</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.email} className="border-b border-slate-50 last:border-0" data-testid={`lead-row-${l.email}`}>
                      <td className="py-2 pr-3 font-medium text-slate-900">{l.email}</td>
                      <td className="py-2 pr-3">
                        <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{l.recommended_plan || "—"}</span>
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{l.lang === "en" ? "🇺🇸 EN" : "🇲🇽 ES"}</td>
                      <td className="py-2 pr-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${l.status === "sent" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {l.status || "pending"}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-slate-500">{new Date(l.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            💡 Una vez configurado <strong>Resend</strong>, un worker leerá esta lista y enviará automáticamente el correo de recuperación. Mientras tanto, copia la lista y mándales un mensaje manual.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}

function Kpi({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">{label}</span>
      </div>
      <div className="font-display text-3xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}
