import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { SeoHead, Breadcrumbs, buildBreadcrumbsJsonLd } from "../../components/seo/SeoHead";
import CategoryIcon from "../../components/CategoryIcon";
import { buildAlternates } from "../../lib/seoUrls";

export default function SeoServicesIndex() {
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const isEn = location.pathname.startsWith("/services");

  useEffect(() => {
    api.get("/seo/sectors").then(r => setSectors(r.data.sectors || [])).finally(() => setLoading(false));
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://getamano.us";
  const breadcrumbs = [{ label: "Inicio", to: "/" }, { label: "Servicios" }];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}>
      <SeoHead
        title={isEn ? "All services" : "Todos los servicios"}
        description={isEn
          ? "Explore 170+ service categories offered by verified Latino providers in the USA: home, health, events, auto, tech and more."
          : "Explora más de 170 categorías de servicios ofrecidos por proveedores latinos verificados en USA: hogar, salud, eventos, autos, tecnología y más."}
        canonical={`${origin}${location.pathname}`}
        alternates={buildAlternates(location.pathname)}
        lang={isEn ? "en" : "es"}
        jsonLd={buildBreadcrumbsJsonLd(breadcrumbs, origin)}
      />
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12" data-testid="seo-services-index">
        <Breadcrumbs items={breadcrumbs} />
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-3" style={{ color: "#025F67" }} data-testid="seo-h1">
          {isEn ? "All services on getamano" : "Todos los servicios en getamano"}
        </h1>
        <p className="text-slate-600 mb-10 text-base md:text-lg">
          {isEn
            ? "170+ categories of verified Latino providers in the USA — organized by sector."
            : "Más de 170 categorías de proveedores latinos verificados en USA — organizadas por sector."}
        </p>

        {loading ? (
          <p className="text-slate-500">{isEn ? "Loading..." : "Cargando..."}</p>
        ) : (
          <div className="space-y-12">
            {sectors.map(sec => (
              <section key={sec.sector} data-testid={`sector-${sec.sector}`}>
                <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: sec.color }}>
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: sec.color }} />
                  {sec.label}
                  <span className="text-sm font-normal text-slate-400">({sec.categories.length})</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {sec.categories.map(cat => (
                    <Link
                      key={cat.category_id}
                      to={`${isEn ? "/services" : "/servicios"}/${cat.slug}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:shadow-sm transition text-sm min-w-0"
                      style={{ borderColor: "#BCC5CC", color: "#025F67" }}
                      data-testid={`cat-link-${cat.slug}`}
                    >
                      <CategoryIcon slug={cat.slug} size={18} color={sec.color} stroke={1.8} className="flex-shrink-0" />
                      <span className="truncate">{isEn ? (cat.name_en || cat.name_es) : cat.name_es}</span>
                      {cat.providers_count > 0 && <span className="text-slate-400 text-xs ml-auto flex-shrink-0">({cat.providers_count})</span>}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
