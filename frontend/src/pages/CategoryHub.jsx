import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { ShieldCheck, Star, MapPin, Award, ArrowRight, ChevronDown, ChevronUp, MessageSquare, Sparkles, ArrowLeft } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { SeoHead, Breadcrumbs, buildBreadcrumbsJsonLd } from "../components/seo/SeoHead";
import { CATEGORY_VISUALS } from "../components/CategoryCard";
import OwnerIdentityBadge from "../components/OwnerIdentityBadge";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * /categoria/:slug  (alias /category/:slug)
 *
 * SEO-optimised category landing. Each one renders:
 *   • Unique <title>, meta description, canonical, OG, Twitter cards
 *   • Schema.org Service + ItemList + BreadcrumbList JSON-LD
 *   • Hero matching the category's gradient + Lucide icon
 *   • Filtered provider list (uses existing /api/providers?category= endpoint)
 *   • FAQ accordion answering 4–5 questions Google surfaces in "People Also Ask"
 *   • CTAs to request a quote and to onboard as a provider
 */

// Per-category SEO copy. Keys must match category.slug.
// h1 / description / faqs are written manually so Google indexes
// authentic, search-aligned content (not generic templates).
const SEO_COPY = {
  cleaning: {
    h1Es: "Servicios de limpieza profesional",
    h1En: "Professional cleaning services",
    descEs: "Encuentra empresas y profesionales latinos de limpieza verificados. Limpieza de casas, oficinas, post-construcción y profundas. Cotización gratis en minutos.",
    descEn: "Find verified Latino-owned cleaning professionals. Home, office, post-construction and deep cleaning. Free quotes in minutes.",
    faqsEs: [
      { q: "¿Cuánto cuesta una limpieza profunda?", a: "El precio promedio en USA es entre $150 y $400 según el tamaño de la casa. En getamano te conectamos con varios proveedores latinos para que recibas cotizaciones gratis y elijas la mejor." },
      { q: "¿Los limpiadores traen sus propios productos?", a: "La mayoría sí. Cada perfil del proveedor en getamano detalla qué incluye su servicio. También puedes filtrar por “productos ecológicos”." },
      { q: "¿Cómo verifican a los limpiadores en getamano?", a: "Validamos identidad real, dirección y nombre del negocio. Los proveedores con sello azul han pasado verificación adicional." },
      { q: "¿Puedo agendar limpiezas recurrentes?", a: "Sí. Contacta directamente al proveedor para acuerdos semanales, quincenales o mensuales." },
    ],
    faqsEn: [
      { q: "How much does a deep cleaning cost?", a: "Average prices in the US range from $150 to $400 depending on home size. getamano connects you with multiple Latino providers so you get free quotes and pick the best." },
      { q: "Do cleaners bring their own supplies?", a: "Most do. Each provider profile lists what's included. You can also filter by “eco-friendly products”." },
      { q: "How do you verify cleaners on getamano?", a: "We validate real identity, address and business name. Providers with the blue badge passed additional verification." },
      { q: "Can I book recurring cleanings?", a: "Yes — contact the provider directly to arrange weekly, biweekly or monthly visits." },
    ],
  },
  catering: {
    h1Es: "Catering y comida latina para tu evento",
    h1En: "Latino catering and event food",
    descEs: "Cocineros y empresas de catering latinos verificados: tacos, pupusas, asados, comida tradicional y bebidas. Para bodas, quinceañeras, oficinas y reuniones.",
    descEn: "Verified Latino caterers and chefs: tacos, pupusas, BBQ, traditional food and drinks. Perfect for weddings, quinceañeras, offices and gatherings.",
    faqsEs: [
      { q: "¿Cuánto cobran por persona?", a: "Depende del menú. En USA, comida latina de catering va desde $12 a $40 por persona. Recibe cotizaciones reales gratis enviando tu solicitud." },
      { q: "¿Sirven bodas y quinceañeras?", a: "Sí. Muchos proveedores se especializan en eventos grandes con meseros, montaje y decoración incluida." },
      { q: "¿Tienen opciones vegetarianas o sin gluten?", a: "Cada proveedor lista su menú en su perfil. Pregunta antes de confirmar para que adapten." },
    ],
    faqsEn: [
      { q: "What's the price per person?", a: "Depends on menu. Latino catering in the US runs from $12 to $40 per person. Send a quote request to get real pricing free." },
      { q: "Do they cater weddings and quinceañeras?", a: "Yes. Many providers specialize in large events with waitstaff, setup and decoration included." },
      { q: "Do they offer vegetarian or gluten-free options?", a: "Each provider lists their menu. Ask before confirming so they can adjust." },
    ],
  },
  construction: {
    h1Es: "Servicios de construcción y remodelación",
    h1En: "Construction and remodeling services",
    descEs: "Constructores latinos verificados: remodelaciones, ampliaciones, drywall, gabinetes, pisos y techos. Trabajos pequeños y grandes con cotización gratis.",
    descEn: "Verified Latino contractors: remodels, additions, drywall, cabinets, flooring and roofing. Small and large jobs with free quotes.",
    faqsEs: [
      { q: "¿Tienen licencia y seguro?", a: "En getamano puedes filtrar por proveedores con licencia y seguro vigente. Mira el sello en cada perfil." },
      { q: "¿Hacen trabajos pequeños como reparaciones?", a: "Sí. Muchos contratistas también aceptan handyman o trabajos pequeños — verifica en su perfil de servicios." },
      { q: "¿Cuánto se demora una remodelación de cocina?", a: "El promedio es 4–8 semanas. Pide a 2–3 proveedores que te den cronograma para comparar." },
    ],
    faqsEn: [
      { q: "Are they licensed and insured?", a: "Filter by licensed/insured providers in the search. Each profile shows the badge." },
      { q: "Do they do small repair jobs?", a: "Yes. Many contractors also accept handyman work — check their listed services." },
      { q: "How long does a kitchen remodel take?", a: "Typically 4–8 weeks. Ask 2–3 providers for a timeline to compare." },
    ],
  },
  handyman: {
    h1Es: "Mantenimiento y reparaciones en casa",
    h1En: "Handyman and home repairs",
    descEs: "Profesionales latinos de mantenimiento general: reparaciones, instalaciones, fugas, electricidad básica, montaje de muebles y más. Mismo día disponible.",
    descEn: "Latino handyman professionals: repairs, installations, leaks, basic electrical, furniture assembly and more. Same-day availability.",
    faqsEs: [
      { q: "¿Atienden el mismo día?", a: "Muchos proveedores ofrecen servicio de emergencia. Filtra por “disponible hoy” en la búsqueda." },
      { q: "¿Cuánto cobran por hora?", a: "El promedio es $45–$95/hora en USA según ciudad y especialidad." },
      { q: "¿Pueden hacer varias reparaciones en una visita?", a: "Sí — al contrario, te ahorra dinero. Pídele al proveedor que liste todo antes de empezar." },
    ],
    faqsEn: [
      { q: "Do they offer same-day service?", a: "Many do. Filter by “available today” in search." },
      { q: "What's the hourly rate?", a: "Typical range is $45–$95/hour in the US depending on city and specialty." },
      { q: "Can they do multiple repairs in one visit?", a: "Yes — in fact, it saves you money. Ask the provider to list everything before they start." },
    ],
  },
  auto: {
    h1Es: "Mecánicos y servicios automotrices",
    h1En: "Auto mechanics and automotive services",
    descEs: "Mecánicos latinos verificados: frenos, transmisión, llantas, hojalatería, A/C de autos, audio y mecánica a domicilio.",
    descEn: "Verified Latino mechanics: brakes, transmission, tires, body work, auto A/C, audio and mobile mechanics.",
    faqsEs: [
      { q: "¿Hacen mecánica a domicilio?", a: "Algunos sí. Filtra por “a domicilio” o pregúntale al proveedor antes de agendar." },
      { q: "¿Aceptan flotillas o seguros?", a: "Cada perfil indica si trabaja con seguros. Pregunta directamente." },
      { q: "¿Cuánto cuesta cambio de aceite?", a: "$25–$80 según tipo de aceite y filtro." },
    ],
    faqsEn: [
      { q: "Do they offer mobile service?", a: "Some do. Filter by “mobile” or ask before booking." },
      { q: "Do they accept insurance or fleets?", a: "Each profile indicates insurance partnerships. Ask directly to confirm." },
      { q: "How much for an oil change?", a: "$25–$80 depending on oil type and filter." },
    ],
  },
  beauty: {
    h1Es: "Belleza y cuidado personal",
    h1En: "Beauty and personal care",
    descEs: "Estilistas, barberos, manicuristas, maquillistas y especialistas latinos de belleza. Servicios en salón o a domicilio para bodas, quinceañeras y eventos.",
    descEn: "Latino stylists, barbers, manicurists, makeup artists and beauty pros. In-salon or mobile service for weddings, quinceañeras and events.",
    faqsEs: [
      { q: "¿Atienden a domicilio para eventos?", a: "Sí. Muchos profesionales ofrecen servicio mobile para quinceañeras, bodas y sesiones de fotos." },
      { q: "¿Cuánto cuesta un maquillaje para evento?", a: "Entre $80 y $250 dependiendo del estilo y si incluye peinado." },
      { q: "¿Hablan español?", a: "Todos los proveedores en getamano hablan español. Filtra por “bilingüe” si necesitas inglés también." },
    ],
    faqsEn: [
      { q: "Do they offer mobile service for events?", a: "Yes — many offer on-site service for quinceañeras, weddings and photoshoots." },
      { q: "How much for event makeup?", a: "$80 to $250 depending on style and whether hair is included." },
      { q: "Do they speak Spanish?", a: "All getamano providers speak Spanish. Filter by “bilingual” if you also need English." },
    ],
  },
  moving: {
    h1Es: "Mudanzas y empresas de moving latinas",
    h1En: "Latino moving companies",
    descEs: "Empresas latinas de mudanzas locales y de larga distancia. Cargadores, camiones, embalaje y desempaquetado.",
    descEn: "Latino-owned local and long-distance moving companies. Loaders, trucks, packing and unpacking.",
    faqsEs: [
      { q: "¿Cuánto cuesta una mudanza local?", a: "Entre $300 y $1,500 según tamaño de casa y horas. Recibe 3 cotizaciones gratis para comparar." },
      { q: "¿Hacen mudanzas largas entre estados?", a: "Sí — busca el filtro “interestatal”. Pueden tomar 2–7 días." },
      { q: "¿Tienen seguro contra daños?", a: "Las empresas verificadas en getamano sí. Verifica el sello azul en su perfil." },
    ],
    faqsEn: [
      { q: "How much for a local move?", a: "Typically $300 to $1,500 depending on home size and hours. Get 3 free quotes to compare." },
      { q: "Do they do long-distance interstate moves?", a: "Yes — filter by “interstate”. Usually 2–7 days." },
      { q: "Do they offer damage insurance?", a: "Verified companies on getamano do. Check the blue badge on their profile." },
    ],
  },
  legal: {
    h1Es: "Servicios legales y abogados latinos",
    h1En: "Latino legal services and lawyers",
    descEs: "Abogados latinos especializados en inmigración, familia, laboral, accidentes y bienes raíces. Consultas en español.",
    descEn: "Latino lawyers specializing in immigration, family, labor, accidents and real estate. Spanish-language consultations.",
    faqsEs: [
      { q: "¿La consulta es gratis?", a: "Muchos abogados en getamano ofrecen primera consulta gratis. Filtra por “consulta gratuita”." },
      { q: "¿Hacen casos de inmigración?", a: "Sí. Hay abogados especializados en visas U, asilo, ciudadanía y reunificación familiar." },
      { q: "¿Aceptan pagos en cuotas?", a: "Cada abogado define sus términos. Confirma directamente al contactarlo." },
    ],
    faqsEn: [
      { q: "Is the consultation free?", a: "Many getamano lawyers offer a free first consultation. Filter by “free consultation”." },
      { q: "Do they handle immigration cases?", a: "Yes — lawyers specializing in U visas, asylum, citizenship and family reunification are available." },
      { q: "Do they accept payment plans?", a: "Each lawyer sets their own terms. Confirm when you contact them." },
    ],
  },
  landscaping: {
    h1Es: "Jardinería y diseño de paisajes",
    h1En: "Landscaping and garden design",
    descEs: "Profesionales latinos de jardinería: corte de césped, podas, instalación de sod, riego, diseño de jardines y mantenimiento mensual.",
    descEn: "Latino landscaping pros: lawn mowing, pruning, sod installation, irrigation, garden design and monthly maintenance.",
    faqsEs: [
      { q: "¿Cuánto cuesta cortar el césped?", a: "$30–$80 por visita según tamaño del lote y frecuencia. Contratos mensuales bajan el precio." },
      { q: "¿Diseñan jardines completos?", a: "Sí. Filtra por “diseño de paisajes” para encontrar especialistas." },
      { q: "¿Vienen mensualmente?", a: "Muchos proveedores ofrecen contratos mensuales o quincenales — pregunta al solicitar la cotización." },
    ],
    faqsEn: [
      { q: "How much to mow the lawn?", a: "$30–$80 per visit depending on lot size and frequency. Monthly contracts get a discount." },
      { q: "Do they design full gardens?", a: "Yes. Filter by “landscape design” to find specialists." },
      { q: "Do they come monthly?", a: "Many providers offer monthly or biweekly contracts — ask when requesting your quote." },
    ],
  },
  events: {
    h1Es: "Eventos: DJs, fotografía, decoración y más",
    h1En: "Events: DJs, photography, decoration and more",
    descEs: "Profesionales latinos para tu evento: DJs, fotógrafos, mariachis, decoradores, planners de quinceañera y bodas, brincolines y piñatas.",
    descEn: "Latino professionals for your event: DJs, photographers, mariachis, decorators, quinceañera/wedding planners, bounce houses and piñatas.",
    faqsEs: [
      { q: "¿Cuánto cuesta un DJ para quinceañera?", a: "$400–$1,500 según horas, equipo y experiencia. Recibe cotizaciones gratis para comparar." },
      { q: "¿Tienen mariachis?", a: "Sí — busca por “mariachi” o “animación de fiestas”." },
      { q: "¿Hacen paquetes completos?", a: "Sí, muchos planners ofrecen paquete (decoración + DJ + fotografía + mesero). Pregunta al solicitar." },
    ],
    faqsEn: [
      { q: "How much for a quinceañera DJ?", a: "$400–$1,500 depending on hours, equipment and experience. Get free quotes to compare." },
      { q: "Do you have mariachis?", a: "Yes — search “mariachi” or “party entertainment”." },
      { q: "Do they offer all-in-one packages?", a: "Yes — many planners offer combo packages (decoration + DJ + photo + waitstaff). Ask when requesting." },
    ],
  },
  tutoring: {
    h1Es: "Tutoría y clases particulares en español",
    h1En: "Tutoring and private classes in Spanish",
    descEs: "Tutores latinos para todas las edades: matemáticas, inglés, español, música, arte, baile y computación. Clases en línea o presenciales.",
    descEn: "Latino tutors for all ages: math, English, Spanish, music, art, dance and computers. Online or in-person classes.",
    faqsEs: [
      { q: "¿Cuánto cobran por hora?", a: "$25–$80/hora según materia y nivel. Tutoría especializada (SAT, AP, AP Spanish) es más cara." },
      { q: "¿Hacen clases en línea?", a: "Sí — filtra por “online” o “virtual” en la búsqueda." },
      { q: "¿Trabajan con niños y adultos?", a: "La mayoría sí. Cada perfil indica los rangos de edad y materias." },
    ],
    faqsEn: [
      { q: "What's the hourly rate?", a: "$25–$80/hour depending on subject and level. Specialized tutoring (SAT, AP) is more." },
      { q: "Do they teach online?", a: "Yes — filter by “online” or “virtual” in search." },
      { q: "Do they work with kids and adults?", a: "Most do. Each profile lists age ranges and subjects." },
    ],
  },
  health: {
    h1Es: "Salud, bienestar y cuidado de mayores",
    h1En: "Health, wellness and elder care",
    descEs: "Profesionales latinos de salud: nutricionistas, terapia física, masajes, yoga, enfermería a domicilio, cuidado de mayores y medicina alternativa.",
    descEn: "Latino health pros: nutritionists, physical therapy, massage, yoga, in-home nursing, elder care and alternative medicine.",
    faqsEs: [
      { q: "¿Aceptan seguros médicos?", a: "Algunos sí — verifica en cada perfil. Otros aceptan pago directo con descuento." },
      { q: "¿Hacen visitas a domicilio?", a: "Enfermería, masajes y terapia física suelen tener servicio mobile. Filtra por “a domicilio”." },
      { q: "¿Hablan español los profesionales?", a: "Todos los proveedores en getamano hablan español. Filtra por “bilingüe” si quieres inglés también." },
    ],
    faqsEn: [
      { q: "Do they accept health insurance?", a: "Some do — check each profile. Others accept direct payment with a discount." },
      { q: "Do they offer in-home visits?", a: "Nursing, massage and physical therapy commonly offer mobile service. Filter by “mobile”." },
      { q: "Do providers speak Spanish?", a: "All getamano providers speak Spanish. Filter by “bilingual” if you also want English." },
    ],
  },
};

