import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { SeoHead, Breadcrumbs, buildBreadcrumbsJsonLd } from "../../components/seo/SeoHead";

export default function SeoServicesIndex() {
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/seo/sectors").then(r => setSectors(r.data.sectors || [])).finally(() => setLoading(false));
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://getamano.us";
  const breadcrumbs = [{ label: "Inicio", to: "/" }, { label: "Servicios" }];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}>
      <SeoHead
        title="Todos los servicios"
        description="Explora más de 170 categorías de servicios ofrecidos por proveedores latinos verificados en USA: hogar, salud, eventos, autos, tecnología y más."
        canonical={`${origin}/servicios`}
        jsonLd={buildBreadcrumbsJsonLd(breadcrumbs, origin)}
      />
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12" data-testid="seo-services-index">
        <Breadcrumbs items={breadcrumbs} />
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-3" style={{ color: "#025F67" }} data-testid="seo-h1">Todos los servicios en getamano</h1>
        <p className="text-slate-600 mb-10 text-base md:text-lg">Más de 170 categorías de proveedores latinos verificados en USA — organizadas por sector.</p>

        {loading ? (
          <p className="text-slate-500">Cargando...</p>
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
                      to={`/servicios/${cat.slug}`}
                      className="px-3 py-2 rounded-lg border bg-white hover:shadow-sm transition text-sm"
                      style={{ borderColor: "#BCC5CC", color: "#025F67" }}
                      data-testid={`cat-link-${cat.slug}`}
                    >
                      {cat.name_es}
                      {cat.providers_count > 0 && <span className="text-slate-400 text-xs ml-1">({cat.providers_count})</span>}
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
