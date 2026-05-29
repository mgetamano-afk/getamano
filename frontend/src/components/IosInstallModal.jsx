import { useState } from "react";
import { X, Share, Plus, ChevronRight, Check, Smartphone } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * IosInstallModal — beautiful step-by-step Safari install guide.
 *
 * Shown when a user (especially "Juan, the casual user") clicks "Download for iPhone"
 * on the landing page. Apple does NOT allow programmatic install on iOS, so we
 * walk the user through it manually — visually clear so anyone can follow.
 *
 * Detects whether the user is actually in Safari. If not (Chrome/Edge on iOS),
 * shows a banner saying "Open this link in Safari to install" with a copy-link
 * fallback.
 */
function isSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Safari includes "Safari" but NOT "CriOS" (Chrome iOS) or "FxiOS" (Firefox iOS)
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export default function IosInstallModal({ open, onClose }) {
  const { lang } = useI18n();
  const [copied, setCopied] = useState(false);

  if (!open) return null;
  const inSafari = isSafari();
  const url = window.location.origin;

  const T = lang === "en" ? {
    title: "Install on your iPhone",
    subtitle: "3 simple steps and the app icon stays on your home screen.",
    step1: "Tap the",
    step1b: "Share",
    step1c: "button below",
    step1Hint: "(square with arrow up — at the bottom of Safari)",
    step2: "Scroll down and tap",
    step2b: "Add to Home Screen",
    step3: "Tap",
    step3b: "Add",
    step3c: "in the top right",
    closeBtn: "I got it",
    notSafariTitle: "Open this in Safari",
    notSafariBody: "iPhone install only works in Safari. Copy the link and paste it in Safari.",
    copyBtn: "Copy link",
    copied: "Copied!",
  } : {
    title: "Instalar en tu iPhone",
    subtitle: "3 pasos sencillos y el ícono se queda en tu pantalla.",
    step1: "Toca el botón",
    step1b: "Compartir",
    step1c: "abajo",
    step1Hint: "(cuadrito con flecha hacia arriba — abajo en Safari)",
    step2: "Baja un poco y toca",
    step2b: "Añadir a pantalla de inicio",
    step3: "Toca",
    step3b: "Añadir",
    step3c: "arriba a la derecha",
    closeBtn: "Entendido",
    notSafariTitle: "Ábrelo en Safari",
    notSafariBody: "La instalación en iPhone solo funciona en Safari. Copia el enlace y pégalo en Safari.",
    copyBtn: "Copiar enlace",
    copied: "¡Copiado!",
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_e) { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid="ios-install-modal">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-4 fade-in">
        {/* Header */}
        <div className="relative p-6 pb-4 text-center" style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white" data-testid="ios-modal-close">
            <X className="w-4 h-4" />
          </button>
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-3">
            <Smartphone className="w-8 h-8 text-white" />
          </div>
          <h2 className="font-display text-xl font-bold text-white">{T.title}</h2>
          <p className="text-white/85 text-sm mt-1">{T.subtitle}</p>
        </div>

        {/* Body */}
        <div className="p-6">
          {!inSafari && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-5 flex items-start gap-3" data-testid="ios-not-safari-warning">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">⚠️</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-900 text-sm">{T.notSafariTitle}</p>
                <p className="text-xs text-amber-800 mt-0.5">{T.notSafariBody}</p>
                <button onClick={copyLink} className="mt-2 px-3 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold inline-flex items-center gap-1" data-testid="ios-copy-link">
                  {copied ? <><Check className="w-3 h-3" /> {T.copied}</> : <><span>📋</span> {T.copyBtn}</>}
                </button>
              </div>
            </div>
          )}

          <ol className="space-y-4">
            {/* Step 1 — Share button */}
            <li className="flex gap-3" data-testid="ios-step-1">
              <span className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: "#03045E" }}>1</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900">
                  {T.step1}{" "}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-xs">
                    <Share className="w-3.5 h-3.5" /> {T.step1b}
                  </span>{" "}
                  {T.step1c}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 italic">{T.step1Hint}</p>
              </div>
            </li>

            {/* Step 2 — Add to home screen */}
            <li className="flex gap-3" data-testid="ios-step-2">
              <span className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: "#03045E" }}>2</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900">
                  {T.step2}{" "}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs">
                    <Plus className="w-3.5 h-3.5" /> {T.step2b}
                  </span>
                </p>
              </div>
            </li>

            {/* Step 3 — confirm */}
            <li className="flex gap-3" data-testid="ios-step-3">
              <span className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: "#03045E" }}>3</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900">
                  {T.step3}{" "}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-xs">
                    <Check className="w-3.5 h-3.5" /> {T.step3b}
                  </span>{" "}
                  {T.step3c}
                </p>
              </div>
            </li>
          </ol>

          <button onClick={onClose} className="mt-6 w-full py-3 rounded-full text-white font-semibold shadow-sm hover:opacity-90 inline-flex items-center justify-center gap-1" style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }} data-testid="ios-modal-done">
            <Check className="w-4 h-4" /> {T.closeBtn} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
