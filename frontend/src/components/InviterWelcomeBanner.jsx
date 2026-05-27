import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, X, UserCheck, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { resolveAvatar } from "../lib/avatar";

/**
 * InviterWelcomeBanner — Sprint A / Section 84.
 *
 * Shows once on AppHome for a brand-new user who signed up via /r/{code}.
 * Communicates: WHO invited them + the GIFT (1st month Pro free).
 *
 * Sources of truth:
 *   - GET  /api/user-referrals/me/inviter
 *   - POST /api/user-referrals/me/dismiss-banner
 *
 * Renders nothing if:
 *   - user has no inviter (organic signup)
 *   - banner already dismissed
 *   - data still loading
 */
export default function InviterWelcomeBanner() {
  const { lang } = useI18n();
  const [data, setData] = useState(null);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.get("/user-referrals/me/inviter")
      .then((r) => { if (mounted) setData(r.data); })
      .catch(() => { if (mounted) setData(null); });
    return () => { mounted = false; };
  }, []);

  if (!data || !data.inviter || data.banner_dismissed) return null;

  const inv = data.inviter;
  const displayName = inv.business_name || inv.name || "Un amigo";
  const avatarUrl = resolveAvatar({
    picture: inv.picture,
    logo_url: inv.logo_url,
    user_id: inv.user_id,
    name: displayName,
  });

  const T = lang === "es" ? {
    invitedBy: "Te invitó",
    headline: "Tu primer mes Pro es GRATIS 🎁",
    body: "Te damos 30 días para que pruebes todo sin pagar.",
    viewProfile: "Ver perfil",
    activate: "Activar mi plan",
    dismiss: "Cerrar",
    autoFollow: "Ya lo sigues",
  } : {
    invitedBy: "Invited by",
    headline: "Your first Pro month is FREE 🎁",
    body: "30 days to try everything with no charge.",
    viewProfile: "View profile",
    activate: "Activate my plan",
    dismiss: "Dismiss",
    autoFollow: "You follow them",
  };

  const dismiss = async () => {
    setHiding(true);
    try { await api.post("/user-referrals/me/dismiss-banner"); }
    catch { /* non-blocking */ }
    setTimeout(() => setData({ ...data, banner_dismissed: true }), 250);
  };

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-orange-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 transition-all duration-300 ${hiding ? "opacity-0 -translate-y-1" : "opacity-100"}`}
      data-testid="inviter-welcome-banner"
    >
      <Sparkles className="absolute top-2 right-10 w-3 h-3 text-amber-400 animate-pulse pointer-events-none" style={{ animationDuration: "2.4s" }} aria-hidden="true" />
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-white/60 hover:text-slate-800 transition"
        aria-label={T.dismiss}
        data-testid="inviter-banner-dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="p-4 sm:p-5 flex items-center gap-4">
        {/* Inviter avatar with gift ring */}
        <Link
          to={inv.slug ? `/provider/${inv.slug}` : "#"}
          className="relative flex-shrink-0"
          data-testid="inviter-banner-avatar-link"
        >
          <div className="absolute inset-0 rounded-full ring-2 ring-amber-300 animate-pulse" style={{ animationDuration: "2.6s" }} aria-hidden="true" />
          <img
            src={avatarUrl}
            alt={displayName}
            loading="lazy"
            className="relative w-14 h-14 rounded-full object-cover border-2 border-white shadow-md"
          />
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow">
            <UserCheck className="w-3 h-3" />
          </span>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-orange-700 font-semibold flex items-center gap-1">
            <Gift className="w-3 h-3" /> {T.invitedBy}
          </div>
          {inv.slug ? (
            <Link to={`/provider/${inv.slug}`} className="block font-bold text-slate-900 truncate hover:underline" data-testid="inviter-banner-name">
              {displayName}
            </Link>
          ) : (
            <div className="font-bold text-slate-900 truncate" data-testid="inviter-banner-name">{displayName}</div>
          )}
          <div className="text-sm font-semibold text-orange-700 mt-0.5">{T.headline}</div>
          <p className="text-xs text-slate-600 mt-0.5 leading-snug hidden sm:block">{T.body}</p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-700 font-medium">
            <UserCheck className="w-3 h-3" /> {T.autoFollow}
          </div>
        </div>
      </div>
    </div>
  );
}
