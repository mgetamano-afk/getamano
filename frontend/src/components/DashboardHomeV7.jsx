import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Eye, MessageCircle, Inbox, Plus, Film, Star, Award, Trash2,
  Image as ImageIcon, ArrowRight, Sparkles, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { buildFileUrl } from "./ImageUpload";

/**
 * DashboardHomeV7 — Provider dashboard "Inicio" landing.
 *
 * Implements the 7-section layout from the V7 rebuild prompt:
 *   1. Greeting + 3 metric tiles (Vistas hoy / Mensajes / Solicitudes)
 *   2. Completitud de perfil (0–100, NO "BAJO" tier label)
 *   3. Portafolio strip (0/12 + thumbnails + add tile)
 *   4. Mis Reels strip (latest 4 + add tile)
 *   5. Actividad reciente (latest events)
 *   6. Programa de referidos (live $ + clipboard)
 *   7. Destacar mi perfil (Featured slot CTA — paid placeholder)
 *
 * The component reuses the existing Provider profile object passed by
 * the parent so we never re-fetch unnecessarily, and pulls light
 * supplemental data (portfolio thumbnails, recent reels, recent
 * activity) lazily.
 */

const TIER_LABELS_BY_PCT = (pct, lang) => {
  // V7 brief explicitly forbids the BAJO/MEDIO/ALTO tier label. Surface
  // a soft progress hint instead.
  if (pct >= 90) return lang === "en" ? "Profile looks great" : "¡Tu perfil se ve genial!";
  if (pct >= 70) return lang === "en" ? "Almost there" : "Vas casi al 100";
  if (pct >= 50) return lang === "en" ? "Keep going" : "Vas avanzando";
  if (pct >= 25) return lang === "en" ? "A few quick wins to go" : "Solo te faltan unos pasos";
  return lang === "en" ? "Let's complete your profile" : "Empecemos a completar tu perfil";
};

