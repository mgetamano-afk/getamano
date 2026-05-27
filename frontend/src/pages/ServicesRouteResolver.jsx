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
    // Lightweight probe loader — same height as SeoCategoryDetail's shell.
    return <div className="min-h-screen" />;
  }
  if (providerExists === true) {
    return <Navigate to={`/p/${slug}`} replace />;
  }
  return <SeoCategoryDetail />;
}
