import { useEffect, useState, useRef } from "react";
import { X, Send, MessageCircle, Phone } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

const STORAGE_KEY = "gm_exit_lead_state";
const DISMISS_TTL_DAYS = 7;
const INACTIVITY_FALLBACK_MS = 60_000;

function _isSuppressed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const { at, captured } = JSON.parse(raw);
    if (captured) return true; // never re-prompt converted leads
    if (!at) return false;
    const ageDays = (Date.now() - at) / (1000 * 60 * 60 * 24);
    return ageDays < DISMISS_TTL_DAYS;
  } catch (_e) {
    return false;
  }
}

function _markDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), captured: false }));
  } catch (_e) { /* ignore */ }
}

function _markCaptured() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), captured: true }));
  } catch (_e) { /* ignore */ }
}

/**
 * Exit-intent + idle-timer lead capture popup.
 *
 * Triggers (any one fires the modal):
 *  - desktop: mouse leaves the viewport via the top edge (classic exit intent)
 *  - mobile / desktop fallback: 60 s without user interaction (mousemove/touch/scroll)
 *
 * Suppressed when:
 *  - user dismissed within the last 7 days
 *  - user already submitted a lead in any prior session
 *  - user is on /admin/* or /dashboard/* (we don't bug logged-in staff)
 */
