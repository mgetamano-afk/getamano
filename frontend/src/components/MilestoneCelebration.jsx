import { useEffect, useState } from "react";
import { Sparkles, X, Trophy } from "lucide-react";
import { api } from "../lib/api";

/**
 * Confetti pieces with random positions/colors. CSS-driven, no library.
 */
function Confetti({ count = 60 }) {
  const colors = ["#2F9D94", "#025F67", "#063154", "#4EBAAE", "#74CFC5", "#A6E1DA", "#BCC5CC"];
  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.2 + Math.random() * 2,
    color: colors[i % colors.length],
    shape: i % 3,
    drift: (Math.random() - 0.5) * 40,
    rot: Math.random() * 360,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map(p => (
        <span
          key={p.id}
          className="absolute top-0 will-change-transform"
          style={{
            left: `${p.left}%`,
            width: p.shape === 0 ? 8 : p.shape === 1 ? 10 : 6,
            height: p.shape === 0 ? 14 : p.shape === 1 ? 6 : 12,
            backgroundColor: p.color,
            borderRadius: p.shape === 2 ? "50%" : 2,
            transform: `rotate(${p.rot}deg)`,
            animation: `confetti-fall ${p.duration}s ${p.delay}s cubic-bezier(.2,.6,.4,1) forwards`,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

const TIER_STYLES = {
  silver:   { ring: "from-slate-300 to-slate-500", glow: "rgba(148,163,184,0.45)", label: "Hito desbloqueado" },
  gold:     { ring: "from-amber-400 to-orange-500", glow: "rgba(251,146,60,0.55)", label: "Logro destacado" },
  platinum: { ring: "from-fuchsia-400 via-orange-400 to-amber-300", glow: "rgba(244,114,182,0.6)", label: "Logro legendario" },
};

/**
 * MilestoneCelebration — Sequential confetti modal that celebrates each
 * unlocked milestone with warmth. Pulls /providers/me/milestones, displays one
 * at a time, dismisses to backend.
 */
export default function MilestoneCelebration({ pollOnMount = true }) {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!pollOnMount) return;
    api.get("/providers/me/milestones")
      .then(r => setQueue(r.data?.celebrate || []))
      .catch(() => {});
  }, [pollOnMount]);

  useEffect(() => {
    if (!current && queue.length > 0) {
      // small delay to let dashboard render first
      const t = setTimeout(() => setCurrent(queue[0]), 600);
      return () => clearTimeout(t);
    }
  }, [queue, current]);

  const dismiss = async () => {
    if (!current) return;
    setClosing(true);
    try { await api.post(`/providers/me/milestones/${current.milestone_id}/dismiss`); } catch {}
    setTimeout(() => {
      setQueue(q => q.slice(1));
      setCurrent(null);
      setClosing(false);
    }, 350);
  };

  if (!current) return null;
  const tier = TIER_STYLES[current.tier] || TIER_STYLES.silver;

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center p-4 transition-opacity ${closing ? "opacity-0" : "opacity-100"}`}
      style={{ background: "rgba(11, 15, 46, 0.78)", backdropFilter: "blur(8px)" }}
      data-testid="milestone-celebration"
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--drift), 110vh, 0) rotate(720deg); opacity: 0.7; }
        }
        @keyframes ms-pop { 0% { transform: scale(.5) translateY(20px); opacity: 0; } 60% { transform: scale(1.08) translateY(-4px); opacity: 1; } 100% { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes ms-glow { 0%,100% { box-shadow: 0 0 0 0 var(--ms-glow); } 50% { box-shadow: 0 0 32px 6px var(--ms-glow); } }
        @keyframes emoji-bounce { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-8px) rotate(6deg); } }
      `}</style>

      <Confetti count={70} />

      <div
        className="relative max-w-md w-full"
        style={{ animation: "ms-pop .6s cubic-bezier(.2,1.4,.4,1) both" }}
      >
        {/* Outer ring with gradient glow */}
        <div className={`absolute -inset-1 rounded-3xl bg-gradient-to-br ${tier.ring} opacity-80 blur-md`} />

        <div
          className="relative bg-white rounded-3xl p-7 text-center"
          style={{ "--ms-glow": tier.glow, animation: "ms-glow 2.4s ease-in-out infinite" }}
        >
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
            data-testid="milestone-close"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 text-orange-700 text-[10px] font-semibold tracking-widest uppercase">
            <Trophy className="w-3 h-3" />
            {tier.label}
          </div>

          <div
            className="my-5 mx-auto w-24 h-24 rounded-2xl bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center text-6xl"
            style={{ animation: "emoji-bounce 2s ease-in-out infinite" }}
            data-testid="milestone-emoji"
          >
            <span>{current.emoji}</span>
          </div>

          <h2 className="font-display text-2xl font-bold text-slate-900 leading-tight" data-testid="milestone-title">
            {current.title}
          </h2>
          <p className="mt-3 text-slate-600 leading-relaxed" data-testid="milestone-message">
            {current.message}
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
            <span>Tu compañero getamano lo está celebrando contigo</span>
          </div>

          <button
            onClick={dismiss}
            className="mt-5 w-full py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-medium transition"
            data-testid="milestone-continue"
          >
            ¡Gracias, sigamos! 🧡
          </button>

          {queue.length > 1 && (
            <p className="mt-2 text-xs text-slate-400" data-testid="milestone-queue">
              {queue.length - 1} {queue.length - 1 === 1 ? "hito más por celebrar" : "hitos más por celebrar"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
