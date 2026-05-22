import { useEffect, useState } from "react";
import { Download, Share, Plus, X, Smartphone, Sparkles } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * InstallPrompt — guides the user to install getamano as a PWA.
 *
 * - Android Chrome / Edge / Samsung Internet: listens for `beforeinstallprompt`
 *   and triggers the native install dialog when the user taps the button.
 * - iOS Safari: shows manual instructions ("Tap Share → Add to Home Screen")
 *   because Apple doesn't expose programmatic install.
 *
 * Hidden when:
 *   - Already installed (display-mode: standalone)
 *   - User dismissed it (localStorage flag, 14-day cooldown)
 *   - Page is /admin/* (don't pester admins)
 */
const COOLDOWN_DAYS = 14;
const STORAGE_KEY = "pwa_install_dismissed_at";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function isIOS() {
  if (!navigator.userAgent) return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInCooldown() {
  try {
    const ts = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    if (!ts) return false;
    return (Date.now() - ts) < COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  } catch (_e) { return false; }
}

export default function InstallPrompt() {
  const { lang } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/admin")) return;
    if (isInCooldown()) return;

    // Android / Desktop Chrome path
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Slight delay so the user has explored the page first
      setTimeout(() => setShowAndroid(true), 8000);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    // Detect installation success
    const onInstalled = () => {
      setShowAndroid(false); setShowIos(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS path: Safari has no programmatic install — show manual instructions
    if (isIOS()) {
      // Only after the user has spent time exploring (12s)
      setTimeout(() => setShowIos(true), 12000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (_e) { /* ignore */ }
    setShowAndroid(false); setShowIos(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome !== "accepted") dismiss();
    setDeferredPrompt(null);
  };

  const T = lang === "en" ? {
    title: "Install getamano",
    body: "Tap below to keep the icon on your home screen — opens like a real app.",
    cta: "Install",
    later: "Maybe later",
    iosTitle: "Add to your iPhone",
    iosBody: "Tap",
    iosShare: "Share",
    iosThen: ", then",
    iosAdd: "Add to Home Screen",
    iosFooter: "Looks like a real app, no App Store needed.",
  } : {
    title: "Instalar getamano",
    body: "Pon el ícono en tu pantalla — se abre como una app real.",
    cta: "Instalar",
    later: "Después",
    iosTitle: "Agrégala a tu iPhone",
    iosBody: "Toca",
    iosShare: "Compartir",
    iosThen: ", después",
    iosAdd: "Añadir a pantalla de inicio",
    iosFooter: "Funciona como app real, sin pasar por la App Store.",
  };

  if (showAndroid && deferredPrompt) {
    return (
      <div className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:right-4 sm:max-w-sm z-[100] rounded-2xl shadow-2xl border border-slate-200 bg-white p-4 animate-in slide-in-from-bottom-3 fade-in" data-testid="pwa-install-android">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}>
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-slate-900 text-sm">{T.title}</p>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{T.body}</p>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={install} className="px-4 py-2 rounded-full text-white font-semibold text-xs shadow-sm hover:opacity-90 inline-flex items-center gap-1" style={{ backgroundColor: "#025F67" }} data-testid="pwa-install-btn">
                <Download className="w-3.5 h-3.5" /> {T.cta}
              </button>
              <button onClick={dismiss} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700" data-testid="pwa-install-later">
                {T.later}
              </button>
            </div>
          </div>
          <button onClick={dismiss} className="p-1 rounded-full hover:bg-slate-100" data-testid="pwa-install-close">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>
    );
  }

  if (showIos) {
    return (
      <div className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:right-4 sm:max-w-sm z-[100] rounded-2xl shadow-2xl border border-slate-200 bg-white p-4 animate-in slide-in-from-bottom-3 fade-in" data-testid="pwa-install-ios">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}>
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-slate-900 text-sm">{T.iosTitle}</p>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">
              {T.iosBody}{" "}
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 font-semibold text-[11px]">
                <Share className="w-3 h-3" /> {T.iosShare}
              </span>
              {T.iosThen}{" "}
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 font-semibold text-[11px]">
                <Plus className="w-3 h-3" /> {T.iosAdd}
              </span>
            </p>
            <p className="text-[11px] text-slate-500 mt-2 italic">{T.iosFooter}</p>
            <button onClick={dismiss} className="mt-3 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700" data-testid="pwa-ios-later">
              {T.later}
            </button>
          </div>
          <button onClick={dismiss} className="p-1 rounded-full hover:bg-slate-100" data-testid="pwa-ios-close">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
