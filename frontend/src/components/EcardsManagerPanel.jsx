/**
 * EcardsManagerPanel — V12 multi-eCard manager.
 *
 * Renders inside the Provider Dashboard `tab === "ecard"` slot. Shows
 * the current owner's eCards as a list of cards with verification toggle
 * + open-public-page CTA. The "+ Agregar otra eCard" button opens a
 * sandbox-pay modal that mints an opening token and forwards to the
 * onboarding flow with `?opening_payment_id=...`.
 *
 * NOTE: this component is intentionally pricing-agnostic. The backend
 * `/users/me/ecards/pricing` endpoint is the single source of truth for
 * dollar amounts; we only render what it returns. When Stripe Link
 * replaces sandbox-pay, only the SandboxPayModal needs to change.
 */
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { toast } from "sonner";
import VerifiedBadge from "./VerifiedBadge";
import { IdCard, Plus, ShieldCheck, ShieldOff, Loader2, ExternalLink, MapPin, X } from "lucide-react";

const fmt = (cents) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export default function EcardsManagerPanel() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [ecards, setEcards] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [payModalKind, setPayModalKind] = useState(null); // "opening" | null
  const [pendingProviderId, setPendingProviderId] = useState(null); // for verification flow

  const refresh = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        api.get("/users/me/ecards"),
        api.get("/users/me/ecards/pricing"),
      ]);
      setEcards(a.data || []);
      setPricing(b.data || null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onAddAnother = () => {
    // First eCard is FREE → skip sandbox modal and go straight to onboarding.
    if ((pricing?.owned_count || 0) === 0) {
      navigate("/provider/onboarding");
      return;
    }
    setPayModalKind("opening");
  };

  const onSandboxConfirmOpening = async () => {
    try {
      const { data } = await api.post("/users/me/ecards/sandbox-pay", { kind: "opening" });
      setPayModalKind(null);
      navigate(`/provider/onboarding?opening_payment_id=${encodeURIComponent(data.payment_id)}&new=1`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    }
  };

  const toggleVerify = async (ec) => {
    setBusyId(ec.provider_id);
    try {
      if (ec.verification_active) {
        await api.delete(`/users/me/ecards/${ec.provider_id}/verify`);
        toast.success(lang === "en" ? "Verification turned off" : "Verificación cancelada");
      } else {
        // Sandbox-pay the verification subscription, then activate
        await api.post("/users/me/ecards/sandbox-pay", { kind: "verification" });
        await api.post(`/users/me/ecards/${ec.provider_id}/verify`);
        toast.success(lang === "en" ? "Verification activated" : "Verificación activa");
      }
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setBusyId(null);
      setPendingProviderId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="ecards-manager-loading">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="ecards-manager-panel">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display font-bold text-xl text-slate-900 flex items-center gap-2">
            <IdCard className="w-6 h-6 text-[#0077B6]" />
            {lang === "en" ? "My eCards" : "Mis eCards"}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {lang === "en"
              ? "Each eCard is an independent business profile with its own public page, reviews and reels."
              : "Cada eCard es un negocio independiente con su propia página pública, reseñas y reels."}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddAnother}
          className="h-11 px-4 rounded-full bg-[#0077B6] text-white text-sm font-semibold hover:bg-[#005f92] active:scale-95 transition inline-flex items-center gap-2"
          data-testid="ecards-add-another-button"
        >
          <Plus className="w-4 h-4" />
          {lang === "en" ? "Add another eCard" : "Agregar otra eCard"}
        </button>
      </header>

      {pricing && (
        <PricingSummary pricing={pricing} lang={lang} />
      )}

      {ecards.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center" data-testid="ecards-empty-state">
          <IdCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-700">
            {lang === "en" ? "You don't have any eCards yet." : "Aún no tienes eCards."}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {lang === "en"
              ? "Your first eCard is free. Click \"Add another eCard\" to start."
              : "Tu primera eCard es gratis. Toca «Agregar otra eCard» para empezar."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="ecards-grid">
          {ecards.map((ec, idx) => (
            <EcardRow
              key={ec.provider_id}
              ec={ec}
              index={idx}
              busy={busyId === ec.provider_id}
              onToggleVerify={() => {
                if (!ec.verification_active) setPendingProviderId(ec.provider_id);
                else toggleVerify(ec);
              }}
              lang={lang}
            />
          ))}
        </div>
      )}

      {/* Sandbox-pay modal for OPENING a new eCard. */}
      {payModalKind === "opening" && (
        <SandboxPayModal
          title={lang === "en" ? "Open another eCard" : "Abrir otra eCard"}
          amountLabel={fmt(pricing?.next_opening_fee_cents ?? 500)}
          subtitle={lang === "en"
            ? "One-time fee. After confirming you'll fill in the new business info."
            : "Pago único. Al confirmar, llenas la información del nuevo negocio."}
          futureProvider="Stripe Link"
          onClose={() => setPayModalKind(null)}
          onConfirm={onSandboxConfirmOpening}
        />
      )}

      {/* Sandbox-pay modal for ACTIVATING verification on an existing eCard. */}
      {pendingProviderId && (
        <SandboxPayModal
          title={lang === "en" ? "Activate verification" : "Activar verificación"}
          amountLabel={`${fmt(_predictNextVerifyCost(pricing))}/mo`}
          subtitle={lang === "en"
            ? "Monthly subscription that bills account-wide based on how many of your eCards are verified."
            : "Suscripción mensual a nivel cuenta. El costo total sube según cuántas eCards estén verificadas."}
          futureProvider="Stripe Subscriptions"
          onClose={() => setPendingProviderId(null)}
          onConfirm={() => {
            const target = ecards.find(e => e.provider_id === pendingProviderId);
            if (target) toggleVerify(target);
          }}
        />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function _predictNextVerifyCost(pricing) {
  if (!pricing) return 1000;
  const n = (pricing.verified_count || 0) + 1;
  const tiers = pricing.tiers?.verification_tiers_cents || {};
  if (n === 1) return tiers["1"] ?? 1000;
  if (n === 2) return tiers["2"] ?? 1500;
  return tiers["3"] ?? 2000;
}

function PricingSummary({ pricing, lang }) {
  const tiers = pricing.tiers?.verification_tiers_cents || {};
  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-slate-50 border border-blue-100 p-5" data-testid="ecards-pricing-summary">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wide">{lang === "en" ? "eCards" : "eCards"}</p>
          <p className="font-display font-bold text-2xl text-[#03045E]" data-testid="ecards-owned-count">{pricing.owned_count}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wide">{lang === "en" ? "Verified" : "Verificadas"}</p>
          <p className="font-display font-bold text-2xl text-[#0077B6]" data-testid="ecards-verified-count">{pricing.verified_count}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wide">{lang === "en" ? "Next opening" : "Próx. apertura"}</p>
          <p className="font-display font-bold text-2xl text-slate-900" data-testid="ecards-next-opening">
            {pricing.next_opening_fee_cents === 0 ? (lang === "en" ? "Free" : "Gratis") : fmt(pricing.next_opening_fee_cents)}
          </p>
        </div>
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wide">{lang === "en" ? "Verification/mo" : "Verificación/mes"}</p>
          <p className="font-display font-bold text-2xl text-emerald-600" data-testid="ecards-monthly-verification">
            {pricing.verification_monthly_cents === 0 ? (lang === "en" ? "Free" : "Gratis") : fmt(pricing.verification_monthly_cents)}
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">
        {lang === "en" ? "Tier pricing: " : "Tarifas: "}
        1 = {fmt(tiers["1"] ?? 1000)}/mo · 2 = {fmt(tiers["2"] ?? 1500)}/mo · 3+ = {fmt(tiers["3"] ?? 2000)}/mo
      </p>
    </div>
  );
}

function EcardRow({ ec, index, busy, onToggleVerify, lang }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" data-testid={`ecard-row-${ec.provider_id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-display font-bold text-base text-slate-900 truncate" data-testid={`ecard-row-${ec.provider_id}-name`}>
              {ec.business_name}
            </h4>
            {ec.is_verified && <VerifiedBadge size={16} />}
            {ec.is_founder && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                Founder
              </span>
            )}
            {index === 0 && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {lang === "en" ? "Primary" : "Principal"}
              </span>
            )}
          </div>
          {(ec.city || ec.state) && (
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {[ec.city, ec.state].filter(Boolean).join(", ")}
            </p>
          )}
          <Link to={ec.public_url} target="_blank" className="text-xs text-[#0077B6] hover:underline mt-1 inline-flex items-center gap-1" data-testid={`ecard-row-${ec.provider_id}-open`}>
            {ec.public_url}
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="text-xs text-slate-500">
          {ec.verification_active
            ? (lang === "en" ? "Verification: active" : "Verificación: activa")
            : (lang === "en" ? "Verification: off" : "Verificación: apagada")}
        </div>
        <button
          type="button"
          onClick={onToggleVerify}
          disabled={busy}
          className={`h-9 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition ${
            ec.verification_active
              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          } disabled:opacity-50`}
          data-testid={`ecard-row-${ec.provider_id}-verify-toggle`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
            ec.verification_active ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {ec.verification_active
            ? (lang === "en" ? "Turn off" : "Apagar")
            : (lang === "en" ? "Activate" : "Activar")}
        </button>
      </div>
    </article>
  );
}

function SandboxPayModal({ title, amountLabel, subtitle, futureProvider, onClose, onConfirm }) {
  const { lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="sandbox-pay-modal">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h3 className="font-display font-bold text-lg text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="my-5 rounded-xl bg-gradient-to-br from-blue-50 to-emerald-50 border border-blue-100 p-5 text-center">
          <p className="text-4xl font-display font-bold text-[#0077B6]" data-testid="sandbox-pay-amount">{amountLabel}</p>
          <p className="text-sm text-slate-600 mt-2">{subtitle}</p>
        </div>
        <div className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
          <strong>{lang === "en" ? "Sandbox mode" : "Modo sandbox"}:</strong>{" "}
          {lang === "en"
            ? `Pagos reales aún no están conectados. Al confirmar, se simula el cobro. En producción se cobrará vía ${futureProvider}.`
            : `Pagos reales aún no están conectados. Al confirmar, se simula el cobro. En producción se cobrará vía ${futureProvider}.`}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 h-11 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            data-testid="sandbox-pay-cancel"
          >
            {lang === "en" ? "Cancel" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 h-11 rounded-full bg-[#0077B6] text-white text-sm font-semibold hover:bg-[#005f92] disabled:opacity-50 inline-flex items-center justify-center gap-2"
            data-testid="sandbox-pay-confirm"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {lang === "en" ? "Confirm (sandbox)" : "Confirmar (sandbox)"}
          </button>
        </div>
      </div>
    </div>
  );
}
