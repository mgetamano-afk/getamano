import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * ScrollToTop — Section 74 (mobile-first nav UX fix).
 *
 * Resets the window scroll position to (0, 0) on every route change.
 *
 * Why this exists
 * ───────────────
 * React Router does NOT restore scroll on navigation by default. Without
 * this, tapping a footer nav item while you're scrolled halfway down one
 * page lands you halfway down the new page — disorienting on mobile.
 *
 * Two exceptions where we DON'T reset:
 *  1. ComunidadLayout already does per-tab scroll restoration (Feed →
 *     Explorar → Feed lands you where you left it). We detect that and
 *     bail to avoid double-scroll.
 *  2. Hash anchors (`/page#section`) intentionally target an in-page
 *     anchor; respect the browser's anchor jump.
 *
 * Behavior is `instant` — animating a scroll on a fresh navigation feels
 * sluggish on iOS. Smooth scroll remains available via `html { scroll-behavior: smooth }`
 * for in-page anchor links and programmatic `scrollTo({behavior:'smooth'})`.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    // Only scroll when the pathname changed (not query/hash on same route)
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    // Respect anchor jumps — let the browser/native handle them
    if (hash) return;

    // Defer the reset to the next paint so the new route has mounted
    // and the body/layout has the right scrollHeight, otherwise iOS
    // sometimes ignores the call.
    const id = requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      } catch {
        // Older Safari: behavior:"instant" not supported — fall back.
        window.scrollTo(0, 0);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [pathname, hash]);

  return null;
}
