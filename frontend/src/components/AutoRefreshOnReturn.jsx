import { useEffect, useRef } from "react";
import { triggerRefresh, refreshHandlerCount } from "../lib/refreshBus";

/**
 * AutoRefreshOnReturn — Section 77 (smart background refresh).
 *
 * When the user comes back to the tab/PWA after being away for a while,
 * silently dispatch the global refresh bus so feeds, earnings, and
 * notifications are fresh — without making them pull-to-refresh.
 *
 * Triggers
 * ────────
 *  · `document.visibilitychange` → tab became visible again
 *  · `window.focus`              → desktop window refocused
 *  · `pageshow` (bfcache)        → returning via back/forward on iOS Safari
 *
 * Threshold
 * ─────────
 * Only refresh if the page has been hidden for ≥ `IDLE_MS` (default 120 s).
 * Below that, the cost-vs-benefit isn't worth the extra fetches.
 *
 * Silence
 * ───────
 * We call `triggerRefresh()` from the bus directly — no spinner, no pull
 * gesture, no UI noise. Each subscribed component re-fetches its own data
 * and updates state when the response lands. If no component is registered
 * (homepage with no widgets, etc.), the call is a no-op.
 */
const IDLE_MS = 2 * 60 * 1000;

export default function AutoRefreshOnReturn() {
  const hiddenSince = useRef(null);
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    const maybeRefresh = (reason) => {
      // Skip if no subscribers — the bus would be a no-op anyway, but
      // we also want to avoid resetting `lastRefresh` on dead routes.
      if (refreshHandlerCount() === 0) return;
      const now = Date.now();
      // Avoid double-triggering when multiple events fire in quick
      // succession (e.g. visibilitychange + focus on the same swap-in).
      if (now - lastRefresh.current < 5_000) return;
      lastRefresh.current = now;
      // Fire and forget — components handle their own loading states.
      triggerRefresh({ timeoutMs: 4_000 }).catch(() => { /* noop */ });
      if (typeof window !== "undefined" && window.__getamano_log) {
        // Lightweight diagnostic for QA
        // eslint-disable-next-line no-console
        console.info("[auto-refresh]", reason);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince.current = Date.now();
        return;
      }
      // visible again
      const away = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
      hiddenSince.current = null;
      if (away >= IDLE_MS) maybeRefresh(`visibility-after-${Math.round(away / 1000)}s`);
    };

    const onFocus = () => {
      // Desktop browser tab refocus — covers cases where visibilitychange
      // didn't fire (multiwindow, focus-stealing extensions).
      const away = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
      if (away >= IDLE_MS) maybeRefresh(`focus-after-${Math.round(away / 1000)}s`);
    };

    const onPageShow = (e) => {
      // bfcache restoration — typically happens on iOS Safari back-swipe.
      // The DOM is stale by definition; always refresh when persisted=true.
      if (e?.persisted) maybeRefresh("pageshow-bfcache");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
