import { useI18n } from "../contexts/I18nContext";

/**
 * LanguageBadges — Section 67 / Audiencia Dual.
 *
 * Renders a row of language pill-badges with flags. If the provider speaks
 * English, also renders a prominent "English-friendly" badge to signal to
 * American visitors they can communicate without barriers.
 *
 * @param {Object}   props
 * @param {string[]} props.languages   — provider.languages array ('es'/'en'/'pt'/...)
 * @param {"light"|"glass"|"dark"} [props.variant="light"] — visual style.
 *   - "light"  → solid teal-tint pills on a light surface (search results)
 *   - "glass"  → translucent white pills with backdrop blur (over hero images)
 *   - "dark"   → dark-on-white pills (default fallback)
 * @param {boolean} [props.showEnglishFriendly=true] — show the standout
 *   "🗣️ English-friendly" badge when 'en' is in the language list.
 */
const FLAGS = {
  es: { flag: "🇲🇽", labelEs: "Español",    labelEn: "Spanish" },
  en: { flag: "🇺🇸", labelEs: "Inglés",     labelEn: "English" },
  pt: { flag: "🇧🇷", labelEs: "Portugués",  labelEn: "Portuguese" },
};

export default function LanguageBadges({
  languages = [],
  variant = "light",
  showEnglishFriendly = true,
  size = "md",
  className = "",
}) {
  const { lang } = useI18n();
  const list = Array.isArray(languages) && languages.length ? languages : ["es"];
  const showEF = showEnglishFriendly && list.includes("en");

  const sizeCls = size === "sm"
    ? "text-[10px] px-2 py-[3px]"
    : "text-[11px] px-2.5 py-1";

  const pillStyle = variant === "glass"
    ? {
        background: "rgba(255,255,255,0.18)",
        backdropFilter: "blur(6px)",
        border: "1px solid rgba(255,255,255,0.32)",
        color: "#FFFFFF",
      }
    : variant === "dark"
      ? { background: "rgba(2,95,103,0.08)", border: "1px solid rgba(2,95,103,0.18)", color: "#03045E" }
      : { background: "#EFF9F7", border: "1px solid #5DCAA5", color: "#03045E" };

  const efStyle = variant === "glass"
    ? { background: "#FFFFFF", color: "#03045E" }
    : { background: "#03045E", color: "#FFFFFF", boxShadow: "0 2px 8px rgba(2,95,103,0.25)" };

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`} data-testid="language-badges">
      {list.map((code) => {
        const item = FLAGS[code];
        if (!item) return null;
        const label = lang === "en" ? item.labelEn : item.labelEs;
        return (
          <span
            key={code}
            className={`inline-flex items-center gap-1 rounded-full font-semibold ${sizeCls}`}
            style={pillStyle}
            data-testid={`language-badge-${code}`}
          >
            <span aria-hidden="true">{item.flag}</span>
            {label}
          </span>
        );
      })}
      {showEF && (
        <span
          className={`inline-flex items-center gap-1 rounded-full font-bold ${sizeCls}`}
          style={efStyle}
          data-testid="language-badge-english-friendly"
          title={lang === "en" ? "Comfortable speaking English" : "Cómodo atendiendo en inglés"}
        >
          🗣️ English-friendly
        </span>
      )}
    </div>
  );
}
