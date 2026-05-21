import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { TrendingUp, TrendingDown, Minus, Activity, DollarSign, Inbox, Sparkles } from "lucide-react";

const BUDGET_LABEL_ES = {
  "<100": "menos de $100",
  "100-300": "$100–$300",
  "300-700": "$300–$700",
  "700-1500": "$700–$1500",
  ">1500": "más de $1500",
};

const SIZE_LABEL_ES = {
  small: "pequeño",
  medium: "mediano",
  large: "grande",
  recurring: "recurrente",
};

export default function MarketPulseCard() {
  const [pulse, setPulse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get("/providers/me/market-pulse")
      .then(r => mounted && setPulse(r.data))
      .catch(() => mounted && setPulse(null))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border p-5 mb-6 animate-pulse" style={{ borderColor: "#BCC5CC", backgroundColor: "#FFFFFF" }} data-testid="market-pulse-loading">
        <div className="h-4 w-40 bg-slate-200 rounded mb-3" />
        <div className="h-3 w-full bg-slate-100 rounded" />
      </div>
    );
  }

  if (!pulse) return null;

  if (!pulse.available) {
    return (
      <div
        className="rounded-2xl border p-5 mb-6 flex items-start gap-4"
        style={{ borderColor: "#BCC5CC", background: "linear-gradient(135deg, rgba(247,246,242,1) 0%, rgba(235,248,247,0.6) 100%)" }}
        data-testid="market-pulse-empty"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#EBF8F7", color: "#025F67" }}>
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "#025F67" }}>Pulso semanal del mercado</div>
          <h3 className="font-display font-bold text-lg" style={{ color: "#025F67" }}>Estamos juntando datos en {pulse.category_name || "tu categoría"}</h3>
          <p className="text-sm mt-1" style={{ color: "#063154", opacity: 0.7 }}>
            Cada cotización y tarifa que publicas alimenta el pulso semanal. En cuanto tu zona alcance suficientes datos, recibirás el snapshot completo.
          </p>
        </div>
      </div>
    );
  }

  const delta = pulse.delta_quotes_pct;
  const TrendIcon = delta === null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendColor = delta === null ? "#BCC5CC" : delta > 0 ? "#2F9D94" : delta < 0 ? "#B91C1C" : "#BCC5CC";

  const priceDelta = pulse.delta_price_pct;
  const PriceIcon = priceDelta === null || priceDelta === 0 ? Minus : priceDelta > 0 ? TrendingUp : TrendingDown;
  const priceColor = priceDelta === null || priceDelta === 0 ? "#BCC5CC" : priceDelta > 0 ? "#2F9D94" : "#B91C1C";

  return (
    <div
      className="rounded-2xl border p-5 md:p-6 mb-6 relative overflow-hidden"
      style={{ borderColor: "#BCC5CC", background: "linear-gradient(135deg, #FFFFFF 0%, #EBF8F7 100%)" }}
      data-testid="market-pulse-card"
    >
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #2F9D94, transparent)" }} />
      <div className="flex items-start justify-between gap-4 mb-4 relative">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#025F67" }}>
            <Sparkles className="w-3 h-3" /> Pulso semanal · {pulse.category_name}
          </div>
          <h3 className="font-display font-bold text-xl" style={{ color: "#025F67" }} data-testid="market-pulse-title">
            Esta semana en {pulse.city || "tu zona"}
          </h3>
        </div>
        <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full" style={{ backgroundColor: "#EBF8F7", color: "#025F67", border: "1px solid #A6E1DA" }}>
          actualizado
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative">
        {/* Demand */}
        <div className="rounded-xl p-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #BCC5CC" }} data-testid="market-pulse-demand">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: "#025F67", opacity: 0.7 }}>
            <Inbox className="w-3.5 h-3.5" /> Cotizaciones nuevas
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl" style={{ color: "#063154" }}>{pulse.weekly_quotes}</span>
            {delta !== null && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: trendColor }}>
                <TrendIcon className="w-3.5 h-3.5" />{delta > 0 ? "+" : ""}{delta}%
              </span>
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: "#063154", opacity: 0.6 }}>vs. {pulse.prev_weekly_quotes} la semana pasada</div>
        </div>

        {/* Price */}
        <div className="rounded-xl p-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #BCC5CC" }} data-testid="market-pulse-price">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: "#025F67", opacity: 0.7 }}>
            <DollarSign className="w-3.5 h-3.5" /> Precio promedio
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-xl" style={{ color: "#063154" }}>
              {pulse.avg_min ? `$${Math.round(pulse.avg_min)}–$${Math.round(pulse.avg_max)}` : "—"}
            </span>
            {priceDelta !== null && priceDelta !== 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: priceColor }}>
                <PriceIcon className="w-3.5 h-3.5" />{priceDelta > 0 ? "+" : ""}{priceDelta}%
              </span>
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: "#063154", opacity: 0.6 }}>{pulse.rate_sample_size} tarifas activas en tu zona</div>
        </div>

        {/* Top demand profile */}
        <div className="rounded-xl p-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #BCC5CC" }} data-testid="market-pulse-top">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: "#025F67", opacity: 0.7 }}>
            <Activity className="w-3.5 h-3.5" /> Lo más pedido
          </div>
          <div className="text-sm font-medium" style={{ color: "#063154" }}>
            {pulse.top_budget_range ? <>Budget: <strong>{BUDGET_LABEL_ES[pulse.top_budget_range] || pulse.top_budget_range}</strong></> : <span className="text-slate-400">Sin datos suficientes</span>}
          </div>
          <div className="text-xs mt-1" style={{ color: "#063154", opacity: 0.6 }}>
            {pulse.top_project_size ? <>Tamaño: {SIZE_LABEL_ES[pulse.top_project_size] || pulse.top_project_size}</> : "—"}
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="mt-4 rounded-xl p-3 text-sm relative" style={{ backgroundColor: "rgba(2,95,103,0.06)", color: "#025F67" }} data-testid="market-pulse-insight">
        <strong>Insight:</strong>{" "}
        {pulse.weekly_quotes > 0 && delta !== null && delta > 0
          ? `La demanda en ${pulse.category_name?.toLowerCase()} subió ${delta}% esta semana. Es buen momento para revisar tus tarifas o lanzar una promo.`
          : pulse.weekly_quotes === 0
          ? `Aún no hay cotizaciones nuevas esta semana en ${pulse.city || "tu zona"}. Comparte tu eCard para atraer demanda.`
          : `Mantén tu eCard actualizada y responde rápido — los proveedores que contestan en menos de 1 hora cierran 2x más trabajos.`}
      </div>
    </div>
  );
}
