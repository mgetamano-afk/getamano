import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { X, Share, Plus, Download, Smartphone, Copy, Check, Compass, Sparkles, MoreVertical } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import SafariInstallTutorial from "./SafariInstallTutorial";
import { trackPwaInstalled } from "../lib/deviceDetection";

/**
 * InstallAppModal — One CTA, fully automatic experience.
 *
 * The user just taps "Descarga la app". We detect device + browser and
 * route them to the FASTEST possible install path:
 *
 *   • Android Chrome / Edge / Samsung Internet
 *       → Trigger native `beforeinstallprompt` (1-tap install).
 *   • iPhone Safari
 *       → Show animated 3-step guide (Share → Add to Home Screen).
 *   • iPhone Chrome / Edge / Firefox / Brave (cannot install PWAs — Apple restriction)
 *       → "Open in Safari" path: copy link + open Safari deep-link automatically.
 *   • Desktop browser
 *       → QR code so user scans with phone camera and installs there.
 *   • App already installed (standalone mode)
 *       → "App ya instalada ✓" confirmation.
 *
 * The component listens globally so any "Descarga la app" button in the
 * codebase opens the same modal via window event.
 */

// ---------- detection helpers ----------
function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function detectPlatform() {
  if (typeof navigator === "undefined") return { os: "unknown", browser: "unknown" };
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/i.test(ua);
  const isIOSChrome = /CriOS/.test(ua);            // Chrome on iOS
  const isIOSEdge = /EdgiOS/.test(ua);             // Edge on iOS
  const isIOSFirefox = /FxiOS/.test(ua);           // Firefox on iOS
  const isIOSBrave = /Brave/.test(ua) && isIOS;    // Brave on iOS (rare)
  const isIOSOpera = /OPiOS/.test(ua);             // Opera on iOS
  const isIOSNonSafari = isIOS && (isIOSChrome || isIOSEdge || isIOSFirefox || isIOSOpera || isIOSBrave);
  // Safari iOS: only "Safari" UA token AND no other iOS browser markers
  const isIOSSafari = isIOS && /Safari/.test(ua) && !isIOSNonSafari;

  let os = "desktop";
  if (isIOS) os = "ios";
  else if (isAndroid) os = "android";

  let browser = "other";
  if (isIOSSafari) browser = "safari";
  else if (isIOSChrome) browser = "chrome-ios";
  else if (isIOSEdge) browser = "edge-ios";
  else if (isIOSFirefox) browser = "firefox-ios";
  else if (isIOSNonSafari) browser = "non-safari-ios";
  else if (isAndroid && /Chrome/.test(ua)) browser = "chrome-android";
  else if (isAndroid) browser = "android-other";

  return { os, browser, isIOS, isAndroid, isIOSSafari, isIOSNonSafari };
}

// ---------- module-level state for native prompt ----------
// Captured once when the browser fires beforeinstallprompt — used
// later when the user opens the modal and clicks Install.
let _deferredPrompt = null;
let _hasNativePrompt = false;
const _listeners = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    _hasNativePrompt = true;
    _listeners.forEach((fn) => fn(true));
  });
  window.addEventListener("appinstalled", () => {
    _deferredPrompt = null;
    _hasNativePrompt = false;
    trackPwaInstalled("android");
    _listeners.forEach((fn) => fn(false));
  });
}

// Public helper to open the modal from anywhere in the app
export function openInstallModal() {
  window.dispatchEvent(new CustomEvent("getamano:open-install-modal"));
}

