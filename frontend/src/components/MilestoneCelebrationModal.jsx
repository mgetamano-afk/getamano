import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Trophy, Sparkles, X, ArrowUpRight, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../contexts/I18nContext";

/**
 * MilestoneCelebrationModal — Section 77.
 *
 * Shown ONCE per new milestone unlock. Detects unseen milestones by
 * comparing the latest milestone credit_id from the server against
 * localStorage. Triggers confetti burst + trophy bounce-in.
 *
 * Props:
 *   summary: the /api/user-referrals/me payload
 *   onShared: callback after the user taps "Share on community"
 */
const SEEN_KEY = "gtm_seen_milestones_v1";

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch { return new Set(); }
}
function persistSeen(set) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

export default function MilestoneCelebrationModal({ summary, onClose }) {
  const { lang } = useI18n();
  const [visible, setVisible] = useState(false);
  const closingRef = useRef(false);

  const latestMs = summary?.latest_milestone;
  const milestoneId = latestMs?.credit_id;

  useEffect(() => {
    if (!latestMs || !milestoneId) return;
    const seen = loadSeen();
    if (seen.has(milestoneId)) return;
    // Show after a short delay so the user notices the AppHome first
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, [latestMs, milestoneId]);

  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (milestoneId) {
      const seen = loadSeen();
      seen.add(milestoneId);
      persistSeen(seen);
    }
    setVisible(false);
    onClose?.();
  };

  if (!visible || !latestMs) return null;

  const monthsEarned = summary.free_months_earned || 1;
  const isFirst = monthsEarned === 1;
  const T = lang === "es" ? {
    title: isFirst ? "¡Tu primer mes gratis!" : `¡${monthsEarned} meses gratis!`,
    subtitle: isFirst
      ? "Refiriendo a 2 amigos a getamano. Esta app es tuya."
      : `Sigues construyendo tu red. Total: ${monthsEarned} meses ahorrados.`,
    valueLabel: "Crédito ganado",
    sharedAuto: "Ya lo compartimos en tu feed de comunidad",
    seeFeed: "Ver en comunidad",
    keepGoing: "Seguir invitando",
    close: "Cerrar",
  } : {
    title: isFirst ? "Your first free month!" : `${monthsEarned} free months!`,
    subtitle: isFirst
      ? "By referring 2 friends to getamano. This app is yours."
      : `Keep building your network. Total: ${monthsEarned} months saved.`,
    valueLabel: "Credit earned",
    sharedAuto: "We already posted this to your community feed",
    seeFeed: "View in community",
    keepGoing: "Keep inviting",
    close: "Close",
  };

  // 28 colorful particles for the confetti burst
  const particles = Array.from({ length: 28 }, (_, i) => i);
  const colors = ["#F59E0B", "#10B981", "#3B82F6", "#EC4899", "#8B5CF6", "#EF4444", "#FCD34D"];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "msc-fade-in 280ms ease-out both",
      }}
      onClick={dismiss}
      data-testid="milestone-celebration-modal"
    >
      <style>{`
        @keyframes msc-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes msc-card-in {
          0%   { transform: scale(0.65) translateY(40px); opacity: 0; }
          60%  { transform: scale(1.04) translateY(-4px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes msc-trophy-bounce {
          0%   { transform: scale(0) rotate(-30deg); opacity: 0; }
          50%  { transform: scale(1.25) rotate(8deg); opacity: 1; }
          75%  { transform: scale(0.95) rotate(-4deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes msc-sparkle-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1) rotate(0deg); }
          50%      { opacity: 1; transform: scale(1.2) rotate(15deg); }
        }
        @keyframes msc-confetti-fall {
          0% {
            transform: translate(0, -10px) rotate(0deg);
            opacity: 0;
          }
          10% { opacity: 1; }
          100% {
            transform: translate(var(--dx), 520px) rotate(var(--dr));
            opacity: 0;
          }
        }
        @keyframes msc-ring-pulse {
          0%   { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>

      {/* Confetti particles — purely CSS, no library */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((i) => {
          const dx = (Math.random() * 700 - 350).toFixed(0);
          const dr = (Math.random() * 720 - 360).toFixed(0);
          const delay = (Math.random() * 0.6).toFixed(2);
          const size = 6 + Math.random() * 6;
          const color = colors[i % colors.length];
          const shape = i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "0";
          return (
            <span
              key={i}
              className="absolute left-1/2 top-1/3"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                background: color,
                borderRadius: shape,
                "--dx": `${dx}px`,
                "--dr": `${dr}deg`,
                animation: `msc-confetti-fall 2.4s cubic-bezier(0.2, 0.7, 0.4, 1) ${delay}s both`,
              }}
            />
          );
        })}
      </div>

      {/* Card */}
      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: "msc-card-in 480ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center z-10 transition"
          aria-label={T.close}
          data-testid="milestone-modal-close"
        >
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {/* Trophy hero with ring pulses */}
        <div
          className="relative px-6 pt-8 pb-6 text-center"
          style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #FED7AA 60%, #FECACA 100%)" }}
        >
          <div className="relative inline-block">
            {/* Pulsing rings behind trophy */}
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(245,158,11,0.4) 0%, transparent 70%)",
                animation: "msc-ring-pulse 1.8s ease-out 0.3s infinite",
              }}
              aria-hidden="true"
            />
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(245,158,11,0.3) 0%, transparent 70%)",
                animation: "msc-ring-pulse 1.8s ease-out 0.9s infinite",
              }}
              aria-hidden="true"
            />
            <div
              className="relative w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
                boxShadow: "0 10px 30px -8px rgba(217, 119, 6, 0.5)",
                animation: "msc-trophy-bounce 760ms cubic-bezier(0.34, 1.6, 0.64, 1) 200ms both",
              }}
            >
              <Trophy className="w-10 h-10 text-white drop-shadow" strokeWidth={2.2} />
            </div>
            {/* Decorative sparkles around trophy */}
            <Sparkles
              className="absolute -top-2 -right-2 w-5 h-5 text-yellow-500"
              style={{ animation: "msc-sparkle-pulse 1.6s ease-in-out infinite" }}
              aria-hidden="true"
            />
            <Sparkles
              className="absolute -bottom-1 -left-3 w-4 h-4 text-orange-500"
              style={{ animation: "msc-sparkle-pulse 1.6s ease-in-out 0.5s infinite" }}
              aria-hidden="true"
            />
            <Heart
              className="absolute top-1 -left-4 w-3.5 h-3.5 text-pink-500"
              style={{ animation: "msc-sparkle-pulse 1.8s ease-in-out 0.3s infinite" }}
              aria-hidden="true"
            />
          </div>

          <h2
            className="font-extrabold text-slate-900 mt-4 tracking-tight"
            style={{ fontSize: "clamp(20px, 5vw, 24px)", letterSpacing: "-0.01em" }}
            data-testid="milestone-modal-title"
          >
            🎉 {T.title}
          </h2>
          <p className="text-sm text-slate-600 mt-2 px-2 leading-snug">{T.subtitle}</p>
        </div>

        {/* Credit pill */}
        <div className="px-6 -mt-3 relative z-10">
          <div
            className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
            style={{
              background: "linear-gradient(135deg, #063154 0%, #025F67 100%)",
              boxShadow: "0 8px 24px -10px rgba(2, 95, 103, 0.4)",
            }}
            data-testid="milestone-modal-credit"
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/70 leading-none">
                {T.valueLabel}
              </div>
              <div
                className="font-extrabold tabular-nums text-white mt-1 leading-none"
                style={{ fontSize: "22px", textShadow: "0 1px 4px rgba(0,0,0,0.2)" }}
              >
                ${(latestMs.amount_cents / 100).toFixed(2)}
              </div>
            </div>
            <Sparkles className="w-6 h-6 text-yellow-300" aria-hidden="true" />
          </div>
        </div>

        {/* Community feed notice */}
        <div className="px-6 pt-4 pb-2 text-center">
          <div className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 bg-emerald-50 ring-1 ring-emerald-200 rounded-full px-3 py-1.5">
            <Share2 className="w-3 h-3 text-emerald-600" />
            <span>{T.sharedAuto}</span>
          </div>
        </div>

        {/* CTAs */}
        <div className="px-6 pb-6 pt-3 flex flex-col gap-2">
          <Link
            to="/comunidad?filter=hitos"
            onClick={dismiss}
            className="inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-semibold text-sm py-3 rounded-full transition"
            data-testid="milestone-modal-see-feed"
          >
            {T.seeFeed} <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 py-2 transition"
            data-testid="milestone-modal-keep-going"
          >
            {T.keepGoing} →
          </button>
        </div>
      </div>
    </div>
  );
}
