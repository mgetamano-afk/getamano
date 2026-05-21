import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

/**
 * Reusable SEO helmet — sets title, description, OG, canonical and optional JSON-LD.
 */
export function SeoHead({ title, description, canonical, image, jsonLd }) {
  const fullTitle = title ? `${title} — getamano` : "getamano · Marketplace latino en USA";
  const ogImage = image || "/getamano-logo-full.png";
  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {canonical && <link rel="canonical" href={canonical} />}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content="website" />
      {canonical && <meta property="og:url" content={canonical} />}
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={ogImage} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}

/**
 * Breadcrumb component with JSON-LD support.
 * items: [{ label, to? }]
 */
export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm" data-testid="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-1 text-slate-500">
        {items.map((it, idx) => (
          <li key={idx} className="flex items-center gap-1">
            {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-300" aria-hidden="true" />}
            {it.to && idx < items.length - 1 ? (
              <Link to={it.to} className="hover:underline" style={{ color: "#025F67" }}>{it.label}</Link>
            ) : (
              <span className={idx === items.length - 1 ? "font-medium" : ""} style={{ color: idx === items.length - 1 ? "#063154" : undefined }}>{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function buildBreadcrumbsJsonLd(items, origin) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((it, idx) => ({
      "@type": "ListItem",
      "position": idx + 1,
      "name": it.label,
      ...(it.to ? { "item": `${origin}${it.to}` } : {}),
    })),
  };
}
