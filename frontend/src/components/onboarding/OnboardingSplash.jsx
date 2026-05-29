import { useI18n } from "../../contexts/I18nContext";
import LanguageToggle from "./LanguageToggle";

/**
 * OnboardingSplash — Section 70 (screen 1 of 3).
 *
 * Full-bleed navy-dark welcome screen with logo + tagline + legal note +
 * primary CTA. First impression for any visitor that hasn't onboarded yet.
 *
 * Visual spec
 * ───────────
 *  · Background : #011C40 (Section 71 token `--gtm-blue-dark`)
 *  · Logo size  : 96 × 96 (logo512.png — already in /public)
 *  · Title      : 32px Poppins 700
 *  · CTA        : white pill, navy text, 56px tall, 16px radius
 *  · Safe areas : padding-top env(safe-area-inset-top), bottom equivalent
 *
 * Accessibility
 * ─────────────
 *  · CTA carries data-testid="onb-splash-cta"
 *  · Logo has descriptive alt text
 */
export default function OnboardingSplash({ onContinue }) {
  const { t } = useI18n();
  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center justify-between text-white font-poppins overflow-hidden relative"
      style={{
        backgroundColor: "var(--gtm-blue-dark, #011C40)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
      }}
      data-testid="onb-splash"
    >
      {/* Top-right language toggle */}
      <div className="w-full px-4 flex justify-end">
        <LanguageToggle />
      </div>

      {/* Center: logo + copy */}
      <div className="flex-1 w-full max-w-md mx-auto px-6 flex flex-col items-center justify-center text-center">
        <img
          src="/getamano-logo-mark.png"
          alt="getamano"
          className="w-24 h-24 mb-8 drop-shadow-[0_4px_24px_rgba(255,255,255,0.18)]"
          draggable={false}
        />
        <h1
          className="text-3xl sm:text-4xl font-bold tracking-tight mb-3"
          style={{ letterSpacing: "-0.02em", color: "#FFFFFF" }}
          data-testid="onb-splash-title"
        >
          {t("onb.splash.title")}
        </h1>
        <p className="text-base sm:text-lg text-white/85 leading-relaxed max-w-sm">
          {t("onb.splash.subtitle")}
        </p>
      </div>

      {/* Bottom: CTA + legal */}
      <div className="w-full max-w-md mx-auto px-6">
        <button
          type="button"
          onClick={onContinue}
          className="w-full h-14 rounded-2xl bg-white text-[#011C40] font-bold text-base shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
          data-testid="onb-splash-cta"
        >
          {t("onb.splash.cta")} →
        </button>
        <p className="mt-4 text-center text-[11px] text-white/55 leading-snug">
          {t("onb.splash.legal")}
        </p>
      </div>
    </div>
  );
}
