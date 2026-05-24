import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { SeoHead, Breadcrumbs, buildBreadcrumbsJsonLd } from "../../components/seo/SeoHead";
import OwnerIdentityBadge from "../../components/OwnerIdentityBadge";
import { ShieldCheck, Star, MapPin, Phone, MessageCircle, Award } from "lucide-react";
import CategoryIcon from "../../components/CategoryIcon";
import { buildAlternates } from "../../lib/seoUrls";

export default function SeoPage() {
  const { categorySlug, citySlug } = useParams();
  const location = useLocation();
  const isEn = location.pathname.startsWith("/services/");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiContent, setAiContent] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/seo/page/${categorySlug}/${citySlug}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    // Fetch unique AI-generated SEO paragraph (cached server-side, ES source).
    // For EN routes we send the ES paragraph through /api/translate (also cached
    // 90 days) so Google indexes a proper English version on the /services/...
    // canonical URL.
    api.get(`/seo/content/${categorySlug}/${citySlug}`)
      .then(async (r) => {
        const esText = r.data.content;
        if (!isEn) { setAiContent(esText); return; }
        try {
          const tr = await api.post("/translate", {
            text: esText,
            source_id: `seo:${categorySlug}/${citySlug}`,
            source_field: "ai_content",
            source_lang: "es",
            target_lang: "en",
          });
          setAiContent(tr.data?.translated_text || esText);
        } catch (_e) {
          setAiContent(esText);
        }
      })
      .catch(() => setAiContent(null));
  }, [categorySlug, citySlug, isEn]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://getamano.us";

  if (loading) {
    return <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}><Header /><div className="max-w-7xl mx-auto px-4 py-12 text-slate-500">Cargando…</div><Footer /></div>;
  }
  if (!data) {
    return <div className="min-h-screen"><Header /><div className="max-w-7xl mx-auto px-4 py-12">No encontrado</div><Footer /></div>;
  }

  const { category, city, providers, related_cities, related_categories } = data;
  const catName = isEn ? (category.name_en || category.name_es) : category.name_es;
  const catNameLower = catName.toLowerCase();
  const breadcrumbs = isEn ? [
    { label: "Home", to: "/" },
    { label: "Services", to: "/services" },
    { label: catName, to: `/services/${category.slug}` },
    { label: city.name },
  ] : [
    { label: "Inicio", to: "/" },
    { label: "Servicios", to: "/servicios" },
    { label: category.name_es, to: `/servicios/${category.slug}` },
    { label: city.name },
  ];

  const title = isEn
    ? `${catName} in ${city.name}, ${city.state}`
    : `${category.name_es} en ${city.name}, ${city.state}`;
  const description = isEn
    ? (providers.length > 0
        ? `Find ${providers.length} verified Latino providers of ${catNameLower} in ${city.name}, ${city.state}. Real reviews and secure payments.`
        : `We're looking for Latino ${catNameLower} providers in ${city.name}, ${city.state}. Join getamano for free.`)
    : (providers.length > 0
        ? `Encuentra ${providers.length} proveedores latinos de ${category.name_es.toLowerCase()} en ${city.name}, ${city.state}. Verificados, con reseñas reales y reciben pagos seguros.`
        : `Estamos buscando proveedores latinos de ${category.name_es.toLowerCase()} en ${city.name}, ${city.state}. ¿Eres uno? Únete gratis a getamano.`);

  // JSON-LD: BreadcrumbList + ItemList (collection) + LocalBusiness for each provider
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": providers.slice(0, 10).map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "LocalBusiness",
        "name": p.business_name,
        "url": `${origin}/proveedor/${p.slug}`,
        ...(p.rating_count > 0 ? {
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": Number(p.rating_avg || 0).toFixed(1),
            "reviewCount": p.rating_count,
          },
        } : {}),
        "address": {
          "@type": "PostalAddress",
          "addressLocality": p.city,
          "addressRegion": p.state,
          "addressCountry": "US",
        },
      },
    })),
  };

  const faq = [
    {
      q: `¿Cuánto cuesta ${category.name_es.toLowerCase()} en ${city.name}?`,
      a: `Los precios varían según el proveedor, tipo de trabajo y duración. En getamano puedes solicitar cotizaciones gratis a múltiples proveedores latinos verificados en ${city.name} y comparar antes de elegir.`,
    },
    {
      q: `¿Cómo sé que el proveedor está verificado?`,
      a: `Todos los proveedores con el badge "Verificado" pasaron nuestra revisión de identidad, dirección y referencias profesionales. ${category.license_flag === "red" ? "Para categorías reguladas como ésta, también verificamos licencias profesionales cuando aplica." : ""}`,
    },
    {
      q: `¿Hablan español los proveedores?`,
      a: `Sí. La gran mayoría de proveedores en getamano hablan español como primer idioma. En el perfil de cada proveedor verás los idiomas que maneja.`,
    },
  ];
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map(item => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": { "@type": "Answer", "text": item.a },
    })),
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}>
      <SeoHead
        title={title}
        description={description}
        canonical={`${origin}${location.pathname}`}
        alternates={buildAlternates(location.pathname)}
        lang={isEn ? "en" : "es"}
        jsonLd={[buildBreadcrumbsJsonLd(breadcrumbs, origin), itemListLd, faqLd]}
      />
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12" data-testid="seo-page">
        <Breadcrumbs items={breadcrumbs} />

        <header className="mb-8 md:mb-12">
          <div className="flex items-center gap-2 mb-2 text-sm text-slate-500">
            <MapPin className="w-4 h-4" /> {city.name}, {city.state}
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className="category-icon-wrap brand" aria-hidden="true">
              <CategoryIcon slug={category.slug} size={36} color="#FFFFFF" stroke={1.6} />
            </span>
            <h1 className="font-display text-4xl md:text-5xl font-bold" style={{ color: "#025F67" }} data-testid="seo-h1">
              {title}
            </h1>
          </div>
          <p className="text-slate-600 text-base md:text-lg max-w-3xl" data-testid="seo-intro">
            {providers.length > 0
              ? (isEn
                  ? `Find ${providers.length} verified Latino providers of ${catNameLower} in ${city.name}. Compare reviews, request a free quote and hire with confidence.`
                  : `Encuentra ${providers.length} proveedores latinos verificados de ${category.name_es.toLowerCase()} en ${city.name}. Compara reseñas, solicita cotización gratis y contrata con confianza.`)
              : (isEn
                  ? `We don't have active providers in this category and city yet. If you're a ${catNameLower} provider in ${city.name}, join free and be the first.`
                  : `Aún no tenemos proveedores activos en esta categoría y ciudad. Si eres proveedor de ${category.name_es.toLowerCase()} en ${city.name}, únete gratis y sé el primero.`)}
          </p>

          {category.license_flag === "red" && (
            <div className="mt-4 px-4 py-3 rounded-xl border-l-4 max-w-3xl" style={{ backgroundColor: "#FEF3F2", borderColor: "#DC2626" }}>
              <p className="text-sm text-red-800">
                <strong>Categoría regulada:</strong> {category.name_es.toLowerCase()} requiere licencia profesional en {city.state}. Verifica siempre que tu proveedor tenga las credenciales correspondientes.
              </p>
            </div>
          )}

          {aiContent && (
            <div className="mt-6 max-w-3xl rounded-xl p-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid #BCC5CC" }} data-testid="seo-ai-content">
              <p className="text-base leading-relaxed" style={{ color: "#063154" }}>{aiContent}</p>
            </div>
          )}
        </header>

        {/* Providers list */}
        {providers.length === 0 ? (
          <div className="bg-white rounded-2xl border p-10 text-center mb-12" style={{ borderColor: "#BCC5CC" }}>
            <Award className="w-12 h-12 mx-auto mb-3" style={{ color: "#2F9D94" }} />
            <h2 className="font-display text-xl font-bold mb-2" style={{ color: "#025F67" }}>Sé el primero en {city.name}</h2>
            <p className="text-slate-600 mb-4">Aún no hay proveedores latinos de {category.name_es.toLowerCase()} en {city.name}. Si eres uno, regístrate gratis y aprovecha el código <strong>GETAMANO50</strong> para 1 año de Plan Pro gratis.</p>
            <Link to="/register?intent=provider" className="btn-primary inline-block" data-testid="empty-cta">Registrarme como proveedor</Link>
          </div>
        ) : (
          <section className="mb-12" data-testid="seo-providers-list">
            <h2 className="font-display text-2xl font-bold mb-4" style={{ color: "#025F67" }}>Proveedores destacados</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map(p => (
                <Link
                  key={p.provider_id}
                  to={`/proveedor/${p.slug}`}
                  className="bg-white rounded-2xl border overflow-hidden card-lift"
                  style={{ borderColor: "#E2E8F0" }}
                  data-testid={`provider-${p.slug}`}
                >
                  <div className="h-32 bg-slate-100 relative">
                    {p.cover_url && <img src={p.cover_url} alt={`${p.business_name} - ${category.name_es} en ${city.name}`} loading="lazy" className="w-full h-full object-cover" />}
                    {p.verification_status === "approved" && (
                      <span className="absolute top-2 left-2 badge-verified" style={{ fontSize: "11px" }}>
                        <ShieldCheck className="w-3 h-3" /> Verificado
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-display font-bold text-base mb-1 truncate" style={{ color: "#025F67" }}>{p.business_name}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                      <MapPin className="w-3 h-3" /> {p.city}, {p.state}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.rating_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: "#063154" }}>
                          <Star className="w-3 h-3 fill-current" style={{ color: "#F59E0B" }} />
                          {Number(p.rating_avg).toFixed(1)} <span className="text-slate-400 font-normal">({p.rating_count})</span>
                        </span>
                      )}
                      <OwnerIdentityBadge identity={p.owner_identity} size="sm" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Why getamano */}
        <section className="bg-white rounded-2xl border p-6 md:p-8 mb-12" style={{ borderColor: "#BCC5CC" }} data-testid="seo-why">
          <h2 className="font-display text-2xl font-bold mb-4" style={{ color: "#025F67" }}>¿Por qué contratar {category.name_es.toLowerCase()} en getamano?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: "#EBF8F7" }}>
                <ShieldCheck className="w-5 h-5" style={{ color: "#025F67" }} />
              </div>
              <h3 className="font-display font-semibold mb-1" style={{ color: "#025F67" }}>Proveedores verificados</h3>
              <p className="text-sm text-slate-600">Cada negocio pasa por verificación de identidad, dirección y referencias antes de aparecer.</p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: "#EBF8F7" }}>
                <MessageCircle className="w-5 h-5" style={{ color: "#025F67" }} />
              </div>
              <h3 className="font-display font-semibold mb-1" style={{ color: "#025F67" }}>Cotización en español</h3>
              <p className="text-sm text-slate-600">Solicita cotización en 30 segundos y recibe respuestas en español de proveedores que entienden tu cultura.</p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: "#EBF8F7" }}>
                <Star className="w-5 h-5" style={{ color: "#025F67" }} />
              </div>
              <h3 className="font-display font-semibold mb-1" style={{ color: "#025F67" }}>Reseñas reales</h3>
              <p className="text-sm text-slate-600">Solo clientes que contactaron al proveedor pueden dejar reseñas. Cero fake reviews.</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12" data-testid="seo-faq">
          <h2 className="font-display text-2xl font-bold mb-4" style={{ color: "#025F67" }}>Preguntas frecuentes</h2>
          <div className="space-y-3">
            {faq.map((item, idx) => (
              <details key={idx} className="bg-white rounded-xl border p-4 group" style={{ borderColor: "#BCC5CC" }}>
                <summary className="cursor-pointer font-medium list-none flex justify-between items-center" style={{ color: "#025F67" }}>
                  <span>{item.q}</span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <p className="text-sm text-slate-600 mt-3">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Related: other cities for same category */}
        {related_cities.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-xl font-bold mb-3" style={{ color: "#025F67" }}>{category.name_es} en otras ciudades</h2>
            <div className="flex flex-wrap gap-2">
              {related_cities.map(c => (
                <Link
                  key={c.slug}
                  to={`/servicios/${category.slug}/${c.slug}`}
                  className="px-4 py-2 rounded-full border bg-white text-sm transition hover:shadow-sm"
                  style={{ borderColor: "#BCC5CC", color: "#025F67" }}
                  data-testid={`related-city-${c.slug}`}
                >
                  {category.name_es} en {c.name}, {c.state}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Related: other categories in same city */}
        {related_categories.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-xl font-bold mb-3" style={{ color: "#025F67" }}>Otros servicios en {city.name}</h2>
            <div className="flex flex-wrap gap-2">
              {related_categories.map(rc => (
                <Link
                  key={rc.category_id}
                  to={`/servicios/${rc.slug}/${city.slug}`}
                  className="px-4 py-2 rounded-full border bg-white text-sm transition hover:shadow-sm"
                  style={{ borderColor: "#BCC5CC", color: "#025F67" }}
                  data-testid={`related-cat-${rc.slug}`}
                >
                  {rc.name_es} en {city.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Final CTA */}
        <section className="rounded-2xl p-6 md:p-10 text-center" style={{ background: "linear-gradient(135deg, #2F9D94 0%, #025F67 100%)" }}>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-3">¿No encuentras lo que buscas?</h2>
          <p className="text-white/90 mb-5 max-w-xl mx-auto">Cuéntanos lo que necesitas y conecta gratis con proveedores latinos verificados en {city.name}.</p>
          <Link to="/search" className="inline-block bg-white px-6 py-3 rounded-full font-semibold transition hover:scale-105" style={{ color: "#025F67" }} data-testid="final-cta">
            Buscar más proveedores en {city.name}
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
