import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, ArrowRight, MapPin } from "lucide-react";
import { api } from "../lib/api";

/**
 * ComunidadExplorar — Section 39 sub-route.
 *
 * Lightweight "Explorar" landing page for /comunidad/explorar that pulls
 * the live categories list from the backend and lets the user jump
 * straight into the corresponding search hub. This is intentionally
 * a quick browse-by-category page, not a copy of the full /buscar.
 * A CTA at the bottom links to the full search.
 */
export default function ComunidadExplorar() {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .get("/categories")
      .then((r) => {
        if (alive) setCats(Array.isArray(r.data) ? r.data.slice(0, 24) : []);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return (
    <div className="tab-content-enter" data-testid="comunidad-explorar">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <header className="mb-6">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
               style={{ background: "rgba(2,95,103,0.08)", color: "#025F67" }}>
            <Compass className="w-3 h-3" /> Explorar
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-2 tracking-tight">
            Descubre proveedores latinos por categoría
          </h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xl">
            Salta directo a la categoría que necesitas. Filtra por ciudad, idioma y rating en el siguiente paso.
          </p>
        </header>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {cats.map((c) => (
              <Link
                key={c.category_id}
                to={`/categoria/${c.slug}`}
                className="group rounded-2xl border border-slate-200 bg-white p-4 hover:border-teal-500 hover:shadow-md transition-all active:scale-[0.98]"
                data-testid={`explorar-cat-${c.slug}`}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-2"
                     style={{ background: "#E1F5EE", color: "#025F67" }}>
                  {c.icon || "🛠️"}
                </div>
                <h3 className="font-display font-semibold text-sm text-slate-900 leading-tight">
                  {c.name_es}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {c.name_en}
                </p>
                <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-teal-700 opacity-0 group-hover:opacity-100 transition">
                  Explorar <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Bottom CTA → full search */}
        <div className="mt-8 rounded-2xl p-5 text-center"
             style={{ background: "linear-gradient(135deg, rgba(2,95,103,0.06) 0%, rgba(47,157,148,0.10) 100%)", border: "1px solid rgba(2,95,103,0.18)" }}>
          <MapPin className="w-6 h-6 mx-auto text-teal-700" />
          <h3 className="font-display font-bold text-slate-900 text-lg mt-2">
            Búsqueda avanzada con mapa
          </h3>
          <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
            Filtra por ciudad, distancia, idioma, video y mucho más.
          </p>
          <Link
            to="/buscar"
            className="inline-flex items-center gap-1.5 mt-3 px-5 py-2.5 rounded-full text-white text-sm font-bold shadow-sm"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
            data-testid="explorar-cta-buscar"
          >
            Ir a búsqueda completa <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
