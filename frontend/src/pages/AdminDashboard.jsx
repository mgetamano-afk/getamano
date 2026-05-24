import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { Users, Briefcase, CheckCircle2, Star, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["pending", "in_review", "needs_info", "approved", "rejected", "suspended"];

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [providers, setProviders] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    if (user.role !== "admin") { navigate("/dashboard"); return; }
    refresh();
    // eslint-disable-next-line
  }, [user, authLoading, filter]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/providers", { params: filter ? { status: filter } : {} }),
      ]);
      setStats(s.data);
      setProviders(p.data);
    } catch (e) {
      toast.error("Error cargando datos");
    } finally {
      setLoading(false);
    }
  };

  const action = async (provider_id, status) => {
    try {
      await api.post(`/admin/providers/${provider_id}/verify`, { status });
      toast.success("Actualizado");
      refresh();
    } catch { toast.error("Error"); }
  };

  if (loading && !stats) return <div className="min-h-screen flex items-center justify-center text-slate-500">{t("common.loading")}</div>;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="admin-dashboard">
        <h1 className="font-display text-3xl font-bold text-slate-900">{t("dashboard.admin.title")}</h1>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <StatCard icon={Users} label="Usuarios" value={stats.total_users} color="bg-blue-50 text-blue-600" testid="admin-stat-users" />
            <StatCard icon={Briefcase} label="Proveedores" value={stats.total_providers} color="bg-orange-50 text-orange-600" testid="admin-stat-providers" />
            <StatCard icon={CheckCircle2} label="Aprobados" value={stats.approved_providers} color="bg-green-50 text-green-600" testid="admin-stat-approved" />
            <StatCard icon={Star} label="Reseñas" value={stats.total_reviews} color="bg-yellow-50 text-yellow-600" testid="admin-stat-reviews" />
          </div>
        )}

        <div className="mt-8 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-display text-xl font-semibold text-slate-900">Proveedores</h2>
            <div className="flex flex-wrap gap-1" data-testid="admin-status-filters">
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs capitalize ${filter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  data-testid={`admin-filter-${s}`}
                >
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {providers.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No hay proveedores con este estado.</div>
            ) : providers.map(p => (
              <div key={p.provider_id} className="p-5 flex flex-wrap items-center gap-4" data-testid={`admin-provider-${p.slug}`}>
                <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                  {p.logo_url && <img src={p.logo_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{p.business_name}</div>
                  <div className="text-sm text-slate-500 truncate">{p.city}, {p.state} · {p.phone}</div>
                </div>
                <Link to={`/provider/${p.slug}`} target="_blank" className="text-blue-600 hover:underline text-sm flex items-center gap-1" data-testid={`admin-view-${p.slug}`}>
                  Ver <ExternalLink className="w-3 h-3" />
                </Link>
                <div className="flex gap-1">
                  <button onClick={() => action(p.provider_id, "approved")} className="px-3 py-1.5 text-sm rounded-full bg-green-50 text-green-700 hover:bg-green-100" data-testid={`admin-approve-${p.slug}`}>Aprobar</button>
                  <button onClick={() => action(p.provider_id, "rejected")} className="px-3 py-1.5 text-sm rounded-full bg-red-50 text-red-700 hover:bg-red-100" data-testid={`admin-reject-${p.slug}`}>Rechazar</button>
                  <button onClick={() => action(p.provider_id, "suspended")} className="px-3 py-1.5 text-sm rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200" data-testid={`admin-suspend-${p.slug}`}>Suspender</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, testid }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid={testid}>
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-2`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="font-display text-3xl font-bold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}
