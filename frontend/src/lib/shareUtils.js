/**
 * shareUtils — Web Share API helper.
 *
 * Section 89 (v4) replaces hardcoded WhatsApp `wa.me/...` links with
 * the native Web Share sheet wherever possible. Modern Android/iOS will
 * present the full system share sheet (WhatsApp, Telegram, Messenger,
 * Mail, Copy Link, Save, etc.). Older desktops / unsupported browsers
 * fall back to copying the URL to clipboard.
 *
 * Usage:
 *   import { sharePayload } from "../lib/shareUtils";
 *   await sharePayload({
 *     title: "María — Limpieza · GM-1335",
 *     text: "Mira esta eCard de un proveedor verificado",
 *     url: "https://getamano.app/p/maria-cleaning-services-sallisaw-ok",
 *   });
 *
 * Returns { ok: bool, method: "native" | "clipboard" | "blocked" }.
 * The caller can show a toast based on `method`.
 */

const PROVIDER_HOST = "getamano.app";  // canonical share host

/**
 * Trigger the native share sheet.
 *
 * @param {{title?: string, text?: string, url?: string, files?: File[]}} payload
 * @returns {Promise<{ok: boolean, method: string, error?: string}>}
 */
export async function sharePayload(payload) {
  const data = {
    title: payload.title || "Getamano",
    text: payload.text || "",
    url: payload.url || window.location.href,
  };
  if (Array.isArray(payload.files) && payload.files.length) {
    data.files = payload.files;
  }

  // 1) Web Share API — native sheet
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return { ok: true, method: "native" };
    } catch (err) {
      // AbortError is a user dismiss — not an error worth surfacing
      if (err && err.name === "AbortError") {
        return { ok: false, method: "native", error: "cancelled" };
      }
      // Fall through to clipboard
      // eslint-disable-next-line no-console
      console.warn("Web Share failed, falling back to clipboard:", err);
    }
  }

  // 2) Clipboard fallback
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      const text = [data.title, data.text, data.url].filter(Boolean).join("\n");
      await navigator.clipboard.writeText(text);
      return { ok: true, method: "clipboard" };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Clipboard fallback failed:", err);
    }
  }

  return { ok: false, method: "blocked", error: "No share method available" };
}

/**
 * Helper specific to a provider eCard. Builds the canonical URL and
 * a localised message in one call.
 *
 * @param {{slug: string, businessName: string, getamanoCode?: string, lang?: 'es'|'en'}} p
 */
export async function shareProvider(p) {
  const url = `https://${PROVIDER_HOST}/p/${p.slug}`;
  const lang = p.lang || "es";
  const title = p.businessName + (p.getamanoCode ? ` · ${p.getamanoCode}` : "");
  const text = lang === "en"
    ? `Check out ${p.businessName} on Getamano${p.getamanoCode ? ` (${p.getamanoCode})` : ""}`
    : `Mira a ${p.businessName} en Getamano${p.getamanoCode ? ` (${p.getamanoCode})` : ""}`;
  return sharePayload({ title, text, url });
}

/**
 * Helper for a story/post URL.
 * @param {{kind: "story"|"post"|"reel"|"job", id: string, summary?: string, lang?: 'es'|'en'}} p
 */
export async function shareSocialItem({ kind, id, summary, lang = "es" }) {
  const path = {
    story: `/s/${id}`,
    post: `/post/${id}`,
    reel: `/r/${id}`,
    job: `/empleos/${id}`,
  }[kind] || `/${kind}/${id}`;
  const url = `https://${PROVIDER_HOST}${path}`;
  const label = {
    story: { es: "una historia", en: "a story" },
    post: { es: "una publicación", en: "a post" },
    reel: { es: "un reel", en: "a reel" },
    job: { es: "una chamba", en: "a job" },
  }[kind] || { es: "esto", en: "this" };
  return sharePayload({
    title: "Getamano",
    text: summary || (lang === "en" ? `Check out ${label.en} on Getamano` : `Mira ${label.es} en Getamano`),
    url,
  });
}
