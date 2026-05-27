import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { api } from "../lib/api";
import SeoCategoryDetail from "./seo/SeoCategoryDetail";

/**
 * ServicesRouteResolver — Bug B1 (Section 61).
 *
 * Legacy / shared URLs use `/services/{slug}` for both categories
 * (e.g. /services/limpieza) and provider eCards (e.g.
 * /services/maria-cleaning-services-sallisaw-ok). The proper provider
 * URL is `/p/{slug}`. To avoid 404s on shared links we probe the slug:
 *   1. Try as a provider eCard (faster, cached). If it resolves → 301 redirect.
 *   2. Otherwise render the SEO category page (existing behavior).
 */
export default function ServicesRouteResolver() {
  const { categorySlug: slug } = useParams();
  const [providerExists, setProviderExists] = useState(null); // null=checking, true=provider, false=not

  useEffect(() => {
    let cancelled = false;
    if (!slug) { setProviderExists(false); return; }
    api.get(`/providers/by-slug/${encodeURIComponent(slug)}`)
      .then(() => { if (!cancelled) setProviderExists(true); })
      .catch(() => { if (!cancelled) setProviderExists(false); });
    return () => { cancelled = true; };
  }, [slug]);

  if (providerExists === null) {
    // Lightweight skeleton while probing — avoids 200ms blank flash.
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-slate-200" />
          <div className="w-40 h-3 rounded-full bg-slate-200" />
          <div className="w-28 h-2 rounded-full bg-slate-200" />
        </div>
      </div>
    );
  }
  if (providerExists === true) {
    return <Navigate to={`/p/${slug}`} replace />;
  }
  return <SeoCategoryDetail />;
}
