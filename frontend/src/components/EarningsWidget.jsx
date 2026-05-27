import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Info, ArrowRight, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * EarningsWidget — Section 71.
 *
 * Compact "Tus ganancias" card for the AppHome dashboard of providers.
 *
 * Shows:
 *   - Pending credit balance (the amount that will be auto-applied to the
 *     next Stripe invoice as a discount).
 *   - This month earnings vs last month (with % delta + arrow).
 *   - "Next action" copy depending on whether there are pending credits.
 *
 * Auto-hides when the provider has zero earnings AND zero pending credits
 * (they'd see only zeros — not motivating). Once they earn their first
 * commission the widget appears.
 *
 * Tap-through goes to /dashboard/provider?tab=red&subtab=earnings for the
 * detailed history.
 */
export default function EarningsWidget() {
  const { lang } = useI18n();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get("/credits/me/summary")
      .then(r => { if (mounted) setSummary(r.data); })
      .catch(() => { if (mounted) setSummary(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading || !summary) return null;
  // Hide widget for "cold start" providers — once they earn $0.01 it appears.
  if (summary.credits_count === 0) return null;

  const T = lang === "es" ? {
    title: "Tus ganancias",
    pending: "Crédito disponible",
    thisMonth: "Este mes",
    vsLast: "vs mes anterior",
    seeBreakdown: "Ver desglose",
    devNote: "Modo demo · al activar Stripe, este crédito se aplicará automáticamente a tu próxima factura.",
  } : {
    title: "Your earnings",
    pending: "Available credit",
    thisMonth: "This month",
    vsLast: "vs last month",
    seeBreakdown: "See breakdown",
    devNote: "Demo mode · when Stripe is activated, this credit will be auto-applied to your next invoice.",
  };

  const delta = summary.delta_pct;
  const deltaUp = delta != null && delta > 0;
  const deltaDown = delta != null && delta < 0;

  return (
    <Link
      to="/dashboard/provider?tab=red&subtab=earnings"
      className="block rounded-2xl overflow-hidden transition transform hover:-translate-y-0.5 active:translate-y-0"
      style={{
        background: "linear-gradient(135deg, #025F67 0%, #0A4D5E 55%, #063154 100%)",
        boxShadow: "0 10px 30px -8px rgba(2, 95, 103, 0.35)",
      }}
      data-testid="earnings-widget"
    >
      <div className="p-4 sm:p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-white/70 uppercase tracking-wider leading-none mt-1">{T.title}</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/70 hover:text-white">
            {T.seeBreakdown} <ArrowRight className="w-3 h-3" />
          </span>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3 flex-wrap">
          {/* Pending balance — the hero number */}
          <div className="min-w-0">
            <div className="text-[11px] text-white/65 leading-none">{T.pending}</div>
            <div
              className="font-extrabold tracking-tight leading-none mt-1"
              style={{
                fontSize: "clamp(30px, 6.5vw, 40px)",
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                letterSpacing: "-0.02em",
                textShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
              data-testid="earnings-widget-pending"
            >
              {summary.pending_balance_label}
            </div>
          </div>

          {/* This month + delta */}
          <div className="text-right shrink-0">
            <div className="text-[11px] text-white/65 leading-none">{T.thisMonth}</div>
            <div className="text-base font-bold mt-1 leading-none" data-testid="earnings-widget-this-month">
              {summary.this_month_label}
            </div>
            {delta != null && (
              <div
                className={`inline-flex items-center gap-0.5 mt-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  deltaUp ? "bg-emerald-400/20 text-emerald-200" : (deltaDown ? "bg-rose-400/20 text-rose-200" : "bg-white/15 text-white/80")
                }`}
                data-testid="earnings-widget-delta"
              >
                {deltaUp && <TrendingUp className="w-3 h-3" />}
                {deltaDown && <TrendingDown className="w-3 h-3" />}
                {delta > 0 ? "+" : ""}{delta}% {T.vsLast}
              </div>
            )}
          </div>
        </div>

        {/* Next action copy */}
        {summary.pending_balance_cents > 0 && (
          <div
            className="mt-3 pt-3 border-t border-white/10 text-[12px] text-white/80 leading-snug flex items-start gap-1.5"
            data-testid="earnings-widget-next-action"
          >
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/70" />
            <span>
              {summary.next_action}
              {!summary.stripe_configured && (
                <span className="block text-[10px] text-white/55 italic mt-0.5">{T.devNote}</span>
              )}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
