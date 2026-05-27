import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Briefcase,
  HeartHandshake,
  IdCard,
  ChevronRight,
  Bell,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import LiveActivityTicker from "../components/LiveActivityTicker";
import FoundingCounter from "../components/FoundingCounter";

/**
 * AppHome — Section 63 Block 5 (app-first home).
 *
 * Replaces the previous web-style Landing as the primary `/` route.
 * Mobile-first layout with: sticky header, teal hero with search, 4 quick
 * actions, popular categories carousel, featured providers carousel,
 * recent jobs list, and a "become a provider" CTA for non-providers.
 */
const POPULAR_CATEGORIES = [
  { id: "limpieza",     slug: "limpieza",      labelEs: "Limpieza",     labelEn: "Cleaning",    emoji: "🧹" },
  { id: "plomeria",     slug: "plomeria",      labelEs: "Plomería",     labelEn: "Plumbing",    emoji: "🔧" },
  { id: "electricidad", slug: "electricidad",  labelEs: "Electricidad", labelEn: "Electrical",  emoji: "⚡" },
  { id: "jardineria",   slug: "jardineria",    labelEs: "Jardinería",   labelEn: "Gardening",   emoji: "🌿" },
  { id: "pintura",      slug: "pintura",       labelEs: "Pintura",      labelEn: "Painting",    emoji: "🎨" },
  { id: "cocina",       slug: "catering-latino",labelEs: "Cocina",      labelEn: "Catering",    emoji: "👨‍🍳" },
  { id: "mudanzas",     slug: "mudanzas",      labelEs: "Mudanzas",     labelEn: "Moving",      emoji: "📦" },
  { id: "belleza",      slug: "belleza",       labelEs: "Belleza",      labelEn: "Beauty",      emoji: "💇" },
];

