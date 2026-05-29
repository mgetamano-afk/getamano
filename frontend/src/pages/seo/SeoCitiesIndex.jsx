import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { SeoHead, Breadcrumbs, buildBreadcrumbsJsonLd } from "../../components/seo/SeoHead";
import { MapPin } from "lucide-react";
import { buildAlternates } from "../../lib/seoUrls";

export default function SeoCitiesIndex() {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const isEn = location.pathname.startsWith("/cities");

  useEffect(() => {
    api.get("/seo/cities").then(r => setCities(r.data.items || [])).finally(() => setLoading(false));
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://getamano.us";
  const breadcrumbs = [{ label: "Inicio", to: "/" }, { label: "Ciudades" }];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F8FCFD" }}>
      <SeoHead
        title={isEn ? "Cities with Latino providers" : "Ciudades con proveedores latinos"}
        description={isEn
          ? "Find verified Latino providers in major US cities: Dallas, Houston, Miami, Los Angeles, Chicago and more."
          : "Encuentra proveedores latinos verificados en las principales ciudades de USA: Dallas, Houston, Miami, Los Ángeles, Chicago y más."}
        canonical={`${origin}${location.pathname}`}
        alternates={buildAlternates(location.pathname)}
        lang={isEn ? "en" : "es"}
        jsonLd={buildBreadcrumbsJsonLd(breadcrumbs, origin)}
      />
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12" data-testid="seo-cities-index">
        <Breadcrumbs items={breadcrumbs} />
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-3" style={{ color: "#03045E" }} data-testid="seo-h1">Proveedores latinos por ciudad</h1>
        <p className="text-slate-600 mb-10 text-base md:text-lg">Explora proveedores verificados en las principales ciudades de USA con presencia latina.</p>

        {loading ? (
          <p className="text-slate-500">Cargando...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {cities.map(c => (
              <Link
                key={c.slug}
                to={`/ciudades/${c.slug}`}
                className="bg-white rounded-2xl border p-4 hover:shadow-md transition card-lift"
                style={{ borderColor: "#BCC5CC" }}
                data-testid={`city-link-${c.slug}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4" style={{ color: "#0077B6" }} />
                  <span className="font-display font-bold text-lg" style={{ color: "#03045E" }}>{c.name}</span>
                </div>
                <div className="text-xs text-slate-500">{c.state}</div>
                <div className="text-xs mt-2 font-medium" style={{ color: c.providers_count > 0 ? "#03045E" : "#94A3B8" }}>
                  {c.providers_count > 0
                    ? `${c.providers_count} ${c.providers_count === 1 ? "proveedor" : "proveedores"}`
                    : "Sé el primero — únete como proveedor →"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
