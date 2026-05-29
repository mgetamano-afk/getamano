import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Award, ArrowRight } from "lucide-react";
import { api } from "../lib/api";

/**
 * FoundingCounter — Live urgency counter for the Founder100 program.
 *
 * Section 74 rewrite (Founder100 redefinition):
 *   - Source: /api/founders/status (was /api/promo-codes/founding-status)
 *   - Shape:  { slots_total: 100, slots_used: N, slots_remaining: 100-N,
 *               free_until: "2027-12-31" }
 *   - Copy:   "Cualquier plan de pago GRATIS hasta diciembre 2027"
 *             (was "Plan Pro gratis con código GETAMANO50")
 *   - Hides itself when slots_remaining <= 0 (sold out → don't display).
 *
 * Polls every 20s so the urgency value (X of 100) feels live. Animates
 * the number when it changes (someone just claimed a spot).
 */
export default function FoundingCounter({ variant = "hero" }) {
  const [data, setData] = useState({
    slots_total: 100,
    slots_used: 0,
    slots_remaining: 100,
    free_until: "2027-12-31",
  });
  const [displayed, setDisplayed] = useState(null);
  const prevRef = useRef(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const fetchStatus = () => {
      api
        .get("/founders/status")
        .then((r) => setData(r.data))
        .catch(() => {});
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 20000);
    return () => clearInterval(id);
  }, []);

  // Animate `slots_remaining` when it changes (claim happened).
  useEffect(() => {
    const remaining = Math.max(0, Number(data.slots_remaining || 0));
    if (prevRef.current === null) {
      setDisplayed(remaining);
      prevRef.current = remaining;
      return;
    }
    if (prevRef.current !== remaining) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1200);
      setDisplayed(remaining);
      prevRef.current = remaining;
      return () => clearTimeout(t);
    }
  }, [data]);

  if (displayed === null || displayed <= 0) return null;

  const remaining = displayed;
  const total = Number(data.slots_total || 100);
  const used = Number(data.slots_used || 0);
  const pct = Math.min(100, Math.round((used / total) * 100));

  // Urgency tiers — 10/25 thresholds make sense for 100 spots.
  const isCritical = remaining <= 10;
  const isHigh = remaining <= 25;
  const urgencyLabel = isCritical
    ? "¡Últimos cupos!"
    : isHigh
    ? "Demanda alta"
    : "Cupos limitados";

  // ─── Compact pill (used in tiny callouts) ────────────────────────────
  if (variant === "compact") {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-400/30 text-orange-200 text-xs"
        data-testid="founding-counter-compact"
      >
        <Award className={`w-3.5 h-3.5 ${isCritical ? "text-red-400" : ""}`} />
        <span>
          <strong className="text-white">{remaining}</strong>/{total} cupos
          Founding
        </span>
      </div>
    );
  }

  // ─── Banner variant — light backgrounds (AppHome) ────────────────────
  if (variant === "banner") {
    return (
      <Link
        to="/registro?role=provider"
        className="block group relative overflow-hidden rounded-3xl shadow-xl hover:shadow-2xl transition-all"
        style={{
          background:
            "linear-gradient(135deg, #F97316 0%, #EA580C 50%, #C2410C 100%)",
          boxShadow:
            "0 12px 32px -8px rgba(234, 88, 12, 0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
        }}
        data-testid="founding-counter-banner"
      >
        <style>{`
          @keyframes founding-shimmer { 0%{transform:translateX(-120%)} 100%{transform:translateX(220%)} }
          @keyframes founding-pop { 0%{transform:scale(1)} 30%{transform:scale(1.18)} 100%{transform:scale(1)} }
          @keyframes founding-bar { from{width:0%} to{width:var(--bar-w)} }
          @keyframes founding-pulse-dot { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(255,255,255,.6)} 50%{opacity:.7;box-shadow:0 0 0 6px rgba(255,255,255,0)} }
        `}</style>

        <span
          className="pointer-events-none absolute inset-y-0 -inset-x-4 w-1/3"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.20), transparent)",
            animation: "founding-shimmer 4.5s infinite",
          }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.18), transparent 60%)",
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-4 px-4 py-4 md:px-5 md:py-5">
          {/* Big number tile */}
          <div
            className="flex-shrink-0 w-[68px] h-[68px] md:w-[76px] md:h-[76px] rounded-2xl flex flex-col items-center justify-center bg-white text-orange-600 shadow-lg"
            style={{
              animation: pulse ? "founding-pop 1s ease" : undefined,
              boxShadow:
                "0 8px 16px -4px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            <span
              className="text-2xl md:text-3xl font-extrabold leading-none font-display"
              data-testid="founding-counter-remaining"
            >
              {remaining}
            </span>
            <span className="text-[9px] tracking-[0.2em] uppercase opacity-80 mt-1 font-bold">
              de {total}
            </span>
          </div>

          {/* Copy */}
          <div className="flex-1 min-w-0 text-white">
            <div className="flex items-center gap-1.5 mb-1">
              <Award className="w-3.5 h-3.5 text-amber-100" />
              <span className="text-[10px] md:text-[11px] tracking-[0.25em] uppercase font-extrabold text-amber-100">
                Founding Members
              </span>
              <span className="inline-flex items-center gap-1 ml-auto text-[10px] text-white/95 font-bold">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-white"
                  style={{ animation: "founding-pulse-dot 1.6s infinite" }}
                />
                {urgencyLabel}
              </span>
            </div>
            <p className="text-sm md:text-base text-white leading-snug font-semibold">
              Cualquier plan de pago{" "}
              <span className="font-extrabold text-amber-100">
                GRATIS hasta diciembre 2027
              </span>
            </p>

            {/* Progress bar */}
            <div className="mt-2 h-2 w-full rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-white"
                style={{
                  "--bar-w": `${pct}%`,
                  width: `${pct}%`,
                  animation: "founding-bar 1.4s ease-out",
                  boxShadow: "0 0 8px rgba(255,255,255,0.7)",
                }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/90">
              <span className="font-medium">
                {used} ya activados · {remaining} cupos disponibles
              </span>
              <span className="inline-flex items-center gap-1 text-white font-bold flex-shrink-0">
                Reclamar mi cupo
                <ArrowRight className="w-3.5 h-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // ─── Hero variant — dark backgrounds (Landing hero) ──────────────────
  return (
    <Link
      to="/registro?role=provider"
      className="block group relative overflow-hidden rounded-2xl border border-orange-400/30 bg-gradient-to-br from-orange-500/15 via-amber-600/10 to-orange-900/5 backdrop-blur-sm px-4 py-3.5 hover:border-orange-400/60 transition"
      data-testid="founding-counter-hero"
    >
      <style>{`
        @keyframes founding-shimmer { 0%{transform:translateX(-120%)}100%{transform:translateX(220%)} }
        @keyframes founding-pop { 0%{transform:scale(1)} 30%{transform:scale(1.18)} 100%{transform:scale(1)} }
        @keyframes founding-bar { from{width:0%} to{width:var(--bar-w)} }
        @keyframes founding-live { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(248,113,113,.7)} 50%{opacity:.6;box-shadow:0 0 0 6px rgba(248,113,113,0)} }
      `}</style>

      <span
        className="pointer-events-none absolute inset-y-0 -inset-x-4 w-1/3"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
          animation: "founding-shimmer 4.5s infinite",
        }}
      />

      <div className="relative flex items-center gap-4">
        <div
          className={`flex-shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-display ${
            isCritical ? "bg-red-500 text-white" : "bg-orange-500 text-white"
          }`}
          style={{
            animation: pulse ? "founding-pop 1s ease" : undefined,
            boxShadow: isCritical
              ? "0 0 24px rgba(248, 113, 113, 0.6)"
              : "0 0 16px rgba(249, 115, 22, 0.45)",
          }}
        >
          <span
            className="text-2xl font-bold leading-none"
            data-testid="founding-counter-remaining"
          >
            {remaining}
          </span>
          <span className="text-[9px] tracking-widest uppercase opacity-80 mt-0.5">
            de {total}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Award className="w-3.5 h-3.5 text-orange-300" />
            <span className="text-[10px] tracking-widest uppercase font-semibold text-orange-300">
              Founding Members
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-red-300 font-semibold ml-auto">
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-400"
                style={{ animation: "founding-live 1.6s infinite" }}
              />
              {urgencyLabel}
            </span>
          </div>
          <p className="text-sm text-white font-medium leading-snug">
            Cualquier plan de pago{" "}
            <strong className="text-orange-300">
              GRATIS hasta diciembre 2027
            </strong>
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                isCritical
                  ? "bg-gradient-to-r from-red-500 to-orange-500"
                  : "bg-gradient-to-r from-orange-500 to-amber-400"
              }`}
              style={{
                "--bar-w": `${pct}%`,
                width: `${pct}%`,
                animation: "founding-bar 1.4s ease-out",
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-white/70">
            <span>
              {used} ya activados · {remaining} cupos disponibles
            </span>
            <span className="inline-flex items-center gap-1 text-orange-300 group-hover:text-orange-200 font-medium flex-shrink-0">
              Reclamar mi cupo
              <ArrowRight className="w-3 h-3 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
