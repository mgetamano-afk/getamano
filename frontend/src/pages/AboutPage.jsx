import { Link } from "react-router-dom";
import {
  HeartHandshake,
  Shield,
  Sparkles,
  Globe2,
  Users,
  Star,
  ArrowRight,
  CheckCircle2,
  Quote,
} from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { SeoHead } from "../components/seo/SeoHead";

/**
 * About / Nosotros — Section 67 corollary.
 *
 * Where the Latino heritage of getamano lives. The landing now speaks
 * universally to all of America; this page is the dedicated home for
 * the brand's origin story: born in the Latino community, built for
 * every family in the US. Bilingual ES/EN.
 *
 * Structure:
 *   1. Hero (origin story headline + Latino-built pride)
 *   2. Our Mission (3 stat cards)
 *   3. Why getamano exists (origin story narrative)
 *   4. Our Values (4-card grid)
 *   5. Trust quote / testimonial pull
 *   6. CTA block (find a pro / become a pro)
 */
export default function AboutPage() {
  const { lang } = useI18n();

  const c = lang === "en"
    ? {
        seoTitle: "About us — getamano",
        seoDesc:
          "getamano was born in the Latino community and grew into a service marketplace for every family in America. Verified pros, real reviews, bilingual support.",
        eyebrow: "Latino-built · America-wide",
        title: "Born in our community.",
        title2: "Built for every family in America.",
        intro:
          "We started by helping Latino families find providers who speak their language and understand their culture. That foundation taught us what trust really feels like — and today, we serve every family across the US who values quality, transparency, and a real human connection.",
        statsHeader: "By the numbers",
        stats: [
          { value: "100%", label: "Verified providers" },
          { value: "EN · ES", label: "Bilingual support" },
          { value: "50+", label: "US cities & growing" },
        ],
        storyTitle: "Why getamano exists",
        storyParas: [
          "Finding a trustworthy plumber, cleaner or electrician shouldn't be a leap of faith — but for millions of families in the US, it is. Generic platforms hide pros behind paywalls and fake reviews. Word-of-mouth doesn't scale.",
          "We saw this most clearly in the Latino community: skilled professionals doing excellent work, with no way to be discovered beyond their own block. And families — Latino and non-Latino alike — paying for hit-or-miss services from anonymous platforms.",
          "getamano is the bridge. We verify every provider, surface real reviews from real neighbors, and make it easy to find a pro who speaks your language — whether that's English, Spanish or both.",
          "We're Latino-founded. We're America-wide. And we're just getting started.",
        ],
        valuesTitle: "What we stand for",
        values: [
          {
            Icon: Shield,
            title: "Verified, always",
            text: "Every provider passes identity & business checks before going live. No anonymous accounts.",
          },
          {
            Icon: Star,
            title: "Real reviews",
            text: "Only verified customers can review. We invest heavily in fighting fake feedback.",
          },
          {
            Icon: Globe2,
            title: "Bilingual by design",
            text: "Built EN & ES from day one. Many of our pros speak both — communicate the way you prefer.",
          },
          {
            Icon: HeartHandshake,
            title: "Pros first, then platform",
            text: "Our pricing rewards quality work. We don't sell leads to the highest bidder.",
          },
        ],
        quote: "“A platform that finally treats service pros and families like people, not transactions.”",
        quoteAttr: "— Founding provider, Sallisaw OK",
        founderEyebrow: "Meet the founder",
        founderName: "Eloy Hernández",
        founderRole: "CEO & Founder · Getamano & Tiangix",
        founderTagline: "Latino entrepreneur",
        founderLead:
          "One question has followed us since the very beginning: why is it so hard to find a trusted service, at a fair price, from someone who actually does great work?",
        founderQuote:
          "Millions of families across the US look for that every single day. And millions of workers — many of them Latino — offer it. The problem is they've never had the right place to find each other.",
        founderBioParas: [
          "Getamano is our answer. A platform where the best service pros — plumbers, electricians, cleaners, landscapers — get the digital presence they deserve, and where any family in the US can find them, read real reviews, and hire with confidence.",
          "We didn't build this only for the Latino community. We built it because honest work deserves a real platform — and because that work, in great part, is done by Latino hands that still don't have the visibility they deserve.",
          "At tiangix.com we do the same with products: connecting small Latino businesses with every household in the US. Same mission, different path.",
          "If you believe in honest commerce, in work done right, and in technology that brings people closer — you're in the right place.",
        ],
        founderClose: "Welcome.",
        founderLinks: [
          { label: "getamano.us", url: "https://getamano.us", emoji: "🤝" },
          { label: "tiangix.com", url: "https://tiangix.com", emoji: "📦" },
        ],
        founderTrust: "🫂 Latino-founded · Serving all of America",
        ctaTitle: "Ready to experience it?",
        ctaSub: "Whether you need a pro or are one, getamano is open to you.",
        ctaFind: "Find a pro near me",
        ctaJoin: "Join as a provider",
      }
    : {
        seoTitle: "Nosotros — getamano",
        seoDesc:
          "getamano nació en la comunidad latina y creció hasta convertirse en un marketplace de servicios para cada familia en USA. Proveedores verificados, reseñas reales, atención bilingüe.",
        eyebrow: "Latino-built · America-wide",
        title: "Nacimos en nuestra comunidad.",
        title2: "Construido para cada familia en USA.",
        intro:
          "Empezamos ayudando a familias latinas a encontrar proveedores que hablan su idioma y entienden su cultura. Esa base nos enseñó qué se siente la confianza de verdad — y hoy atendemos a cada familia en USA que valora calidad, transparencia y una conexión humana real.",
        statsHeader: "En números",
        stats: [
          { value: "100%", label: "Proveedores verificados" },
          { value: "EN · ES", label: "Atención bilingüe" },
          { value: "50+", label: "Ciudades en USA y creciendo" },
        ],
        storyTitle: "Por qué existe getamano",
        storyParas: [
          "Encontrar un plomero, una limpieza o un electricista confiable no debería ser un salto al vacío — pero para millones de familias en USA, lo es. Las plataformas genéricas esconden a los profesionales detrás de pagos y reseñas falsas. El boca a boca no escala.",
          "Esto lo vimos más claro que nunca en la comunidad latina: profesionales talentosos haciendo trabajos excelentes, sin forma de ser descubiertos más allá de su cuadra. Y familias — latinas y no latinas — pagando por servicios al azar de plataformas anónimas.",
          "getamano es el puente. Verificamos cada proveedor, mostramos reseñas reales de vecinos reales, y hacemos fácil encontrar un pro que hable tu idioma — sea inglés, español o ambos.",
          "Somos fundados por latinos. Atendemos a todo USA. Y apenas estamos empezando.",
        ],
        valuesTitle: "Lo que defendemos",
        values: [
          {
            Icon: Shield,
            title: "Verificación siempre",
            text: "Cada proveedor pasa por validación de identidad y negocio antes de aparecer. Sin cuentas anónimas.",
          },
          {
            Icon: Star,
            title: "Reseñas reales",
            text: "Solo clientes verificados pueden reseñar. Invertimos fuerte en combatir reseñas falsas.",
          },
          {
            Icon: Globe2,
            title: "Bilingüe por diseño",
            text: "Construido en EN y ES desde el día uno. Muchos pros hablan los dos — comunicate como prefieras.",
          },
          {
            Icon: HeartHandshake,
            title: "Primero los pros, luego la plataforma",
            text: "Nuestro modelo premia el trabajo de calidad. No vendemos clientes al mejor postor.",
          },
        ],
        quote: "“Una plataforma que por fin trata a los pros y a las familias como personas, no como transacciones.”",
        quoteAttr: "— Proveedor fundador, Sallisaw OK",
        founderEyebrow: "Conoce al fundador",
        founderName: "Eloy Hernández",
        founderRole: "CEO & Founder · Getamano & Tiangix",
        founderTagline: "Emprendedor latino",
        founderLead:
          "Hay una pregunta que nos ha perseguido desde el principio: ¿por qué es tan difícil encontrar un servicio de confianza, a un precio justo, de alguien que de verdad hace bien su trabajo?",
        founderQuote:
          "Millones de familias en USA buscan eso mismo todos los días. Y millones de trabajadores — muchos de ellos latinos — lo ofrecen. El problema es que nunca han tenido el lugar correcto para encontrarse.",
        founderBioParas: [
          "Getamano es nuestra respuesta. Una plataforma donde los mejores proveedores de servicios — plomeros, electricistas, limpiadores, jardineros — tienen la presencia digital que merecen, y donde cualquier familia en USA puede encontrarlos, leer sus reseñas, y contratarlos con confianza.",
          "No construimos esto solo para la comunidad latina. Lo construimos porque el trabajo honesto merece una plataforma real — y porque ese trabajo, en gran parte, lo hacen manos latinas que todavía no tienen la visibilidad que merecen.",
          "En tiangix.com hacemos lo mismo con productos: conectamos pequeños negocios latinos con cada hogar en USA. Misma misión, distinto camino.",
          "Si crees en el comercio honesto, en el trabajo bien hecho, y en que la tecnología puede acercar a las personas — estás en el lugar correcto.",
        ],
        founderClose: "Bienvenido.",
        founderLinks: [
          { label: "getamano.us", url: "https://getamano.us", emoji: "🤝" },
          { label: "tiangix.com", url: "https://tiangix.com", emoji: "📦" },
        ],
        founderTrust: "🫂 Latino-founded · Serving all of America",
        ctaTitle: "¿Listo para experimentarlo?",
        ctaSub: "Necesites un pro o lo seas tú, getamano está abierto para ti.",
        ctaFind: "Buscar un profesional",
        ctaJoin: "Únete como proveedor",
      };

  return (
    <>
      <SeoHead title={c.seoTitle} description={c.seoDesc} />
      <div className="min-h-screen bg-white">
        <Header />

        {/* ─── Hero ─────────────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden"
          style={{ background: "linear-gradient(160deg, #03045E 0%, #014a52 60%, #013840 100%)" }}
          data-testid="about-hero"
        >
          {/* Decorative dots */}
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{
            backgroundImage: "radial-gradient(#FFF 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }} aria-hidden="true" />
          <div className="relative max-w-5xl mx-auto px-5 md:px-8 py-16 md:py-24">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-[11px] font-semibold text-white/95 mb-5" data-testid="about-eyebrow">
              🫂 <span>{c.eyebrow}</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-[1.1]" data-testid="about-title">
              {c.title}
              <br />
              <span style={{ color: "#5DCAA5" }}>{c.title2}</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-white/85 leading-relaxed max-w-2xl" data-testid="about-intro">
              {c.intro}
            </p>
          </div>
        </section>

        {/* ─── Stats ────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-5 md:px-8 -mt-10 md:-mt-12 relative z-10" data-testid="about-stats">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {c.stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl bg-white border-2 p-5 text-center shadow-sm"
                style={{ borderColor: "#5DCAA5" }}
              >
                <div className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: "#03045E" }}>{s.value}</div>
                <div className="mt-1.5 text-xs uppercase tracking-wider text-slate-500 font-semibold">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Story ────────────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-5 md:px-8 py-16 md:py-20" data-testid="about-story">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 rounded-full" style={{ background: "#F97316" }} />
            <p className="text-[11px] uppercase tracking-[1.5px] font-bold text-slate-500">{c.storyTitle}</p>
          </div>
          <div className="space-y-5">
            {c.storyParas.map((p, i) => (
              <p
                key={i}
                className={i === c.storyParas.length - 1
                  ? "text-lg md:text-xl font-bold text-slate-900 leading-snug"
                  : "text-base md:text-[17px] text-slate-700 leading-relaxed"}
                data-testid={`about-story-para-${i}`}
              >
                {p}
              </p>
            ))}
          </div>
        </section>

        {/* ─── Values ───────────────────────────────────────────────── */}
        <section className="bg-slate-50 py-16 md:py-20" data-testid="about-values">
          <div className="max-w-5xl mx-auto px-5 md:px-8">
            <div className="flex items-center gap-2 mb-8">
              <Sparkles className="w-4 h-4" style={{ color: "#F97316" }} />
              <p className="text-[11px] uppercase tracking-[1.5px] font-bold text-slate-500">{c.valuesTitle}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {c.values.map(({ Icon, title, text }, i) => (
                <div
                  key={title}
                  className="rounded-2xl bg-white p-5 md:p-6 border border-slate-200 hover:border-teal-300 hover:shadow-md transition"
                  data-testid={`about-value-${i}`}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "#EFF9F7" }}>
                    <Icon className="w-5 h-5" style={{ color: "#03045E" }} />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Pull quote ───────────────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-5 md:px-8 py-16 md:py-20 text-center" data-testid="about-quote">
          <Quote className="w-8 h-8 mx-auto mb-4 opacity-30" style={{ color: "#03045E" }} />
          <p className="text-xl md:text-2xl font-bold text-slate-900 leading-snug italic">
            {c.quote}
          </p>
          <p className="mt-4 text-sm text-slate-500 font-semibold">{c.quoteAttr}</p>
        </section>

        {/* ─── Founder ──────────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden"
          style={{ background: "linear-gradient(180deg, #F8FCFD 0%, #FFFFFF 100%)" }}
          data-testid="about-founder"
        >
          <div className="max-w-5xl mx-auto px-5 md:px-8 py-16 md:py-20">
            <div className="flex items-center gap-2 mb-8">
              <Sparkles className="w-4 h-4" style={{ color: "#F97316" }} />
              <p className="text-[11px] uppercase tracking-[1.5px] font-bold text-slate-500" data-testid="about-founder-eyebrow">
                {c.founderEyebrow}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 md:gap-10 items-start">
              {/* Portrait with mint ring */}
              <div className="relative mx-auto md:mx-0 flex-shrink-0">
                <div
                  className="absolute -inset-2 rounded-full opacity-20"
                  style={{ background: "radial-gradient(circle, #5DCAA5 0%, transparent 70%)" }}
                  aria-hidden="true"
                />
                <img
                  src="/avatars/founder-e-hernandez.png"
                  alt="Eloy Hernández, founder of getamano"
                  loading="lazy"
                  className="relative w-40 h-40 md:w-48 md:h-48 rounded-full object-cover shadow-xl"
                  style={{ border: "4px solid #FFFFFF", boxShadow: "0 12px 40px -10px rgba(2,95,103,0.35)" }}
                  data-testid="about-founder-image"
                />
                {/* Mexico flag — heritage badge (bottom-right) */}
                <span
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full text-white text-base font-bold flex items-center justify-center shadow-lg border-2 border-white"
                  style={{ background: "#5DCAA5" }}
                  aria-label="Mexican-American heritage"
                  data-testid="about-founder-flag-mx"
                >
                  🇲🇽
                </span>
                {/* USA flag — serving-all-of-America badge (bottom-left) */}
                <span
                  className="absolute -bottom-1 -left-1 w-9 h-9 rounded-full text-white text-base font-bold flex items-center justify-center shadow-lg border-2 border-white"
                  style={{ background: "#1D4ED8" }}
                  aria-label="Serving all of America"
                  data-testid="about-founder-flag-us"
                >
                  🇺🇸
                </span>
              </div>

              {/* Bio */}
              <div className="min-w-0">
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight" data-testid="about-founder-name">
                  {c.founderName}
                </h2>
                <p className="mt-1 text-sm font-semibold" style={{ color: "#03045E" }} data-testid="about-founder-role">
                  {c.founderRole}
                </p>
                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[1.2px] text-slate-400" data-testid="about-founder-tagline">
                  {c.founderTagline}
                </p>

                {/* Lead question */}
                <p className="mt-5 text-base md:text-[17px] text-slate-700 leading-relaxed" data-testid="about-founder-lead">
                  {c.founderLead}
                </p>

                {/* Pull quote */}
                <blockquote
                  className="mt-5 pl-4 italic text-slate-800 text-[15px] md:text-base leading-relaxed"
                  style={{ borderLeft: "3px solid #F97316" }}
                  data-testid="about-founder-quote"
                >
                  "{c.founderQuote}"
                </blockquote>

                {/* Bio paragraphs */}
                <div className="mt-5 space-y-3">
                  {c.founderBioParas.map((p, i) => (
                    <p
                      key={i}
                      className="text-base text-slate-700 leading-relaxed"
                      data-testid={`about-founder-bio-${i}`}
                    >
                      {p}
                    </p>
                  ))}
                </div>

                {/* Welcome close */}
                <p className="mt-4 text-xl font-extrabold" style={{ color: "#03045E" }} data-testid="about-founder-close">
                  {c.founderClose}
                </p>

                {/* Cross-project links */}
                <div className="mt-5 flex flex-wrap gap-2" data-testid="about-founder-links">
                  {c.founderLinks.map((link, i) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-bold transition hover:-translate-y-0.5 hover:shadow-md"
                      style={i === 0
                        ? { background: "#03045E", color: "#FFFFFF", boxShadow: "0 4px 12px rgba(2,95,103,0.25)" }
                        : { background: "#FEF3C7", color: "#92400E", border: "1.5px solid #F59E0B" }}
                      data-testid={`about-founder-link-${i}`}
                    >
                      <span aria-hidden="true">{link.emoji}</span> {link.label}
                    </a>
                  ))}
                </div>

                {/* Trust pill */}
                <div
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                  style={{ background: "#EFF9F7", color: "#03045E", border: "1px solid #5DCAA5" }}
                  data-testid="about-founder-trust"
                >
                  {c.founderTrust}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── CTA ──────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-5 md:px-8 pb-20" data-testid="about-cta">
          <div
            className="relative overflow-hidden rounded-3xl p-8 md:p-12 text-center"
            style={{ background: "linear-gradient(135deg, #03045E 0%, #014a52 100%)" }}
          >
            <Users className="absolute top-4 right-4 w-20 h-20 opacity-5" style={{ color: "#5DCAA5" }} aria-hidden="true" />
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{c.ctaTitle}</h2>
            <p className="mt-2 text-white/80 text-base">{c.ctaSub}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/search"
                className="inline-flex items-center gap-1.5 px-6 py-3 rounded-full text-sm font-bold text-white transition hover:brightness-110 active:scale-95"
                style={{ background: "#F97316", boxShadow: "0 4px 16px rgba(249,115,22,0.35)" }}
                data-testid="about-cta-find"
              >
                <CheckCircle2 className="w-4 h-4" />
                {c.ctaFind}
              </Link>
              <Link
                to="/register?intent=provider"
                className="inline-flex items-center gap-1 px-5 py-3 rounded-full text-sm font-bold text-white transition hover:bg-white/10"
                style={{ border: "1.5px solid rgba(255,255,255,0.4)" }}
                data-testid="about-cta-join"
              >
                {c.ctaJoin} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
