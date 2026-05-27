import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Users, Share2, Copy, Check, ArrowUpRight, Gift, MessageCircle,
  Sparkles, Heart, Trophy, UserPlus, Link2,
} from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * ReferralProgressCard — Section 72 / redesigned Section 76b.
 *
 * Compact, animated, icon-rich card for AppHome (provider only).
 * Visual brief:
 *   - Decorative blob + sparkle/heart corner accents (warm friendly look)
 *   - Headline in white with text-shadow (was unreadable green-on-orange)
 *   - Animated progress bar with 2 milestone dots + shimmer fill
 *   - Stats row with icons + count-up on the numbers
 *   - Compact link bar with Link2 icon prefix and short visible portion
 *   - Smaller share buttons (WhatsApp green + Copy + Share native)
 *   - Hover micro-lift, sparkle pulse on Trophy when ≥1 milestone earned
 */
export default function ReferralProgressCard() {
  const { lang } = useI18n();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.get("/user-referrals/me")
      .then((r) => { if (mounted) setSummary(r.data); })
      .catch(() => { if (mounted) setSummary(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading || !summary) return null;

  const T = lang === "es" ? {
    badge: "Tu red",
    progressOf: "Progreso al próximo mes gratis",
    seeInvites: "Ver invitados",
    friendsPaid: "Suscritos",
    monthsEarned: "Meses ganados",
    shareLabel: "Tu link único",
    copy: "Copiar",
    copied: "¡Listo!",
    waLabel: "WhatsApp",
    shareLabel2: "Compartir",
    waText: (link) => `🌟 Únete a getamano — la app latina de servicios verificados en USA. Usando mi link, tu primer mes Pro va gratis: ${link}`,
    appIsYours: "Esta app es tuya — mereces un espacio aquí.",
    motivateInitial: (n) => `Refiere ${n === 1 ? "1 amigo más" : `${n} amigos`} y gana tu próximo mes gratis`,
    motivateNext: "¡Sigue invitando para acumular meses!",
  } : {
    badge: "Your network",
    progressOf: "Progress to next free month",
    seeInvites: "See invitees",
    friendsPaid: "Subscribed",
    monthsEarned: "Months earned",
    shareLabel: "Your unique link",
    copy: "Copy",
    copied: "Done!",
    waLabel: "WhatsApp",
    shareLabel2: "Share",
    waText: (link) => `🌟 Join getamano — the Latino app for verified services in the USA. With my link your first Pro month is free: ${link}`,
    appIsYours: "This app is yours — you deserve a place here.",
    motivateInitial: (n) => `Refer ${n === 1 ? "1 more friend" : `${n} more friends`} to earn your next free month`,
    motivateNext: "Keep inviting to stack up free months!",
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}${summary.share_path}`;
  // Display-friendly short URL (drop https://)
  const shortUrl = shareUrl.replace(/^https?:\/\//, "");

  // Progress within current 2-friend cycle (0 or 1)
  const inCycle = summary.ratio - summary.needed_for_next;
  const progressPct = (inCycle / summary.ratio) * 100;
  const milestonesEarned = summary.free_months_earned || 0;

  // Sprint A — "Almost there" hot state: when only 1 more paid referee
  // unlocks the next free month, surface a pulsing flame badge over the
  // headline to create urgency in the highest-leverage moment.
  const almostThere = summary.needed_for_next === 1;

  // Headline — replace the long server-generated one with a punchier copy
  const headlineCopy = summary.needed_for_next > 0
    ? T.motivateInitial(summary.needed_for_next)
    : T.motivateNext;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      toast.success(T.copied);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const shareWa = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(T.waText(shareUrl))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Únete a getamano", text: T.waText(shareUrl), url: shareUrl });
      } catch (_e) { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  return (
    <div
      className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: "linear-gradient(135deg, #FB923C 0%, #F97316 55%, #EA580C 100%)",
        boxShadow: "0 8px 24px -10px rgba(234, 88, 12, 0.45)",
      }}
      data-testid="referral-progress-card"
    >
      {/* Decorative blobs */}
      <svg
        className="absolute -right-12 -top-14 w-44 h-44 opacity-10 pointer-events-none"
        viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      >
        <path fill="#FFF" d="M52.6,-65.2C66.4,-55.3,75,-37.1,77.8,-18.5C80.6,0.1,77.5,19,68.6,33.7C59.6,48.3,44.8,58.6,28.7,65.9C12.5,73.2,-5.1,77.4,-21.7,73.7C-38.4,70.1,-54.2,58.6,-64.7,43.3C-75.2,28,-80.5,8.9,-77.5,-8.6C-74.5,-26.1,-63.3,-42,-49.1,-52.5C-34.9,-63.1,-17.4,-68.4,1.4,-70.1C20.3,-71.8,40.5,-69.9,52.6,-65.2Z" transform="translate(100 100)" />
      </svg>
      <Sparkles className="absolute top-3 right-12 w-3 h-3 text-yellow-200 opacity-70 animate-pulse" style={{ animationDuration: "3s" }} aria-hidden="true" />
      <Heart className="absolute bottom-20 right-4 w-2.5 h-2.5 text-pink-200 opacity-40" aria-hidden="true" />
      {/* Grain */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='80' height='80' filter='url(%23n)'/></svg>\")",
        }}
        aria-hidden="true"
      />

      <div className="relative p-4 sm:p-5 text-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative w-7 h-7 rounded-lg bg-white/15 ring-1 ring-white/30 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="text-[10px] font-semibold text-white/85 uppercase tracking-[0.14em] leading-none mt-1">
              {T.badge}
            </div>
          </div>
          <Link
            to="/dashboard/provider?tab=red&subtab=invites"
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-white/85 hover:text-white transition group/link"
            data-testid="referral-card-see-invites"
          >
            {T.seeInvites}
            <ArrowUpRight className="w-3 h-3 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" />
          </Link>
        </div>

        {/* Punchy headline (white + shadow for readability) */}
        <h3
          className="font-extrabold tracking-tight leading-tight mt-3 text-white"
          style={{
            fontSize: "clamp(14px, 2.9vw, 16px)",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            letterSpacing: "-0.005em",
            textShadow: "0 1px 6px rgba(155, 47, 0, 0.4)",
          }}
          data-testid="referral-card-headline"
        >
          {headlineCopy}
        </h3>

        {/* Sprint A — Pulsing "🔥 Te falta 1" urgency badge */}
        {almostThere && (
          <div
            className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-300/95 text-amber-900 text-[10px] font-extrabold uppercase tracking-wider shadow-md ring-1 ring-yellow-200"
            style={{ animation: "rpc-pulse 1.6s ease-in-out infinite" }}
            data-testid="referral-card-almost-there"
          >
            <span className="text-sm leading-none">🔥</span>
            {lang === "es" ? "¡Te falta 1!" : "1 to go!"}
          </div>
        )}

        {/* Progress with milestone dots */}
        <div className="mt-3" data-testid="referral-card-progress">
          <div className="flex items-center justify-between text-[10px] text-white/85 mb-1">
            <span className="inline-flex items-center gap-1">
              <UserPlus className="w-2.5 h-2.5" /> {T.progressOf}
            </span>
            <span className="font-mono font-bold tabular-nums">
              {inCycle}/{summary.ratio}
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-white to-yellow-100 transition-all duration-700 ease-out"
              style={{
                width: `${progressPct}%`,
                boxShadow: "0 0 8px rgba(255,255,255,0.5)",
              }}
            />
            {/* Shimmer overlay when partial progress */}
            {progressPct > 0 && progressPct < 100 && (
              <div
                className="absolute top-0 h-full w-1/3 pointer-events-none"
                style={{
                  left: `${Math.max(0, progressPct - 33)}%`,
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                  animation: "rpc-shimmer 2.2s linear infinite",
                }}
              />
            )}
          </div>
          {/* Milestone dots */}
          <div className="flex justify-between mt-1 px-0.5">
            {Array.from({ length: summary.ratio }).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ring-1 ring-white/40 transition ${i < inCycle ? "bg-white shadow-sm" : "bg-white/20"}`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        {/* Stats row — compact, icon-led */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-black/15 backdrop-blur-sm p-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <UserPlus className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-white/65 leading-none">{T.friendsPaid}</div>
              <div className="text-[18px] font-extrabold leading-tight tabular-nums" data-testid="referral-card-paid-count">
                {summary.paid_count}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0 border-l border-white/10 pl-2">
            <div className="relative w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              {milestonesEarned > 0 ? (
                <>
                  <Trophy className="w-3.5 h-3.5 text-yellow-200" />
                  <Sparkles className="absolute -top-1 -right-1 w-2.5 h-2.5 text-yellow-100 animate-pulse" style={{ animationDuration: "1.8s" }} />
                </>
              ) : (
                <Gift className="w-3.5 h-3.5 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-white/65 leading-none">{T.monthsEarned}</div>
              <div className="text-[18px] font-extrabold leading-tight tabular-nums" data-testid="referral-card-months-earned">
                {milestonesEarned}
              </div>
            </div>
          </div>
        </div>

        {/* Link bar with Link2 icon prefix */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-white/70 mb-1">
            <Link2 className="w-2.5 h-2.5" /> <span>{T.shareLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="flex-1 min-w-0 bg-black/25 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-white/95 truncate select-all"
              data-testid="referral-card-link"
              title={shareUrl}
            >
              {shortUrl}
            </div>
            <button
              type="button"
              onClick={copyLink}
              className={`shrink-0 inline-flex items-center gap-1 font-semibold text-[11px] px-2.5 py-1.5 rounded-lg transition-all ${
                copied
                  ? "bg-emerald-400 text-white scale-95"
                  : "bg-white text-orange-600 hover:bg-orange-50 active:scale-95"
              }`}
              data-testid="referral-card-copy"
              aria-label={T.copy}
            >
              {copied ? (
                <><Check className="w-3 h-3" /> {T.copied}</>
              ) : (
                <><Copy className="w-3 h-3" /> {T.copy}</>
              )}
            </button>
          </div>
        </div>

        {/* Share buttons row — smaller */}
        <div className="flex gap-1.5 mt-2.5">
          <button
            type="button"
            onClick={shareWa}
            className="flex-1 inline-flex items-center justify-center gap-1 bg-[#25D366] hover:bg-[#1FAD51] active:scale-95 text-white font-semibold text-[11px] py-2 rounded-lg transition"
            data-testid="referral-card-share-wa"
          >
            <MessageCircle className="w-3 h-3" /> {T.waLabel}
          </button>
          <button
            type="button"
            onClick={shareNative}
            className="flex-1 inline-flex items-center justify-center gap-1 bg-white/15 hover:bg-white/25 active:scale-95 text-white font-semibold text-[11px] py-2 rounded-lg transition"
            data-testid="referral-card-share-native"
          >
            <Share2 className="w-3 h-3" /> {T.shareLabel2}
          </button>
        </div>

        {/* Tagline with star accents */}
        <p
          className="flex items-center justify-center gap-1.5 text-[10px] text-white/65 italic mt-3"
          data-testid="referral-card-tagline"
        >
          <Sparkles className="w-2.5 h-2.5 text-yellow-200" />
          <span>{T.appIsYours}</span>
          <Sparkles className="w-2.5 h-2.5 text-yellow-200" />
        </p>
      </div>

      <style>{`
        @keyframes rpc-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes rpc-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(253, 224, 71, 0.6); }
          50% { transform: scale(1.06); box-shadow: 0 0 0 6px rgba(253, 224, 71, 0); }
        }
      `}</style>
    </div>
  );
}
