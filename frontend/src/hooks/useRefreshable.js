import { useEffect } from "react";
import { onRefresh } from "../lib/refreshBus";

/**
 * useRefreshable — register a fetch function with the global refresh bus.
 *
 * The function is invoked by `PullToRefresh` (Section 74/75) when the user
 * pulls down from the top of the page. Unmounting auto-unregisters.
 *
 * Always memoize the passed function with `useCallback` to avoid
 * register/unregister churn on every render.
 */
export default function useRefreshable(refetchFn) {
  useEffect(() => {
    if (typeof refetchFn !== "function") return undefined;
    return onRefresh(refetchFn);
  }, [refetchFn]);
}
