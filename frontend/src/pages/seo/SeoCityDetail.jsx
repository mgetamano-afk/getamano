import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { SeoHead, Breadcrumbs, buildBreadcrumbsJsonLd } from "../../components/seo/SeoHead";
import { MapPin } from "lucide-react";

export default function SeoCityDetail() {
  const { citySlug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/seo/city/${citySlug}`).then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [citySlug]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://getamano.us";
  if (loading) return <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}><Header /><div className="max-w-7xl mx-auto px-4 py-12 text-slate-500">Cargando…</div><Footer /></div>;
  if (!data) return <div className="min-h-screen"><Header /><div className="max-w-7xl mx-auto px-4 py-12">Ciudad no encontrada</div><Footer /></div>;

  const { city, categories, total_providers } = data;
  const breadcrumbs = [
    { label: "Inicio", to: "/" },
    { label: "Ciudades", to: "/ciudades" },
    { label: city.name },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}>
      <SeoHead
        title={`Proveedores latinos en ${city.name}, ${city.state}`}
        description={`Encuentra los mejores proveedores latinos verificados en ${city.name}, ${city.state}. ${total_providers} negocios activos en getamano.`}
        canonical={`${origin}/ciudades/${city.slug}`}
        jsonLd={buildBreadcrumbsJsonLd(breadcrumbs, origin)}
      />
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12" data-testid="seo-city-detail">
        <Breadcrumbs items={breadcrumbs} />
        <div className="flex items-center gap-2 mb-2 text-sm text-slate-500"><MapPin className="w-4 h-4" /> {city.name}, {city.state}</div>
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-3" style={{ color: "#025F67" }} data-testid="seo-h1">Proveedores latinos en {city.name}</h1>
        <p className="text-slate-600 mb-10 text-base md:text-lg">{total_providers} proveedores latinos verificados activos en {city.name}, {city.state}.</p>

        {categories.length === 0 ? (
          <div className="bg-white rounded-2xl border p-10 text-center" style={{ borderColor: "#BCC5CC" }}>
            <p className="text-slate-500 mb-3">Aún no hay proveedores activos en esta ciudad.</p>
            <Link to="/register?intent=provider" className="btn-primary inline-block">¿Eres proveedor? Únete</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map(cat => (
              <Link
                key={cat.category_id}
                to={`/servicios/${cat.slug}/${city.slug}`}
                className="bg-white rounded-xl border p-4 hover:shadow-md transition flex items-center justify-between"
                style={{ borderColor: "#BCC5CC" }}
                data-testid={`city-cat-link-${cat.slug}`}
              >
                <span className="font-medium" style={{ color: "#025F67" }}>{cat.name_es}</span>
                <span className="text-xs text-slate-400">{cat.providers_count} {cat.providers_count === 1 ? "negocio" : "negocios"}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
