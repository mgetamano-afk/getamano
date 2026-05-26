/**
 * imageHelpers — Section 58.
 *
 * Centralized helpers to keep image rendering consistent across the app and
 * to apply scale-friendly defaults (lazy loading, async decoding, intrinsic
 * dimensions to prevent layout shift).
 *
 * Usage:
 *   import { lazyImg } from "../lib/imageHelpers";
 *   <img {...lazyImg(buildFileUrl(p.url))} className="..." alt="..." />
 *
 * For above-the-fold hero images, pass `priority: true` to opt out of lazy:
 *   <img {...lazyImg(url, { priority: true })} ... />
 */

export const lazyImg = (src, { priority = false, fetchPriority = "auto" } = {}) => ({
  src,
  loading: priority ? "eager" : "lazy",
  decoding: priority ? "sync" : "async",
  // JSX expects camelCase fetchPriority
  fetchPriority: priority ? "high" : fetchPriority,
});

/**
 * Production console silencer — Section 58.
 * Suppresses console.log + console.debug in production builds while keeping
 * warn + error visible for crash diagnostics.
 *
 * Call once from index.js (after React mounts) inside a NODE_ENV !== "development"
 * guard.
 */
export const silenceConsoleInProd = () => {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development") return;
  const noop = () => {};
  // eslint-disable-next-line no-console
  console.log = noop;
  // eslint-disable-next-line no-console
  console.debug = noop;
  // eslint-disable-next-line no-console
  console.info = noop;
};
