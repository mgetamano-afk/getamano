import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, ChevronRight, Sparkles, Loader2, Crown, Medal } from "lucide-react";
import { api } from "../lib/api";
import { getDicebearAvatar, resolveAvatar } from "../lib/avatar";

/**
 * LeaderboardWidget — Section 35 (dashboard mini view).
 *
 * Fetches /api/leaderboard/me and shows the provider's current month rank
 * with a motivating gap message ("Sube a #N con X puntos más"). When the
 * provider has zero score this month, surfaces a friendly nudge.
 */
const RANK_GRADIENTS = ["from-amber-500 to-yellow-400", "from-slate-400 to-slate-300", "from-orange-700 to-orange-500"];

export default function LeaderboardWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get("/leaderboard/me")
      .then(r => { if (alive) setData(r.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-6 flex items-center gap-3 text-slate-400 text-sm" data-testid="leaderboard-widget-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando ranking del mes…
      </div>
    );
  }
  if (!data) return null;

  const { ranked, me, next, podium_target } = data;

  // Unranked CTA — no score this month yet
  if (!ranked) {
    return (
      <div
        className="rounded-2xl p-5 mb-6"
        style={{ background: "linear-gradient(135deg, rgba(2,95,103,0.04) 0%, rgba(47,157,148,0.08) 100%)", border: "1px solid rgba(2,95,103,0.18)" }}
        data-testid="leaderboard-widget"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(2,95,103,0.10)" }}>
            <Trophy className="w-6 h-6" style={{ color: "#025F67" }} />
          </div>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{ background: "rgba(2,95,103,0.10)", color: "#025F67" }}>
              <Sparkles className="w-3 h-3" /> Ranking del mes
            </div>
            <h3 className="font-display font-bold text-slate-900 text-lg mt-1.5" data-testid="leaderboard-widget-title">
              Aún no estás en el ranking este mes
            </h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Suma puntos respondiendo chambas, recibiendo reviews 4★+, trayendo referidos y manteniendo tu racha activa.
            </p>
            <Link to="/ranking" className="inline-flex items-center gap-1 text-sm font-semibold mt-2.5 text-teal-700 hover:underline" data-testid="leaderboard-widget-see-ranking">
              Ver ranking completo <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Ranked widget
  const gap = next ? next.score - me.score + 1 : null;
  const podiumGap = podium_target ? podium_target.score - me.score + 1 : null;
  const isPodium = me.rank <= 3;
  const rankColor = isPodium ? RANK_GRADIENTS[me.rank - 1] : "from-teal-600 to-teal-500";

  return (
    <div
      className="rounded-2xl p-5 mb-6"
      style={{
        background: isPodium
          ? "linear-gradient(135deg, #FFF7ED 0%, #FED7AA 70%, #FDBA74 100%)"
          : "linear-gradient(135deg, rgba(2,95,103,0.05) 0%, rgba(47,157,148,0.10) 100%)",
        border: isPodium ? "1px solid rgba(234,88,12,0.35)" : "1px solid rgba(2,95,103,0.20)",
      }}
      data-testid="leaderboard-widget"
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${rankColor} shadow-md`}>
          {isPodium ? <Crown className="w-7 h-7 text-white" /> : <Trophy className="w-7 h-7 text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
                 style={{ background: "rgba(0,0,0,0.06)", color: isPodium ? "#9A3412" : "#025F67" }}>
              <Sparkles className="w-3 h-3" /> Ranking del mes
            </div>
            <Link to="/ranking" className="text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                  style={{ color: isPodium ? "#9A3412" : "#025F67" }}
                  data-testid="leaderboard-widget-see-ranking">
              Ver ranking <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-display font-bold text-3xl text-slate-900" data-testid="leaderboard-widget-rank">#{me.rank}</span>
            <span className="text-sm text-slate-600">de {data.total_ranked}</span>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.6)", color: "#0F172A" }}>
              {me.score} pts
            </span>
          </div>

          {isPodium && (
            <p className="text-sm font-semibold text-slate-900 mt-2">
              {me.rank === 1 ? "🥇 ¡Estás liderando este mes!" : me.rank === 2 ? "🥈 Top 2 del mes" : "🥉 Top 3 del mes"}
            </p>
          )}

          {!isPodium && podiumGap !== null && (
            <p className="text-sm text-slate-700 mt-2" data-testid="leaderboard-widget-gap">
              Sube a <strong>#{podium_target?.rank}</strong> con <strong>{podiumGap} {podiumGap === 1 ? "punto" : "puntos"}</strong> más esta semana.
            </p>
          )}
          {!isPodium && podiumGap === null && next && (
            <p className="text-sm text-slate-700 mt-2" data-testid="leaderboard-widget-gap">
              Sube a <strong>#{next.rank}</strong> con <strong>{gap} {gap === 1 ? "punto" : "puntos"}</strong> más.
            </p>
          )}

          {/* Breakdown chips */}
          <div className="flex flex-wrap gap-1.5 mt-3" data-testid="leaderboard-widget-breakdown">
            {me.breakdown.referrals_credited > 0 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.6)", color: "#92400E" }}>
                ✨ {me.breakdown.referrals_credited * 25} pts referidos
              </span>
            )}
            {me.breakdown.streak_days > 0 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.6)", color: "#9A3412" }}>
                🔥 {me.breakdown.streak_days * 2} pts racha
              </span>
            )}
            {me.breakdown.reviews_4plus > 0 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.6)", color: "#047857" }}>
                ⭐ {me.breakdown.reviews_4plus * 5} pts reviews
              </span>
            )}
            {me.breakdown.gig_applications > 0 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.6)", color: "#1E40AF" }}>
                💼 {me.breakdown.gig_applications} pts chambas
              </span>
            )}
            {me.breakdown.fast_responses > 0 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.6)", color: "#0369A1" }}>
                ⚡ {me.breakdown.fast_responses * 3} pts rapidez
              </span>
            )}
            {me.breakdown.active_pro_bonus > 0 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.6)", color: "#025F67" }}>
                ✓ {me.breakdown.active_pro_bonus} bonus Pro
              </span>
            )}
            {me.breakdown.completion_bonus > 0 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.6)", color: "#7C3AED" }}>
                💯 {me.breakdown.completion_bonus} pts perfil
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Top 3 mini podium preview */}
      {data.top_10 && data.top_10.length >= 3 && (
        <div className="mt-4 pt-4 border-t border-white/40 flex justify-around gap-2">
          {[1, 0, 2].map((order) => {  // 2nd, 1st, 3rd visually
            const r = data.top_10[order];
            if (!r) return null;
            return (
              <Link
                key={r.provider_id}
                to={`/provider/${r.slug}`}
                className="flex flex-col items-center min-w-0 text-center"
                data-testid={`leaderboard-widget-podium-${r.rank}`}
              >
                <div className="relative">
                  <div className={`w-12 h-12 rounded-full overflow-hidden border-2 ${r.rank === 1 ? "border-amber-400 w-14 h-14" : "border-white"}`}>
                    <img src={resolveAvatar({picture: r.photo_url, user_id: r.user_id || r.provider_id, name: r.business_name, gender: r.gender})} alt={r.business_name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow ${r.rank === 1 ? "bg-amber-500" : r.rank === 2 ? "bg-slate-400" : "bg-orange-600"}`}>
                    {r.rank}
                  </div>
                </div>
                <p className="text-[10px] font-semibold text-slate-900 mt-1 truncate w-16">{r.business_name}</p>
                <p className="text-[9px] text-slate-500">{r.score} pts</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
