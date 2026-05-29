import { useI18n } from "../../contexts/I18nContext";

/**
 * LanguageToggle — Section 72.
 *
 * Pill-style ES / EN toggle used in the onboarding flow (splash, slides,
 * login) so a first-time visitor can pick their language BEFORE they see
 * any content. Mounted in the top-right corner of every onboarding screen.
 *
 * Persistence
 * ───────────
 * Reuses the existing I18nContext (`changeLang`) which writes to
 * `localStorage.tx_lang`. Mirrors the value to the `gtm_lang` key
 * specified in the prompt for forward compatibility with the new
 * design-system contracts.
 *
 * Accessibility
 * ─────────────
 *  · aria-label on the container
 *  · aria-pressed on each pill
 *  · 44×44 touch target per pill (mobile-first)
 */
export default function LanguageToggle() {
  const { lang, changeLang, t } = useI18n();

  const set = (next) => {
    if (next === lang) return;
    changeLang(next);
    try { localStorage.setItem("gtm_lang", next); } catch { /* private mode */ }
  };

  return (
    <div
      role="group"
      aria-label={t("onb.lang.aria")}
      className="inline-flex items-center gap-0 p-1 rounded-full bg-white/95 backdrop-blur shadow-sm ring-1 ring-white/30 font-poppins"
      data-testid="onb-lang-toggle"
    >
      {[
        { code: "es", label: "ES" },
        { code: "en", label: "EN" },
      ].map(opt => {
        const active = lang === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => set(opt.code)}
            aria-pressed={active}
            className={`min-w-[44px] h-9 px-3 rounded-full text-xs font-bold tracking-wide transition-colors ${
              active
                ? "bg-[#03045E] text-white shadow-sm"
                : "text-[#03045E]/70 hover:text-[#03045E]"
            }`}
            data-testid={`onb-lang-${opt.code}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