export default function InstallAppModal() {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [installedNow, setInstalledNow] = useState(false);
  const [hasNative, setHasNative] = useState(_hasNativePrompt);
  const [copied, setCopied] = useState(false);

  // Listen for "open" events from any button
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("getamano:open-install-modal", onOpen);
    return () => window.removeEventListener("getamano:open-install-modal", onOpen);
  }, []);

  // Subscribe to native prompt availability changes
  useEffect(() => {
    const fn = (avail) => setHasNative(avail);
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  }, []);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const platform = useMemo(detectPlatform, [open]);
  const alreadyInstalled = isStandalone();
  const url = typeof window !== "undefined" ? window.location.origin : "";

  const T = lang === "en" ? {
    title: "Get the getamano app",
    subtitle: "Works just like a real app — no App Store needed.",
    androidCta: "Install now",
    androidWaiting: "Tap the menu (⋮) and choose \"Install app\" or \"Add to Home Screen\".",
    safariStep1: "Tap the Share button",
    safariStep2: "Scroll down and tap",
    safariStep2b: "Add to Home Screen",
    safariStep3: "Tap Add — done!",
    nonSafariTitle: "On iPhone, only Safari can install apps",
    nonSafariBody: "Apple restricts app installs to Safari. Open this link there:",
    copy: "Copy link",
    copied: "Copied!",
    openSafari: "Open in Safari",
    desktopTitle: "Scan with your phone",
    desktopBody: "Open your camera, point at the QR, and install it from there.",
    installed: "App already installed",
    installedBody: "You're all set — open getamano from your home screen.",
    close: "Close",
  } : {
    title: "Descarga la app de getamano",
    subtitle: "Funciona como app real — sin pasar por la App Store.",
    androidCta: "Instalar ahora",
    androidWaiting: "Toca el menú (⋮) y elige \"Instalar app\" o \"Añadir a pantalla de inicio\".",
    safariStep1: "Toca el botón Compartir",
    safariStep2: "Baja y toca",
    safariStep2b: "Añadir a pantalla de inicio",
    safariStep3: "Toca Añadir — ¡listo!",
    nonSafariTitle: "En iPhone, solo Safari instala apps",
    nonSafariBody: "Apple solo permite instalar desde Safari. Ábrelo así:",
    copy: "Copiar link",
    copied: "¡Copiado!",
    openSafari: "Abrir en Safari",
    desktopTitle: "Escanea con tu celular",
    desktopBody: "Abre la cámara, apunta al QR y se instala desde ahí.",
    installed: "App ya instalada",
    installedBody: "Estás listo — abre getamano desde tu pantalla de inicio.",
    close: "Cerrar",
  };

  const onInstallNative = async () => {
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalledNow(true);
    _deferredPrompt = null;
    _hasNativePrompt = false;
    setHasNative(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (_e) {
      // Fallback: select the link element
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (_err) { /* ignore */ }
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  // Try iOS deep-link to open in Safari (works for Chrome iOS users)
  // Note: iOS removed support for x-safari-https:// in iOS 14+, so we fall
  // back to clipboard copy + tell the user to open Safari.
  const openInSafari = () => {
    copyLink();
    // Best-effort attempt — on most iOS Chrome it'll just open Chrome
    // again, so we rely on the user opening Safari themselves.
    window.location.href = url;
  };

  if (!open) return null;

  // ---- Render correct view ----
  let view = "desktop";
  if (alreadyInstalled || installedNow) view = "installed";
  else if (platform.os === "android") view = "android";
  else if (platform.os === "ios" && platform.browser === "safari") view = "ios-safari";
  else if (platform.os === "ios" && platform.browser !== "safari") view = "ios-non-safari";

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
      onClick={() => setOpen(false)}
      data-testid="install-app-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-app-modal-title"
    >
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 sm:p-7 animate-in slide-in-from-bottom-4 fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 transition"
          aria-label={T.close}
          data-testid="install-app-modal-close"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
          >
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="install-app-modal-title" className="font-display text-lg font-bold text-slate-900 leading-tight">{T.title}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{T.subtitle}</p>
          </div>
        </div>

        {/* Views */}
        {view === "android" && (
          <div data-testid="install-view-android">
            {hasNative ? (
              <button
                onClick={onInstallNative}
                className="w-full py-3.5 rounded-2xl text-white font-semibold shadow-md hover:opacity-95 active:scale-[0.99] transition inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: "#025F67" }}
                data-testid="install-android-btn"
              >
                <Download className="w-5 h-5" /> {T.androidCta}
              </button>
            ) : (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 leading-relaxed flex items-start gap-3">
                <MoreVertical className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <span>{T.androidWaiting}</span>
              </div>
            )}
          </div>
        )}

        {view === "ios-safari" && (
          <div data-testid="install-view-ios-safari">
            <SafariInstallTutorial className="mb-4" />
            <ol className="space-y-3">
              <Step
                n={1}
                text={
                  <>
                    {T.safariStep1}{" "}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-800">
                      <Share className="w-3.5 h-3.5" /> {lang === "en" ? "Share" : "Compartir"}
                    </span>
                  </>
                }
              />
              <Step
                n={2}
                text={
                  <>
                    {T.safariStep2}{" "}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-800">
                      <Plus className="w-3.5 h-3.5" /> {T.safariStep2b}
                    </span>
                  </>
                }
              />
              <Step n={3} text={T.safariStep3} />
            </ol>
          </div>
        )}

        {view === "ios-non-safari" && (
          <div data-testid="install-view-ios-non-safari">
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-sm text-amber-900 leading-relaxed mb-4">
              <p className="font-semibold flex items-center gap-1.5"><Compass className="w-4 h-4" /> {T.nonSafariTitle}</p>
              <p className="text-xs mt-1.5 text-amber-800">{T.nonSafariBody}</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 truncate">
              <span className="truncate flex-1" data-testid="install-link">{url}</span>
            </div>
            <div className="flex flex-col gap-2 mt-3">
              <button
                onClick={copyLink}
                className="w-full py-3 rounded-2xl font-semibold text-white shadow-md hover:opacity-95 active:scale-[0.99] transition inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: "#025F67" }}
                data-testid="install-copy-link-btn"
              >
                {copied ? <><Check className="w-4 h-4" /> {T.copied}</> : <><Copy className="w-4 h-4" /> {T.copy}</>}
              </button>
              <p className="text-xs text-slate-500 text-center mt-1 leading-relaxed">
                {lang === "en"
                  ? "1. Tap Copy link 2. Open Safari 3. Paste & go"
                  : "1. Toca \"Copiar link\" 2. Abre Safari 3. Pega y entra"}
              </p>
            </div>
          </div>
        )}

        {view === "desktop" && (
          <div className="text-center" data-testid="install-view-desktop">
            <p className="text-sm text-slate-700 leading-relaxed mb-4">{T.desktopBody}</p>
            <div className="inline-block rounded-2xl bg-white p-4 border border-slate-200 shadow-inner">
              <QRCodeSVG
                value={url}
                size={180}
                level="M"
                includeMargin={false}
                fgColor="#025F67"
              />
            </div>
            <p className="text-xs text-slate-500 mt-4 break-all" data-testid="install-link">{url}</p>
            {hasNative && (
              <button
                onClick={onInstallNative}
                className="mt-5 w-full py-3 rounded-2xl text-white font-semibold shadow-md hover:opacity-95 active:scale-[0.99] transition inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: "#025F67" }}
                data-testid="install-desktop-btn"
              >
                <Download className="w-5 h-5" /> {T.androidCta}
              </button>
            )}
          </div>
        )}

        {view === "installed" && (
          <div className="text-center py-2" data-testid="install-view-installed">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="font-display font-bold text-lg text-slate-900 mt-3">{T.installed}</p>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{T.installedBody}</p>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function Step({ n, text }) {
  return (
    <li className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-sm"
        style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
      >
        {n}
      </div>
      <p className="text-sm text-slate-800 leading-relaxed pt-0.5">{text}</p>
    </li>
  );
}
