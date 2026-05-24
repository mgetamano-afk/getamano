import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { SeoHead, Breadcrumbs, buildBreadcrumbsJsonLd } from "../../components/seo/SeoHead";
import CategoryIcon from "../../components/CategoryIcon";
import { buildAlternates } from "../../lib/seoUrls";

export default function SeoCategoryDetail() {
  const { categorySlug } = useParams();
  const location = useLocation();
  const isEn = location.pathname.startsWith("/services/") || location.pathname.startsWith("/category/");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/seo/category/${categorySlug}`).then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [categorySlug]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://getamano.us";
  if (loading) return <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}><Header /><div className="max-w-7xl mx-auto px-4 py-12 text-slate-500">Cargando…</div><Footer /></div>;
  if (!data) return <div className="min-h-screen"><Header /><div className="max-w-7xl mx-auto px-4 py-12">Categoría no encontrada</div><Footer /></div>;

  const { category, cities, total_cities } = data;
  const breadcrumbs = [
    { label: "Inicio", to: "/" },
    { label: "Servicios", to: "/servicios" },
    { label: category.name_es },
  ];
  const totalProviders = cities.reduce((s, c) => s + c.providers_count, 0);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}>
      <SeoHead
        title={isEn
          ? `${category.name_en} in USA — Verified Latino providers`
          : `${category.name_es} en USA — Proveedores latinos verificados`}
        description={isEn
          ? `Find verified Latino providers of ${(category.name_en || "").toLowerCase()} in ${total_cities} US cities. ${totalProviders} active businesses on getamano.`
          : `Encuentra proveedores latinos verificados de ${category.name_es.toLowerCase()} en ${total_cities} ciudades de USA. ${totalProviders} negocios activos en getamano.`}
        canonical={`${origin}${location.pathname}`}
        alternates={buildAlternates(location.pathname)}
        lang={isEn ? "en" : "es"}
        jsonLd={buildBreadcrumbsJsonLd(breadcrumbs, origin)}
      />
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12" data-testid="seo-category-detail">
        <Breadcrumbs items={breadcrumbs} />
        <div className="flex items-center gap-3 mb-3">
          <span className="category-icon-wrap brand" aria-hidden="true">
            <CategoryIcon slug={category.slug} size={36} color="#FFFFFF" stroke={1.6} />
          </span>
          <h1 className="font-display text-4xl md:text-5xl font-bold" style={{ color: "#025F67" }} data-testid="seo-h1">{category.name_es} — Proveedores latinos</h1>
        </div>
        <p className="text-slate-600 mb-10 text-base md:text-lg">
          {totalProviders > 0
            ? `${totalProviders} proveedores latinos verificados de ${category.name_es.toLowerCase()} activos en ${total_cities} ciudades de USA.`
            : `Aún no hay proveedores activos en esta categoría. ¿Eres uno? `}
          {totalProviders === 0 && <Link to="/register?intent=provider" className="underline" style={{ color: "#2F9D94" }}>Únete a getamano</Link>}
        </p>

        {category.license_flag === "red" && (
          <div className="mb-8 px-4 py-3 rounded-xl border-l-4" style={{ backgroundColor: "#FEF3F2", borderColor: "#DC2626" }}>
            <p className="text-sm text-red-800"><strong>Categoría regulada:</strong> {category.name_es.toLowerCase()} requiere licencia o certificación en USA. Verifica que tu proveedor esté autorizado.</p>
          </div>
        )}

        {cities.length === 0 ? (
          <div className="bg-white rounded-2xl border p-10 text-center" style={{ borderColor: "#BCC5CC" }}>
            <p className="text-slate-500 mb-3">No hay proveedores activos aún en esta categoría.</p>
            <Link to="/ciudades" className="btn-outline inline-block">Explorar otras ciudades</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cities.map(c => (
              <Link
                key={c.slug}
                to={`/servicios/${category.slug}/${c.slug}`}
                className="bg-white rounded-xl border p-4 hover:shadow-md transition flex items-center justify-between"
                style={{ borderColor: "#BCC5CC" }}
                data-testid={`cat-city-link-${c.slug}`}
              >
                <div>
                  <div className="font-medium" style={{ color: "#025F67" }}>{c.name}</div>
                  <div className="text-xs text-slate-500">{c.state}</div>
                </div>
                <span className="text-xs text-slate-400">{c.providers_count} {c.providers_count === 1 ? "negocio" : "negocios"}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
