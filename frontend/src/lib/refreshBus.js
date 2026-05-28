/**
 * refreshBus — Section 75 (mobile-first UX).
 *
 * Tiny pub/sub for page-level "refresh data" signals. Used by the global
 * PullToRefresh component to re-fetch only what the current route needs,
 * instead of doing a full `window.location.reload()` (slow on 3G/4G).
 *
 * Usage (component side)
 * ──────────────────────
 *   import useRefreshable from "../hooks/useRefreshable";
 *
 *   const fetchFeatured = useCallback(async () => {
 *     const r = await api.get("/providers/featured");
 *     setFeatured(r.data || []);
 *   }, []);
 *
 *   useEffect(() => { fetchFeatured(); }, [fetchFeatured]);
 *   useRefreshable(fetchFeatured);
 *
 * Usage (trigger side, only PullToRefresh)
 * ────────────────────────────────────────
 *   const handled = await triggerRefresh();
 *   if (!handled) window.location.reload();
 *
 * Contract
 * ────────
 *   · Each handler is awaited (so the spinner stays up until data lands).
 *   · `triggerRefresh()` returns `true` if at least one handler ran.
 *   · `triggerRefresh()` has a hard 2.5s timeout — if a handler is slow,
 *     the UI still recovers and the spinner closes.
 */
const handlers = new Set();

export function onRefresh(handler) {
  if (typeof handler !== "function") return () => {};
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export async function triggerRefresh({ timeoutMs = 2500 } = {}) {
  if (handlers.size === 0) return false;
  const promises = [...handlers].map((h) => {
    try {
      return Promise.resolve(h());
    } catch {
      return Promise.resolve();
    }
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([Promise.allSettled(promises), timeout]);
  return true;
}

export function refreshHandlerCount() {
  return handlers.size;
}
