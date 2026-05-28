import { Link } from "react-router-dom";
import { Home, HeartHandshake, Briefcase, ArrowRight } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * AudienceCards — Section 67 "Audiencia Dual" / dual-audience pivot.
 *
 * Three side-by-side cards that explicitly speak to:
 *   1. American (non-Hispanic) families looking for service pros
 *   2. Latino families looking for providers who understand their culture
 *   3. Service professionals (Latino OR American) wanting to grow
 *
 * Goal: shift the perception that getamano is exclusive to Latinos by
 * showing welcome messages to all 3 audiences. Latino heritage stays as
 * a point of pride, not a barrier.
 *
 * Layout: 3-col on md+, single column on mobile (auto-stacks via grid).
 */
export default function AudienceCards() {
  const { lang } = useI18n();
  const cards = lang === "en"
    ? [
        {
          id: "american",
          Icon: Home,
          emoji: "🏠",
          title: "American families",
          description:
            "Looking for reliable cleaning, plumbing, electrical or landscaping services? Find verified pros near you — many speak English & Spanish.",
          cta: "Find a pro near me",
          href: "/search",
          bg: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
          border: "#BFDBFE",
          accent: "#1D4ED8",
          ringHex: "rgba(29, 78, 216, 0.18)",
          testid: "audience-card-american",
        },
        {
          id: "latino",
          Icon: HeartHandshake,
          emoji: "🫂",
          title: "Latino families",
          description:
            "Encuentra proveedores que hablan tu idioma y entienden tu cultura. Verificados, con reseñas reales de tu comunidad.",
          cta: "Buscar un proveedor",
          href: "/search",
          bg: "linear-gradient(135deg, #EFF9F7 0%, #D9F2EA 100%)",
          border: "#5DCAA5",
          accent: "#025F67",
          ringHex: "rgba(2, 95, 103, 0.18)",
          testid: "audience-card-latino",
        },
        {
          id: "pros",
          Icon: Briefcase,
          emoji: "💼",
          title: "Service professionals",
          description:
            "Latino or American — if you offer quality services, getamano connects you with clients of all backgrounds in your city.",
          cta: "Join as a provider",
          href: "/register?intent=provider",
          bg: "linear-gradient(135deg, #FFF9F0 0%, #FEF3C7 100%)",
          border: "#FCD34D",
          accent: "#B45309",
          ringHex: "rgba(180, 83, 9, 0.18)",
          testid: "audience-card-pros",
        },
      ]
    : [
        {
          id: "american",
          Icon: Home,
          emoji: "🏠",
          title: "Familias americanas",
          description:
            "Buscan limpieza, plomería, electricidad o jardinería. Encuentra profesionales verificados cerca de ti — muchos hablan inglés y español.",
          cta: "Buscar un profesional",
          href: "/search",
          bg: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
          border: "#BFDBFE",
          accent: "#1D4ED8",
          ringHex: "rgba(29, 78, 216, 0.18)",
          testid: "audience-card-american",
        },
        {
          id: "latino",
          Icon: HeartHandshake,
          emoji: "🫂",
          title: "Familias latinas",
          description:
            "Encuentra proveedores que hablan tu idioma y entienden tus necesidades. Verificados, con reseñas reales de tu comunidad.",
          cta: "Buscar un proveedor",
          href: "/search",
          bg: "linear-gradient(135deg, #EFF9F7 0%, #D9F2EA 100%)",
          border: "#5DCAA5",
          accent: "#025F67",
          ringHex: "rgba(2, 95, 103, 0.18)",
          testid: "audience-card-latino",
        },
        {
          id: "pros",
          Icon: Briefcase,
          emoji: "💼",
          title: "Proveedores de servicios",
          description:
            "Latino o americano — si ofreces calidad, getamano te conecta con clientes de todos los orígenes en tu ciudad.",
          cta: "Unirme como proveedor",
          href: "/register?intent=provider",
          bg: "linear-gradient(135deg, #FFF9F0 0%, #FEF3C7 100%)",
          border: "#FCD34D",
          accent: "#B45309",
          ringHex: "rgba(180, 83, 9, 0.18)",
          testid: "audience-card-pros",
        },
      ];

  const headline = lang === "en" ? "Built for everyone in the US" : "Para todos en USA";
  const subhead = lang === "en"
    ? "Latino-built · Quality-first · All backgrounds welcome"
    : "Latino-built · Calidad primero · Todos bienvenidos";

  return (
    <section className="max-w-7xl mx-auto px-5 md:px-6 py-8" data-testid="audience-cards-section">
      <div className="text-center mb-6">
        <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight" data-testid="audience-cards-headline">
          {headline}
        </h2>
        <p className="text-xs md:text-sm text-slate-500 mt-1.5 max-w-md mx-auto" data-testid="audience-cards-subhead">
          {subhead}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {cards.map(({ id, Icon, emoji, title, description, cta, href, bg, border, accent, ringHex, testid }) => (
          <Link
            key={id}
            to={href}
            className="group rounded-2xl p-4 md:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg block"
            style={{ background: bg, border: `1.5px solid ${border}`, boxShadow: `0 1px 0 ${ringHex}` }}
            data-testid={testid}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl leading-none" aria-hidden="true">{emoji}</span>
              <Icon className="w-4 h-4" style={{ color: accent }} aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold leading-tight mb-1.5" style={{ color: accent }}>
              {title}
            </h3>
            <p className="text-[12.5px] text-slate-700 leading-snug mb-3">
              {description}
            </p>
            <span
              className="inline-flex items-center gap-1 text-[12px] font-bold transition-transform group-hover:translate-x-0.5"
              style={{ color: accent }}
            >
              {cta} <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