function calcCompleteness(profile) {
  if (!profile) return { pct: 0, items: [] };
  // Pragmatic 8-point checklist that mirrors the V7 prompt brief.
  const items = [
    { id: "photo",   label_es: "Foto de perfil",      label_en: "Profile photo",     done: !!profile.logo_url || !!profile.photo_url },
    { id: "cover",   label_es: "Portada",             label_en: "Cover image",       done: !!profile.cover_url },
    { id: "bio",     label_es: "Descripción",         label_en: "Bio",               done: !!(profile.about || profile.bio) },
    { id: "phone",   label_es: "Teléfono / WhatsApp", label_en: "Phone / WhatsApp",  done: !!profile.phone },
    { id: "city",    label_es: "Ciudad",              label_en: "City",              done: !!profile.city },
    { id: "rates",   label_es: "Tarifas",             label_en: "Pricing",           done: Array.isArray(profile.services) && profile.services.length > 0 },
    { id: "portfolio", label_es: "1+ foto en portafolio", label_en: "1+ portfolio photo", done: (profile.portfolio_count || 0) > 0 },
    { id: "verify",  label_es: "Verificación",        label_en: "Verification",      done: profile.verification_status === "approved" },
  ];
  const done = items.filter(i => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  return { pct, items };
}

export default function DashboardHomeV7({ profile, unread = 0, requests = [], onTabChange = () => {} }) {
  const { lang } = useI18n();
  const [portfolio, setPortfolio] = useState([]);
  const [reels, setReels] = useState([]);
  const [activity, setActivity] = useState([]);
  const [referral, setReferral] = useState({ code: "", earnings_usd: 0, conversions: 0 });

  // Load supplemental data; fail soft on every individual fetch so a
  // single broken endpoint never blanks the entire home view.
  useEffect(() => {
    api.get("/providers/me/portfolio").then(r => setPortfolio(r.data || [])).catch(() => {});
    api.get("/reels", { params: { limit: 4 } }).then(r => {
      const mine = (r.data || []).filter(x => x.provider_user_id === profile?.user_id);
      setReels(mine);
    }).catch(() => {});
    api.get("/activity-feed/me", { params: { limit: 6 } })
      .then(r => setActivity(Array.isArray(r.data) ? r.data : (r.data?.items || [])))
      .catch(() => setActivity([]));
    api.get("/referrals/summary")
      .then(r => setReferral({
        code: r.data?.code || "",
        earnings_usd: r.data?.earnings_usd || 0,
        conversions: r.data?.conversions || 0,
      }))
      .catch(() => {});
  }, [profile?.user_id]);

  const { pct, items: complItems } = useMemo(() => calcCompleteness(profile), [profile]);
  const newLeads = (requests || []).filter(r => ["new", "pending"].includes(r.status)).length;

  return (
    <div className="space-y-5" data-testid="dashboard-home-v7">
      {/* 1 — Greeting + 3 metric tiles */}
      <header className="rounded-2xl bg-gradient-to-br from-[#03045E] to-[#0077B6] text-white p-5" data-testid="home-v7-greeting">
        <p className="text-[11px] uppercase tracking-widest opacity-80 font-bold">
          {lang === "en" ? "Welcome back" : "Bienvenido de vuelta"}
        </p>
        <h1 className="font-display font-bold text-2xl mt-1">
          {profile?.business_name || profile?.name || "—"}
        </h1>
        {profile?.getamano_code && (
          <span className="mt-2 inline-flex items-center gap-1 px-2 h-6 rounded-full bg-white/10 text-xs font-mono font-bold">
            {profile.getamano_code}
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 gap-3" data-testid="home-v7-metrics">
        <Metric icon={Eye}            label={lang === "en" ? "Today's views" : "Vistas hoy"} value={profile?.views_today ?? profile?.views ?? 0} accent="text-sky-600" />
        <Metric icon={MessageCircle}  label={lang === "en" ? "Messages" : "Mensajes"}  value={unread} accent="text-emerald-600" testid="metric-messages" />
        <Metric icon={Inbox}          label={lang === "en" ? "New leads" : "Leads"}    value={newLeads} accent="text-amber-600" testid="metric-leads" />
      </div>

      {/* 2 — Completitud de perfil */}
      <section
        className="rounded-2xl border border-slate-200 bg-white p-5"
        data-testid="home-v7-completeness"
      >
        <header className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">
              {lang === "en" ? "Profile completeness" : "Completitud de tu perfil"}
            </p>
            <h2 className="font-display font-bold text-xl text-[#03045E] mt-0.5">
              {pct}%
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{TIER_LABELS_BY_PCT(pct, lang)}</p>
          </div>
        </header>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden" data-testid="home-v7-completeness-bar">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0077B6] to-[#00B4D8] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-y-1 text-[12px]">
          {complItems.map(it => (
            <li
              key={it.id}
              className={`inline-flex items-center gap-1.5 ${it.done ? "text-emerald-700" : "text-slate-500"}`}
              data-testid={`home-v7-completeness-item-${it.id}`}
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${it.done ? "text-emerald-500" : "text-slate-300"}`} />
              {lang === "en" ? it.label_en : it.label_es}
            </li>
          ))}
        </ul>
      </section>

      {/* 3 — Portafolio */}
      <Section
        title={lang === "en" ? "Portfolio" : "Portafolio"}
        rightHint={`${portfolio.length}/12`}
        cta={{ label: lang === "en" ? "Manage" : "Gestionar", onClick: () => onTabChange("galeria") }}
        testid="home-v7-portfolio"
      >
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
          {portfolio.slice(0, 8).map(item => (
            <img
              key={item.id}
              src={buildFileUrl(item.image_url)}
              alt=""
              className="flex-shrink-0 w-20 h-20 rounded-xl object-cover ring-1 ring-slate-200"
              loading="lazy"
              data-testid={`home-v7-portfolio-thumb-${item.id}`}
            />
          ))}
          {portfolio.length < 12 && (
            <button
              type="button"
              onClick={() => onTabChange("galeria")}
              className="flex-shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#0077B6] flex items-center justify-center text-slate-400 hover:text-[#0077B6]"
              data-testid="home-v7-portfolio-add"
            >
              <Plus className="w-5 h-5" strokeWidth={3} />
            </button>
          )}
        </div>
        {portfolio.length === 0 && (
          <p className="text-xs text-slate-500 mt-2">
            {lang === "en"
              ? "Add up to 12 photos of your past work to build trust."
              : "Suma hasta 12 fotos de tus trabajos para generar confianza."}
          </p>
        )}
      </Section>

      {/* 4 — Mis Reels */}
      <Section
        title={lang === "en" ? "My Reels" : "Mis Reels"}
        cta={{ label: lang === "en" ? "Open Reels" : "Ver Reels", onClick: () => null, to: "/reels" }}
        testid="home-v7-reels"
      >
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
          {reels.slice(0, 4).map(r => (
            <Link
              key={r.reel_id}
              to={`/reels?r=${r.reel_id}`}
              className="flex-shrink-0 w-20 aspect-[9/16] rounded-xl bg-slate-900 overflow-hidden relative group"
              data-testid={`home-v7-reel-${r.reel_id}`}
            >
              {r.thumbnail_url ? (
                <img src={buildFileUrl(r.thumbnail_url)} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <video src={buildFileUrl(r.video_url)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[10px] text-white font-bold inline-flex items-center gap-0.5">
                <Eye className="w-2.5 h-2.5" /> {r.views_count || 0}
              </div>
            </Link>
          ))}
          <Link
            to="/reels"
            className="flex-shrink-0 w-20 aspect-[9/16] rounded-xl border-2 border-dashed border-slate-300 hover:border-pink-500 flex items-center justify-center text-slate-400 hover:text-pink-500"
            data-testid="home-v7-reel-add"
          >
            <Film className="w-5 h-5" />
          </Link>
        </div>
        {reels.length === 0 && (
          <p className="text-xs text-slate-500 mt-2">
            {lang === "en" ? "Post 60-second vertical videos to attract attention." : "Sube videos verticales de 60s para atraer atención."}
          </p>
        )}
      </Section>

      {/* 5 — Actividad reciente */}
      <Section
        title={lang === "en" ? "Recent activity" : "Actividad reciente"}
        testid="home-v7-activity"
      >
        {activity.length === 0 ? (
          <p className="text-xs text-slate-500">
            {lang === "en" ? "Activity will appear here as people interact with your profile." : "Aquí verás cuando la gente interactúe con tu perfil."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.slice(0, 6).map((a, i) => (
              <li key={a.id || i} className="py-2 text-sm" data-testid={`home-v7-activity-${i}`}>
                <p className="text-slate-800">{a.label || a.title || a.message || a.event_type || JSON.stringify(a).slice(0, 80)}</p>
                {a.created_at && (
                  <p className="text-[11px] text-slate-400">
                    {new Date(a.created_at).toLocaleString("es-ES")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 6 — Programa de referidos */}
      <Section
        title={lang === "en" ? "Referrals" : "Referidos"}
        rightHint={`$${referral.earnings_usd}`}
        cta={{ label: lang === "en" ? "Open" : "Abrir", onClick: () => onTabChange("red") }}
        testid="home-v7-referrals"
      >
        <p className="text-sm text-slate-700 leading-snug">
          {lang === "en"
            ? "Earn $5 every time a referred provider converts."
            : "Ganas $5 cada vez que un proveedor que invitaste se convierte."}
        </p>
        {referral.code && (
          <div className="mt-2 flex items-center gap-2">
            <code className="px-2 py-1 rounded-md bg-slate-100 text-sm font-mono">{referral.code}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/r/${referral.code}`)
                  .then(() => toast.success(lang === "en" ? "Link copied" : "Enlace copiado"))
                  .catch(() => {});
              }}
              className="text-xs font-semibold text-[#0077B6] hover:underline"
              data-testid="home-v7-referrals-copy"
            >
              {lang === "en" ? "Copy link" : "Copiar enlace"}
            </button>
          </div>
        )}
      </Section>

      {/* 7 — Destacar mi perfil */}
      <section
        className="rounded-2xl p-5 border border-amber-200 bg-gradient-to-br from-amber-50 to-rose-50"
        data-testid="home-v7-feature"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-bold text-amber-700 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {lang === "en" ? "Featured slot" : "Slot destacado"}
            </p>
            <h2 className="font-display font-bold text-lg text-[#03045E] mt-0.5">
              {lang === "en" ? "Feature your profile this week" : "Destaca tu perfil esta semana"}
            </h2>
            <p className="text-sm text-slate-700 mt-1 leading-snug">
              {lang === "en"
                ? "Pin your profile to the top of every Barrio carousel in your city — 7 days."
                : "Fija tu perfil arriba del carrusel de Barrio en tu ciudad — 7 días."}
            </p>
          </div>
        </header>
        <button
          type="button"
          onClick={() => toast.message(lang === "en" ? "Available when payments are live." : "Disponible cuando activemos pagos.")}
          className="mt-3 inline-flex items-center gap-1 h-10 px-4 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white text-sm font-bold active:scale-95"
          data-testid="home-v7-feature-cta"
        >
          {lang === "en" ? "Feature for $9.99" : "Destacar por $9.99"} <ArrowRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, accent = "text-slate-700", testid }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-3" data-testid={testid}>
      <Icon className={`w-4 h-4 mb-1 ${accent}`} />
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{label}</p>
      <p className="font-display font-bold text-2xl text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

function Section({ title, rightHint, cta, children, testid }) {
  const CtaComp = cta?.to ? Link : "button";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={testid}>
      <header className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display font-bold text-base text-[#03045E]">{title}</h3>
          {rightHint && <span className="text-xs font-bold text-slate-400">{rightHint}</span>}
        </div>
        {cta && (
          <CtaComp
            {...(cta.to ? { to: cta.to } : { type: "button", onClick: cta.onClick })}
            className="text-xs font-bold text-[#0077B6] hover:underline inline-flex items-center gap-0.5"
            data-testid={`${testid}-cta`}
          >
            {cta.label} <ArrowRight className="w-3 h-3" />
          </CtaComp>
        )}
      </header>
      {children}
    </section>
  );
}
