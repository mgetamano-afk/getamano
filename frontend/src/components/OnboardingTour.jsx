import { useEffect, useState, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight, X, Wallet, Users, Trophy, Sparkles,
} from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * OnboardingTour — Section 81c.
 *
 * Gentle 3-step coachmark tour that fires the FIRST time a provider lands
 * on AppHome. Points the user at the three new social-loop widgets so they
 * understand "this is how getamano pays you back".
 *
 * Spotlight pattern (no external lib):
 *   - Fixed-position overlay covers viewport with semi-opaque backdrop.
 *   - SVG mask cuts out a rounded rectangle over the target element so the
 *     widget below stays fully visible.
 *   - Floating tooltip card with title + body + Skip / Next buttons.
 *
 * State:
 *   - localStorage key `gtm_onboarding_apphome_v1_seen` (boolean).
 *   - Once dismissed (Skip or Done), never shows again on this device.
 *   - Auto-skips if user isn't a provider, or if target widgets are missing
 *     (e.g. fresh user with no credits yet → EarningsWidget is hidden).
 *
 * Props:
 *   role: "provider" | other — only fires for providers
 *   onDone: callback after Done/Skip
 */

const STORAGE_KEY = "gtm_onboarding_apphome_v1_seen";

function loadSeen() {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
function markSeen() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
}

function useElementRect(testid, activeStep, stepIndex) {
  const [rect, setRect] = useState(null);
  const compute = useCallback(() => {
    if (activeStep !== stepIndex) { setRect(null); return; }
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // give scroll a moment to settle
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        bottom: r.bottom,
        right: r.right,
      });
    }, 360);
  }, [testid, activeStep, stepIndex]);

  useLayoutEffect(() => {
    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [compute]);

  return rect;
}

