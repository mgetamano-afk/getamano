import { Link } from "react-router-dom";
import { Globe2 } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import BrandMark from "./BrandMark";

/**
 * AboutNavBar — Section 89 v8 (Part 2).
 *
 * Sticky nav bar only rendered on `/about`. The full landing chrome
 * stays inside `<Landing>` so we don't touch existing layout — this
 * component sits ABOVE the landing's Header and provides a quick lang
 * toggle + "Open app" CTA back to the reels-feed root.
 */
export default function AboutNavBar() {
  const { lang, changeLang } = useI18n();
  const toggle = () => changeLang(lang === "en" ? "es" : "en");
  return (
    <div
      className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm"
      data-testid="about-nav-bar"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
        <Link to="/about" className="flex items-center gap-2" data-testid="about-nav-logo">
          <BrandMark size="sm" />
          <span className="font-display font-extrabold text-lg" style={{ color: "#03045E" }}>
            getamano
          </span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
          data-testid="about-nav-lang-toggle"
          aria-label="Toggle language"
        >
          <Globe2 className="w-3.5 h-3.5" />
          {lang === "en" ? "EN · ES" : "ES · EN"}
        </button>
        <Link
          to="/"
          className="h-9 px-4 rounded-full font-bold text-sm text-white inline-flex items-center"
          style={{ background: "#0077B6" }}
          data-testid="about-nav-open-app"
        >
          {lang === "en" ? "Open app" : "Abrir la app"}
        </Link>
      </div>
    </div>
  );
}