export default function ExitIntentLeadCapture() {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("form"); // form | success
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    city: "",
    service: "",
    preferred_channel: "whatsapp",
  });
  const firedRef = useRef(false);
  const lastActivityRef = useRef(Date.now());

  // Don't mount on internal staff pages
  const isStaffRoute = typeof window !== "undefined"
    && (window.location.pathname.startsWith("/admin")
        || window.location.pathname.startsWith("/dashboard"));

  useEffect(() => {
    if (isStaffRoute) return;
    if (_isSuppressed()) return;

    const fire = (reason) => {
      if (firedRef.current) return;
      firedRef.current = true;
      console.info(`[exit-intent] triggered (${reason})`);
      setOpen(true);
    };

    const onMouseLeave = (e) => {
      // Exit-intent: pointer leaves through the top edge
      if (e.clientY <= 0 && e.relatedTarget == null) fire("mouseleave-top");
    };

    const bumpActivity = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove", "scroll", "keydown", "touchstart", "click"];
    events.forEach((ev) => window.addEventListener(ev, bumpActivity, { passive: true }));
    document.addEventListener("mouseleave", onMouseLeave);

    // Idle-timer fallback for mobile (no mouseleave there)
    const idleTimer = setInterval(() => {
      if (firedRef.current) return;
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= INACTIVITY_FALLBACK_MS) fire("idle-60s");
    }, 5000);

    return () => {
      document.removeEventListener("mouseleave", onMouseLeave);
      events.forEach((ev) => window.removeEventListener(ev, bumpActivity));
      clearInterval(idleTimer);
    };
  }, [isStaffRoute]);

  const onChange = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.name.trim().length < 2) {
      setError(lang === "es" ? "Tu nombre es muy corto." : "Name is too short.");
      return;
    }
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      setError(lang === "es" ? "Teléfono inválido (mínimo 10 dígitos)." : "Invalid phone (min 10 digits).");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/leads/capture", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || null,
        service: form.service.trim() || null,
        preferred_channel: form.preferred_channel,
        lang,
        source: "exit_intent",
      });
      _markCaptured();
      setStage("success");
    } catch (err) {
      console.error("[exit-intent] submit failed", err);
      setError(err?.response?.data?.detail || (lang === "es" ? "No pudimos guardar. Reintenta." : "Could not save. Retry."));
    } finally {
      setSubmitting(false);
    }
  };

  const onClose = () => {
    if (stage === "form") _markDismissed();
    setOpen(false);
  };

  if (!open) return null;
  const isEs = lang === "es";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      data-testid="exit-lead-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="exit-lead-modal"
        style={{ animation: "exit-lead-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        <style>{`@keyframes exit-lead-in{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Header with gradient */}
        <div
          className="relative px-5 sm:px-6 py-5 sm:py-6 text-white"
          style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={isEs ? "Cerrar" : "Close"}
            className="absolute top-3 right-3 text-white/80 hover:text-white"
            data-testid="exit-lead-close"
          >
            <X className="w-5 h-5" />
          </button>
          {stage === "form" ? (
            <>
              <div className="text-2xl sm:text-3xl font-bold leading-tight">
                {isEs ? "🤝 Antes de irte..." : "🤝 Before you go..."}
              </div>
              <p className="text-white/85 text-sm mt-2 leading-snug">
                {isEs
                  ? "Dinos qué buscas y te mandamos 3 proveedores latinos verificados — gratis y en menos de 24h."
                  : "Tell us what you're looking for and we'll send 3 verified Latino providers — free, within 24h."}
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl sm:text-3xl font-bold leading-tight">
                {isEs ? "¡Listo! ✨" : "All set! ✨"}
              </div>
              <p className="text-white/85 text-sm mt-2">
                {isEs
                  ? "Te contactaremos pronto por tu canal preferido."
                  : "We'll reach out soon via your preferred channel."}
              </p>
            </>
          )}
        </div>

        {/* Body */}
        {stage === "form" && (
          <form className="p-5 sm:p-6 space-y-3" onSubmit={onSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={isEs ? "Tu nombre" : "Your name"}
                value={form.name}
                onChange={onChange("name")}
                className="col-span-2 w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none text-sm"
                data-testid="exit-lead-name"
                autoFocus
              />
              <input
                type="tel"
                placeholder={isEs ? "Teléfono (10 dígitos)" : "Phone (10 digits)"}
                value={form.phone}
                onChange={onChange("phone")}
                className="col-span-2 w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none text-sm"
                data-testid="exit-lead-phone"
              />
              <input
                type="text"
                placeholder={isEs ? "Ciudad" : "City"}
                value={form.city}
                onChange={onChange("city")}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none text-sm"
                data-testid="exit-lead-city"
              />
              <input
                type="text"
                placeholder={isEs ? "Servicio" : "Service"}
                value={form.service}
                onChange={onChange("service")}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none text-sm"
                data-testid="exit-lead-service"
              />
            </div>

            {/* Channel toggle */}
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-2 mt-1">
                {isEs ? "¿Cómo te contactamos?" : "How should we reach you?"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ChannelButton
                  active={form.preferred_channel === "whatsapp"}
                  onClick={() => setForm((f) => ({ ...f, preferred_channel: "whatsapp" }))}
                  icon={<MessageCircle className="w-4 h-4" />}
                  label="WhatsApp"
                  testid="exit-lead-channel-whatsapp"
                />
                <ChannelButton
                  active={form.preferred_channel === "sms"}
                  onClick={() => setForm((f) => ({ ...f, preferred_channel: "sms" }))}
                  icon={<Phone className="w-4 h-4" />}
                  label={isEs ? "Mensaje (SMS)" : "Text (SMS)"}
                  testid="exit-lead-channel-sms"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" data-testid="exit-lead-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full text-sm font-bold text-white rounded-full px-4 py-3 transition disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
              data-testid="exit-lead-submit"
            >
              {submitting ? (
                <>{isEs ? "Enviando…" : "Sending…"}</>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {isEs ? "Sí, quiero los 3 proveedores" : "Yes, send me the 3 providers"}
                </>
              )}
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-2">
              {isEs
                ? "Sin spam. Te contactamos solo una vez."
                : "No spam. We'll only reach out once."}
            </p>
          </form>
        )}

        {stage === "success" && (
          <div className="p-6 text-center">
            <div className="text-5xl mb-4">✨</div>
            <p className="text-slate-700 text-sm">
              {isEs
                ? "Ya tenemos tu mensaje. Mientras tanto, explora la comunidad latina."
                : "We've got your message. Meanwhile, explore the Latino community."}
            </p>
            <a
              href="/buscar"
              className="inline-block mt-4 text-sm font-semibold text-teal-700 underline"
              data-testid="exit-lead-explore"
            >
              {isEs ? "Explorar proveedores →" : "Explore providers →"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelButton({ active, onClick, icon, label, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition ${
        active
          ? "border-teal-600 bg-teal-50 text-teal-700"
          : "border-slate-200 text-slate-600 hover:border-slate-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
