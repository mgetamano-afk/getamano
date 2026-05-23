import { useEffect, useState } from "react";
import { Gift, Check, Clock, Copy, Loader2, Sparkles, Award } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

/**
 * CouponsCard — Section 35.5 dashboard widget.
 *
 * Lists the provider's earned coupons (50%/25%/10% off based on previous
 * month rank). Lets them copy the code or mark it redeemed. When Stripe is
 * wired, the redeem button will trigger an actual checkout discount.
 */
const TIER_THEME = {
  50: { bg: "linear-gradient(135deg, #FFF7ED 0%, #FED7AA 100%)", border: "rgba(234,88,12,0.40)", accent: "#9A3412", emoji: "🥇" },
  25: { bg: "linear-gradient(135deg, #F1F5F9 0%, #CBD5E1 100%)", border: "rgba(100,116,139,0.40)", accent: "#475569", emoji: "🥈" },
  10: { bg: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)", border: "rgba(217,119,6,0.40)", accent: "#92400E", emoji: "🥉" },
};

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  } catch (_e) {
    return iso.slice(0, 10);
  }
}

export default function CouponsCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  const load = () => {
    api.get("/me/coupons")
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
      toast.success("¡Código copiado!");
    } catch (_e) {
      toast.error("No se pudo copiar");
    }
  };

  const redeem = async (couponId) => {
    setRedeeming(couponId);
    try {
      await api.post(`/me/coupons/${couponId}/redeem`);
      toast.success("✅ Cupón aplicado a tu próxima mensualidad");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No se pudo redimir");
    } finally {
      setRedeeming(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-6 text-slate-400 text-sm flex items-center gap-2" data-testid="coupons-card-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando recompensas…
      </div>
    );
  }
  if (!data || !data.items || data.items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 mb-6" data-testid="coupons-card" id="rewards">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
               style={{ background: "rgba(194,65,12,0.10)", color: "#C2410C" }}>
            <Sparkles className="w-3 h-3" /> Recompensas redimibles
          </div>
          <h3 className="font-display font-bold text-slate-900 text-lg mt-2 leading-tight" data-testid="coupons-card-title">
            {data.active_count > 0 ? `Tienes ${data.active_count} ${data.active_count === 1 ? "cupón" : "cupones"} activo${data.active_count !== 1 ? "s" : ""}` : "Tus recompensas"}
          </h3>
          <p className="text-xs text-slate-500 mt-1">Descuentos ganados por estar en el Top del ranking mensual. Se canjean al renovar tu plan.</p>
        </div>
      </div>

      <ul className="space-y-3">
        {data.items.map(c => {
          const theme = TIER_THEME[c.discount_pct] || TIER_THEME[10];
          const expired = c.status === "expired";
          const redeemed = c.status === "redeemed";
          const available = c.status === "available";
          return (
            <li
              key={c.coupon_id}
              className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ background: theme.bg, border: `1px solid ${theme.border}`, opacity: expired ? 0.55 : 1 }}
              data-testid={`coupon-row-${c.coupon_id}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="text-3xl flex-shrink-0" aria-hidden="true">{theme.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-white/70" style={{ color: theme.accent }}>
                      {c.tier_label} · {c.month_key}
                    </span>
                    {redeemed && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: "rgba(5,150,105,0.15)", color: "#047857" }}>
                        ✅ Redimido
                      </span>
                    )}
                    {expired && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">
                        Expirado
                      </span>
                    )}
                  </div>
                  <p className="font-display font-bold text-lg leading-tight mt-0.5" style={{ color: theme.accent }} data-testid={`coupon-discount-${c.coupon_id}`}>
                    {c.discount_pct}% off tu próxima mensualidad
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => copyCode(c.code)}
                      className="inline-flex items-center gap-1 font-mono font-bold px-2 py-1 rounded-md bg-white/80 hover:bg-white transition"
                      style={{ color: theme.accent }}
                      title="Copiar código"
                      data-testid={`coupon-code-${c.coupon_id}`}
                    >
                      {copiedCode === c.code ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {c.code}
                    </button>
                    <span className="text-slate-600 inline-flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      Válido hasta {formatDate(c.redeemable_until)}
                    </span>
                  </div>
                </div>
              </div>
              {available && (
                <button
                  type="button"
                  onClick={() => redeem(c.coupon_id)}
                  disabled={redeeming === c.coupon_id}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-white text-xs font-bold whitespace-nowrap disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
                  data-testid={`coupon-redeem-${c.coupon_id}`}
                >
                  <Award className="w-3.5 h-3.5" />
                  {redeeming === c.coupon_id ? "Aplicando…" : "Aplicar a mi plan"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
