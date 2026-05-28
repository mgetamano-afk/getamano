import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

/**
 * Reusable SEO helmet — sets title, description, OG, canonical, hreflang
 * alternates and optional JSON-LD.
 *
 * `alternates` — array of `{ lang: "es"|"en", url: "https://..." }` so Google
 * knows the same content exists in another language. The "x-default" hreflang
 * is auto-derived from the first ES entry (most of our marketplace is ES-first).
 *
 * `lang` — sets <html lang="..."> dynamically so screen readers + Google pick
 * the right locale.
 */
export function SeoHead({ title, description, canonical, image, jsonLd, alternates, lang = "es" }) {
  const fullTitle = title ? `${title} — getamano` : "getamano · Trusted service pros across the US";
  const ogImage = image || "/getamano-logo-full.png";
  const ogLocale = lang === "en" ? "en_US" : "es_US";
  const defaultUrl = (alternates || []).find((a) => a.lang === "es")?.url
    || (alternates || [])[0]?.url
    || canonical;
  return (
    <Helmet>
      <html lang={lang} />
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {canonical && <link rel="canonical" href={canonical} />}
      {(alternates || []).map((alt) => (
        <link key={alt.lang} rel="alternate" hrefLang={alt.lang} href={alt.url} />
      ))}
      {defaultUrl && <link rel="alternate" hrefLang="x-default" href={defaultUrl} />}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content="website" />
      <meta property="og:locale" content={ogLocale} />
      {lang === "es" && <meta property="og:locale:alternate" content="en_US" />}
      {lang === "en" && <meta property="og:locale:alternate" content="es_US" />}
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
