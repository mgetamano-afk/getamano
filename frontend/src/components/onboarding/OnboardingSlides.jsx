import { useEffect, useRef, useState } from "react";
import { ShieldCheck, MapPin, Megaphone, MessageSquareQuote } from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";
import LanguageToggle from "./LanguageToggle";

/**
 * OnboardingSlides — Section 70 (screen 2 of 3).
 *
 * Four value-proposition slides with icon + title + description, paginated
 * by a horizontal swipe (touch) or by tapping the dots / Next button.
 *
 * Behavior
 * ────────
 *  · Auto-advance every 4 s while idle (paused while user is dragging)
 *  · Swipe threshold: 50 px horizontal, dominant over vertical
 *  · Last slide replaces "Next" CTA with "Empezar/Get started" (full-width)
 *  · "Skip" link top-right (next to language toggle) jumps to the login
 */
const ICON_BY_INDEX = [
  ShieldCheck,
  MapPin,
  Megaphone,
  MessageSquareQuote,
];

export default function OnboardingSlides({ onDone }) {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchRef = useRef({ x: 0, y: 0, active: false });

  const slides = [0, 1, 2, 3].map(i => ({
    title: t(`onb.slide.title_${i + 1}`),
    desc:  t(`onb.slide.desc_${i + 1}`),
    Icon:  ICON_BY_INDEX[i],
  }));

  // Auto-advance every 4 s
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => {
      setActive(a => (a + 1) % slides.length);
    }, 4000);
    return () => clearTimeout(id);
  }, [active, paused, slides.length]);

  const next = () => {
    if (active === slides.length - 1) onDone?.();
    else setActive(a => a + 1);
  };
  const prev = () => setActive(a => Math.max(0, a - 1));

  const onTouchStart = (e) => {
    const tch = e.touches?.[0];
    if (!tch) return;
    touchRef.current = { x: tch.clientX, y: tch.clientY, active: true };
    setPaused(true);
  };
  const onTouchEnd = (e) => {
    const s = touchRef.current;
    if (!s.active) return;
    touchRef.current = { x: 0, y: 0, active: false };
    setPaused(false);
    const tch = e.changedTouches?.[0];
    if (!tch) return;
    const dx = tch.clientX - s.x;
    const dy = tch.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) next(); else prev();
  };

  const isLast = active === slides.length - 1;

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col text-[#03045E] font-poppins"
      style={{
        backgroundColor: "var(--gtm-blue-surface, #CAF0F8)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-testid="onb-slides"
    >
      {/* Top bar: language toggle + Skip */}
      <div className="w-full px-4 flex items-center justify-between">
        <LanguageToggle />
        <button
          type="button"
          onClick={onDone}
          className="text-sm font-semibold text-[#03045E]/70 hover:text-[#03045E] transition px-2 py-1"
          data-testid="onb-slides-skip"
        >
          {t("onb.slide.skip")}
        </button>
      </div>

      {/* Main slide */}
      <div className="flex-1 w-full max-w-md mx-auto px-6 flex flex-col items-center justify-center text-center">
        <div
          key={active}
          className="flex flex-col items-center"
          style={{ animation: "gtm-slide-in 320ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center mb-8 shadow-md"
            style={{
              background: "linear-gradient(135deg, var(--gtm-blue-light, #90E0EF) 0%, var(--gtm-blue-accent, #00B4D8) 100%)",
            }}
          >
            {(() => {
              const Icon = slides[active].Icon;
              return <Icon className="w-12 h-12 text-white" strokeWidth={2.2} />;
            })()}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3" style={{ letterSpacing: "-0.02em", color: "#03045E" }}>
            {slides[active].title}
          </h2>
          <p className="text-base sm:text-[17px] text-[#03045E]/80 leading-relaxed max-w-sm">
            {slides[active].desc}
          </p>
        </div>
      </div>

      {/* Dots indicator */}
      <div className="w-full flex justify-center gap-2 mb-6" data-testid="onb-slides-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Slide ${i + 1}`}
            className="h-2 rounded-full transition-all"
            style={{
              width: i === active ? 28 : 8,
              backgroundColor: i === active ? "#03045E" : "rgba(3, 4, 94, 0.25)",
            }}
            data-testid={`onb-slides-dot-${i}`}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="w-full max-w-md mx-auto px-6">
        <button
          type="button"
          onClick={next}
          className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-lg active:scale-[0.98] transition-transform"
          style={{ backgroundColor: "var(--gtm-blue-primary, #0077B6)" }}
          data-testid="onb-slides-cta"
        >
          {isLast ? t("onb.slide.done") : t("onb.slide.next")} →
        </button>
      </div>
    </div>
  );
}
