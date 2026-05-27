import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Users, Share2, Copy, Check, ArrowRight, Gift, MessageCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * ReferralProgressCard — Section 72.
 *
 * "Refer 2 friends → 1 free month" progress widget for the AppHome of
 * providers. Sits next to EarningsWidget. Auto-hides for non-providers.
 *
 * Shows:
 *   - Headline copy with the next milestone framing.
 *   - Progress bar 0/2 → 1/2 → 2/2 (resets each milestone).
 *   - Big stat: paid count + free months earned.
 *   - Unique share link + share buttons (WhatsApp, copy).
 *
 * Tap-through → /dashboard/provider?tab=red&subtab=invites for the full
 * invites list with status badges.
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
    friendsPaid: "Amigos suscritos",
    monthsEarned: "Meses gratis ganados",
    shareLabel: "Tu link único · cópialo y compártelo",
    copy: "Copiar",
    copied: "¡Copiado!",
    shareWa: "Compartir por WhatsApp",
    waText: (link) => `🌟 Únete a getamano — la app latina de servicios verificados en USA. Usando mi link, tu primer mes Pro va gratis: ${link}`,
    appIsYours: "Esta app es tuya — mereces un espacio aquí.",
  } : {
    badge: "Your network",
    progressOf: "Progress to next free month",
    seeInvites: "See invitees",
    friendsPaid: "Subscribed friends",
    monthsEarned: "Free months earned",
    shareLabel: "Your unique link · copy and share",
    copy: "Copy",
    copied: "Copied!",
    shareWa: "Share via WhatsApp",
    waText: (link) => `🌟 Join getamano — the Latino app for verified services in the USA. With my link your first Pro month is free: ${link}`,
    appIsYours: "This app is yours — you deserve a place here.",
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}${summary.share_path}`;

  // Progress bar value 0..1 — show how many more referrals needed in this cycle
  const inCycle = summary.ratio - summary.needed_for_next; // 0 or 1
  const progressPct = (inCycle / summary.ratio) * 100;

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
    const text = T.waText(shareUrl);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #F59E0B 0%, #F97316 55%, #EA580C 100%)",
        boxShadow: "0 10px 30px -8px rgba(234, 88, 12, 0.35)",
      }}
      data-testid="referral-progress-card"
    >
      <div className="p-4 sm:p-5 text-white">
        {/* Header: badge + CTA */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-[11px] font-semibold text-white/80 uppercase tracking-wider leading-none mt-1">
              {T.badge}
            </div>
          </div>
          <Link
            to="/dashboard/provider?tab=red&subtab=invites"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/80 hover:text-white"
            data-testid="referral-card-see-invites"
          >
            {T.seeInvites} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Headline */}
        <h3
          className="font-extrabold tracking-tight leading-tight mt-3"
          style={{
            fontSize: "clamp(17px, 3.4vw, 20px)",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            letterSpacing: "-0.01em",
            textShadow: "0 1px 4px rgba(0,0,0,0.12)",
          }}
          data-testid="referral-card-headline"
        >
          {summary.headline}
        </h3>

        {/* Progress bar */}
        <div className="mt-3" data-testid="referral-card-progress">
          <div className="flex items-center justify-between text-[11px] text-white/85 mb-1.5">
            <span>{T.progressOf}</span>
            <span className="font-mono font-bold">{inCycle}/{summary.ratio}</span>
          </div>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${progressPct}%`, transitionDuration: "600ms" }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/12 backdrop-blur rounded-xl px-3 py-2.5">
            <div className="text-[10px] text-white/75 leading-none">{T.friendsPaid}</div>
            <div className="text-xl font-extrabold leading-tight mt-0.5" data-testid="referral-card-paid-count">
              {summary.paid_count}
            </div>
          </div>
          <div className="bg-white/12 backdrop-blur rounded-xl px-3 py-2.5">
            <div className="text-[10px] text-white/75 leading-none flex items-center gap-1">
              <Gift className="w-3 h-3" /> {T.monthsEarned}
            </div>
            <div className="text-xl font-extrabold leading-tight mt-0.5" data-testid="referral-card-months-earned">
              {summary.free_months_earned}
            </div>
          </div>
        </div>

        {/* Share link bar */}
        <div className="mt-4">
          <div className="text-[10px] text-white/75 mb-1.5">{T.shareLabel}</div>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 min-w-0 bg-black/20 backdrop-blur rounded-lg px-3 py-2 text-[12px] font-mono text-white/95 truncate select-all"
              data-testid="referral-card-link"
            >
              {shareUrl}
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 inline-flex items-center gap-1 bg-white text-orange-600 font-semibold text-xs px-3 py-2 rounded-lg hover:bg-orange-50 transition"
              data-testid="referral-card-copy"
              aria-label={T.copy}
            >
              {copied ? (<><Check className="w-3.5 h-3.5" /> {T.copied}</>) : (<><Copy className="w-3.5 h-3.5" /> {T.copy}</>)}
            </button>
          </div>
        </div>

        {/* Share buttons row */}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={shareWa}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1FAD51] text-white font-semibold text-xs py-2.5 rounded-lg transition"
            data-testid="referral-card-share-wa"
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </button>
          <button
            type="button"
            onClick={async () => {
              if (navigator.share) {
                try {
                  await navigator.share({ title: "Únete a getamano", text: T.waText(shareUrl), url: shareUrl });
                } catch (_e) { /* user cancelled */ }
              } else {
                copyLink();
              }
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 text-white font-semibold text-xs py-2.5 rounded-lg transition"
            data-testid="referral-card-share-native"
          >
            <Share2 className="w-3.5 h-3.5" /> {T.shareWa.split(" ")[0]}
          </button>
        </div>

        {/* Motivational tagline */}
        <p className="text-[10px] text-white/65 italic mt-3 text-center" data-testid="referral-card-tagline">
          {T.appIsYours}
        </p>
      </div>
    </div>
  );
}
