import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, ArrowLeft, Loader2, Check, Heart } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";

/**
 * CancelSubscriptionModal — FTC "Click-to-Cancel Rule" compliant.
 *
 * Flow (3 short steps that never block the user from cancelling):
 *  1. Warning + benefit list user is about to lose
 *  2. Reason selector (optional — user can skip)
 *  3. Confirmation screen with reactivation reminder
 *
 * Per FTC, every screen has a clear "Cancelar suscripción" button. The user
 * can cancel directly from screen 1 without going through reasons.
 */
const REASONS = [
  { id: "too_expensive", labelEs: "Es muy caro", labelEn: "Too expensive" },
  { id: "not_using", labelEs: "No lo estoy usando lo suficiente", labelEn: "Not using it enough" },
  { id: "missing_features", labelEs: "Faltan funcionalidades que necesito", labelEn: "Missing features I need" },
  { id: "competition", labelEs: "Encontré otra plataforma", labelEn: "Found another platform" },
  { id: "technical_issues", labelEs: "Problemas técnicos / bugs", labelEn: "Technical issues / bugs" },
  { id: "other", labelEs: "Otro motivo", labelEn: "Other reason" },
];

export default function CancelSubscriptionModal({ sub, onClose, onSuccess, lang = "es" }) {
  const [step, setStep] = useState(1); // 1 warning · 2 reason · 3 success
  const [reason, setReason] = useState(null);
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelledSub, setCancelledSub] = useState(null);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ESC closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const T = lang === "en" ? {
    title1: "Sorry to see you go",
    title2: "Why are you cancelling?",
    title3: "Subscription cancelled",
    body1: "Cancel now and you'll lose:",
    body1Subtitle: "Your access continues until your next renewal date.",
    body3: <>You're all set. Your <strong>{(({ basic: "Basic", pro: "Pro", premium: "Premium" })[sub?.plan]) || sub?.plan}</strong> plan stays active until <strong>{(sub?.next_renewal_date || "").slice(0, 10)}</strong>. After that, you'll automatically move to the Free plan. We've sent a confirmation to your email.</>,
    reasonOptional: "Optional — helps us improve. You can skip this.",
    otherPlaceholder: "Tell us what happened (max 280 chars)",
    cancelNow: "Cancel my subscription",
    cancelling: "Cancelling…",
    next: "Continue",
    skip: "Skip and cancel",
    back: "Go back",
    close: "Close",
    benefits: [
      "Better search ranking",
      "Direct WhatsApp button",
      "Premium eCard branding",
      "Visibility boosts each month",
    ],
  } : {
    title1: "Lamentamos verte ir",
    title2: "¿Por qué cancelas?",
    title3: "Suscripción cancelada",
    body1: "Si cancelas ahora, perderás:",
    body1Subtitle: "Tu acceso continúa hasta tu próxima fecha de renovación.",
    body3: <>Listo. Tu plan <strong>{(({ basic: "Básico", pro: "Pro", premium: "Premium" })[sub?.plan]) || sub?.plan}</strong> sigue activo hasta el <strong>{(sub?.next_renewal_date || "").slice(0, 10)}</strong>. Después pasarás automáticamente al plan Gratis. Te enviamos confirmación por correo.</>,
    reasonOptional: "Opcional — nos ayuda a mejorar. Puedes saltar este paso.",
    otherPlaceholder: "Cuéntanos qué pasó (máx 280 caracteres)",
    cancelNow: "Cancelar mi suscripción",
    cancelling: "Cancelando…",
    next: "Continuar",
    skip: "Saltar y cancelar",
    back: "Atrás",
    close: "Cerrar",
    benefits: [
      "Mejor posición en búsquedas",
      "Botón WhatsApp directo",
      "Branding premium en tu eCard",
      "Boosts de visibilidad cada mes",
    ],
  };

  const doCancel = async (reasonValue) => {
    setSubmitting(true);
    try {
      const r = await api.post("/me/subscription/cancel", {
        reason: reasonValue === "other" ? `other: ${otherText}`.slice(0, 280) : reasonValue,
      });
      setCancelledSub(r.data);
      setStep(3);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      data-testid="cancel-subscription-modal"
    >
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 sm:p-7 animate-in slide-in-from-bottom-4 fade-in max-h-[90vh] overflow-y-auto scroll-touch"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close (X) — present on ALL steps per FTC accessibility */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 transition"
          aria-label={T.close}
          data-testid="cancel-modal-close"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>

        {/* ─────── STEP 1 — Warning + benefits user will lose ─────── */}
        {step === 1 && (
          <div data-testid="cancel-step-1">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(245,158,11,0.12)" }}>
              <AlertTriangle className="w-6 h-6" style={{ color: "#B45309" }} />
            </div>
            <h2 className="font-display font-bold text-2xl text-slate-900 leading-tight">{T.title1}</h2>
            <p className="text-sm text-slate-600 mt-2">{T.body1Subtitle}</p>

            <p className="mt-5 text-sm font-semibold text-slate-900">{T.body1}</p>
            <ul className="mt-2 space-y-1.5">
              {T.benefits.map((b, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-slate-400 mt-1.5">·</span>{b}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3 rounded-2xl text-white font-bold inline-flex items-center justify-center gap-2 hover:opacity-95 transition"
                style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
                data-testid="cancel-step1-continue"
              >
                {lang === "en" ? "I'd rather stay" : "Mejor me quedo"}
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3 rounded-2xl text-slate-600 font-medium hover:bg-slate-50 transition"
                data-testid="cancel-step1-cancel-anyway"
              >
                {T.cancelNow}
              </button>
            </div>
          </div>
        )}

        {/* ─────── STEP 2 — Reason selector ─────── */}
        {step === 2 && (
          <div data-testid="cancel-step-2">
            <button
              onClick={() => setStep(1)}
              className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 mb-3"
              data-testid="cancel-step2-back"
            >
              <ArrowLeft className="w-4 h-4" /> {T.back}
            </button>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900 leading-tight">{T.title2}</h2>
            <p className="text-sm text-slate-500 mt-1.5">{T.reasonOptional}</p>

            <div className="mt-4 space-y-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  className={`w-full text-left px-4 py-3 rounded-2xl border transition ${reason === r.id ? "border-teal-700 bg-teal-50/60" : "border-slate-200 hover:border-slate-300 bg-white"}`}
                  data-testid={`cancel-reason-${r.id}`}
                >
                  <span className="text-sm font-medium" style={{ color: reason === r.id ? "#025F67" : "#0F172A" }}>
                    {lang === "en" ? r.labelEn : r.labelEs}
                  </span>
                </button>
              ))}
            </div>

            {reason === "other" && (
              <textarea
                value={otherText}
                onChange={(e) => setOtherText(e.target.value.slice(0, 280))}
                placeholder={T.otherPlaceholder}
                rows={3}
                maxLength={280}
                className="mt-3 w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm"
                data-testid="cancel-reason-other-text"
              />
            )}

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => doCancel(reason)}
                disabled={submitting}
                className="w-full py-3 rounded-2xl bg-red-50 text-red-700 font-bold border border-red-200 inline-flex items-center justify-center gap-2 hover:bg-red-100 active:scale-[0.99] transition disabled:opacity-50"
                data-testid="cancel-step2-confirm"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {T.cancelling}</> : T.cancelNow}
              </button>
              <button
                type="button"
                onClick={() => doCancel(null)}
                disabled={submitting}
                className="w-full py-2.5 rounded-2xl text-slate-500 font-medium hover:bg-slate-50 transition text-sm"
                data-testid="cancel-step2-skip"
              >
                {T.skip}
              </button>
            </div>
          </div>
        )}

        {/* ─────── STEP 3 — Success / confirmation ─────── */}
        {step === 3 && (
          <div className="text-center" data-testid="cancel-step-3">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="font-display font-bold text-2xl text-slate-900 mt-3">{T.title3}</h2>
            <p className="text-sm text-slate-700 mt-3 leading-relaxed">{T.body3}</p>

            <div className="mt-5 rounded-2xl p-4 inline-flex items-start gap-2.5 text-left" style={{ background: "rgba(255, 107, 44, 0.08)" }}>
              <Heart className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#FF6B2C" }} />
              <p className="text-xs text-slate-700 leading-relaxed">
                {lang === "en"
                  ? <>If you change your mind, just hit <strong>Reactivate</strong> in your dashboard before {(cancelledSub?.next_renewal_date || sub?.next_renewal_date || "").slice(0, 10)}.</>
                  : <>Si cambias de opinión, toca <strong>Reactivar</strong> en tu panel antes del {(cancelledSub?.next_renewal_date || sub?.next_renewal_date || "").slice(0, 10)}.</>}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onSuccess(cancelledSub || sub)}
              className="mt-6 w-full py-3 rounded-2xl text-white font-bold inline-flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
              data-testid="cancel-step3-done"
            >
              {lang === "en" ? "Got it" : "Entendido"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
