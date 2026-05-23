import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import {
  isSupported,
  getPermission,
  requestPermission,
  dismissOptIn,
  isOptInDismissed,
  wasGranted,
  startActivityFeedPolling,
} from "../lib/pushNotifications";

const SHOW_AFTER_MS = 20_000;
const SHOW_AFTER_SCROLL_PX = 600;

/**
 * Subtle bottom-right opt-in card for browser notifications.
 *
 * Trust-first UX: shown ONLY after meaningful engagement
 *   - 20 s on the page (intent signal), AND
 *   - user scrolled past 600 px (read the hero / value prop)
 *
 * Skipped entirely if:
 *   - browser doesn't support Notification API
 *   - permission already granted or denied
 *   - user dismissed within the last 30 days
 *
 * On grant, immediately kicks off /api/activity-feed polling so the next
 * provider join / review fires a real system notification.
 */
export default function PushOptInBanner() {
  const { lang } = useI18n();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  // Auto-start polling if the user already granted permission on a previous visit.
  useEffect(() => {
    if (wasGranted()) {
      startActivityFeedPolling(api, () => lang);
    }
  }, [lang]);

  useEffect(() => {
    if (!isSupported()) return;
    if (getPermission() !== "default") return; // 'granted' or 'denied' → never show
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
  }, []);

  const onActivate = async () => {
    setBusy(true);
    const result = await requestPermission();
    setBusy(false);
    setVisible(false);
    if (result === "granted") startActivityFeedPolling(api, () => lang);
  };

  const onDismiss = () => {
    dismissOptIn();
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
                ? "Te enviamos una notificación cuando un nuevo proveedor latino se une o una reseña destaca."
                : "We'll ping you when a new Latino provider joins or a review stands out."}
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
