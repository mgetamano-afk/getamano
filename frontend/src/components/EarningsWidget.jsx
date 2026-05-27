import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Info, ArrowUpRight, Wallet,
  Sparkles, CalendarDays, Activity,
} from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * EarningsWidget — Section 71 / redesigned Section 76b.
 *
 * Compact card for AppHome. Visual brief:
 *   - Decorative SVG blob + grain noise overlay (depth, anti-flat look)
 *   - Animated count-up on the hero number (300ms, eased)
 *   - Three-column compact stat row (this month, last month, delta)
 *   - Hover micro-lift + ring glow
 *   - Demo-mode badge (top-right) when Stripe isn't wired yet
 */
export default function EarningsWidget() {
  const { lang } = useI18n();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayCents, setDisplayCents] = useState(0);
  const animRef = useRef();

  useEffect(() => {
    let mounted = true;
    api.get("/credits/me/summary")
      .then(r => { if (mounted) setSummary(r.data); })
      .catch(() => { if (mounted) setSummary(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // Count-up animation when summary arrives
  useEffect(() => {
    if (!summary) return;
    const target = summary.pending_balance_cents || 0;
    const duration = 700;
    const start = performance.now();
    cancelAnimationFrame(animRef.current);
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplayCents(Math.round(target * eased));
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [summary]);

  if (loading || !summary) return null;
  if (summary.credits_count === 0) return null;

  const T = lang === "es" ? {
    title: "Tus ganancias",
    pending: "Crédito disponible",
    thisMonth: "Este mes",
    lastMonth: "Mes pasado",
    seeBreakdown: "Ver detalle",
    vs: "vs",
    demoMode: "Modo demo",
    note: "Se aplica como descuento en tu próxima factura.",
    noteDemo: "Al activar Stripe se aplicará automáticamente.",
  } : {
    title: "Your earnings",
    pending: "Available credit",
    thisMonth: "This month",
    lastMonth: "Last month",
    seeBreakdown: "See details",
    vs: "vs",
    demoMode: "Demo mode",
    note: "Applies as a discount on your next invoice.",
    noteDemo: "When Stripe is activated, it auto-applies.",
  };

  const delta = summary.delta_pct;
  const deltaUp = delta != null && delta > 0;
  const deltaDown = delta != null && delta < 0;
  const fmtDollars = (c) => `$${(c / 100).toFixed(2)}`;

  return (
    <Link
      to="/dashboard/provider?tab=red&subtab=earnings"
      className="group relative block rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: "linear-gradient(135deg, #063154 0%, #0A4D5E 55%, #025F67 100%)",
        boxShadow: "0 8px 24px -10px rgba(2, 95, 103, 0.4)",
      }}
      data-testid="earnings-widget"
    >
      {/* Decorative background blob */}
      <svg
        className="absolute -right-10 -top-12 w-44 h-44 opacity-[0.07] pointer-events-none"
        viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      >
        <path fill="#FFF" d="M44.8,-66.8C57.7,-58.5,67.5,-44.7,72.8,-29.8C78.1,-14.9,79,1.1,74.8,15.3C70.7,29.4,61.6,41.7,50,52.2C38.5,62.7,24.6,71.4,9.5,73.8C-5.6,76.3,-21.9,72.5,-36.3,64.4C-50.7,56.3,-63.2,43.8,-69.6,28.6C-76,13.4,-76.3,-4.5,-70.7,-19.6C-65.1,-34.8,-53.6,-47.2,-40.3,-55.5C-26.9,-63.7,-13.5,-67.8,1.5,-70.1C16.4,-72.4,32.8,-72.9,44.8,-66.8Z" transform="translate(100 100)" />
      </svg>
      {/* Grain noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='80' height='80' filter='url(%23n)'/></svg>\")",
        }}
        aria-hidden="true"
      />

      <div className="relative p-4 sm:p-5 text-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-300/30 to-emerald-500/20 ring-1 ring-emerald-300/40 flex items-center justify-center shrink-0">
              <Wallet className="w-3.5 h-3.5 text-emerald-200" />
              <Sparkles className="absolute -top-1 -right-1 w-2.5 h-2.5 text-yellow-300 animate-pulse" style={{ animationDuration: "2.4s" }} />
            </div>
            <div className="text-[10px] font-semibold text-white/80 uppercase tracking-[0.14em] leading-none mt-1">
              {T.title}
            </div>
          </div>
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-white/70 group-hover:text-white transition">
            {T.seeBreakdown}
            <ArrowUpRight className="w-3 h-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        </div>

        {/* Hero number */}
        <div className="mt-3" data-testid="earnings-widget-pending">
          <div className="text-[10px] uppercase tracking-wider text-white/60 leading-none">{T.pending}</div>
          <div
            className="font-extrabold tracking-tight leading-none mt-1"
            style={{
              fontSize: "clamp(26px, 5.5vw, 34px)",
              fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
              letterSpacing: "-0.02em",
              textShadow: "0 2px 8px rgba(0,0,0,0.18)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtDollars(displayCents)}
          </div>
        </div>

        {/* Compact 3-column stat row */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-black/15 backdrop-blur-sm p-2.5">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/55 leading-none">
              <TrendingUp className="w-2.5 h-2.5" /> {T.thisMonth}
            </div>
            <div className="text-[13px] font-bold tabular-nums leading-tight" data-testid="earnings-widget-this-month">
              {summary.this_month_label}
            </div>
          </div>
          <div className="flex flex-col gap-0.5 border-x border-white/10 px-2">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/55 leading-none">
              <CalendarDays className="w-2.5 h-2.5" /> {T.lastMonth}
            </div>
            <div className="text-[13px] font-bold tabular-nums leading-tight text-white/85">
              {summary.last_month_label}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/55 leading-none">
              <Activity className="w-2.5 h-2.5" /> {T.vs}
            </div>
            <div
              className="text-[13px] font-bold tabular-nums leading-tight inline-flex items-center gap-0.5"
              data-testid="earnings-widget-delta"
            >
              {delta == null ? (
                <span className="text-white/60">—</span>
              ) : (
                <>
                  {deltaUp && <TrendingUp className="w-3 h-3 text-emerald-300" />}
                  {deltaDown && <TrendingDown className="w-3 h-3 text-rose-300" />}
                  <span className={deltaUp ? "text-emerald-200" : deltaDown ? "text-rose-200" : "text-white/85"}>
                    {delta > 0 ? "+" : ""}{delta}%
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer note */}
        {summary.pending_balance_cents > 0 && (
          <div className="mt-3 flex items-start gap-1.5 text-[11px] text-white/75 leading-snug" data-testid="earnings-widget-next-action">
            <Info className="w-3 h-3 mt-0.5 shrink-0 text-white/60" />
            <span>{summary.stripe_configured ? T.note : T.noteDemo}</span>
          </div>
        )}

        {/* Demo mode badge */}
        {!summary.stripe_configured && (
          <div className="absolute top-2.5 right-2.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-yellow-300/20 text-yellow-100 text-[8.5px] font-bold uppercase tracking-wider ring-1 ring-yellow-300/30">
              <span className="w-1 h-1 rounded-full bg-yellow-300 animate-pulse" />
              {T.demoMode}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
