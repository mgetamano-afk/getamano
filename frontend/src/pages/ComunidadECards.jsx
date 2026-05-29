import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, MapPin, ExternalLink, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import EmptyState from "../components/EmptyState";

/**
 * ComunidadECards — Section 63 Block 2.
 *
 * Public eCards directory inside /comunidad. Shows all approved providers
 * as snackable cards, sorted by ranking_score (or rating_avg fallback).
 * Filter by city / category later. Distinct from /search by being:
 *   · Browsable & ranked (not filter-first).
 *   · Card-based, social-feel.
 */
export default function ComunidadECards() {
  const { lang } = useI18n();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/providers", { params: { sort: "ranking", limit: 50 } })
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.items || []);
        // Only show approved providers in the public eCards directory.
        setProviders(list.filter(p => (p.verification_status || "approved") === "approved"));
      })
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-4 md:px-6 max-w-7xl mx-auto py-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
            <div className="aspect-square bg-slate-100" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-slate-100 rounded w-3/4" />
              <div className="h-2 bg-slate-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <EmptyState
          title={lang === "en" ? "No eCards yet" : "Aún no hay eCards"}
          description={lang === "en"
            ? "Be the first verified provider in your area."
            : "Sé el primer proveedor verificado en tu zona."}
          ctaLabel={lang === "en" ? "Become a provider" : "Ser proveedor"}
          ctaTo="/register?intent=provider"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-5" data-testid="comunidad-ecards-grid">
      <h1 className="text-xl md:text-2xl font-display font-extrabold text-slate-900 mb-4">
        {lang === "en" ? "eCards in the community" : "eCards de la comunidad"}
      </h1>
      <p className="text-sm text-slate-500 mb-5">
        {lang === "en"
          ? "Verified Latino providers ranked by community trust."
          : "Proveedores latinos verificados, ordenados por la confianza de la comunidad."}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {providers.map(p => <ECardTile key={p.provider_id} provider={p} lang={lang} />)}
      </div>
    </div>
  );
}

function ECardTile({ provider, lang }) {
  const slug = provider.slug || provider.provider_slug;
  const logo = provider.logo_url || provider.cover_url || provider.banner_url;
  const ratingAvg = provider.rating_avg || 0;
  const ratingCount = provider.rating_count || 0;
  const categoryLabel = lang === "en" ? provider.category_name_en : provider.category_name_es;
  return (
    <Link
      to={`/p/${slug}`}
      className="group block bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all"
      data-testid={`ecard-tile-${slug || provider.provider_id}`}
    >
      <div className="aspect-square bg-slate-100 relative">
        {logo ? (
          <img
            src={logo}
            alt={provider.business_name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-slate-300">🏢</div>
        )}
        {provider.verification_status === "approved" && (
          <span
            className="absolute top-2 left-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/95 backdrop-blur text-[10px] font-extrabold tracking-wide"
            style={{ color: "#03045E" }}
          >
            <ShieldCheck className="w-3 h-3" />
            {lang === "en" ? "VERIFIED" : "VERIFICADO"}
          </span>
        )}
        {ratingCount > 0 && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-400/95 text-white text-[10px] font-extrabold">
            <Star className="w-3 h-3 fill-white" strokeWidth={0} /> {ratingAvg.toFixed(1)}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-[13px] font-bold text-slate-900 truncate" title={provider.business_name}>
          {provider.business_name}
        </p>
        {categoryLabel && (
          <p className="text-[11px] text-slate-500 truncate">{categoryLabel}</p>
        )}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-slate-400 truncate inline-flex items-center gap-0.5">
            <MapPin className="w-2.5 h-2.5" /> {provider.city || ""}
          </span>
          <span className="text-[11px] font-bold inline-flex items-center gap-0.5" style={{ color: "#03045E" }}>
            <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
