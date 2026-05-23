import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Crown, Medal, Star, MapPin, Sparkles, Info, ChevronLeft } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { getDicebearAvatar } from "../lib/avatar";

/**
 * RankingPage — Section 35 public page at /ranking.
 *
 * Full monthly leaderboard with:
 *   • Hero podium for top 3
 *   • Numbered list rows 4-100 with score + breakdown chips on hover
 *   • Transparent formula explainer panel ("Cómo se calcula")
 */
export default function RankingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get("/leaderboard/monthly?limit=100")
      .then(r => { if (alive) setData(r.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const monthLabel = data?.month ? formatMonth(data.month) : "este mes";
  const podium = data?.top?.slice(0, 3) || [];
  const rest = data?.top?.slice(3) || [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" data-testid="ranking-page">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-4" data-testid="ranking-back">
          <ChevronLeft className="w-4 h-4" /> Inicio
        </Link>

        {/* Hero */}
        <div className="text-center mb-8">
          <span className="inline-block text-[10px] uppercase tracking-widest font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
            <Sparkles className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Ranking del mes
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-slate-900 mt-3 tracking-tight">
            Top proveedores · <span className="capitalize" data-testid="ranking-month">{monthLabel}</span>
          </h1>
          <p className="text-slate-500 mt-2 max-w-xl mx-auto text-sm">
            Los proveedores latinos más activos de este mes. Se actualiza cada 5 minutos según referidos verificados, reseñas 4★+, chambas, racha y respuesta rápida.
          </p>
        </div>

        {loading && (
          <div className="text-center py-16 text-slate-400">Cargando ranking…</div>
        )}

        {!loading && data?.top?.length === 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
            <Trophy className="w-12 h-12 mx-auto text-slate-300" />
            <h2 className="font-display font-bold text-xl text-slate-900 mt-3">Aún no hay ranking este mes</h2>
            <p className="text-sm text-slate-500 mt-2">A medida que los proveedores sumen actividad este mes, aparecerán aquí.</p>
          </div>
        )}

        {/* Podium top-3 */}
        {!loading && podium.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:gap-6 items-end mb-8" data-testid="ranking-podium">
            {[1, 0, 2].map((order) => {
              const r = podium[order];
              if (!r) return <div key={order} />;
              const isFirst = r.rank === 1;
              const cardHeight = isFirst ? "h-56" : r.rank === 2 ? "h-44" : "h-40";
              const accent = isFirst ? "from-amber-500 to-yellow-400" : r.rank === 2 ? "from-slate-400 to-slate-300" : "from-orange-700 to-orange-500";
              const icon = isFirst ? <Crown className="w-6 h-6 text-amber-300" /> : <Medal className={`w-5 h-5 ${r.rank === 2 ? "text-slate-300" : "text-orange-300"}`} />;
              return (
                <Link
                  key={r.provider_id}
                  to={`/services/${r.slug}`}
                  className={`relative rounded-2xl text-white overflow-hidden flex flex-col items-center justify-end pb-4 px-2 ${cardHeight} bg-gradient-to-br ${accent} hover:scale-[1.02] transition-transform shadow-lg`}
                  data-testid={`ranking-podium-${r.rank}`}
                >
                  <div className="absolute top-2 right-2">{icon}</div>
                  <div className={`rounded-full overflow-hidden border-[3px] border-white shadow-lg ${isFirst ? "w-20 h-20 -translate-y-1" : "w-16 h-16"}`}>
                    <img src={r.photo_url || getDicebearAvatar(r.business_name)} alt={r.business_name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <p className={`font-display font-bold mt-2 leading-tight text-center truncate w-full px-2 ${isFirst ? "text-base sm:text-lg" : "text-xs sm:text-sm"}`}>{r.business_name}</p>
                  <p className="text-[10px] sm:text-xs opacity-90 mt-0.5">{r.city || ""}</p>
                  <div className="mt-2 inline-flex items-center gap-1 bg-white/25 backdrop-blur-sm rounded-full px-2.5 py-0.5">
                    <span className="text-sm font-bold">#{r.rank}</span>
                    <span className="text-[10px]">·</span>
                    <span className="text-sm font-bold">{r.score} pts</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Rest of the list 4-100 */}
        {!loading && rest.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden" data-testid="ranking-list">
            <ul className="divide-y divide-slate-100">
              {rest.map(r => (
                <li key={r.provider_id} data-testid={`ranking-row-${r.rank}`}>
                  <Link to={`/services/${r.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <span className="font-display font-bold text-lg text-slate-400 w-8 text-center flex-shrink-0">#{r.rank}</span>
                    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border border-slate-200">
                      <img src={r.photo_url || getDicebearAvatar(r.business_name)} alt={r.business_name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 truncate">{r.business_name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                        {r.rating > 0 && (
                          <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{r.rating} ({r.reviews_count})</span>
                        )}
                        {r.city && (
                          <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{r.city}{r.state ? `, ${r.state}` : ""}</span>
                        )}
                        {r.plan !== "free" && (
                          <span className="text-teal-700 font-semibold">{r.plan === "premium" ? "★ Pro" : r.plan === "pro" ? "✓ Plus" : "Activo"}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-base text-slate-900">{r.score}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">pts</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Formula explainer */}
        {data?.formula && (
          <div className="rounded-2xl bg-teal-50 border border-teal-200 p-5 mt-8" data-testid="ranking-formula">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-5 h-5 text-teal-700" />
              <h3 className="font-display font-bold text-slate-900 text-base">Cómo se calcula tu puntaje</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Row icon="✨" label="Referido verificado" pts={`+${data.formula.referrals_credited} pts`} />
              <Row icon="⭐" label="Reseña 4★+" pts={`+${data.formula.reviews_4plus} pts`} />
              <Row icon="💼" label="Aplicación a chamba" pts={`+${data.formula.gig_applications} pt (máx ${data.caps.gig_applications})`} />
              <Row icon="🔥" label="Día de racha" pts={`+${data.formula.streak_days} pts (máx ${data.caps.streak_days})`} />
              <Row icon="⚡" label="Respuesta < 2h" pts={`+${data.formula.fast_responses} pts (máx ${data.caps.fast_responses})`} />
              <Row icon="✓" label="Bono plan pagado" pts={`+${data.formula.active_pro_bonus} pts`} />
              <Row icon="💯" label="Perfil completo (≥80%)" pts={`+${data.formula.completion_bonus} pts`} />
            </div>
            <p className="text-xs text-slate-500 mt-3">El ranking se reinicia cada mes (UTC). Cuentas suspendidas o no verificadas no aparecen.</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Row({ icon, label, pts }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-700 truncate">{label}</p>
        <p className="text-xs font-bold text-teal-700">{pts}</p>
      </div>
    </div>
  );
}

function formatMonth(yyyyMm) {
  try {
    const [y, m] = yyyyMm.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  } catch (_e) {
    return yyyyMm;
  }
}
