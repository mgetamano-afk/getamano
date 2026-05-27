import { useEffect, useState } from "react";
import { Heart, MessageCircle, X, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { resolveAvatar } from "../lib/avatar";

const DISMISS_KEY = "thank_inviter_modal_dismissed_v1";

/**
 * ThankInviterModal — Sprint A / Section 84.
 *
 * Fires on AppHome ONCE when:
 *   1. The user has an inviter (signup via /r/{code})
 *   2. The user just activated their first Pro month (can_thank=true)
 *   3. They have not already thanked AND haven't dismissed this session
 *
 * UX: opens a celebratory modal with the inviter's photo + a one-tap
 * "Send thanks via WhatsApp" CTA (also writes an internal notification
 * via /user-referrals/me/send-thanks). Closes the social loop.
 */
export default function ThankInviterModal() {
  const { lang } = useI18n();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) return;
    let mounted = true;
    api.get("/user-referrals/me/inviter")
      .then((r) => {
        if (!mounted) return;
        setData(r.data);
        if (r.data?.inviter && r.data?.can_thank) {
          // Small delay so it doesn't appear at the same moment as the
          // page paint — feels less aggressive.
          setTimeout(() => setOpen(true), 1200);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const T = lang === "es" ? {
    title: "🎉 ¡Tu plan Pro está activo!",
    subtitle: "Gracias a esta persona, tu primer mes va gratis.",
    sendWa: "Agradecer por WhatsApp",
    sendApp: "Agradecer en getamano",
    later: "Después",
    thanked: "¡Gracias enviadas! 💚",
    waText: (name) => `¡Hola ${name}! Acabo de activar mi plan Pro en getamano gracias a tu invitación. Te agradezco — la app está increíble. 🙌`,
  } : {
    title: "🎉 Your Pro plan is active!",
    subtitle: "Thanks to this person, your first month is free.",
    sendWa: "Thank via WhatsApp",
    sendApp: "Thank in getamano",
    later: "Later",
    thanked: "Thanks sent! 💚",
    waText: (name) => `Hi ${name}! I just activated my Pro plan on getamano thanks to your invite. Really appreciate it — the app is great. 🙌`,
  };

  if (!open || !data?.inviter) return null;

  const inv = data.inviter;
  const displayName = inv.business_name || inv.name || (lang === "es" ? "tu amigo" : "your friend");
  const firstName = (inv.name || displayName).split(" ")[0];
  const avatarUrl = resolveAvatar({
    picture: inv.picture,
    logo_url: inv.logo_url,
    user_id: inv.user_id,
    name: displayName,
  });

  const close = () => {
    if (typeof window !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  const doInternalThank = async () => {
    setSending(true);
    try {
      await api.post("/user-referrals/me/send-thanks");
      setSent(true);
      toast.success(T.thanked);
      setTimeout(close, 1600);
    } catch {
      toast.error(lang === "es" ? "No se pudo enviar" : "Could not send");
    } finally {
      setSending(false);
    }
  };

  const doWhatsappThank = async () => {
    // Always also record the internal thank — so the inviter sees the
    // in-app + push + sent.dm notification even if they don't read WA.
    await doInternalThank().catch(() => {});
    const message = T.waText(firstName);
    const wa = inv.phone
      ? `https://wa.me/${String(inv.phone).replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-in fade-in"
      onClick={close}
      role="dialog"
      aria-modal="true"
      data-testid="thank-inviter-modal"
    >
      <div
        className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "thx-pop 280ms cubic-bezier(.34,1.56,.64,1)" }}
      >
        <button
          type="button"
          onClick={close}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/70 hover:bg-white shadow flex items-center justify-center text-slate-600"
          aria-label="Close"
          data-testid="thank-inviter-close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hero band with confetti-ish gradient */}
        <div
          className="relative h-28 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #FB923C 0%, #F472B6 60%, #C084FC 100%)" }}
        >
          {/* floating hearts */}
          {[...Array(5)].map((_, i) => (
            <Heart
              key={i}
              className="absolute text-white/40 animate-bounce"
              style={{
                left: `${10 + i * 18}%`,
                top: `${i % 2 === 0 ? 20 : 50}%`,
                animationDelay: `${i * 0.15}s`,
                animationDuration: "1.8s",
                width: `${10 + (i % 3) * 4}px`,
                height: `${10 + (i % 3) * 4}px`,
              }}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* Inviter avatar overlap */}
        <div className="-mt-12 flex justify-center">
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
          />
        </div>

        <div className="px-6 pt-3 pb-6 text-center">
          <h2 className="text-lg font-extrabold text-slate-900" data-testid="thank-inviter-title">{T.title}</h2>
          <p className="text-sm text-slate-600 mt-1">{T.subtitle}</p>
          <div className="font-bold text-slate-900 mt-2" data-testid="thank-inviter-name">{displayName}</div>

          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={doWhatsappThank}
              disabled={sending || sent}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1FAD51] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-xl transition active:scale-95"
              data-testid="thank-inviter-wa"
            >
              {sent ? <Check className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
              {sent ? T.thanked : T.sendWa}
            </button>
            <button
              type="button"
              onClick={doInternalThank}
              disabled={sending || sent}
              className="w-full inline-flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 text-rose-700 font-semibold text-sm py-2.5 rounded-xl transition active:scale-95"
              data-testid="thank-inviter-app"
            >
              <Heart className="w-4 h-4" /> {T.sendApp}
            </button>
            <button
              type="button"
              onClick={close}
              className="w-full text-xs text-slate-500 hover:text-slate-700 py-1"
              data-testid="thank-inviter-later"
            >
              {T.later}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes thx-pop {
            0% { opacity: 0; transform: scale(.9) translateY(20px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
