import BrandMark from "./BrandMark";
import { useEffect, useState } from "react";

const STORAGE_KEY = "gm_splash_shown_at";
const COOLDOWN_HOURS = 6;
const VISIBLE_MS = 1800;

/**
 * SplashScreen — Section 48 — PWA / mobile-only welcome animation.
 *
 * Behavior:
 *  · Renders ONLY when:
 *      - Viewport width < 768px (mobile), AND
 *      - PWA standalone display-mode OR ?splash=1 query param (debug), AND
 *      - Cooldown of 6h since last shown (so re-launches in same session don't loop).
 *  · Slides in for ~1.8 s with logo + brand mark, then fades out.
 *  · Honors `prefers-reduced-motion` by simply not rendering.
 *  · Uses backdrop-filter for the soft blur of the app behind during fade-out.
 */
function _isMobile() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

function _isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function _reducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function _isOnCooldown() {
  try {
    const at = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    if (!at) return false;
    return Date.now() - at < COOLDOWN_HOURS * 3_600_000;
  } catch (_e) {
    return false;
  }
}

function _markShown() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (_e) { /* ignore */ }
}

export default function SplashScreen() {
  const [phase, setPhase] = useState("init"); // init | visible | fade | done

  useEffect(() => {
    // Decide synchronously on mount whether to even render
    if (_reducedMotion()) { setPhase("done"); return; }
    const debugForce = typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("splash") === "1";
    const shouldShow = debugForce
      || (_isMobile() && _isStandalone() && !_isOnCooldown());
    if (!shouldShow) { setPhase("done"); return; }
    setPhase("visible");
    _markShown();
    const fadeTimer = setTimeout(() => setPhase("fade"), VISIBLE_MS);
    const doneTimer = setTimeout(() => setPhase("done"), VISIBLE_MS + 400);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, []);

  if (phase === "init" || phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #03045E 0%, #0077B6 60%, #F97316 130%)",
        opacity: phase === "fade" ? 0 : 1,
        transition: "opacity 380ms ease-out",
        pointerEvents: phase === "fade" ? "none" : "auto",
      }}
      data-testid="splash-screen"
      aria-hidden={phase === "fade"}
    >
      <style>{`
        @keyframes splash-rise { from { opacity:0; transform: translateY(28px) scale(.96); } to { opacity:1; transform: translateY(0) scale(1); } }
        @keyframes splash-tag { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
        @keyframes splash-ring { 0%{ transform: scale(1); opacity:.55 } 100%{ transform: scale(1.6); opacity:0 } }
      `}</style>
      <div className="text-center px-6">
        <div className="relative inline-block" style={{ animation: "splash-rise 520ms cubic-bezier(.16,1,.3,1) both" }}>
          <span className="absolute inset-0 rounded-full" style={{
            background: "rgba(255,255,255,0.35)",
            animation: "splash-ring 1.6s ease-out infinite",
          }} aria-hidden />
          <span className="relative inline-flex items-center justify-center w-28 h-28 rounded-full bg-white shadow-2xl">
            <BrandMark size="2xl" className="w-20 h-20" />
          </span>
        </div>
        <h1
          className="text-white text-3xl font-extrabold mt-6 tracking-tight"
          style={{ animation: "splash-rise 520ms cubic-bezier(.16,1,.3,1) 120ms both" }}
        >
          getamano
        </h1>
        <p
          className="text-white/90 text-sm mt-2 font-medium"
          style={{ animation: "splash-tag 460ms ease-out 360ms both" }}
        >
          Comunidad latina en USA · ¡Bienvenido!
        </p>
      </div>
    </div>
  );
}