const FALLBACK_COPY = {
  h1Es: null, h1En: null, descEs: null, descEn: null,
  faqsEs: [
    { q: "¿Cómo verifican a los proveedores?", a: "Cada profesional pasa validación de identidad y dirección. Los verificados muestran sello azul en su perfil." },
    { q: "¿Cuánto cuesta usar getamano?", a: "Para clientes es 100% gratis. Solo pagas al proveedor el servicio que contratas." },
    { q: "¿Puedo dejar reseñas?", a: "Sí — al terminar el servicio, recibes un email para calificarlo. Las reseñas son públicas y verificadas." },
  ],
  faqsEn: [
    { q: "How do you verify providers?", a: "Every pro passes identity and address validation. Verified ones show a blue badge on their profile." },
    { q: "How much does getamano cost?", a: "It's 100% free for clients. You only pay the provider for the service you book." },
    { q: "Can I leave reviews?", a: "Yes — after the service, you'll get an email to rate it. Reviews are public and verified." },
  ],
};

const FALLBACK_VISUAL = { gradient: "linear-gradient(145deg, #03045E 0%, #0077B6 50%, #0ABAB5 100%)", accent: "#5EEAD4" };

export default function CategoryHub() {
  const { slug } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const [category, setCategory] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(0);

  const cityFilter = search.get("city") || "";
  const stateFilter = search.get("state") || "";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.get("/categories"),
      api.get("/providers", { params: { category: slug, limit: 12, ...(cityFilter && { city: cityFilter }), ...(stateFilter && { state: stateFilter }) } }),
    ])
      .then(([catsRes, provRes]) => {
        if (!alive) return;
        const cat = (catsRes.data || []).find(c => c.slug === slug);
        setCategory(cat || { slug, name_es: slug, name_en: slug });
        setProviders(provRes.data || []);
      })
      .catch(() => alive && setProviders([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [slug, cityFilter, stateFilter]);

  const visual = CATEGORY_VISUALS[slug] || FALLBACK_VISUAL;
  const Icon = visual.icon;
  const copy = SEO_COPY[slug] || FALLBACK_COPY;

  const name = category ? (lang === "es" ? category.name_es : category.name_en) : slug;
  const h1 = lang === "es" ? (copy.h1Es || `${category?.name_es || name} en USA`) : (copy.h1En || `${category?.name_en || name} in the US`);
  const description = lang === "es"
    ? (copy.descEs || `Encuentra ${name?.toLowerCase()} latinos verificados en getamano. Servicios cerca de ti, en español.`)
    : (copy.descEn || `Find verified Latino ${name?.toLowerCase()} on getamano. Services near you, in Spanish.`);
  const faqs = lang === "es" ? copy.faqsEs : copy.faqsEn;
  const locationLabel = cityFilter ? `${cityFilter}${stateFilter ? `, ${stateFilter}` : ""}` : "";

  const origin = typeof window !== "undefined" ? window.location.origin : "https://getamano.us";
  const canonical = `${origin}/categoria/${slug}${cityFilter ? `?city=${encodeURIComponent(cityFilter)}` : ""}`;

  const breadcrumbs = useMemo(() => ([
    { label: lang === "es" ? "Inicio" : "Home", to: "/" },
    { label: lang === "es" ? "Servicios" : "Services", to: "/buscar" },
    { label: name },
  ]), [lang, name]);

  const breadcrumbsLd = buildBreadcrumbsJsonLd(breadcrumbs, origin);

  // Schema.org Service + FAQPage + ItemList
  const jsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbsLd,
      {
        "@type": "Service",
        "name": h1,
        "description": description,
        "provider": {
          "@type": "Organization",
          "name": "getamano",
          "url": origin,
          "logo": `${origin}/getamano-logo-full.png`,
        },
        "areaServed": locationLabel || "United States",
        "serviceType": name,
      },
      {
        "@type": "ItemList",
        "name": h1,
        "numberOfItems": providers.length,
        "itemListElement": providers.slice(0, 10).map((p, idx) => ({
          "@type": "ListItem",
          "position": idx + 1,
          "url": `${origin}/p/${p.slug || p.provider_id}`,
          "name": p.business_name,
        })),
      },
      {
        "@type": "FAQPage",
        "mainEntity": faqs.map(f => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a },
        })),
      },
    ],
  }), [breadcrumbsLd, h1, description, locationLabel, name, providers, faqs, origin]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <SeoHead title={`${h1}${locationLabel ? ` en ${locationLabel}` : ""}`} description={description} canonical={canonical} jsonLd={jsonLd} />
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden text-white" data-testid="category-hub-hero">
        <div className="absolute inset-0" style={{ background: visual.gradient }} />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1.5px 1.5px, white 1.2px, transparent 0)", backgroundSize: "16px 16px" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 50% at 25% 0%, rgba(255,255,255,0.18), transparent 70%)" }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:pt-12 sm:pb-16">
          <Breadcrumbs items={breadcrumbs} />
          <button
            onClick={() => navigate(-1)}
            className="hidden sm:inline-flex items-center gap-1 text-white/80 hover:text-white text-sm mb-3"
            data-testid="category-back-btn"
          >
            <ArrowLeft className="w-4 h-4" /> {lang === "es" ? "Volver" : "Back"}
          </button>

          <div className="grid sm:grid-cols-[auto_1fr] gap-5 sm:gap-7 items-center">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.15)", border: `2px solid ${visual.accent}55` }}
            >
              {Icon && <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-white" strokeWidth={1.5} />}
            </div>
            <div>
              <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.1] text-white" style={{ color: "#FFFFFF", textShadow: "0 2px 12px rgba(0,0,0,0.18)" }} data-testid="category-hub-h1">
                {h1}{locationLabel && <span className="text-white/85"> en {locationLabel}</span>}
              </h1>
              <p className="mt-3 text-base sm:text-lg text-white/80 leading-relaxed max-w-3xl" data-testid="category-hub-description">
                {description}
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link
                  to={`/buscar?category=${slug}${cityFilter ? `&city=${encodeURIComponent(cityFilter)}` : ""}`}
                  className="px-5 py-2.5 rounded-full font-semibold text-sm inline-flex items-center gap-2 hover:scale-[1.02] transition"
                  style={{ background: "white", color: "#03045E" }}
                  data-testid="category-cta-search"
                >
                  <Sparkles className="w-4 h-4" /> {lang === "es" ? "Ver todos los proveedores" : "See all providers"}
                </Link>
                <Link
                  to="/registro?role=provider"
                  className="px-5 py-2.5 rounded-full font-semibold text-sm inline-flex items-center gap-2 border border-white/30 hover:bg-white/10 transition"
                  style={{ color: "white" }}
                  data-testid="category-cta-onboard"
                >
                  {lang === "es" ? "Soy proveedor" : "I'm a provider"} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROVIDERS GRID */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-slate-900" data-testid="category-providers-title">
            {lang === "es" ? "Proveedores destacados" : "Featured providers"}
          </h2>
          <Link to={`/buscar?category=${slug}`} className="text-sm font-semibold text-teal-700 hover:underline inline-flex items-center gap-1" data-testid="category-see-all-link">
            {lang === "es" ? "Ver todos" : "See all"} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-56 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : providers.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center" data-testid="category-empty-state">
            <p className="font-display font-bold text-slate-900 text-lg">
              {lang === "es" ? `Aún no tenemos proveedores de ${name?.toLowerCase()} aquí` : `No ${name?.toLowerCase()} providers here yet`}
            </p>
            <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
              {lang === "es"
                ? "Estamos creciendo. Publica tu eCard gratis y sé de los primeros en esta categoría."
                : "We're growing. Publish your free eCard and be among the first in this category."}
            </p>
            <Link to="/registro?role=provider" className="mt-4 inline-flex px-5 py-2.5 rounded-full font-semibold text-white" style={{ backgroundColor: "#03045E" }} data-testid="category-empty-onboard">
              {lang === "es" ? "Soy proveedor" : "I'm a provider"}
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="category-providers-grid">
            {providers.map((p) => <ProviderTile key={p.provider_id} p={p} lang={lang} />)}
          </div>
        )}
      </section>

      {/* TRUST STRIP */}
      <section className="bg-slate-100/60 py-10 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid sm:grid-cols-3 gap-5">
          <TrustItem icon={ShieldCheck} title={lang === "es" ? "Verificados" : "Verified"} body={lang === "es" ? "Identidad real, dirección y negocio validados." : "Real identity, address and business validated."} />
          <TrustItem icon={Star} title={lang === "es" ? "Reseñas reales" : "Real reviews"} body={lang === "es" ? "Solo de clientes que contrataron el servicio." : "Only from clients who hired the service."} />
          <TrustItem icon={Award} title={lang === "es" ? "100% gratis para clientes" : "100% free for clients"} body={lang === "es" ? "Solo pagas al proveedor el servicio que contratas." : "You only pay the provider for the service you book."} />
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-slate-900 mb-6 text-center" data-testid="category-faq-title">
          {lang === "es" ? "Preguntas frecuentes" : "Frequently asked questions"}
        </h2>
        <div className="space-y-2.5">
          {faqs.map((f, i) => {
            const open = openFaq === i;
            return (
              <button
                key={i}
                onClick={() => setOpenFaq(open ? -1 : i)}
                className="w-full text-left bg-white rounded-2xl border border-slate-200 px-4 sm:px-5 py-4 hover:border-slate-300 transition"
                data-testid={`category-faq-${i}`}
                aria-expanded={open}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900 text-sm sm:text-base">{f.q}</span>
                  {open ? <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                </div>
                {open && <p className="mt-3 text-sm text-slate-600 leading-relaxed" data-testid={`category-faq-${i}-answer`}>{f.a}</p>}
              </button>
            );
          })}
        </div>

        {/* CTA strip below FAQs */}
        <div className="mt-10 rounded-3xl p-6 sm:p-8 text-center text-white" style={{ background: visual.gradient }}>
          <p className="font-display font-bold text-xl sm:text-2xl">{lang === "es" ? "¿Listo para empezar?" : "Ready to get started?"}</p>
          <p className="text-white/85 text-sm mt-2 max-w-md mx-auto">
            {lang === "es" ? "Recibe cotizaciones gratis de proveedores latinos verificados en tu zona." : "Get free quotes from verified Latino providers in your area."}
          </p>
          <Link
            to={`/buscar?category=${slug}`}
            className="inline-flex mt-5 px-6 py-3 rounded-full bg-white font-semibold text-sm hover:scale-[1.02] transition gap-2 items-center"
            style={{ color: "#03045E" }}
            data-testid="category-bottom-cta"
          >
            <MessageSquare className="w-4 h-4" /> {lang === "es" ? "Solicita una cotización" : "Get a free quote"}
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function TrustItem({ icon: Icon, title, body }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
        <Icon className="w-5 h-5" style={{ color: "#03045E" }} />
      </div>
      <div>
        <p className="font-semibold text-slate-900 text-sm">{title}</p>
        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function ProviderTile({ p, lang }) {
  const rating = p.avg_rating || 0;
  const reviews = p.review_count || 0;
  return (
    <Link
      to={`/p/${p.slug || p.provider_id}`}
      className="group bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition overflow-hidden flex flex-col"
      data-testid={`category-provider-${p.provider_id}`}
    >
      <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
        {p.cover_url || p.photo_url ? (
          <img
            src={p.cover_url || p.photo_url}
            alt={p.business_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-3xl font-bold">
            {(p.business_name || "?").charAt(0).toUpperCase()}
          </div>
        )}
        {p.verification_status === "approved" && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[11px] font-semibold">
            <ShieldCheck className="w-3 h-3" /> {lang === "es" ? "Verificado" : "Verified"}
          </span>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-display font-bold text-slate-900 text-base group-hover:text-teal-700 transition leading-tight">
          {p.business_name}
        </h3>
        {(p.city || p.state) && (
          <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {p.city}{p.city && p.state ? ", " : ""}{p.state}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1.5 text-sm">
          {reviews > 0 ? (
            <>
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-slate-900">{rating.toFixed(1)}</span>
              <span className="text-slate-500 text-xs">({reviews})</span>
            </>
          ) : (
            <span className="text-xs text-slate-400">
              {lang === "es" ? "Sin reseñas aún" : "No reviews yet"}
            </span>
          )}
        </div>
        <div className="mt-auto pt-3">
          {p.owner_identity && <OwnerIdentityBadge identity={p.owner_identity} flag={p.owner_flag} />}
        </div>
      </div>
    </Link>
  );
}
