import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * Live social-proof ticker — reads /api/activity-feed (recent providers + reviews)
 * and renders an infinite marquee inside the dark band below the hero.
 *
 * Falls back to evergreen pills if the API is empty / unreachable so the strip
 * never looks dead. Refetches every 60s.
 */
const POLL_MS = 60_000;
// Section 68 / C2 fix — slower marquee for less visual noise.
const MARQUEE_DURATION_S = 80;
// Show events from the last 72h only (keeps the strip relevant, not spammy).
const MAX_AGE_MS = 72 * 60 * 60 * 1000;
// Cap unique events shown so we don't fall back into a "loop of the same 3".
const MAX_ITEMS = 8;

function _formatRelative(iso, lang) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.max(1, Math.round(diffMs / 60_000));
  if (mins < 60) return lang === "es" ? `hace ${mins} min` : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return lang === "es" ? `hace ${hrs}h` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return lang === "es" ? `hace ${days}d` : `${days}d ago`;
}

function _evergreen(lang) {
  return [
    { icon: "🇺🇸", text: lang === "es" ? "getamano ya está en 38 estados" : "getamano is now in 38 states", link: "/ciudades" },
    { icon: "💎", text: lang === "es" ? "Founding Members · Cualquier plan de pago GRATIS hasta dic 2027" : "Founding Members · Any paid plan FREE until Dec 2027", link: "/registro?role=provider" },
    { icon: "✨", text: lang === "es" ? "Comunidad latina verificada" : "Verified Latino community", link: "/comunidad" },
  ];
}

export default function LiveActivityTicker() {
  const { lang } = useI18n();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const fetchFeed = async () => {
      try {
        const r = await api.get("/activity-feed", { params: { limit: 8 } });
        if (!cancelled && Array.isArray(r.data?.items)) setItems(r.data.items);
      } catch (e) {
        console.error("[LiveActivityTicker] fetch failed", e);
      }
    };
    fetchFeed();
    const id = setInterval(fetchFeed, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Convert API rows to render rows.
  const liveRows = items.map((it) => ({
    icon: it.icon || "•",
    text: lang === "es" ? it.text_es : it.text_en,
    link: it.link || "/buscar",
    rel: _formatRelative(it.at, lang),
    at: it.at,
  }));

  // Section 68 / C2 — filter to last 72h, dedupe by text, cap at MAX_ITEMS.
  // No evergreen fill — when there's nothing recent, render the idle state
  // so users aren't tricked by a fake "always live" loop.
  const cutoff = Date.now() - MAX_AGE_MS;
  const seen = new Set();
  const filtered = liveRows
    .filter((r) => !r.at || new Date(r.at).getTime() >= cutoff)
    .filter((r) => {
      const k = r.text || "";
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_ITEMS);

  // Idle state: nothing recent → render a calm "Tranquilo por aquí" pill,
  // no marquee, no faux activity.
  if (filtered.length === 0) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl border border-emerald-400/15 shadow-xl"
        style={{
          background:
            "radial-gradient(ellipse at top left, rgba(16,185,129,0.10) 0%, transparent 55%), " +
            "linear-gradient(135deg, #050a14 0%, #0b1220 60%, #050a14 100%)",
          boxShadow: "0 8px 24px -10px rgba(0,0,0,0.55)",
        }}
        data-testid="live-activity-ticker-idle"
      >
        <div className="py-3 px-4 flex items-center gap-2 text-[12px] text-white/70">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400/60" />
          </span>
          <span className="font-bold text-emerald-300/90 tracking-[0.18em] text-[10px]">
            {lang === "es" ? "TRANQUILO POR AQUÍ" : "QUIET RIGHT NOW"}
          </span>
          <span className="text-white/50">
            · {lang === "es"
              ? "vuelve pronto para ver actividad reciente"
              : "check back soon for fresh activity"}
          </span>
        </div>
      </div>
    );
  }

  // Duplicate the array so the CSS marquee scrolls seamlessly.
  const doubled = [...filtered, ...filtered];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-emerald-400/20 shadow-2xl"
      style={{
        background:
          "radial-gradient(ellipse at top left, rgba(16,185,129,0.18) 0%, transparent 55%), " +
          "radial-gradient(ellipse at bottom right, rgba(2,95,103,0.30) 0%, transparent 60%), " +
          "linear-gradient(135deg, #050a14 0%, #0b1220 60%, #050a14 100%)",
        boxShadow:
          "0 12px 40px -10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 60px rgba(16,185,129,0.06)",
      }}
      data-testid="live-activity-ticker"
    >
      {/* Section 67 — Self-contained keyframe so the ticker animates on any
          page that mounts it (AppHome, Landing, etc.) without relying on a
          parent's <style> block. */}
      <style>{`@keyframes scroll-x { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      {/* Subtle animated dot grid for "live" feel */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
        aria-hidden
      />

      <div className="relative py-3">
        <div
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 bg-emerald-500/30 border border-emerald-400/50 backdrop-blur-md rounded-full px-2.5 py-1 text-[10px] font-extrabold text-emerald-100 tracking-[0.2em] pointer-events-none shadow-lg"
          style={{ boxShadow: "0 0 16px rgba(16,185,129,0.45)" }}
          data-testid="live-activity-badge"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {lang === "es" ? "EN VIVO" : "LIVE"}
        </div>
        {/* Left fade — hides marquee text sliding under the EN VIVO badge */}
        <div className="absolute left-0 top-0 bottom-0 w-36 z-10 bg-gradient-to-r from-[#050a14] via-[#050a14]/80 to-transparent pointer-events-none" aria-hidden />
        {/* Right fade — symmetrical edge softening */}
        <div className="absolute right-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-l from-[#050a14] via-[#050a14]/70 to-transparent pointer-events-none" aria-hidden />

        <div
          className="flex gap-12 whitespace-nowrap pl-36 pr-16 hover:[animation-play-state:paused]"
          style={{ animation: `scroll-x ${MARQUEE_DURATION_S}s linear infinite`, width: "max-content" }}
        >
          {doubled.map((row, i) => (
            <Link
              key={`${row.text}-${i}`}
              to={row.link}
              className="text-sm text-amber-200/95 flex-shrink-0 hover:text-amber-100 transition-colors inline-flex items-center gap-1.5 drop-shadow-[0_0_8px_rgba(252,211,77,0.25)]"
              data-testid={`live-activity-row-${i}`}
            >
              <span aria-hidden>{row.icon}</span>
              <span>{row.text}</span>
              {row.rel && (
                <span className="text-white/50 text-xs ml-1">· {row.rel}</span>
              )}
              <span className="ml-12 text-emerald-400/40">◆</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
