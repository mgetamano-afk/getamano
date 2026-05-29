import { useEffect, useState } from "react";
import {
  Gift,
  Share2,
  CheckCircle2,
  Clock3,
  Sparkles,
  Copy,
  ExternalLink,
  TrendingUp,
  Lock,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { resolveAvatar } from "../lib/avatar";

/**
 * MyInvitesPanel — "Refer 2 = 1 month free" program dashboard.
 *
 * Lives inside MiRedPage as the "Invitaciones / Invites" tab. Shows:
 *  · The mechanic ("Refer 2 paid = 1 free month, max 10 → 1 year, referee
 *    gets first month free")
 *  · Progress toward the next milestone with milestone dots
 *  · Stats: registered / paid / months_earned / dollars_saved
 *  · Shareable referral link with QR + copy button
 *  · List of invited users with status pill (registered / paid / credited)
 *
 * Data sources:
 *   GET /api/user-referrals/me        → summary + counts + needed_for_next
 *   GET /api/user-referrals/me/invites → list of referrals
 */
const MAX_MILESTONES = 6; // 6 milestones * 2 referees = 12 paid → 12 months → 1 year cap

export default function MyInvitesPanel() {
  const { lang } = useI18n();
  const [summary, setSummary] = useState(null);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/user-referrals/me"),
      api.get("/user-referrals/me/invites"),
    ])
      .then(([s, i]) => {
        setSummary(s.data);
        setInvites(i.data || []);
      })
      .catch(() => { /* keep empty */ })
      .finally(() => setLoading(false));
  }, []);

  const T = lang === "en" ? {
    title: "My invites",
    subtitle: "Refer friends, earn free months of Pro.",
    mechanicTitle: "How it works",
    mechanic1: "Share your link with friends in the trade",
    mechanic2: "When 2 of them subscribe to Pro, you earn 1 free month",
    mechanic3: "Stack up to 12 free months (a whole year) — cap at 10 paid invites",
    mechanic4: "Each friend gets their first month FREE on activation",
    progressTitle: "Progress to next free month",
    nextMilestone: (n) => `${n} more friend${n === 1 ? "" : "s"} = 1 free month`,
    capReached: "🏆 Max reached — you've earned a full year",
    statRegistered: "Registered",
    statPaid: "Paid Pro",
    statMonths: "Free months earned",
    statSaved: "Dollars saved",
    yourLink: "Your invite link",
    copy: "Copy link",
    copied: "Link copied!",
    share: "Share",
    shareText: (link) => `Únete a getamano y obtén tu primer mes Pro GRATIS con mi link: ${link}`,
    invitesTitle: "People you've invited",
    empty: "Start sharing your link — your network is your superpower.",
    statusRegistered: "Registered",
    statusPaid: "Paid · counts!",
    statusCredited: "Credited 🎁",
  } : {
    title: "Mis invitaciones",
    subtitle: "Invita amigos, gana meses gratis de Pro.",
    mechanicTitle: "Cómo funciona",
    mechanic1: "Comparte tu link con amigos del rubro",
    mechanic2: "Cuando 2 de ellos se suscriben a Pro, ganas 1 mes gratis",
    mechanic3: "Apila hasta 12 meses gratis (un año entero) — máximo 10 invitados pagos",
    mechanic4: "Cada amigo recibe su primer mes GRATIS al activar",
    progressTitle: "Progreso al próximo mes gratis",
    nextMilestone: (n) => `${n} amigo${n === 1 ? "" : "s"} más = 1 mes gratis`,
    capReached: "🏆 Máximo alcanzado — ganaste un año completo",
    statRegistered: "Registrados",
    statPaid: "Pagaron Pro",
    statMonths: "Meses gratis ganados",
    statSaved: "Dólares ahorrados",
    yourLink: "Tu link de invitación",
    copy: "Copiar link",
    copied: "¡Link copiado!",
    share: "Compartir",
    shareText: (link) => `Únete a getamano y obtén tu primer mes Pro GRATIS con mi link: ${link}`,
    invitesTitle: "Personas que has invitado",
    empty: "Empieza a compartir tu link — tu red es tu superpoder.",
    statusRegistered: "Registrado",
    statusPaid: "Pagó · ¡cuenta!",
    statusCredited: "Acreditado 🎁",
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center text-sm text-slate-500" data-testid="my-invites-loading">
        {lang === "en" ? "Loading…" : "Cargando…"}
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center text-sm text-slate-500">
        {lang === "en" ? "Couldn't load invites." : "No se pudo cargar."}
      </div>
    );
  }

  // Derive share URL from API. Backend returns share_path + ref_code; we
  // build the full origin-anchored URL here so the link works no matter
  // which preview domain we're on.
  const shareUrl = summary.share_url
    || (summary.share_path ? `${window.location.origin}${summary.share_path}` : null)
    || (summary.ref_code ? `${window.location.origin}/r/${summary.ref_code}` : "");

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(T.copied);
    } catch {
      toast.error(lang === "en" ? "Copy failed" : "No se pudo copiar");
    }
  };

  const shareLink = async () => {
    if (!shareUrl) return;
    const text = T.shareText(shareUrl);
    if (navigator.share) {
      try {
        await navigator.share({ title: "getamano", text, url: shareUrl });
        return;
      } catch { /* user cancelled */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const paidCount = summary.paid_count || 0;
  const registeredOnly = (summary.registered_count || 0) - paidCount;
  const monthsEarned = summary.free_months_earned ?? summary.milestones_earned ?? 0;
  const dollarsSaved = monthsEarned * 15;     // Pro = $15/mo
  const neededForNext = summary.needed_for_next || 0;
  const capReached = monthsEarned >= MAX_MILESTONES * 2;  // 12 months

  // Build milestone dots 1..MAX_MILESTONES (each = 2 paid referees)
  const dots = Array.from({ length: MAX_MILESTONES }, (_, i) => i + 1);

  return (
    <div className="space-y-4" data-testid="my-invites-panel">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #F97316 0%, #DC2626 100%)" }}
          >
            <Gift className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-extrabold text-slate-900 text-lg leading-tight" data-testid="my-invites-title">
              {T.title}
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">{T.subtitle}</p>
          </div>
        </div>

        {/* Mechanic explainer */}
        <div className="mt-4 rounded-xl p-4 space-y-2" style={{ background: "#FFF8EA", border: "1px solid #FCD34D" }} data-testid="my-invites-mechanic">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#B45309" }}>
            <Sparkles className="w-3 h-3 inline mr-1" /> {T.mechanicTitle}
          </p>
          <ul className="space-y-1.5 text-sm text-slate-800">
            <li className="flex items-start gap-2"><span className="font-bold mt-0.5" style={{ color: "#F97316" }}>1.</span><span>{T.mechanic1}</span></li>
            <li className="flex items-start gap-2"><span className="font-bold mt-0.5" style={{ color: "#F97316" }}>2.</span><span>{T.mechanic2}</span></li>
            <li className="flex items-start gap-2"><span className="font-bold mt-0.5" style={{ color: "#F97316" }}>3.</span><span>{T.mechanic3}</span></li>
            <li className="flex items-start gap-2"><span className="font-bold mt-0.5" style={{ color: "#10B981" }}>★</span><span className="font-semibold">{T.mechanic4}</span></li>
          </ul>
        </div>
      </div>

      {/* Progress to next milestone */}
      <div
        className="rounded-2xl p-5 text-white shadow-md relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #03045E 0%, #014a52 100%)" }}
        data-testid="my-invites-progress"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
            <TrendingUp className="w-3 h-3 inline mr-1" /> {T.progressTitle}
          </p>
          {capReached && <span className="text-[11px] font-bold bg-yellow-300/20 text-yellow-100 rounded-full px-2 py-0.5">{T.capReached}</span>}
        </div>
        <p className="text-2xl font-extrabold mb-3" data-testid="my-invites-progress-headline">
          {capReached
            ? "🏆"
            : `${paidCount} / ${(Math.floor(paidCount / 2) + 1) * 2}`}
          {!capReached && (
            <span className="text-sm font-semibold ml-2 text-white/80">
              ({T.nextMilestone(neededForNext)})
            </span>
          )}
        </p>
        {/* Milestone dots */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {dots.map((m) => {
            const target = m * 2;
            const reached = paidCount >= target;
            const current = !reached && paidCount >= (m - 1) * 2;
            return (
              <div key={m} className="flex flex-col items-center" data-testid={`milestone-dot-${m}`}>
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-extrabold border-2 transition-all ${
                    reached ? "bg-yellow-300 text-amber-900 border-yellow-200 shadow-lg" :
                    current ? "bg-white/15 border-white/40 text-white animate-pulse" :
                    "bg-white/5 border-white/15 text-white/40"
                  }`}
                  style={{ animationDuration: "2s" }}
                >
                  {reached ? "✓" : `${target}`}
                </div>
                <span className={`text-[9px] mt-1 font-semibold ${reached ? "text-yellow-200" : "text-white/50"}`}>
                  {m}{lang === "en" ? "mo" : "m"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="my-invites-stats">
        <Stat icon={Clock3} color="#0EA5E9" label={T.statRegistered} value={registeredOnly} testid="stat-registered" />
        <Stat icon={CheckCircle2} color="#10B981" label={T.statPaid} value={paidCount} testid="stat-paid" />
        <Stat icon={Gift} color="#F97316" label={T.statMonths} value={monthsEarned} testid="stat-months" />
        <Stat icon={Trophy} color="#D97706" label={T.statSaved} value={`$${dollarsSaved}`} testid="stat-saved" />
      </div>

      {/* Share link */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4" data-testid="my-invites-share">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
          {T.yourLink}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-mono text-slate-700 truncate" data-testid="my-invites-link-display">
            {shareUrl || "—"}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50 active:scale-95 transition"
              data-testid="my-invites-copy-btn"
            >
              <Copy className="w-4 h-4" /> {T.copy}
            </button>
            <button
              type="button"
              onClick={shareLink}
              className="inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl text-white text-sm font-bold transition active:scale-95 hover:brightness-110"
              style={{ background: "#10B981" }}
              data-testid="my-invites-share-btn"
            >
              <Share2 className="w-4 h-4" /> {T.share}
            </button>
          </div>
        </div>
      </div>

      {/* Invite list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4" data-testid="my-invites-list">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
          {T.invitesTitle} <span className="text-slate-400">({invites.length})</span>
        </p>
        {invites.length === 0 ? (
          <div className="py-6 text-center">
            <Lock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">{T.empty}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invites.map((inv) => {
              const r = inv.referee || {};
              const status = inv.status || "registered";
              const avatar = resolveAvatar({
                picture: r.picture,
                user_id: r.user_id,
                name: r.name,
              });
              return (
                <li key={inv.referral_id} className="py-2.5 flex items-center gap-3" data-testid={`invite-row-${inv.referral_id}`}>
                  <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{r.name || (lang === "en" ? "Friend" : "Amigo")}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {new Date(inv.created_at).toLocaleDateString(lang === "en" ? "en-US" : "es-ES", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <StatusPill status={status} T={T} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, color, label, value, testid }) {
  return (
    <div className="bg-white rounded-xl p-3 ring-1 ring-slate-100 shadow-sm" data-testid={testid}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] uppercase tracking-wide font-bold text-slate-500">{label}</span>
      </div>
      <div className="text-xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

function StatusPill({ status, T }) {
  const map = {
    registered: { bg: "#FEF3C7", color: "#B45309", label: T.statusRegistered },
    paid:       { bg: "#D1FAE5", color: "#047857", label: T.statusPaid },
    credited:   { bg: "#FFE4E6", color: "#BE185D", label: T.statusCredited },
  };
  const m = map[status] || map.registered;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
      style={{ background: m.bg, color: m.color }}
    >
      {m.label}
    </span>
  );
}
