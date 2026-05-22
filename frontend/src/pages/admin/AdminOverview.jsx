import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { Users, Briefcase, CheckCircle2, Star, Clock, MessageSquare, TrendingUp } from "lucide-react";

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/admin/stats"),
      api.get("/admin/providers", { params: { status: "pending" } }),
    ]).then(([s, p]) => { setStats(s.data); setRecent(p.data.slice(0, 5)); });
  }, []);

  return (
    <AdminLayout title="Resumen">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Users} label="Usuarios" value={stats?.total_users ?? "—"} color="from-blue-500/20 to-blue-500/5 text-blue-300" testid="ov-users" />
        <Stat icon={Briefcase} label="Proveedores" value={stats?.total_providers ?? "—"} color="from-orange-500/20 to-orange-500/5 text-orange-300" testid="ov-providers" />
        <Stat icon={Clock} label="Pendientes" value={stats?.pending_providers ?? "—"} color="from-yellow-500/20 to-yellow-500/5 text-yellow-300" testid="ov-pending" />
        <Stat icon={CheckCircle2} label="Aprobados" value={stats?.approved_providers ?? "—"} color="from-green-500/20 to-green-500/5 text-green-300" testid="ov-approved" />
        <Stat icon={Star} label="Reseñas" value={stats?.total_reviews ?? "—"} color="from-pink-500/20 to-pink-500/5 text-pink-300" testid="ov-reviews" />
        <Stat icon={MessageSquare} label="Clientes" value={stats?.total_clients ?? "—"} color="from-purple-500/20 to-purple-500/5 text-purple-300" testid="ov-clients" />
        <Stat icon={TrendingUp} label="Ingresos plan" value="$0" color="from-slate-500/20 to-slate-500/5 text-slate-300" testid="ov-revenue" subtitle="Q3 2026 launch" />
      </div>

      <div className="mt-8 bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h2 className="font-display font-semibold text-white">Últimos proveedores pendientes</h2>
        </div>
        <div className="divide-y divide-slate-800">
          {recent.length === 0 ? (
            <div className="p-6 text-slate-500 text-sm">Sin pendientes 🎉</div>
          ) : recent.map(p => (
            <div key={p.provider_id} className="p-4 flex items-center gap-4" data-testid={`ov-pending-${p.slug}`}>
              <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden flex-shrink-0">
                {p.logo_url && <img src={p.logo_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-white">{p.business_name}</div>
                <div className="text-xs text-slate-400 truncate">{p.city}, {p.state}</div>
              </div>
              <a href={`/admin/queue`} className="text-blue-400 text-sm hover:underline">Revisar →</a>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

function Stat({ icon: Icon, label, value, color, subtitle, testid }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-gradient-to-br ${color} p-5`} data-testid={testid}>
      <Icon className="w-5 h-5 mb-2 opacity-80" />
      <div className="font-display text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-300 mt-1">{label}</div>
      {subtitle && <div className="text-[10px] text-slate-500 mt-0.5">{subtitle}</div>}
    </div>
  );
}
