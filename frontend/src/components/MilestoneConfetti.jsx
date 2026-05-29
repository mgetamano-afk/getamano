import { useEffect, useState, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * MilestoneConfetti — Section 63 (CEO marketing recommendation).
 *
 * Fires a celebratory confetti shower + toast banner when a provider crosses
 * a likes/views/reviews milestone for the first time. Anti-spam: persists the
 * last celebrated threshold per provider in localStorage so they only get
 * celebrated ONCE per milestone.
 *
 * Thresholds: 10, 25, 50, 100, 250, 500, 1000, 2500, 5000.
 *
 * Confetti is pure CSS — 50 colored squares that fall + rotate + fade. Zero
 * dependencies. ~700ms total animation duration.
 *
 * Props:
 *   metric        "likes" | "views" | "reviews" | "bookmarks"
 *   value         current count
 *   providerKey   stable id used for localStorage key (provider_id / slug / user_id)
 *   label         (optional) custom label override
 */
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

const COPY = {
  es: {
    likes: { unit: "corazones", verb: "amado" },
    views: { unit: "vistas", verb: "visto" },
    reviews: { unit: "reseñas", verb: "valorado" },
    bookmarks: { unit: "guardadas", verb: "guardado" },
  },
  en: {
    likes: { unit: "hearts", verb: "loved" },
    views: { unit: "views", verb: "seen" },
    reviews: { unit: "reviews", verb: "rated" },
    bookmarks: { unit: "bookmarks", verb: "saved" },
  },
};

// Vibrant confetti colors
const CONFETTI_COLORS = ["#f43f5e", "#f97316", "#facc15", "#10b981", "#0ea5e9", "#8b5cf6", "#ec4899", "#0077B6"];

export default function MilestoneConfetti({ metric, value, providerKey, label }) {
  const { lang } = useI18n();
  const [active, setActive] = useState(null); // current threshold being celebrated
  const [pieces, setPieces] = useState([]);
  const dismissTimerRef = useRef(null);

  useEffect(() => {
    if (!providerKey || !metric || typeof value !== "number") return;
    // Find the HIGHEST milestone we just crossed
    const crossed = [...MILESTONES].reverse().find((m) => value >= m);
    if (!crossed) return;
    const storageKey = `gtm:milestone:${providerKey}:${metric}`;
    const lastCelebrated = parseInt(localStorage.getItem(storageKey) || "0", 10);
    if (crossed <= lastCelebrated) return; // already celebrated this milestone or higher
    // Fire celebration
    localStorage.setItem(storageKey, String(crossed));
    fireCelebration(crossed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, metric, providerKey]);

  const fireCelebration = (threshold) => {
    setActive(threshold);
    // 50 confetti pieces with random horizontal start + rotation + duration
    const newPieces = Array.from({ length: 50 }, (_, i) => ({
      id: `${threshold}-${i}-${Date.now()}`,
      left: Math.random() * 100, // % across the viewport
      delay: Math.random() * 300, // ms — staggered start
      duration: 1800 + Math.random() * 1200, // 1.8-3s fall
      rotation: Math.random() * 360,
      rotationEnd: Math.random() * 720,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 10, // 6-16px
      shape: Math.random() < 0.4 ? "circle" : "square",
    }));
    setPieces(newPieces);
    // Haptic
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate([50, 30, 50]); } catch { /* ignore */ }
    }
    // Auto-dismiss after 5s
    clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => dismiss(), 5500);
    // Clean up confetti pieces after their longest fall
    setTimeout(() => setPieces([]), 3500);
  };

  const dismiss = () => {
    setActive(null);
    setPieces([]);
    clearTimeout(dismissTimerRef.current);
  };

  if (!active) return null;

  const t = (COPY[lang] || COPY.es)[metric] || COPY.es.likes;

  return (
    <>
      {/* Confetti layer — fixed full-viewport, ignores pointer events */}
      <div
        className="fixed inset-0 z-[150] pointer-events-none overflow-hidden"
        aria-hidden="true"
        data-testid="milestone-confetti"
      >
        {pieces.map((p) => (
          <span
            key={p.id}
            className="absolute top-0 gtm-confetti-piece"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              borderRadius: p.shape === "circle" ? "50%" : "2px",
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              "--rot-start": `${p.rotation}deg`,
              "--rot-end": `${p.rotationEnd}deg`,
            }}
          />
        ))}
      </div>

      {/* Celebratory toast banner */}
      <div
        className="fixed top-20 left-1/2 -translate-x-1/2 z-[160] max-w-sm w-[calc(100%-2rem)] pointer-events-auto animate-fadeSlideUp"
        data-testid="milestone-banner"
        role="status"
      >
        <div className="relative bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 rounded-3xl shadow-2xl p-5 text-white text-center overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-white/20 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-white/15 blur-2xl pointer-events-none" />

          <button
            type="button"
            onClick={dismiss}
            className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/15 hover:bg-black/25 flex items-center justify-center text-white/90"
            aria-label="Cerrar"
            data-testid="milestone-banner-close"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="relative pointer-events-none">
            <div className="text-4xl mb-1 animate-bounce" aria-hidden="true">🎉</div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/90 inline-flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3" />
              {lang === "en" ? "Milestone unlocked" : "Logro desbloqueado"}
            </p>
            <h3 className="font-display font-bold text-2xl mb-1.5 leading-tight" data-testid="milestone-banner-headline">
              {lang === "en"
                ? `${active} ${t.unit} reached!`
                : `¡${active} ${t.unit} alcanzados!`}
            </h3>
            <p className="text-sm text-white/95 leading-snug">
              {label || (lang === "en"
                ? `Your business has been ${t.verb} ${active} times — the community loves what you do.`
                : `Tu negocio ha sido ${t.verb} ${active} veces — la comunidad ama lo que haces.`)}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
