import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Sparkles, Smartphone, Wifi, BellRing, Share, Plus, Download, Compass, ExternalLink, Check, Copy, MoreVertical } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import SafariInstallTutorial from "../components/SafariInstallTutorial";
import { useI18n } from "../contexts/I18nContext";
import {
  detectDevice,
  isStandalonePWA,
  markInstallDeclined,
  trackPwaInstalled,
} from "../lib/deviceDetection";

/**
 * /instalar — dedicated landing for the PWA install flow. Optimised for:
 *   • QR codes printed on a provider's physical card (desktop visitor → QR)
 *   • Marketing links shared on Instagram bio / WhatsApp / SMS
 *   • Founders sending the URL to early users in onboarding emails
 *
 * Same auto-detection logic as InstallAppModal (so the experience is
 * consistent), but presented as a full page with brand context, the
 * benefits of installing, and a one-tap CTA.
 */
export default function Install() {
  const { lang } = useI18n();
  const [device, setDevice] = useState(detectDevice);
  const [installed, setInstalled] = useState(isStandalonePWA);
  const [hasNativePrompt, setHasNativePrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [copied, setCopied] = useState(false);

  // Capture beforeinstallprompt while on this page (Android Chrome/Edge).
  useEffect(() => {
    const onBefore = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setHasNativePrompt(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setHasNativePrompt(false);
      setDeferredPrompt(null);
      trackPwaInstalled(device.os);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [device.os]);

  // Re-detect once on mount in case the UA hint changed (rare but safe)
  useEffect(() => { setDevice(detectDevice()); }, []);

  const url = typeof window !== "undefined" ? window.location.origin : "";

  const T = lang === "en" ? {
    eyebrow: "Install the app",
    title: "Install getamano on your phone",
    subtitle: "No App Store. No Google Play. Direct from your home screen.",
    benefit1Title: "One-tap from your home screen",
    benefit1Body: "Tap the icon, open instantly — no browser bar, no clutter.",
    benefit2Title: "Works without signal",
    benefit2Body: "Your saved providers and chats stay accessible offline.",
    benefit3Title: "Push notifications",
    benefit3Body: "Get alerts when a client contacts you (provider) or your booking is confirmed.",
    androidInstall: "Install now",
    androidWaitingTitle: "Open Chrome menu",
    androidWaitingBody: "Tap the ⋮ button (top-right) and choose \"Install app\" — it'll add getamano to your home screen.",
    samsungTitle: "Samsung Internet — manual install",
    samsungBody: "Tap the menu (☰ bottom-right) → \"Add page to\" → \"Home Screen\" → \"Add\".",
    safariTitle: "iPhone — 3 steps in Safari",
    iosNonSafariTitle: "Apple only allows install from Safari",
    iosNonSafariBody: "Tap below to copy the link, then open Safari and paste it there.",
    copyLink: "Copy link",
    copied: "Copied!",
    desktopTitle: "Scan with your phone",
    desktopBody: "Open your camera, point at the QR, install on your phone.",
    installedTitle: "You already have getamano installed",
    installedBody: "Open it from your home screen for the full experience.",
    openApp: "Open getamano",
    backHome: "← Back to home",
    footer: "Why a PWA? It works on every phone, no waiting for App Store reviews, and you save the 30% Apple/Google fee — every dollar stays in the Latino marketplace.",
  } : {
    eyebrow: "Instala la app",
    title: "Instala getamano en tu teléfono",
    subtitle: "Sin App Store. Sin Google Play. Directo desde tu pantalla de inicio.",
    benefit1Title: "Acceso 1-tap desde tu pantalla",
    benefit1Body: "Toca el ícono, se abre al instante — sin barra de navegador, sin distracciones.",
    benefit2Title: "Funciona sin señal",
    benefit2Body: "Tus proveedores guardados y chats siguen accesibles sin internet.",
    benefit3Title: "Notificaciones",
    benefit3Body: "Te avisamos cuando un cliente te contacta (proveedor) o cuando confirman tu reserva.",
    androidInstall: "Instalar ahora",
    androidWaitingTitle: "Abre el menú de Chrome",
    androidWaitingBody: "Toca el botón ⋮ (arriba a la derecha) y elige \"Instalar app\" — getamano se agrega a tu pantalla de inicio.",
    samsungTitle: "Samsung Internet — instalación manual",
    samsungBody: "Toca el menú (☰ abajo a la derecha) → \"Añadir página a\" → \"Pantalla de inicio\" → \"Añadir\".",
    safariTitle: "iPhone — 3 pasos en Safari",
    iosNonSafariTitle: "Apple solo permite instalar desde Safari",
    iosNonSafariBody: "Toca abajo para copiar el link, después abre Safari y pégalo ahí.",
    copyLink: "Copiar link",
    copied: "¡Copiado!",
    desktopTitle: "Escanea con tu celular",
    desktopBody: "Abre la cámara, apunta al QR y se instala en tu teléfono.",
    installedTitle: "Ya tienes getamano instalado",
    installedBody: "Ábrelo desde tu pantalla de inicio para la experiencia completa.",
    openApp: "Abrir getamano",
    backHome: "← Volver al inicio",
    footer: "¿Por qué PWA? Funciona en todos los teléfonos, sin esperar revisión de la App Store, y te ahorras la comisión del 30% de Apple/Google — cada dólar se queda en el marketplace latino.",
  };

  const onInstallNative = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      trackPwaInstalled("android");
      setInstalled(true);
    } else {
      markInstallDeclined();
    }
    setDeferredPrompt(null);
    setHasNativePrompt(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (_e) {
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (_err) { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const benefits = [
    { icon: Smartphone, title: T.benefit1Title, body: T.benefit1Body, color: "#03045E" },
    { icon: Wifi, title: T.benefit2Title, body: T.benefit2Body, color: "#FF6B2C" },
    { icon: BellRing, title: T.benefit3Title, body: T.benefit3Body, color: "#22C55E" },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-bold tracking-widest uppercase border border-orange-200">
            <Sparkles className="w-3.5 h-3.5" /> {T.eyebrow}
          </span>
          <h1 className="font-display mt-5 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-[1.1]" data-testid="install-page-title">
            {T.title}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">{T.subtitle}</p>
        </div>

        {/* Action card — what to do based on device */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sm:p-8 mb-10" data-testid="install-action-card">
          {installed ? (
            <div className="text-center py-4" data-testid="install-state-installed">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="font-display font-bold text-xl text-slate-900 mt-4">{T.installedTitle}</p>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{T.installedBody}</p>
              <Link to="/" className="inline-flex mt-6 px-6 py-3 rounded-full text-white font-semibold hover:opacity-95 active:scale-[0.99] transition gap-2 items-center" style={{ backgroundColor: "#03045E" }} data-testid="install-open-app">
                <ExternalLink className="w-4 h-4" /> {T.openApp}
              </Link>
            </div>
          ) : device.canInstallIOS ? (
            <div data-testid="install-state-ios-safari">
              <div className="grid sm:grid-cols-[auto_1fr] gap-6 items-center">
                <SafariInstallTutorial />
                <div>
                  <p className="font-display font-bold text-lg text-slate-900 mb-3">{T.safariTitle}</p>
                  <ol className="space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">1</span>
                      <span>
                        {lang === "en" ? "Tap" : "Toca"}{" "}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-800 text-xs">
                          <Share className="w-3 h-3" /> {lang === "en" ? "Share" : "Compartir"}
                        </span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">2</span>
                      <span>
                        {lang === "en" ? "Scroll & tap" : "Desliza y toca"}{" "}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-800 text-xs">
                          <Plus className="w-3 h-3" /> {lang === "en" ? "Add to Home Screen" : "Añadir a pantalla de inicio"}
                        </span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">3</span>
                      <span>{lang === "en" ? "Tap Add — done!" : "Toca Añadir — ¡listo!"}</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          ) : device.isIOSNonSafari ? (
            <div className="text-center" data-testid="install-state-ios-non-safari">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-5 text-left">
                <p className="font-display font-bold text-amber-900 inline-flex items-center gap-1.5"><Compass className="w-4 h-4" /> {T.iosNonSafariTitle}</p>
                <p className="text-sm text-amber-800 mt-1.5">{T.iosNonSafariBody}</p>
              </div>
              <button
                onClick={copyLink}
                className="w-full max-w-xs mx-auto py-3.5 rounded-2xl font-semibold text-white shadow-md hover:opacity-95 active:scale-[0.99] transition inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: "#03045E" }}
                data-testid="install-copy-link"
              >
                {copied ? <><Check className="w-5 h-5" /> {T.copied}</> : <><Copy className="w-5 h-5" /> {T.copyLink}</>}
              </button>
            </div>
          ) : device.canInstallAndroid && hasNativePrompt ? (
            <div className="text-center" data-testid="install-state-android">
              <button
                onClick={onInstallNative}
                className="w-full max-w-xs mx-auto py-4 rounded-2xl font-bold text-white shadow-md hover:opacity-95 active:scale-[0.99] transition inline-flex items-center justify-center gap-2 text-base"
                style={{ backgroundColor: "#03045E" }}
                data-testid="install-android-btn"
              >
                <Download className="w-5 h-5" /> {T.androidInstall}
              </button>
            </div>
          ) : device.canInstallAndroid ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3" data-testid="install-state-android-waiting">
              <MoreVertical className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-display font-bold text-slate-900 text-base">{T.androidWaitingTitle}</p>
                <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">{T.androidWaitingBody}</p>
              </div>
            </div>
          ) : device.canInstallSamsung ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3" data-testid="install-state-samsung">
              <MoreVertical className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-display font-bold text-slate-900 text-base">{T.samsungTitle}</p>
                <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">{T.samsungBody}</p>
              </div>
            </div>
          ) : (
            <div className="text-center" data-testid="install-state-desktop">
              <p className="font-display font-bold text-lg text-slate-900 mb-2">{T.desktopTitle}</p>
              <p className="text-sm text-slate-600 mb-5">{T.desktopBody}</p>
              <div className="inline-block rounded-2xl bg-white p-4 border border-slate-200 shadow-inner">
                <QRCodeSVG value={url} size={200} level="M" includeMargin={false} fgColor="#03045E" />
              </div>
              <p className="text-xs text-slate-500 mt-4 break-all" data-testid="install-page-link">{url}</p>
            </div>
          )}
        </div>

        {/* Benefits */}
        <div className="grid sm:grid-cols-3 gap-4 sm:gap-6 mb-10">
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm" data-testid={`install-benefit-${i + 1}`}>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${b.color}1A` }}
                >
                  <Icon className="w-5 h-5" style={{ color: b.color }} />
                </div>
                <p className="font-display font-bold text-slate-900 text-sm">{b.title}</p>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{b.body}</p>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-500 max-w-2xl mx-auto leading-relaxed mb-6 italic" data-testid="install-page-footer">
          {T.footer}
        </p>

        <div className="text-center">
          <Link to="/" className="inline-flex text-sm text-slate-600 hover:text-slate-900 font-medium" data-testid="install-back-home">
            {T.backHome}
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
