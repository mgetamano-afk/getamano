import { useNavigate } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * UniversalServicesCard — Section 67 (corrected) / Audiencia Dual.
 *
 * Replaces the previous "Audience Cards" 3-card split (which segmented
 * clients by ethnicity). The corrected design principle: ONE universal
 * message that speaks to every person in the US without dividing by
 * background. Latino pride lives only in the footer pride pill, the
 * About page, the blog and provider badges — NEVER as visible customer
 * segmentation on the landing.
 *
 * Visual: large centered teal-bordered card with emoji row, headline,
 * description, trust badges row, and TWO CTAs (client + provider).
 */
export default function UniversalServicesCard() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const c = lang === "en"
    ? {
        sectionTitle: "Home services you can trust",
        headline: "Find the right professional for your home — wherever you're from",
        description:
          "Cleaning, plumbing, electrical, landscaping and more. Verified providers with real reviews, serving families across the US.",
        badges: ["✓ Verified", "⭐ Real reviews", "🗣️ EN & ES", "📍 Near you"],
        ctaClient: "Find a pro near me",
        ctaProvider: "Are you a service pro? Join free →",
      }
    : {
        sectionTitle: "Servicios del hogar en los que puedes confiar",
        headline: "Encuentra el profesional ideal para tu hogar — sin importar de dónde eres",
        description:
          "Limpieza, plomería, electricidad, jardinería y más. Proveedores verificados con reseñas reales, atendiendo familias en todo USA.",
        badges: ["✓ Verificados", "⭐ Reseñas reales", "🗣️ EN & ES", "📍 Cerca de ti"],
        ctaClient: "Buscar un profesional",
        ctaProvider: "¿Eres proveedor? Únete gratis →",
      };

  return (
    <section className="max-w-7xl mx-auto px-5 md:px-6 py-8" data-testid="universal-services-section">
      <p className="text-center text-[11px] font-bold tracking-[1.5px] text-slate-400 uppercase mb-3" data-testid="universal-services-eyebrow">
        {c.sectionTitle}
      </p>

      <div
        className="relative overflow-hidden rounded-3xl p-7 md:p-9 mx-auto max-w-4xl"
        style={{
          border: "2px solid #025F67",
          background: "linear-gradient(160deg, #EFF9F7 0%, #FFFFFF 60%)",
        }}
      >
        {/* Decorative blob */}
        <div
          className="absolute -top-10 -right-10 w-36 h-36 rounded-full pointer-events-none"
          style={{ background: "rgba(2,95,103,0.05)" }}
          aria-hidden="true"
        />

        {/* Emoji row */}
        <div className="text-[28px] mb-4 tracking-[6px] leading-none" aria-hidden="true">
          🏠 🔧 ⚡ 🌿
        </div>

        {/* Headline */}
        <h2
          className="text-xl md:text-2xl font-extrabold leading-tight mb-2.5"
          style={{ color: "#025F67" }}
          data-testid="universal-services-headline"
        >
          {c.headline}
        </h2>

        {/* Description */}
        <p className="text-sm text-slate-600 leading-relaxed mb-4 max-w-xl">
          {c.description}
        </p>

        {/* Trust badges */}
        <div className="flex flex-wrap gap-1.5 mb-5" data-testid="universal-services-badges">
          {c.badges.map((b) => (
            <span
              key={b}
              className="inline-flex items-center bg-white text-[12px] font-semibold px-3 py-1 rounded-full"
              style={{ border: "1.5px solid #5DCAA5", color: "#025F67" }}
            >
              {b}
            </span>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate("/search")}
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded-full text-white text-sm font-bold transition active:scale-95 hover:brightness-110"
            style={{ background: "#025F67", boxShadow: "0 4px 16px rgba(2,95,103,0.25)" }}
            data-testid="universal-services-cta-client"
          >
            <Search className="w-4 h-4" />
            {c.ctaClient}
          </button>

          <button
            type="button"
            onClick={() => navigate("/register?intent=provider")}
            className="inline-flex items-center gap-1 px-4 py-[10px] rounded-full text-sm font-semibold transition hover:bg-teal-50"
            style={{ border: "1.5px solid #025F67", color: "#025F67", background: "transparent" }}
            data-testid="universal-services-cta-provider"
          >
            {c.ctaProvider}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
