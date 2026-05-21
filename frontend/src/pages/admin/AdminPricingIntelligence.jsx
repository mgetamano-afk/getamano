import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { TrendingUp, MapPin, Activity, Download, DollarSign, Users } from "lucide-react";

const BUDGET_LABEL = {
  "<100": "<$100", "100-300": "$100-300", "300-700": "$300-700", "700-1500": "$700-1.5K", ">1500": ">$1.5K",
  "unknown": "No sabe", "prefer_not_to_say": "—",
};

export default function AdminPricingIntelligence() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ state: "", days: 365 });
  const [cats, setCats] = useState([]);
  const [states, setStates] = useState([]);

  const load = () => {
    const q = new URLSearchParams();
    if (filters.state) q.set("state", filters.state);
    q.set("days", filters.days);
    api.get(`/admin/pricing-intelligence?${q.toString()}`).then(r => setData(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, [filters]);
  useEffect(() => {
    api.get("/categories").then(r => setCats(r.data?.items || r.data || [])).catch(() => {});
    api.get("/cities").then(r => {
      const items = r.data?.items || r.data || [];
      setStates([...new Set(items.map(c => c.state).filter(Boolean))].sort());
    }).catch(() => {});
  }, []);

  const downloadCsv = async () => {
    try {
      const token = localStorage.getItem("token");
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/admin/pricing-intelligence/export.csv`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "getmano-pricing.csv";
      document.body.appendChild(a); a.click(); a.remove();
    } catch {}
  };

  return (
    <AdminLayout title="Inteligencia de precios">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl p-6 mb-6" style={{ background: "linear-gradient(135deg, #0B0F2E 0%, #2D1B69 100%)" }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-fuchsia-500/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-300 text-[10px] font-semibold tracking-widest uppercase mb-2">
              <TrendingUp className="w-3 h-3" /> Pricing Intelligence · admin only
            </div>
            <h2 className="font-display text-2xl font-bold text-white">El data flywheel de getmano</h2>
            <p className="text-sm text-white/65 mt-1">Precios reales, demanda por ciudad, eficiencia operativa. <strong className="text-fuchsia-300">Nunca mostramos datos individuales — solo agregados.</strong></p>
          </div>
          <div className="flex items-center gap-2">
            <select value={filters.state} onChange={e => setFilters({ ...filters, state: e.target.value })} className="h-9 px-3 rounded-full bg-white/10 text-white text-xs border border-white/20" data-testid="pricing-filter-state">
              <option value="">Todos los estados</option>
              {states.map(s => <option key={s} value={s} className="text-slate-900">{s}</option>)}
            </select>
            <button onClick={downloadCsv} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs" data-testid="pricing-export">
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </button>
          </div>
        </div>
      </div>

      {!data ? (
        <div className="text-slate-400 text-sm py-12 text-center">Cargando análisis...</div>
      ) : (
        <div className="space-y-4">
          {/* Operations KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="pricing-ops">
            <Stat Icon={Activity} label="Cotizaciones" value={data.operations.total_quotes} sub={`${data.operations.responded} respondidas`} />
            <Stat Icon={TrendingUp} label="Tasa de respuesta" value={`${data.operations.response_rate_pct}%`} sub={data.operations.avg_response_hours ? `~${data.operations.avg_response_hours}h promedio` : "—"} />
            <Stat Icon={DollarSign} label="Respuestas con precio" value={`${data.operations.price_rate_pct}%`} sub={`${data.operations.responses_with_price} / ${data.operations.responses_total}`} />
            <Stat Icon={Users} label="Datos de tarifas" value={data.by_category.reduce((a, c) => a + c.sample_size, 0)} sub="totales registrados" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* By category */}
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5" data-testid="pricing-categories">
              <h3 className="font-display font-bold text-white mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-amber-400" />Tarifas por categoría</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800"><th className="text-left py-2">Categoría</th><th className="text-right">$ Mín</th><th className="text-right">$ Máx</th><th className="text-right">Top budget</th><th className="text-right">n</th></tr></thead>
                <tbody>
                  {data.by_category.length === 0 ? <tr><td colSpan={5} className="py-5 text-center text-slate-500">Sin datos</td></tr> : data.by_category.map(c => (
                    <tr key={c.category_id} className="border-b border-slate-800/50 last:border-0">
                      <td className="py-2 text-slate-300">{c.category_name}</td>
                      <td className="text-right text-white font-medium">${c.avg_min}</td>
                      <td className="text-right text-white font-medium">${c.avg_max}</td>
                      <td className="text-right text-amber-300 text-xs">{BUDGET_LABEL[c.top_budget_range] || "—"}</td>
                      <td className="text-right text-slate-500 text-xs">{c.sample_size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Demand by city */}
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5" data-testid="pricing-demand">
              <h3 className="font-display font-bold text-white mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-orange-400" />Demanda por ciudad</h3>
              {data.demand_by_city.length === 0 ? <div className="py-5 text-center text-slate-500 text-sm">Sin solicitudes recientes</div> : data.demand_by_city.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-200">{c.city}{c.state ? `, ${c.state}` : ""}</div>
                    {c.top_category && <div className="text-[10px] text-slate-500">Top: {c.top_category}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg font-bold text-white">{c.count}</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">cotizaciones</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Stat({ Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4">
      <Icon className="w-4 h-4 text-amber-400 mb-2" />
      <div className="font-display text-2xl font-bold text-white leading-none">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