export default function OnboardingTour({ role, onDone }) {
  const { lang } = useI18n();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  // Boot logic: fire once per device, providers only, after a 1.4s grace
  // period so the AppHome has time to render and the widgets to mount.
  useEffect(() => {
    if (role !== "provider") return;
    if (loadSeen()) return;
    const t = setTimeout(() => {
      // Make sure the milestone celebration modal isn't open — that takes
      // priority (the user just unlocked a hito, more important than tour).
      const modal = document.querySelector('[data-testid="milestone-celebration-modal"]');
      if (modal) return;
      setActive(true);
    }, 1400);
    return () => clearTimeout(t);
  }, [role]);

  const T = lang === "es" ? {
    steps: [
      {
        icon: Wallet,
        title: "Tu dinero, tu app",
        body: "Aquí ves cuánto crédito acumulas. Cada referido + comisión se aplica como descuento automático en tu próxima factura. Esta app te devuelve lo que aportas.",
      },
      {
        icon: Users,
        title: "Refiere 2 → gana 1 mes",
        body: "Comparte tu link único. Cuando 2 amigos se suscriben a getamano, tu siguiente mes va gratis. Acumulable: 4 amigos = 2 meses, y así infinito.",
      },
      {
        icon: Trophy,
        title: "La comunidad celebra contigo",
        body: "Cada vez que ganas un mes gratis, automáticamente lo posteamos en la comunidad. Tu red te felicita — y eso te trae más referidos.",
      },
    ],
    skip: "Saltar",
    next: "Siguiente",
    done: "Empezar",
    progress: (i, n) => `Paso ${i + 1} de ${n}`,
  } : {
    steps: [
      {
        icon: Wallet,
        title: "Your money, your app",
        body: "See how much credit you've earned here. Every referral + commission auto-applies as a discount on your next invoice. This app gives back what you put in.",
      },
      {
        icon: Users,
        title: "Refer 2 → earn 1 month",
        body: "Share your unique link. When 2 friends subscribe to getamano, your next month is free. Stackable: 4 friends = 2 months, and so on, forever.",
      },
      {
        icon: Trophy,
        title: "The community celebrates with you",
        body: "Every time you earn a free month, we auto-post to the community. Your network cheers you on — and that brings more referrals.",
      },
    ],
    skip: "Skip",
    next: "Next",
    done: "Get started",
    progress: (i, n) => `Step ${i + 1} of ${n}`,
  };

  // Map each step to a data-testid on the AppHome
  const STEP_TARGETS = [
    "earnings-widget",
    "referral-progress-card",
    "milestone-of-the-week-widget",
  ];

  const rect = useElementRect(STEP_TARGETS[step], step, step);

  const close = (markDone = true) => {
    if (markDone) markSeen();
    setActive(false);
    onDone?.();
  };

  const next = () => {
    if (step >= T.steps.length - 1) {
      close(true);
      return;
    }
    setStep((s) => s + 1);
  };

  // If after 700ms we haven't located the current step target (widget not
  // rendered for this user), gracefully skip the tour to avoid awkward
  // empty pointers.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-testid="${STEP_TARGETS[step]}"]`);
      if (!el && step === 0) {
        close(true);  // no widgets at all → skip and don't try again
      }
    }, 700);
    return () => clearTimeout(t);
  }, [active, step]);

  if (!active) return null;

  const currentStep = T.steps[step];
  const Icon = currentStep.icon;

  // Tooltip position: prefer below the highlighted element, flip up if not
  // enough room. Falls back to centered if no rect (e.g. element missing).
  let tooltipStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 14;
    const tooltipWidth = Math.min(340, vw - 24);
    const tooltipApproxHeight = 220;
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    let top;
    if (spaceBelow >= tooltipApproxHeight + margin) {
      top = rect.bottom + margin;
    } else if (spaceAbove >= tooltipApproxHeight + margin) {
      top = rect.top - tooltipApproxHeight - margin;
    } else {
      // Not enough room above or below — pin to bottom of viewport
      top = Math.max(12, vh - tooltipApproxHeight - 12);
    }
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(vw - tooltipWidth - 12, left));
    tooltipStyle = { left: `${left}px`, top: `${top}px`, width: `${tooltipWidth}px`, transform: "none" };
  }

  // Spotlight cutout using SVG mask
  const cutout = rect ? (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none"
      width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <mask id="spotlight-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <rect
            x={rect.left - 6}
            y={rect.top - 6}
            width={rect.width + 12}
            height={rect.height + 12}
            rx="16" ry="16"
            fill="black"
          />
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="rgba(3, 4, 94, 0.55)" mask="url(#spotlight-mask)" />
      {/* Pulsing ring around target — Ocean Blue cyan */}
      <rect
        x={rect.left - 6}
        y={rect.top - 6}
        width={rect.width + 12}
        height={rect.height + 12}
        rx="16" ry="16"
        fill="none"
        stroke="rgba(0, 180, 216, 0.95)"
        strokeWidth="2.5"
        style={{ animation: "ot-spotlight-pulse 1.8s ease-out infinite" }}
      />
    </svg>
  ) : (
    <div className="fixed inset-0" style={{ background: "rgba(3, 4, 94, 0.55)", pointerEvents: "none" }} aria-hidden="true" />
  );

  return createPortal(
    <div
      // Section 88 — outer overlay must NOT block scroll. The provider
      // landing was unscrollable because every touch event hit this
      // `fixed inset-0` div and never reached the underlying page.
      // We make the overlay transparent to pointer events and re-enable
      // them only on the tooltip card so its buttons still work.
      className="fixed inset-0 z-[120]"
      style={{ animation: "ot-fade-in 280ms ease-out both", pointerEvents: "none" }}
      data-testid="onboarding-tour"
    >
      <style>{`
        @keyframes ot-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ot-spotlight-pulse {
          0%   { stroke-opacity: 0.9; stroke-width: 2.5; }
          50%  { stroke-opacity: 0.4; stroke-width: 5; }
          100% { stroke-opacity: 0.9; stroke-width: 2.5; }
        }
        @keyframes ot-card-in {
          0%   { opacity: 0; transform: translateY(10px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {cutout}

      {/* Tooltip card */}
      <div
        className="fixed bg-white rounded-2xl shadow-2xl p-5 max-w-[340px]"
        style={{
          ...tooltipStyle,
          animation: "ot-card-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both",
          boxShadow: "0 24px 60px -12px rgba(0,0,0,0.35)",
          pointerEvents: "auto",  // Section 88 — re-enable on the card only
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="onboarding-tooltip"
      >
        {/* Close X */}
        <button
          type="button"
          onClick={() => close(true)}
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center transition"
          aria-label={T.skip}
          data-testid="onboarding-close"
        >
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {/* Icon */}
        <div className="relative inline-block">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 60%, #F97316 100%)",
              boxShadow: "0 6px 16px -6px rgba(245, 158, 11, 0.5)",
            }}
          >
            <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <Sparkles
            className="absolute -top-1 -right-1 w-3 h-3 text-yellow-500"
            style={{ animation: "ot-spotlight-pulse 2s ease-in-out infinite" }}
            aria-hidden="true"
          />
        </div>

        {/* Title */}
        <h3
          className="font-extrabold text-slate-900 mt-3 leading-tight tracking-tight"
          style={{ fontSize: "17px", letterSpacing: "-0.01em" }}
          data-testid="onboarding-title"
        >
          {currentStep.title}
        </h3>

        {/* Body */}
        <p className="text-[13px] text-slate-600 mt-2 leading-relaxed" data-testid="onboarding-body">
          {currentStep.body}
        </p>

        {/* Step indicator dots */}
        <div className="flex items-center gap-1.5 mt-4" aria-label={T.progress(step, T.steps.length)}>
          {T.steps.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === step
                  ? "bg-amber-500 w-6"
                  : i < step
                    ? "bg-amber-200 w-2"
                    : "bg-slate-200 w-2"
              }`}
              aria-hidden="true"
            />
          ))}
          <span className="ml-auto text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {T.progress(step, T.steps.length)}
          </span>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => close(true)}
            className="flex-1 text-[12px] font-semibold text-slate-500 hover:text-slate-900 py-2 transition"
            data-testid="onboarding-skip"
          >
            {T.skip}
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex items-center justify-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 active:scale-95 text-white font-semibold text-[12px] px-4 py-2 rounded-full shadow-sm transition min-w-[110px]"
            data-testid="onboarding-next"
          >
            {step >= T.steps.length - 1 ? T.done : T.next}
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
