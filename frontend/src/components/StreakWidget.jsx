import { useEffect, useState } from "react";
import { Flame, Trophy, Calendar, Loader2 } from "lucide-react";
import { api } from "../lib/api";

/**
 * StreakWidget — Section 34 (Duolingo-style retention loop).
 *
 * Surfaces the provider's active-day streak on their dashboard. Builds
 * urgency on the "at_risk" status to keep the habit loop tight without
 * being annoying (no popups, no notifications inside the widget itself —
 * that's a separate push-notification feature once Twilio/Resend are live).
 *
 * Visual hierarchy:
 *   alive   → 🔥 amber gradient · "N días seguidos · próxima meta: M"
 *   at_risk → ⚠️ orange · "Tu racha está en riesgo · entra hoy para no perderla"
 *   cold    → 💪 slate · "Empieza tu racha · responde 1 chamba para sumar"
 */
export default function StreakWidget() {
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get("/providers/me/streak")
      .then(r => { if (alive) setStreak(r.data); })
      .catch(() => { if (alive) setStreak(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-6 text-slate-400 text-sm flex items-center gap-2" data-testid="streak-widget-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando tu racha…
      </div>
    );
  }
  if (!streak) return null;

  const { current_days, best_days, status, next_milestone } = streak;

  // Theme tokens per status
  const THEME = status === "alive"
    ? {
        bg: "linear-gradient(135deg, #FFF7ED 0%, #FED7AA 70%, #FCA552 100%)",
        border: "rgba(234,88,12,0.35)",
        accent: "#9A3412",
        accentBg: "#FED7AA",
        icon: <Flame className="w-7 h-7" style={{ color: "#EA580C" }} />,
        title: current_days === 1 ? "¡Empezaste tu racha!" : `${current_days} días seguidos 🔥`,
        subtitle: next_milestone
          ? `Próxima meta: ${next_milestone} días · ${next_milestone - current_days} para llegar`
          : "Eres una leyenda — sigue así",
      }
    : status === "at_risk"
    ? {
        bg: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)",
        border: "rgba(217,119,6,0.40)",
        accent: "#92400E",
        accentBg: "#FDE68A",
        icon: <Flame className="w-7 h-7" style={{ color: "#D97706" }} />,
        title: `Tu racha de ${current_days} ${current_days === 1 ? "día está" : "días está"} en riesgo`,
        subtitle: "Entra a getamano hoy (responde un mensaje o aplica a una chamba) para no perderla.",
      }
    : {
        bg: "rgba(2,95,103,0.04)",
        border: "rgba(2,95,103,0.18)",
        accent: "#025F67",
        accentBg: "rgba(2,95,103,0.10)",
        icon: <Flame className="w-7 h-7 text-slate-400" />,
        title: "Empieza tu racha hoy",
        subtitle: "Responde una chamba, contesta un mensaje, o aplica a un trabajo para sumar tu primer día.",
      };

  return (
    <div
      className="rounded-2xl p-5 mb-6"
      style={{ background: THEME.bg, border: `1px solid ${THEME.border}` }}
      data-testid="streak-widget"
    >
      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: THEME.accentBg }}
        >
          {THEME.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-1.5"
               style={{ background: "rgba(0,0,0,0.06)", color: THEME.accent }}>
            <Calendar className="w-3 h-3" /> Racha de actividad
          </div>
          <h3 className="font-display font-bold text-slate-900 text-lg leading-tight" data-testid="streak-widget-title">
            {THEME.title}
          </h3>
          <p className="text-sm text-slate-700 mt-1 leading-relaxed">{THEME.subtitle}</p>

          {best_days > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-bold"
                style={{ background: "rgba(255,255,255,0.6)", color: THEME.accent }}
                data-testid="streak-widget-best"
              >
                <Trophy className="w-3 h-3" /> Récord: {best_days} {best_days === 1 ? "día" : "días"}
              </span>
              {status === "alive" && current_days >= best_days && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg" style={{ background: "#FEF3C7", color: "#92400E" }}>
                  Nuevo récord 🏆
                </span>
              )}
            </div>
          )}

          {/* Visual progress bar to next milestone */}
          {status === "alive" && next_milestone && current_days > 0 && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (current_days / next_milestone) * 100)}%`,
                    background: "linear-gradient(90deg, #F97316 0%, #EA580C 100%)",
                  }}
                  data-testid="streak-widget-progress"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
