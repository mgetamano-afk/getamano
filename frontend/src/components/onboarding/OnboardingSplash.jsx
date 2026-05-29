import { useI18n } from "../../contexts/I18nContext";
import LanguageToggle from "./LanguageToggle";
import BrandMark from "../../components/BrandMark";
import CityscapeBackdrop from "../CityscapeBackdrop";

/**
 * OnboardingSplash — Section 70 (screen 1 of 3).
 *
 * Full-bleed navy-dark welcome screen with logo + tagline + legal note +
 * primary CTA. First impression for any visitor that hasn't onboarded yet.
 *
 * Visual spec (updated Section 87)
 * ────────────────────────────────
 *  · Background : CSS cityscape (Ocean Blue navy + animated buildings)
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
      className="relative w-full flex flex-col items-center justify-between text-white font-poppins overflow-hidden"
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--gtm-blue-dark, #03045E)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
      }}
      data-testid="onb-splash"
    >
      <CityscapeBackdrop />

      {/* Top-right language toggle */}
      <div className="relative z-10 w-full px-4 flex justify-end">
        <LanguageToggle />
      </div>

      {/* Center: logo + copy */}
      <div className="relative z-10 flex-1 w-full max-w-md mx-auto px-6 flex flex-col items-center justify-center text-center">
        <BrandMark size="2xl" glow draggable={false} className="mb-8" />
        <h1
          className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
          style={{ letterSpacing: "-0.02em", color: "#FFFFFF" }}
          data-testid="onb-splash-title"
        >
          {t("onb.splash.title")}
        </h1>
        <p className="text-base sm:text-lg text-white/95 leading-relaxed max-w-sm drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
          {t("onb.splash.subtitle")}
        </p>
      </div>

      {/* Bottom: CTA + legal */}
      <div className="relative z-10 w-full max-w-md mx-auto px-6">
        <button
          type="button"
          onClick={onContinue}
          className="w-full h-14 rounded-2xl bg-white text-[#03045E] font-bold text-base shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-transform"
          data-testid="onb-splash-cta"
        >
          {t("onb.splash.cta")} →
        </button>
        <p className="mt-4 text-center text-[11px] text-white/75 leading-snug">
          {t("onb.splash.legal")}
        </p>
      </div>
    </div>
  );
}
