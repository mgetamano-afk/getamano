import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocation } from "react-router-dom";

/**
 * PullToRefresh — Section 74 (mobile-first UX fix).
 *
 * Cross-platform pull-to-refresh. iOS Safari doesn't expose a native
 * pull-to-refresh inside standalone PWAs (no URL bar to drag), and
 * Android Chrome's native one only fires from the URL bar — neither
 * helps users inside our app. This component bridges that gap.
 *
 * Behavior
 * ────────
 * · Active only when `window.scrollY === 0` (you're at the top).
 * · Tracks `touchmove` deltaY; when the user pulls DOWN past 70px,
 *   we show a centered spinner indicator. Past 100px we commit the
 *   refresh on touchend.
 * · "Refresh" = call the provided `onRefresh()` callback, defaulting
 *   to `window.location.reload()`.
 * · Skipped on modal-open routes (story viewer, share sheet, etc.)
 *   by checking for body overflow:hidden which we use as the
 *   universal "modal is open" signal.
 * · Suppressed by `data-no-ptr="true"` on any ancestor — let pages
 *   opt out (e.g. /search has its own custom scrolling).
 */
const TRIGGER_PX = 70;        // visual feedback threshold
const COMMIT_PX  = 110;       // pull past this → refresh fires
const MAX_PULL   = 140;       // cap so indicator doesn't fly off

export default function PullToRefresh({ onRefresh } = {}) {
  const [pull, setPull] = useState(0);          // 0..MAX_PULL
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const tracking = useRef(false);
  const { pathname } = useLocation();

  useEffect(() => {
    // Don't enable PTR on the story viewer, modals, or fullscreen overlays
    if (typeof window === "undefined") return;

    const isBlocked = () => {
      if (document.body.style.overflow === "hidden") return true;       // modal open
      if (document.querySelector('[data-no-ptr="true"]')) return true;  // opt-out
      return false;
    };

    const onTouchStart = (e) => {
      if (refreshing) return;
      if (isBlocked()) return;
      if (window.scrollY > 2) return;
      const t = e.touches[0];
      if (!t) return;
      startY.current = t.clientY;
      tracking.current = true;
    };

    const onTouchMove = (e) => {
      if (!tracking.current || refreshing) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      // Only pull DOWN, and only if we're still at top
      if (dy <= 0 || window.scrollY > 2) {
        if (pull !== 0) setPull(0);
        return;
      }
      // Dampened resistance — feels rubber-bandy on iOS
      const damped = Math.min(MAX_PULL, dy * 0.55);
      setPull(damped);
    };

    const onTouchEnd = async () => {
      if (!tracking.current) return;
      tracking.current = false;
      const final = pull;
      if (final >= COMMIT_PX) {
        setRefreshing(true);
        setPull(TRIGGER_PX);
        try {
          if (typeof onRefresh === "function") {
            await onRefresh();
            setRefreshing(false);
            setPull(0);
          } else {
            // Default: hard reload — guarantees fresh data
            window.location.reload();
          }
        } catch {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    // passive: false on touchmove so we can preventDefault when pulling
    // (prevents Safari's native rubber-band fighting our indicator).
    const moveOpts = { passive: false };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove",  onTouchMove,  moveOpts);
    window.addEventListener("touchend",   onTouchEnd,   { passive: true });
    window.addEventListener("touchcancel", onTouchEnd,  { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove",  onTouchMove);
      window.removeEventListener("touchend",   onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pull, refreshing, pathname, onRefresh]);

  // Visual indicator — a centered teal spinner that descends with the pull.
  // Rotation eases in 0→90° as the user gets closer to the commit threshold.
  const rotate = Math.min(180, (pull / COMMIT_PX) * 180);
  const opacity = Math.min(1, pull / TRIGGER_PX);
  const triggered = pull >= COMMIT_PX || refreshing;

  if (pull <= 0 && !refreshing) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 right-0 z-[80] pointer-events-none flex justify-center"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        transform: `translateY(${pull * 0.4}px)`,
        opacity,
        transition: tracking.current ? "none" : "opacity 200ms, transform 250ms",
      }}
      data-testid="pull-to-refresh-indicator"
    >
      <div
        className={`flex items-center justify-center w-11 h-11 rounded-full bg-white shadow-xl ring-1 ring-slate-200 ${
          triggered ? "scale-105" : ""
        }`}
        style={{ transition: "transform 200ms" }}
      >
        <RefreshCw
          className={`w-5 h-5 ${triggered ? "text-teal-600" : "text-slate-500"} ${
            refreshing ? "animate-spin" : ""
          }`}
          style={{ transform: refreshing ? undefined : `rotate(${rotate}deg)`, transition: "transform 80ms" }}
          strokeWidth={2.5}
        />
      </div>
    </div>
  );
}
