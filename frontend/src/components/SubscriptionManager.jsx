import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Sparkles, Loader2, ArrowUpRight, AlertCircle, Check, RotateCcw } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { toast } from "sonner";
import CancelSubscriptionModal from "./CancelSubscriptionModal";

/**
 * SubscriptionManager — shows the provider's current plan + cancellation entry
 * point. Lives inside the provider Dashboard (Configuration / Suscripción tab).
 *
 *  • Active paid plan         → green card with plan name, renewal date, "Cancelar" button
 *  • Cancelled (still active) → amber card with "Reactivar" button + access-until date
 *  • Free plan                → blue card with upgrade CTA
 */
const PLAN_LABELS = {
  free: { es: "Gratis", en: "Free" },
  basic: { es: "Básico", en: "Basic" },
  pro: { es: "Pro", en: "Pro" },
  premium: { es: "Premium", en: "Premium" },
};

function formatDate(iso, locale) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "es-ES", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch (_e) { return iso.slice(0, 10); }
}

export default function SubscriptionManager() {
  const { lang } = useI18n();
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/me/subscription");
      setSub(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onCancelled = (nextSub) => {
    setSub(nextSub);
    setShowCancel(false);
  };

  const onReactivate = async () => {
    setReactivating(true);
    try {
      const r = await api.post("/me/subscription/reactivate");
      setSub(r.data);
      toast.success(lang === "en" ? "Subscription reactivated" : "Suscripción reactivada");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setReactivating(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-6 animate-pulse h-44" data-testid="subscription-manager-loading" />
    );
  }

  if (!sub) return null;

  const planName = (PLAN_LABELS[sub.plan] || { es: sub.plan, en: sub.plan })[lang === "en" ? "en" : "es"];
  const isFree = sub.plan === "free";
  const isCancelled = sub.status === "cancelled";
  const billingLabel = sub.billing_cycle === "annual" ? (lang === "en" ? "Annual" : "Anual") : (lang === "en" ? "Monthly" : "Mensual");

  // ─── FREE plan card — upgrade CTA ───
  if (isFree) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="subscription-manager">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(2,95,103,0.08)" }}>
            <Sparkles className="w-5 h-5" style={{ color: "#03045E" }} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{lang === "en" ? "Your plan" : "Tu plan"}</p>
            <h3 className="font-display text-2xl font-bold text-slate-900 mt-0.5">{planName}</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {lang === "en"
                ? "Upgrade to unlock more categories, unlimited photos, priority ranking and direct WhatsApp."
                : "Mejora tu plan para desbloquear más categorías, fotos ilimitadas, mejor posición y WhatsApp directo."}
            </p>
            <Link
              to="/plans"
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold hover:opacity-95 active:scale-[0.98] transition"
              style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
              data-testid="subscription-upgrade-btn"
            >
              {lang === "en" ? "Upgrade my plan" : "Mejorar mi plan"} <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── CANCELLED state — amber card with "Reactivate" CTA ───
  if (isCancelled) {
    return (
      <div className="rounded-2xl border-2 p-6" style={{ borderColor: "#F59E0B", background: "#FFFBEB" }} data-testid="subscription-manager">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
            <AlertCircle className="w-5 h-5" style={{ color: "#B45309" }} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#B45309" }}>{lang === "en" ? "Cancelled" : "Cancelada"}</p>
            <h3 className="font-display text-xl font-bold text-slate-900 mt-0.5">
              {planName} <span className="text-base font-normal text-slate-500">· {billingLabel}</span>
            </h3>
            <p className="text-sm text-slate-700 mt-2 leading-relaxed">
              {lang === "en"
                ? <>You'll keep access until <strong>{formatDate(sub.next_renewal_date, lang)}</strong>. After that you'll move to the Free plan automatically.</>
                : <>Mantienes acceso hasta el <strong>{formatDate(sub.next_renewal_date, lang)}</strong>. Después pasarás al plan Gratis automáticamente.</>}
            </p>
            <button
              type="button"
              onClick={onReactivate}
              disabled={reactivating}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold hover:opacity-95 active:scale-[0.98] transition disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
              data-testid="subscription-reactivate-btn"
            >
              {reactivating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {lang === "en" ? "Reactivating…" : "Reactivando…"}</>
                : <><RotateCcw className="w-4 h-4" /> {lang === "en" ? "Reactivate" : "Reactivar"}</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── ACTIVE paid plan — main card ───
  return (
    <>
      <div className="rounded-2xl border-2 p-6" style={{ borderColor: "#16A34A33", background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 100%)" }} data-testid="subscription-manager">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(22,163,74,0.12)" }}>
            <Check className="w-5 h-5" style={{ color: "#16A34A" }} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#16A34A" }}>{lang === "en" ? "Active plan" : "Plan activo"}</p>
            <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
              <h3 className="font-display text-2xl font-bold text-slate-900" data-testid="subscription-plan-name">{planName}</h3>
              <span className="text-sm text-slate-500">· {billingLabel}</span>
              <span className="text-sm font-semibold text-slate-700">
                ${sub.amount}{sub.billing_cycle === "annual" ? (lang === "en" ? "/yr" : "/año") : (lang === "en" ? "/mo" : "/mes")}
              </span>
              {sub.annual_discount_applied && (
                <span className="ml-1 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md" style={{ background: "#FEF3C7", color: "#92400E" }}>
                  {lang === "en" ? "2 mo free" : "2 meses gratis"}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-2 inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              {lang === "en" ? "Renews on " : "Se renueva el "}
              <strong className="text-slate-800" data-testid="subscription-next-renewal">{formatDate(sub.next_renewal_date, lang)}</strong>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/plans"
                className="px-4 py-2 rounded-full text-slate-800 text-sm font-medium border border-slate-300 hover:bg-slate-50 transition inline-flex items-center gap-1.5"
                data-testid="subscription-change-plan"
              >
                <ArrowUpRight className="w-3.5 h-3.5" /> {lang === "en" ? "Change plan" : "Cambiar de plan"}
              </Link>
              <button
                type="button"
                onClick={() => setShowCancel(true)}
                className="px-4 py-2 rounded-full text-slate-600 text-sm font-medium hover:bg-slate-100 transition"
                data-testid="subscription-cancel-btn"
              >
                {lang === "en" ? "Cancel subscription" : "Cancelar suscripción"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCancel && (
        <CancelSubscriptionModal
          sub={sub}
          onClose={() => setShowCancel(false)}
          onSuccess={onCancelled}
          lang={lang}
        />
      )}
    </>
  );
}
