import { Award, ShieldCheck, Star } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * TrustScore — Section 89 v4.
 *
 * Computes a 0–100 score from provider signals and renders a semaphore
 * badge (red < 50, yellow 50–74, green ≥ 75). Pure presentational —
 * call sites pass a hydrated provider profile.
 *
 * Algorithm (locked here so backend + frontend agree):
 *   · provider_verified            +25
 *   · portfolio_count clamp 0..10  +15   (full marks at 10 photos)
 *   · reviews_count clamp 0..20    +20   (full marks at 20 reviews)
 *   · avg_rating clamp 0..5        +20   (avg * 4)
 *   · referrals_converted clamp 0..5 +10 (referee_converted * 2)
 *   · days_active clamp 0..180     +10   (days/180 * 10)
 *   ────────────────────────────  TOTAL = 100
 *
 * Returns null if `profile` is missing all signals (so the badge hides
 * itself instead of showing a misleading score).
 */
export function calcTrustScore(profile) {
  if (!profile) return null;
  let s = 0;
  if (profile.provider_verified) s += 25;
  s += Math.min(15, (profile.portfolio_count || 0) * 1.5);
  s += Math.min(20, (profile.reviews_count || 0) * 1.0);
  s += Math.min(20, (profile.avg_rating || 0) * 4.0);
  s += Math.min(10, (profile.referrals_converted || 0) * 2.0);
  s += Math.min(10, ((profile.days_active || 0) / 180) * 10);
  return Math.round(Math.max(0, Math.min(100, s)));
}

function tierFor(score) {
  if (score >= 75) return { tier: "green", color: "#10B981", bg: "rgba(16, 185, 129, 0.10)", label_es: "Alto", label_en: "High" };
  if (score >= 50) return { tier: "yellow", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.10)", label_es: "Medio", label_en: "Medium" };
  return { tier: "red", color: "#EF4444", bg: "rgba(239, 68, 68, 0.10)", label_es: "Bajo", label_en: "Low" };
}

/**
 * Badge variants
 * ──────────────
 *  · "inline"   — compact pill used inline next to a provider name
 *  · "card"     — block card used on the dashboard (full breakdown)
 *  · "tile"     — small square stat for the search result card
 */
export default function TrustScore({ profile, variant = "inline" }) {
  const { lang } = useI18n();
  const score = calcTrustScore(profile);
  if (score === null) return null;

  const t = tierFor(score);

  if (variant === "tile") {
    return (
      <div
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold"
        style={{ background: t.bg, color: t.color }}
        data-testid="trust-tile"
        data-score={score}
        data-tier={t.tier}
      >
        <Award className="w-3 h-3" strokeWidth={2.5} />
        {score}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
        data-testid="trust-card"
        data-score={score}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: t.bg }}
          >
            <Award className="w-6 h-6" style={{ color: t.color }} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">
              {lang === "en" ? "Profile completeness" : "Completitud de perfil"}
            </p>
            <p className="font-display font-extrabold text-3xl text-[#03045E] leading-none">
              {score}
              <span className="text-base text-slate-400 ml-1 font-bold">/ 100</span>
            </p>
          </div>
          {/* Section 89 v7 — removed the BAJO/MEDIO/ALTO tier label per
              user feedback. The numeric score is enough. */}
        </div>
        {/* breakdown rows */}
        <ul className="space-y-1.5 text-xs text-slate-600">
          <Row icon={ShieldCheck} on={!!profile.provider_verified} label_es="Verificado ✓" label_en="Verified ✓" lang={lang} />
          <Row icon={Star} count={profile.reviews_count} label_es="reseñas" label_en="reviews" lang={lang} />
          <Row icon={Award} count={profile.portfolio_count} label_es="fotos en portafolio" label_en="portfolio photos" lang={lang} />
          <Row icon={Award} count={profile.referrals_converted} label_es="referidos convertidos" label_en="converted referrals" lang={lang} />
        </ul>
      </div>
    );
  }

  // inline (default)
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ background: t.bg, color: t.color }}
      data-testid="trust-inline"
      data-score={score}
      data-tier={t.tier}
      title={lang === "en" ? `Trust Score: ${score}/100` : `Trust Score: ${score}/100`}
    >
      <Award className="w-3 h-3" strokeWidth={2.5} />
      {score}
    </span>
  );
}

function Row({ icon: Icon, on, count, label_es, label_en, lang }) {
  const ok = on || (typeof count === "number" && count > 0);
  return (
    <li className={`flex items-center gap-2 ${ok ? "text-[#03045E]" : "text-slate-400"}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={ok ? 2.5 : 1.8} />
      <span>
        {typeof count === "number"
          ? <><strong className="font-bold">{count}</strong> {lang === "en" ? label_en : label_es}</>
          : (lang === "en" ? label_en : label_es)}
      </span>
    </li>
  );
}
