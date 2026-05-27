import { useEffect, useState } from "react";
import { Star, Heart, Share2, X, Sparkles, MessageCircle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../contexts/I18nContext";

/**
 * ReviewThankYouModal — Section 82.
 *
 * Fires after a client submits a 5-star review. Two goals:
 *   1. Acknowledge the social/community angle ("you just supported a
 *      Latino provider — gracias").
 *   2. Convert that good will into amplification: native-share / WhatsApp /
 *      copy-link CTAs that re-share the provider's eCard.
 *
 * Each share contains a tracking ref parameter so the provider can later
 * see "thanks to this review, X new visits arrived" (future analytics
 * pass — already in the share URL).
 *
 * Props:
 *   open: boolean — show/hide
 *   provider: { business_name, slug, logo_url, city, state }
 *   onClose: () => void
 *   rating: number (only shown if 5)
 */
export default function ReviewThankYouModal({ open, provider, onClose, rating = 5 }) {
  const { lang } = useI18n();
  const [copied, setCopied] = useState(false);
  // Animated mount/unmount
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) setVisible(true);
  }, [open]);

  if (!visible || !provider) return null;

  const T = lang === "es" ? {
    title: "¡Gracias por apoyar!",
    subtitle: `Tu reseña de 5⭐ a ${provider.business_name || "tu proveedor"} ayuda a que más gente de la comunidad confíe.`,
    tagline: "Esta app es nuestra. Cada reseña construye comunidad.",
    shareCta: "¿Quieres compartirlo con un amigo?",
    waBtn: "Recomendar por WhatsApp",
    shareBtn: "Compartir",
    copyBtn: "Copiar link",
    copied: "¡Copiado!",
    close: "Cerrar",
    waText: (name, link) => `🌟 Acabo de contratar a ${name} en getamano y fue una excelente experiencia. Te lo recomiendo: ${link}`,
  } : {
    title: "Thanks for the love!",
    subtitle: `Your 5⭐ review of ${provider.business_name || "this provider"} helps the community trust them.`,
    tagline: "This app is ours. Every review builds community.",
    shareCta: "Want to share with a friend?",
    waBtn: "Recommend via WhatsApp",
    shareBtn: "Share",
    copyBtn: "Copy link",
    copied: "Copied!",
    close: "Close",
    waText: (name, link) => `🌟 I just hired ${name} on getamano and it was a great experience. Highly recommend: ${link}`,
  };

  const backend = process.env.REACT_APP_BACKEND_URL || (typeof window !== "undefined" ? window.location.origin : "");
  // Use the OG-rich endpoint so WhatsApp / iMessage / Facebook get the dynamic preview
  // (Section 65). Adds `?ref=review` so the provider can later attribute traffic.
  const shareUrl = `${backend}/api/og/p/${provider.slug}?ref=review`;
  const humanUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/p/${provider.slug}`;

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  const onWa = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(T.waText(provider.business_name || "tu proveedor", shareUrl))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const onShareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: provider.business_name,
          text: T.waText(provider.business_name || "tu proveedor", shareUrl),
          url: shareUrl,
        });
      } catch (_e) { /* user cancelled */ }
    } else {
      copy();
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      toast.success(T.copied);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={{
        background: "rgba(15, 23, 42, 0.5)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: open ? "rtm-fade-in 280ms ease-out both" : "rtm-fade-out 200ms ease-in both",
      }}
      onClick={handleClose}
      data-testid="review-thank-you-modal"
    >
      <style>{`
        @keyframes rtm-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rtm-fade-out { from { opacity: 1 } to { opacity: 0 } }
        @keyframes rtm-card-in {
          0%   { opacity: 0; transform: scale(0.85) translateY(20px); }
          60%  { opacity: 1; transform: scale(1.03) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes rtm-heart-beat {
          0%, 100% { transform: scale(1); }
          25%      { transform: scale(1.15); }
          50%      { transform: scale(1); }
          75%      { transform: scale(1.1); }
        }
        @keyframes rtm-star-pop {
          0%   { opacity: 0; transform: scale(0) rotate(-45deg); }
          50%  { opacity: 1; transform: scale(1.3) rotate(8deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes rtm-sparkle-twinkle {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>

      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: "rtm-card-in 480ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center z-10 transition"
          aria-label={T.close}
          data-testid="review-modal-close"
        >
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {/* Hero */}
        <div
          className="relative px-6 pt-8 pb-5 text-center overflow-hidden"
          style={{ background: "linear-gradient(135deg, #FCE7F3 0%, #FED7AA 60%, #FEF3C7 100%)" }}
        >
          {/* Floating sparkles for depth */}
          <Sparkles className="absolute top-3 left-6 w-3 h-3 text-amber-500" style={{ animation: "rtm-sparkle-twinkle 2.4s ease-in-out infinite" }} aria-hidden="true" />
          <Sparkles className="absolute top-5 right-10 w-2.5 h-2.5 text-pink-500" style={{ animation: "rtm-sparkle-twinkle 2.4s ease-in-out 0.6s infinite" }} aria-hidden="true" />
          <Sparkles className="absolute bottom-8 left-12 w-2.5 h-2.5 text-orange-400" style={{ animation: "rtm-sparkle-twinkle 2.4s ease-in-out 1.2s infinite" }} aria-hidden="true" />

          {/* Heart icon */}
          <div className="relative inline-block">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #F472B6 0%, #EC4899 60%, #DB2777 100%)",
                boxShadow: "0 10px 30px -8px rgba(219, 39, 119, 0.45)",
                animation: "rtm-heart-beat 1.6s ease-in-out infinite",
              }}
            >
              <Heart className="w-8 h-8 text-white fill-white" strokeWidth={2} />
            </div>
            {/* 5 stars pop in around the heart */}
            {rating === 5 && [...Array(5)].map((_, i) => {
              const angle = -90 + (i * 72);  // pentagon arrangement
              const rad = (angle * Math.PI) / 180;
              const dx = Math.cos(rad) * 44;
              const dy = Math.sin(rad) * 44;
              return (
                <Star
                  key={i}
                  className="absolute w-4 h-4 fill-amber-400 text-amber-400"
                  style={{
                    left: "50%",
                    top: "50%",
                    transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
                    animation: `rtm-star-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${300 + i * 80}ms both`,
                  }}
                  aria-hidden="true"
                />
              );
            })}
          </div>

          <h2
            className="font-extrabold text-slate-900 mt-5 tracking-tight"
            style={{ fontSize: "clamp(20px, 5vw, 24px)", letterSpacing: "-0.01em" }}
            data-testid="review-modal-title"
          >
            {T.title}
          </h2>
          <p className="text-sm text-slate-600 mt-2 px-2 leading-snug">{T.subtitle}</p>
        </div>

        {/* Body */}
        <div className="px-6 pt-5 pb-6">
          <p className="text-[12px] italic text-center text-slate-500 mb-4 leading-snug">
            ✨ {T.tagline} ✨
          </p>

          <div className="mb-3 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {T.shareCta}
            </div>
          </div>

          {/* Share buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onWa}
              className="inline-flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1FAD51] active:scale-[0.98] text-white font-semibold text-sm py-3 rounded-full shadow-sm transition"
              data-testid="review-modal-wa"
            >
              <MessageCircle className="w-4 h-4" /> {T.waBtn}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onShareNative}
                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-semibold text-sm py-2.5 rounded-full transition"
                data-testid="review-modal-share"
              >
                <Share2 className="w-3.5 h-3.5" /> {T.shareBtn}
              </button>
              <button
                type="button"
                onClick={copy}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 font-semibold text-sm py-2.5 rounded-full transition active:scale-[0.98] ${
                  copied
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
                data-testid="review-modal-copy"
              >
                {copied ? <><Check className="w-3.5 h-3.5" /> {T.copied}</> : <><Copy className="w-3.5 h-3.5" /> {T.copyBtn}</>}
              </button>
            </div>
          </div>

          {/* Display the link being shared (transparency) */}
          <div className="mt-3 text-center">
            <div className="text-[10px] text-slate-400 font-mono truncate" title={humanUrl}>
              {humanUrl}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
