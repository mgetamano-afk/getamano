import { useState } from "react";
import { Apple, Smartphone, Download, Check, Loader2 } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import { usePwaInstall } from "../contexts/PwaInstallContext";
import IosInstallModal from "./IosInstallModal";
import { toast } from "sonner";

/**
 * InstallButtons — landing-page hero CTAs ("Para iPhone" / "Para Android").
 *
 * Designed for "Juan, the casual user" who needs ONE button click — no manual
 * Safari steps, no banners to wait for. Click the button → install fires.
 *
 *   - iPhone button → opens IosInstallModal with 3-step illustrated guide
 *   - Android button → if beforeinstallprompt is ready, fires native install
 *                      → if not (e.g. user is on desktop or already-installed),
 *                        shows a friendly "Visit on your phone" hint
 *
 * Hidden when already installed (display-mode: standalone).
 */
export default function InstallButtons({ variant = "default" }) {
  const { lang } = useI18n();
  const { canInstallAndroid, install, isInstalled, isIOS, isAndroid } = usePwaInstall();
  const [showIos, setShowIos] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  if (isInstalled || installed) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200 text-green-700 text-sm font-semibold" data-testid="install-already">
        <Check className="w-4 h-4" /> {lang === "en" ? "App installed" : "App instalada"}
      </div>
    );
  }

  const triggerAndroid = async () => {
    if (canInstallAndroid) {
      setInstalling(true);
      try {
        const choice = await install();
        if (choice.outcome === "accepted") {
          setInstalled(true);
          toast.success(lang === "en" ? "🎉 App installed! Find the icon on your home screen." : "🎉 ¡App instalada! Busca el ícono en tu pantalla.");
        }
      } finally {
        setInstalling(false);
      }
      return;
    }
    // Fallback when beforeinstallprompt hasn't fired (e.g. user is on desktop,
    // or browser doesn't support PWA install)
    if (isAndroid) {
      toast.info(lang === "en" ? "Tap the menu (⋮) → Install app" : "Toca el menú (⋮) → Instalar app");
    } else {
      toast.info(lang === "en"
        ? "Open this on your Android phone in Chrome to install."
        : "Ábrela desde tu Android con Chrome para instalar.");
    }
  };

  // Hero variant — big stacked buttons (used in landing hero)
  if (variant === "hero") {
    return (
      <>
        <div className="flex flex-col sm:flex-row gap-3 mt-7" data-testid="install-buttons-hero">
          <button
            onClick={() => setShowIos(true)}
            className="group flex-1 inline-flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-white text-slate-900 hover:bg-slate-50 transition shadow-lg shadow-black/10 border border-white/40"
            data-testid="install-ios-btn"
          >
            <Apple className="w-7 h-7 fill-slate-900" />
            <div className="text-left flex-1">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold leading-none">
                {lang === "en" ? "Get it for" : "Descarga para"}
              </div>
              <div className="font-display text-lg font-bold leading-tight">iPhone</div>
            </div>
            <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
          </button>

          <button
            onClick={triggerAndroid}
            disabled={installing}
            className="group flex-1 inline-flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-white text-slate-900 hover:bg-slate-50 transition shadow-lg shadow-black/10 border border-white/40 disabled:opacity-70"
            data-testid="install-android-btn"
          >
            {installing
              ? <Loader2 className="w-7 h-7 animate-spin text-teal-600" />
              : <span className="text-2xl leading-none">🤖</span>}
            <div className="text-left flex-1">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold leading-none">
                {lang === "en" ? "Get it for" : "Descarga para"}
              </div>
              <div className="font-display text-lg font-bold leading-tight">Android</div>
            </div>
            <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
          </button>
        </div>
        <IosInstallModal open={showIos} onClose={() => setShowIos(false)} />
      </>
    );
  }

  // Compact variant — small chip pair (used inline elsewhere)
  return (
    <>
      <div className="flex items-center gap-2" data-testid="install-buttons-compact">
        <button
          onClick={() => setShowIos(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          data-testid="install-ios-btn"
        >
          <Apple className="w-3.5 h-3.5 fill-white" /> iPhone
        </button>
        <button
          onClick={triggerAndroid}
          disabled={installing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-70"
          data-testid="install-android-btn"
        >
          {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
          Android
        </button>
      </div>
      <IosInstallModal open={showIos} onClose={() => setShowIos(false)} />
    </>
  );
}
