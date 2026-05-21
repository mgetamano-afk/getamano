import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Award, ArrowRight, Flame } from "lucide-react";
import { api } from "../lib/api";

/**
 * FoundingCounter — Live urgency counter for the GETMANO50 promo.
 * Polls /promo-codes/founding-status every 20s, animates remaining spots,
 * and ramps up visual urgency as spots dwindle.
 */
export default function FoundingCounter({ variant = "hero" }) {
  const [data, setData] = useState({ available: true, used: 0, max: 50 });
  const [displayed, setDisplayed] = useState(null);
  const prevRef = useRef(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const fetchStatus = () => {
      api.get("/promo-codes/founding-status").then(r => setData(r.data)).catch(() => {});
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 20000);
    return () => clearInterval(id);
  }, []);

  // Animate remaining count when it changes (someone just claimed a spot)
  useEffect(() => {
    const remaining = data.max - data.used;
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

  if (!data.available || displayed === null) return null;

  const remaining = displayed;
  const pct = Math.min(100, Math.round((data.used / data.max) * 100));
  // Urgency tiers
  const isCritical = remaining <= 10;
  const isHigh = remaining <= 25;

  const urgencyLabel = isCritical
    ? "¡Últimos cupos!"
    : isHigh
    ? "Demanda alta"
    : "Cupos limitados";

  if (variant === "compact") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-400/30 text-orange-200 text-xs" data-testid="founding-counter-compact">
        <Flame className={`w-3.5 h-3.5 ${isCritical ? "text-red-400" : ""}`} />
        <span><strong className="text-white">{remaining}</strong>/{data.max} cupos Founding restantes</span>
      </div>
    );
  }

  const recent = Array.isArray(data.recent) ? data.recent.slice(0, 3) : [];
  // Stable color palette by initial
  const avatarBg = (s) => {
    const colors = ["#FF6B2C", "#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"];
    const idx = (s?.charCodeAt(0) || 0) % colors.length;
    return colors[idx];
  };
  // Time-ago helper (short ES)
  const timeAgo = (iso) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "hace un momento";
    if (m < 60) return `hace ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h}h`;
    const d = Math.floor(h / 24);
    return `hace ${d}d`;
  };
  const latest = recent[0];

  return (
    <Link
      to="/registro?intent=provider&promo=GETMANO50"
      className="block group relative overflow-hidden rounded-2xl border border-orange-400/30 bg-gradient-to-br from-orange-500/15 via-amber-600/10 to-orange-900/5 backdrop-blur-sm px-4 py-3.5 hover:border-orange-400/60 transition"
      data-testid="founding-counter-hero"
    >
      <style>{`
        @keyframes founding-shimmer { 0%{transform:translateX(-120%)}100%{transform:translateX(220%)} }
        @keyframes founding-pop { 0%{transform:scale(1)} 30%{transform:scale(1.18)} 100%{transform:scale(1)} }
        @keyframes founding-bar { from{width:0%} to{width:var(--bar-w)} }
        @keyframes founding-live { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(248,113,113,.7)} 50%{opacity:.6;box-shadow:0 0 0 6px rgba(248,113,113,0)} }
      `}</style>

      {/* Shimmer sweep */}
      <span className="pointer-events-none absolute inset-y-0 -inset-x-4 w-1/3"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)", animation: "founding-shimmer 4.5s infinite" }} />

      <div className="relative flex items-center gap-4">
        {/* Big number */}
        <div className={`flex-shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-display ${isCritical ? "bg-red-500 text-white" : "bg-orange-500 text-white"}`}
          style={{ animation: pulse ? "founding-pop 1s ease" : undefined, boxShadow: isCritical ? "0 0 24px rgba(248, 113, 113, 0.6)" : "0 0 16px rgba(249, 115, 22, 0.45)" }}>
          <span className="text-2xl font-bold leading-none" data-testid="founding-counter-remaining">{remaining}</span>
          <span className="text-[9px] tracking-widest uppercase opacity-80 mt-0.5">de {data.max}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Award className="w-3.5 h-3.5 text-orange-300" />
            <span className="text-[10px] tracking-widest uppercase font-semibold text-orange-300">Founding Members</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-red-300 font-semibold ml-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" style={{ animation: "founding-live 1.6s infinite" }} />
              {urgencyLabel}
            </span>
          </div>
          <p className="text-sm text-white font-medium leading-snug">
            Plan <strong className="text-orange-300">Pro gratis hasta 2027</strong> con código <code className="bg-white/10 text-orange-200 px-1.5 py-0.5 rounded text-xs">GETMANO50</code>
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div className={`h-full rounded-full ${isCritical ? "bg-gradient-to-r from-red-500 to-orange-500" : "bg-gradient-to-r from-orange-500 to-amber-400"}`}
              style={{ "--bar-w": `${pct}%`, width: `${pct}%`, animation: "founding-bar 1.4s ease-out" }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-white/60">
            {recent.length > 0 ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex -space-x-1.5" data-testid="founding-counter-avatars">
                  {recent.map((m, i) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[#0B0F2E] shadow"
                      style={{ backgroundColor: avatarBg(m.initial) }}
                      title={`${m.first_name}${m.city ? ` · ${m.city}` : ""}`}
                    >
                      {m.initial}
                    </div>
                  ))}
                </div>
                <span className="truncate">
                  <strong className="text-white/90">{latest?.first_name}</strong>
                  {latest?.city ? ` desde ${latest.city}` : ""}
                  {recent.length > 1 ? ` y ${recent.length - 1} más` : ""} se unieron {timeAgo(latest?.at)}
                </span>
              </div>
            ) : (
              <span>{data.used} ya activados</span>
            )}
            <span className="inline-flex items-center gap-1 text-orange-300 group-hover:text-orange-200 font-medium flex-shrink-0">
              Reclamar mi cupo <ArrowRight className="w-3 h-3 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
