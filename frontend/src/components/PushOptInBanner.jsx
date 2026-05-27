import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import {
  pushSupported,
  pushPermission,
  ensurePushSubscription,
} from "../lib/push";
import { toast } from "sonner";

const SHOW_AFTER_MS = 20_000;
const SHOW_AFTER_SCROLL_PX = 600;
const LS_DISMISSED_AT = "gm_push_optin_dismissed_at";
const DISMISS_TTL_DAYS = 30;

function isOptInDismissed() {
  try {
    const at = parseInt(localStorage.getItem(LS_DISMISSED_AT) || "0", 10);
    if (!at) return false;
    const ageDays = (Date.now() - at) / (1000 * 60 * 60 * 24);
    return ageDays < DISMISS_TTL_DAYS;
  } catch { return false; }
}

function markDismissed() {
  try { localStorage.setItem(LS_DISMISSED_AT, String(Date.now())); } catch { /* ignore */ }
}

/**
 * Bottom-right opt-in card for Web Push notifications (Section 68).
 *
 * Wires the user's browser to:
 *   1. navigator.serviceWorker.PushManager.subscribe() with our VAPID key
 *   2. POST /api/push/subscribe → backend stores the subscription
 *
 * Trust-first UX: only appears after meaningful engagement
 *   - 20 s on the page (intent signal), AND
 *   - user scrolled past 600 px (read the hero / value prop)
 *
 * Skipped entirely if:
 *   - user is not logged in (Web Push only useful for authenticated users)
 *   - browser doesn't support Service Worker / PushManager / Notification
 *   - permission already granted or denied
 *   - user dismissed within the last 30 days
 */
export default function PushOptInBanner() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.user_id) return;            // need auth to register a subscription
    if (!pushSupported()) return;
    if (pushPermission() !== "default") return;  // 'granted' or 'denied' → never show
    if (isOptInDismissed()) return;

    let shown = false;
    const tryShow = () => {
      if (shown) return;
      if (window.scrollY < SHOW_AFTER_SCROLL_PX) return;
      shown = true;
      setVisible(true);
    };
    const timer = setTimeout(tryShow, SHOW_AFTER_MS);
    window.addEventListener("scroll", tryShow, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", tryShow);
    };
  }, [user?.user_id]);

  const onActivate = async () => {
    setBusy(true);
    const result = await ensurePushSubscription();
    setBusy(false);
    setVisible(false);
    if (result.ok) {
      toast.success(lang === "es"
        ? "Notificaciones activadas 🎉"
        : "Notifications activated 🎉");
    } else if (result.reason === "denied") {
      toast.error(lang === "es"
        ? "Permiso denegado. Actívalo desde la configuración del navegador."
        : "Permission denied. Enable it from your browser settings.");
    } else {
      // Common silent failures (unsupported, sw_not_ready, no_vapid) — log but
      // don't shout at the user.
      console.warn("[push] activation failed", result);
    }
  };

  const onDismiss = () => {
    markDismissed();
    setVisible(false);
  };

  if (!visible) return null;

  const isEs = lang === "es";
  return (
    <div
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 max-w-[340px]"
      style={{ animation: "push-optin-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      data-testid="push-optin-banner"
    >
      <style>{`@keyframes push-optin-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 sm:p-5 backdrop-blur"
        style={{ boxShadow: "0 20px 60px rgba(2, 95, 103, 0.18)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
          >
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900 leading-tight">
              {isEs ? "¿Te avisamos en tiempo real?" : "Get real-time updates?"}
            </h3>
            <p className="text-[13px] text-slate-600 mt-1 leading-snug">
              {isEs
                ? "Recibe un aviso al instante cuando un cliente te escriba o reserve una cita."
                : "Get an instant ping when a client messages you or books an appointment."}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={isEs ? "Cerrar" : "Close"}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600 -mt-1 -mr-1"
            data-testid="push-optin-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onActivate}
            disabled={busy}
            className="flex-1 text-sm font-semibold text-white rounded-full px-4 py-2.5 transition disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
            data-testid="push-optin-activate"
          >
            {busy
              ? (isEs ? "Activando…" : "Activating…")
              : (isEs ? "Activar" : "Enable")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3"
            data-testid="push-optin-dismiss"
          >
            {isEs ? "Ahora no" : "Not now"}
          </button>
        </div>
      </div>
    </div>
  );
}
