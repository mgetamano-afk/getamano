import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { Heart, Search, ShieldCheck, Star } from "lucide-react";
import { toast } from "sonner";
import ChambasNearby from "../components/ChambasNearby";

export default function ClientDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [favs, setFavs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    api.get("/favorites").then(r => setFavs(r.data)).finally(() => setLoading(false));
  }, [user, authLoading, navigate]);

  const remove = async (provider_id) => {
    try {
      await api.delete(`/favorites/${provider_id}`);
      setFavs(favs.filter(f => f.provider_id !== provider_id));
      toast.success("Eliminado");
    } catch { toast.error("Error"); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">{t("common.loading")}</div>;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="client-dashboard">
        <h1 className="font-display text-3xl font-bold text-slate-900">{t("dashboard.client.title")}</h1>
        <p className="text-slate-500 mt-1">Hola, {user?.name}</p>

        <div className="mt-6">
          <ChambasNearby city={user?.city} role="client" limit={3} />
        </div>

        <div className="mt-8">
          <h2 className="font-display text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2"><Heart className="w-5 h-5 text-orange-500" /> {t("dashboard.client.favorites")}</h2>
          {favs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center" data-testid="favorites-empty">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Aún no tienes favoritos.</p>
              <Link to="/search" className="btn-primary inline-flex mt-4">{t("hero.cta.explore")}</Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {favs.map(p => (
                <div key={p.provider_id} className="card-lift bg-white rounded-2xl border border-slate-200 p-5 flex gap-4" data-testid={`favorite-${p.slug}`}>
                  <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
                    {p.logo_url && <img src={p.logo_url} alt={p.business_name} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link to={`/provider/${p.slug}`} className="font-display font-semibold text-slate-900 hover:text-blue-600 block truncate">{p.business_name}</Link>
                    <p className="text-sm text-slate-500 truncate">{p.city}{p.state ? `, ${p.state}` : ""}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      {p.verification_status === "approved" && <span className="badge-verified"><ShieldCheck className="w-3 h-3" /> Verificado</span>}
                      {p.rating_count > 0 && <span className="flex items-center gap-0.5 text-slate-600"><Star className="w-3 h-3 fill-orange-500 text-orange-500" /> {p.rating_avg.toFixed(1)}</span>}
                    </div>
                  </div>
                  <button onClick={() => remove(p.provider_id)} className="text-slate-400 hover:text-red-500 text-xs" data-testid={`remove-favorite-${p.slug}`}>Quitar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
