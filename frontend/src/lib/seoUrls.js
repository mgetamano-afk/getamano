/**
 * URL helpers — map paths between ES and EN canonical routes for SEO hreflang.
 *
 * Used by SEO pages to declare alternates so Google indexes both versions of
 * the same content as separate URLs with proper language signals.
 *
 * Single source of truth lives here so the sitemap (backend) and the React
 * components stay in sync.
 */

// Pairs of (ES segment, EN segment). Order is meaningful — we replace prefixes
// so longer patterns must come first.
const ES_TO_EN_PREFIX = [
  ["/servicios/", "/services/"],   // /servicios/cleaning/dallas → /services/cleaning/dallas
  ["/servicios",  "/services"],
  ["/ciudades/",  "/cities/"],
  ["/ciudades",   "/cities"],
  ["/proveedor/", "/provider/"],   // /proveedor/{slug} → /provider/{slug}
  ["/categoria/", "/category/"],
  ["/buscar",     "/search"],
  ["/empleos",    "/gigs"],
  ["/ranking",    "/leaderboard"],
  ["/registro",   "/register"],
  ["/instalar",   "/install"],
  ["/comunidad",  "/community"],
  ["/verificar-correo", "/verify-email"],
];

const EN_TO_ES_PREFIX = ES_TO_EN_PREFIX.map(([es, en]) => [en, es]);

function _swap(path, pairs) {
  for (const [from, to] of pairs) {
    if (path === from || path.startsWith(from + "?") || path.startsWith(from + "#")
        || path.startsWith(from) && (from.endsWith("/") || path.length === from.length || ["/", "?", "#"].includes(path[from.length]))) {
      return to + path.slice(from.length);
    }
  }
  return null;
}

export function getOrigin() {
  if (typeof window === "undefined") return "https://getamano.us";
  return window.location.origin;
}

/** Returns null when no ES alternate exists for this path. */
export function toEsUrl(path) {
  return _swap(path, EN_TO_ES_PREFIX) || path;
}

/** Returns null when no EN alternate exists for this path. */
export function toEnUrl(path) {
  return _swap(path, ES_TO_EN_PREFIX) || path;
}

/**
 * Build the `alternates` array for SeoHead given the current path. We always
 * emit BOTH es and en alternates so Google can pick the right one per locale.
 */
export function buildAlternates(currentPath) {
  const origin = getOrigin();
  const esPath = toEsUrl(currentPath);
  const enPath = toEnUrl(currentPath);
  return [
    { lang: "es", url: `${origin}${esPath}` },
    { lang: "en", url: `${origin}${enPath}` },
  ];
}