export default function AppHome() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [featured, setFeatured] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [providerSlug, setProviderSlug] = useState("");

  const isProvider = user?.role === "provider";
  const firstName = (user?.name || "").trim().split(/\s+/)[0] || (user?.email || "").split("@")[0];

  // Featured + jobs — runs once, guest-safe.
  useEffect(() => {
    api.get("/providers/featured").then(r => setFeatured(Array.isArray(r.data) ? r.data.slice(0, 6) : [])).catch(() => {});
    api.get("/jobs", { params: { limit: 3, sort: "recent" } })
      .then(r => setRecentJobs(Array.isArray(r.data) ? r.data : (r.data?.items || [])))
      .catch(() => setRecentJobs([]));
  }, []);

  // Auth-dependent fetches: notifications, conversations, and provider slug.
  useEffect(() => {
    if (!user) { setUnreadNotifications(0); setUnreadMessages(0); setProviderSlug(""); return; }
    api.get("/notifications").then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.items || []);
      setUnreadNotifications(list.filter(n => !n.read).length);
    }).catch(() => {});
    api.get("/conversations").then(r => {
      const list = Array.isArray(r.data) ? r.data : [];
      setUnreadMessages(list.filter(c => c.unread).length);
    }).catch(() => {});
    // Fetch provider slug so QA4 'My eCard' can route to /p/{slug}.
    if (user.role === "provider") {
      api.get("/providers/me").then(r => setProviderSlug(r.data?.slug || "")).catch(() => {});
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Sticky compact header ─────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 bg-white border-b border-slate-100"
        style={{ paddingTop: "var(--safe-top, 0px)" }}
        data-testid="apphome-header"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="font-display font-extrabold text-[22px] tracking-tight" style={{ letterSpacing: "-0.5px" }}>
            <span style={{ color: "#025F67" }}>get</span>
            <span style={{ color: "#111827" }}>amano</span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/messages")}
                  className="relative p-2 rounded-full hover:bg-slate-100"
                  aria-label={lang === "en" ? "Messages" : "Mensajes"}
                  data-testid="apphome-messages-btn"
                >
                  <MessageCircle className="w-[22px] h-[22px] text-slate-700" />
                  {unreadMessages > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white">
                      {unreadMessages > 9 ? "9+" : unreadMessages}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/notifications")}
                  className="relative p-2 rounded-full hover:bg-slate-100"
                  aria-label={lang === "en" ? "Notifications" : "Notificaciones"}
                  data-testid="apphome-notifications-btn"
                >
                  <Bell className="w-[22px] h-[22px] text-slate-700" />
                  {unreadNotifications > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white">
                      {unreadNotifications > 9 ? "9+" : unreadNotifications}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <Link to="/login" className="px-4 h-9 inline-flex items-center rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800" data-testid="apphome-login-btn">
                {lang === "en" ? "Sign in" : "Entrar"}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero with greeting + search ───────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #025F67 0%, #014a52 60%, #013840 100%)" }}
        data-testid="apphome-hero"
      >
        {/* Decorative city silhouette */}
        <div className="absolute bottom-0 left-0 right-0 opacity-[0.08] pointer-events-none" aria-hidden="true">
          <svg viewBox="0 0 375 120" xmlns="http://www.w3.org/2000/svg" className="w-full block">
            <path
              d="M0,120 L0,80 L20,80 L20,60 L40,60 L40,55 L60,55 L60,60 L80,60 L80,40 L90,40 L90,28 L100,28 L100,40 L110,40 L110,60 L130,60 L130,48 L140,48 L140,35 L150,35 L150,48 L160,48 L160,60 L180,60 L180,65 L200,65 L200,52 L210,52 L210,40 L220,40 L220,52 L240,52 L240,72 L260,72 L260,60 L270,60 L270,48 L280,48 L280,60 L300,60 L300,72 L320,72 L320,64 L335,64 L335,55 L345,55 L345,64 L375,64 L375,120 Z"
              fill="white"
            />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-5 md:px-6 py-6 md:py-10">
          <p className="text-white/75 text-[13px] md:text-sm mb-1">
            {user
              ? (lang === "en" ? `Hi, ${firstName} 👋` : `Hola, ${firstName} 👋`)
              : (lang === "en" ? "Welcome to" : "Bienvenido a")}
          </p>
          <h1
            className={`text-white font-display font-extrabold tracking-tight mb-5 ${user ? "text-xl md:text-2xl" : "text-[26px] md:text-4xl"}`}
            style={{ letterSpacing: "-0.5px", lineHeight: 1.1 }}
            data-testid="apphome-greeting"
          >
            {user
              ? (lang === "en" ? "What do you need today?" : "¿Qué necesitas hoy?")
              : (lang === "en" ? "getamano — Latino services" : "getamano — servicios latinos")}
          </h1>

          {/* Search trigger */}
          <button
            type="button"
            onClick={() => navigate("/search")}
            className="w-full max-w-2xl bg-white rounded-2xl shadow-xl px-4 py-3.5 flex items-center gap-3 text-left hover:shadow-2xl transition"
            data-testid="apphome-search-trigger"
          >
            <Search className="w-5 h-5 flex-shrink-0" style={{ color: "#025F67" }} />
            <span className="text-slate-400 text-[15px]">
              {lang === "en" ? "What service do you need?" : "¿Qué servicio necesitas?"}
            </span>
          </button>
        </div>
      </section>

      {/* ── Live ticker (compact) ─────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-2 -mt-3 relative z-10">
        <LiveActivityTicker />
      </div>

      {/* ── Founding 50 promo banner (always visible on AppHome) ─────── */}
      <div className="max-w-7xl mx-auto px-3 md:px-5 mt-3" data-testid="apphome-founding-banner">
        <FoundingCounter variant="banner" />
      </div>

      {/* ── Quick actions grid 4 cols ─────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-5 pt-5 md:pt-7" data-testid="apphome-quick-actions">
        <div className="grid grid-cols-4 gap-2">
          <QuickAction
            icon={<Search className="w-[22px] h-[22px]" style={{ color: "#025F67" }} />}
            label={lang === "en" ? "Search" : "Buscar"}
            bgColor="#EFF9F7"
            onClick={() => navigate("/search")}
            testid="apphome-qa-search"
          />
          <QuickAction
            icon={<Briefcase className="w-[22px] h-[22px]" style={{ color: "#8B5CF6" }} />}
            label={lang === "en" ? "Jobs" : "Chambas"}
            bgColor="#F5F3FF"
            onClick={() => navigate("/empleos")}
            testid="apphome-qa-jobs"
          />
          <QuickAction
            icon={<HeartHandshake className="w-[22px] h-[22px]" style={{ color: "#EC4899" }} />}
            label={lang === "en" ? "Community" : "Comunidad"}
            bgColor="#FDF2F8"
            onClick={() => navigate("/comunidad")}
            testid="apphome-qa-community"
          />
          <QuickAction
            icon={<IdCard className="w-[22px] h-[22px]" style={{ color: "#F59E0B" }} />}
            label={isProvider
              ? (lang === "en" ? "My eCard" : "Mi eCard")
              : (lang === "en" ? "Be a provider" : "Ser proveedor")}
            bgColor="#FFFBEB"
            onClick={() => {
              if (isProvider) {
                if (providerSlug) navigate(`/p/${providerSlug}`);
                else navigate("/dashboard/provider");
              } else {
                navigate("/register?intent=provider");
              }
            }}
            testid="apphome-qa-ecard"
          />
        </div>
      </section>

      {/* ── Popular categories scroll ─────────────────────────────────── */}
      <section className="pt-6 md:pt-8" data-testid="apphome-categories-section">
        <div className="max-w-7xl mx-auto px-5 mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            {lang === "en" ? "Popular categories" : "Categorías populares"}
          </h2>
          <button
            type="button"
            onClick={() => navigate("/search")}
            className="text-[13px] font-semibold inline-flex items-center gap-0.5"
            style={{ color: "#025F67" }}
            data-testid="apphome-categories-seeall"
          >
            {lang === "en" ? "See all" : "Ver todas"} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-5 pb-2 scroll-touch" style={{ scrollbarWidth: "none" }}>
          {POPULAR_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => navigate(`/search?category=${cat.slug}`)}
              className="flex-shrink-0 flex flex-col items-center gap-2 px-4 py-3.5 bg-white border-[1.5px] border-slate-200 rounded-2xl hover:border-teal-300 hover:shadow-sm transition min-w-[80px] active:scale-95"
              data-testid={`apphome-cat-${cat.id}`}
            >
              <span className="text-2xl leading-none">{cat.emoji}</span>
              <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                {lang === "en" ? cat.labelEn : cat.labelEs}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Featured providers scroll ─────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="pt-6 md:pt-8" data-testid="apphome-featured-section">
          <div className="max-w-7xl mx-auto px-5 mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              {lang === "en" ? "Featured providers" : "Proveedores destacados"}
            </h2>
            <button
              type="button"
              onClick={() => navigate("/search?sort=rating")}
              className="text-[13px] font-semibold inline-flex items-center gap-0.5"
              style={{ color: "#025F67" }}
              data-testid="apphome-featured-seeall"
            >
              {lang === "en" ? "See all" : "Ver todos"} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-2 scroll-touch" style={{ scrollbarWidth: "none" }}>
            {featured.map(p => (
              <ProviderCard key={p.provider_id || p.id} provider={p} navigate={navigate} lang={lang} />
            ))}
          </div>
        </section>
      )}

      {/* ── Recent jobs (3 vertical) ──────────────────────────────────── */}
      {recentJobs.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 pt-6 md:pt-8" data-testid="apphome-jobs-section">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              {lang === "en" ? "Recent jobs" : "Últimas chambas"}
            </h2>
            <button
              type="button"
              onClick={() => navigate("/empleos")}
              className="text-[13px] font-semibold inline-flex items-center gap-0.5"
              style={{ color: "#025F67" }}
              data-testid="apphome-jobs-seeall"
            >
              {lang === "en" ? "See all" : "Ver todas"} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2.5">
            {recentJobs.slice(0, 3).map(job => (
              <JobRow key={job.gig_id || job.id} job={job} navigate={navigate} />
            ))}
          </div>
        </section>
      )}

      {/* ── Become a provider banner (guests + clients) ───────────────── */}
      {!isProvider && (
        <section className="max-w-7xl mx-auto px-5 pt-6 md:pt-8" data-testid="apphome-provider-banner">
          <div
            className="rounded-3xl p-5 flex items-center justify-between gap-3 shadow-lg"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #014a52 60%, #013840 100%)" }}
          >
            <div className="min-w-0">
              <p className="text-white/80 text-[12px] mb-1">
                {lang === "en" ? "Do you offer services?" : "¿Ofreces servicios?"}
              </p>
              <p className="text-white text-base md:text-lg font-bold mb-3 leading-tight">
                {lang === "en" ? "Create your free profile" : "Crea tu perfil gratis"}
              </p>
              <button
                type="button"
                onClick={() => navigate("/register?intent=provider")}
                className="inline-flex items-center gap-1 px-4 h-9 rounded-xl text-white text-[13px] font-bold transition hover:brightness-110"
                style={{ background: "#5DCAA5" }}
                data-testid="apphome-become-provider-btn"
              >
                {lang === "en" ? "Get started" : "Empezar"} <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-[48px] md:text-[64px] leading-none flex-shrink-0" aria-hidden="true">🧑‍🔧</div>
          </div>
        </section>
      )}

      {/* ── Tagline tail ──────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-5 py-8 text-center">
        <Sparkles className="w-4 h-4 mx-auto mb-1.5" style={{ color: "#F59E0B" }} />
        <p className="text-xs text-slate-500">
          {lang === "en"
            ? "Real Latino services, verified across the US."
            : "Servicios latinos reales, verificados en todo EE.UU."}
        </p>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, bgColor, onClick, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 px-2 py-3 rounded-2xl transition active:scale-95 hover:brightness-105"
      style={{ background: bgColor }}
      data-testid={testid}
    >
      <span className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center shadow-sm">{icon}</span>
      <span className="text-[11px] font-semibold text-slate-700 text-center leading-tight">{label}</span>
    </button>
  );
}

function ProviderCard({ provider, navigate, lang }) {
  const slug = provider.slug || provider.provider_slug;
  const ratingAvg = provider.rating_avg || 0;
  const ratingCount = provider.rating_count || 0;
  const logo = provider.logo_url || provider.cover_url || provider.banner_url;
  const categoryLabel = provider.category_label
    || (lang === "en" ? provider.category_name_en : provider.category_name_es)
    || provider.category_name
    || "";
  return (
    <button
      type="button"
      onClick={() => slug && navigate(`/p/${slug}`)}
      className="flex-shrink-0 w-[160px] bg-white rounded-2xl border-[1.5px] border-slate-100 shadow-sm hover:shadow-md transition overflow-hidden text-left active:scale-95"
      data-testid={`apphome-provider-card-${slug || provider.provider_id}`}
    >
      <div className="h-[100px] bg-slate-100 relative">
        {logo ? (
          <img
            src={logo}
            alt={provider.business_name || ""}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl text-slate-300">🏢</div>
        )}
        {provider.verification_status === "approved" && (
          <span
            className="absolute top-1.5 right-1.5 bg-white/95 backdrop-blur px-1.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wide"
            style={{ color: "#025F67" }}
          >
            ✓ {lang === "en" ? "VERIFIED" : "VERIFICADO"}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-[13px] font-bold text-slate-900 truncate" title={provider.business_name}>{provider.business_name}</p>
        <p className="text-[11px] text-slate-500 truncate">{categoryLabel}</p>
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <span className="text-[12px] font-semibold" style={{ color: "#F59E0B" }}>
            ⭐ {ratingCount > 0 ? ratingAvg.toFixed(1) : "—"}
          </span>
          <span className="text-[10px] text-slate-400 truncate">{provider.city || ""}</span>
        </div>
      </div>
    </button>
  );
}

function JobRow({ job, navigate }) {
  const id = job.gig_id || job.id;
  return (
    <button
      type="button"
      onClick={() => navigate(`/empleos/${id}`)}
      className="w-full bg-white border-[1.5px] border-slate-100 rounded-2xl px-3.5 py-3 flex items-center gap-3 hover:shadow-sm active:scale-[0.99] transition text-left"
      data-testid={`apphome-job-row-${id}`}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: "#EFF9F7" }}
      >
        <Briefcase className="w-5 h-5" style={{ color: "#025F67" }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-slate-900 truncate">{job.title}</p>
        <p className="text-[12px] text-slate-500 truncate">
          {[job.city, job.budget_display || job.salary_display, job.gig_type || job.job_type].filter(Boolean).join(" · ")}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </button>
  );
}
