/**
 * VerificationCenter — V13 dedicated "Verificarme" panel.
 *
 * Replaces the legacy "Suscripción" tab. Surfaces:
 *   · Live status of every eCard's verification (active / off)
 *   · The 3 verification tiers ($10 / $15 / $20) with the active one
 *     highlighted, plus the eCard opening fee math.
 *   · The new "Refer & Earn" rewards table: 2 refs = 1 month free,
 *     4 refs = 2 months free, scaling up to 12 months. The widget
 *     pulls /referrals/summary to show live progress.
 */
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import VerifiedBadge from "./VerifiedBadge";
import { ShieldCheck, ShieldOff, Sparkles, Gift, Check, Loader2 } from "lucide-react";

const fmt = (cents) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

const REWARD_LADDER = [
  { refs: 2,  months: 1 },
  { refs: 4,  months: 2 },
  { refs: 6,  months: 3 },
  { refs: 8,  months: 4 },
  { refs: 10, months: 6 },
  { refs: 12, months: 12 },
];

export default function VerificationCenter() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [ecards, setEcards] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [referrals, setReferrals] = useState({ paid: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const refresh = async () => {
    try {
      const [a, b, c] = await Promise.all([
        api.get("/users/me/ecards"),
        api.get("/users/me/ecards/pricing"),
        api.get("/providers/me/referrals").catch(() => ({ data: { total_paid: 0 } })),
      ]);
      setEcards(a.data || []);
      setPricing(b.data || null);
      setReferrals({ paid: c.data?.total_paid || 0 });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const toggle = async (ec) => {
    setBusyId(ec.provider_id);
    try {
      if (ec.verification_active) {
        await api.delete(`/users/me/ecards/${ec.provider_id}/verify`);
        toast.success(lang === "en" ? "Verification turned off" : "Verificación cancelada");
        await refresh();
      } else {
        await api.post("/users/me/ecards/sandbox-pay", { kind: "verification" });
        await api.post(`/users/me/ecards/${ec.provider_id}/verify`);
        toast.success(lang === "en" ? "Verification activated" : "Verificación activada");
        // V16.1 — celebrate by routing to the dashboard home so the
        // ShareLinkCard surfaces with the "Estás verificado" banner.
        navigate(
          `/dashboard/provider?celebrate=verified&slug=${encodeURIComponent(ec.slug || "")}`,
        );
        return;
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12" data-testid="verification-center-loading">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const verifiedCount = pricing?.verified_count || 0;
  const tiers = pricing?.tiers?.verification_tiers_cents || { "1": 1000, "2": 1500, "3": 2000 };
  const paidRefs = referrals?.paid || 0;
  const earnedMonths = REWARD_LADDER.reduce((acc, r) => paidRefs >= r.refs ? r.months : acc, 0);
  const nextReward = REWARD_LADDER.find(r => paidRefs < r.refs);

  return (
    <div className="space-y-6 animate-fadeSlideUp" data-testid="verification-center">
      <header className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-display font-bold text-2xl text-slate-900">
            {lang === "en" ? "Get Verified" : "Verificarme"}
          </h3>
          <p className="text-sm text-slate-500 max-w-xl mt-1">
            {lang === "en"
              ? "Activate verification on each eCard you want to feature with the blue badge. Subscription bills account-wide based on how many eCards are verified."
              : "Activa la verificación en cada eCard que quieras destacar con el badge azul. El cobro mensual es a nivel cuenta y depende de cuántas eCards tengas verificadas."}
          </p>
        </div>
      </header>

      {/* Tier pricing cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="verification-tiers">
        {[1, 2, 3].map((tier) => {
          const cents = tiers[String(tier)];
          const isActive = (tier === 3 ? verifiedCount >= 3 : verifiedCount === tier);
          return (
            <div
              key={tier}
              className={`rounded-2xl p-5 transition-all duration-300 ${
                isActive
                  ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl scale-[1.02] ring-2 ring-emerald-300"
                  : "bg-white border border-slate-200 hover:border-emerald-200 hover:-translate-y-0.5 hover:shadow"
              }`}
              data-testid={`verification-tier-${tier}`}
            >
              <p className={`text-xs uppercase tracking-widest font-bold ${isActive ? "text-emerald-100" : "text-slate-400"}`}>
                {tier === 3 ? (lang === "en" ? "3 or more eCards" : "3 o más eCards") : (lang === "en" ? `${tier} eCard${tier > 1 ? "s" : ""}` : `${tier} eCard${tier > 1 ? "s" : ""}`)}
              </p>
              <p className={`font-display font-bold text-4xl mt-2 ${isActive ? "text-white" : "text-[#03045E]"}`}>{fmt(cents)}<span className={`text-base font-normal ${isActive ? "text-emerald-100" : "text-slate-400"}`}>/mes</span></p>
              {isActive && (
                <p className="mt-2 text-xs font-semibold text-emerald-50 flex items-center gap-1">
                  <Check className="w-3 h-3" /> {lang === "en" ? "Your current tier" : "Tu tier actual"}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* eCard verification list */}
      {ecards.length > 0 && (
        <section className="space-y-2" data-testid="verification-ecards-list">
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            {lang === "en" ? "Your eCards" : "Tus eCards"}
          </h4>
          <div className="space-y-2">
            {ecards.map((ec) => (
              <div
                key={ec.provider_id}
                className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3 hover:border-emerald-200 transition"
                data-testid={`verification-ecard-${ec.provider_id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 truncate">{ec.business_name}</span>
                    {ec.is_verified && <VerifiedBadge size={14} />}
                  </div>
                  <Link to={ec.public_url} target="_blank" className="text-xs text-[#0077B6] hover:underline">{ec.public_url}</Link>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(ec)}
                  disabled={busyId === ec.provider_id}
                  className={`h-9 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95 ${
                    ec.verification_active
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                  } disabled:opacity-50`}
                  data-testid={`verification-ecard-${ec.provider_id}-toggle`}
                >
                  {busyId === ec.provider_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                    ec.verification_active ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  {ec.verification_active
                    ? (lang === "en" ? "Turn off" : "Apagar")
                    : (lang === "en" ? "Activate" : "Activar")}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Refer & Earn rewards */}
      <section
        className="rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 border border-orange-100 p-5"
        data-testid="verification-rewards-widget"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center shadow">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-display font-bold text-lg text-slate-900">
              {lang === "en" ? "Refer & earn free verification" : "Recomienda y gana verificación gratis"}
            </h4>
            <p className="text-sm text-slate-600">
              {lang === "en"
                ? "Each paid referral knocks months off your verification bill."
                : "Cada referido convertido te regala meses de verificación gratis."}
            </p>
          </div>
        </div>

        {/* Live progress */}
        <div className="rounded-xl bg-white p-4 mb-3" data-testid="verification-rewards-progress">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">
              {lang === "en" ? "Paid referrals" : "Referidos pagados"}: <span className="text-orange-600">{paidRefs}</span>
            </span>
            <span className="text-xs text-emerald-700 font-semibold">
              {lang === "en" ? `Earned: ${earnedMonths} mo free` : `Ganados: ${earnedMonths} mes${earnedMonths !== 1 ? "es" : ""} gratis`}
            </span>
          </div>
          {nextReward && (
            <>
              <div className="mt-2 h-2 rounded-full bg-orange-100 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-rose-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, (paidRefs / nextReward.refs) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {lang === "en"
                  ? `${nextReward.refs - paidRefs} more to unlock ${nextReward.months} ${nextReward.months === 1 ? "month" : "months"} free.`
                  : `${nextReward.refs - paidRefs} más para desbloquear ${nextReward.months} ${nextReward.months === 1 ? "mes" : "meses"} gratis.`}
              </p>
            </>
          )}
        </div>

        {/* Reward ladder */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {REWARD_LADDER.map((r) => {
            const unlocked = paidRefs >= r.refs;
            return (
              <div
                key={r.refs}
                className={`rounded-lg p-2 text-center transition ${
                  unlocked
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm"
                    : "bg-white border border-orange-100 text-slate-500"
                }`}
                data-testid={`rewards-tier-${r.refs}`}
              >
                <p className="text-[10px] uppercase font-bold tracking-wider">{r.refs} refs</p>
                <p className="font-display font-bold text-base">{r.months}{lang === "en" ? "mo" : "mes"}</p>
                {unlocked && <Check className="w-3 h-3 mx-auto mt-0.5" />}
              </div>
            );
          })}
        </div>
        <Link
          to="/dashboard/provider?tab=referidos"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-700 hover:text-orange-900 transition"
          data-testid="verification-rewards-go-referrals"
        >
          <Sparkles className="w-4 h-4" />
          {lang === "en" ? "Open referrals dashboard →" : "Abrir mi panel de referidos →"}
        </Link>
      </section>

      {/* eCard opening fee math (read-only reminder so users see the
          full pricing model in one place). */}
      <section
        className="rounded-2xl bg-blue-50 border border-blue-100 p-5"
        data-testid="verification-ecard-pricing-recap"
      >
        <h4 className="font-display font-bold text-base text-slate-900 mb-2">
          {lang === "en" ? "eCard opening fees" : "Costos de apertura de eCards"}
        </h4>
        <ul className="text-sm text-slate-700 space-y-1">
          <li>· {lang === "en" ? "1st eCard: free" : "1ª eCard: gratis"}</li>
          <li>· {lang === "en" ? "Each additional eCard: $5 one-time (Stripe Link in production)" : "Cada eCard adicional: $5 una sola vez (Stripe Link en producción)"}</li>
          <li>· {lang === "en" ? "Verification billed monthly, account-wide (Stripe Subscriptions in production)" : "La verificación se cobra mensualmente a nivel cuenta (Stripe Subscriptions en producción)"}</li>
        </ul>
      </section>
    </div>
  );
}
