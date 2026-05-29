import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Briefcase,
  HeartHandshake,
  IdCard,
  ChevronRight,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import LiveActivityTicker from "../components/LiveActivityTicker";
import FoundingCounter from "../components/FoundingCounter";
import FuturisticDecor from "../components/FuturisticDecor";
import NotificationBell from "../components/NotificationBell";
import EarningsWidget from "../components/EarningsWidget";
import ReferralProgressCard from "../components/ReferralProgressCard";
import MilestoneCelebrationModal from "../components/MilestoneCelebrationModal";
import MilestoneOfTheWeekWidget from "../components/MilestoneOfTheWeekWidget";
import OnboardingTour from "../components/OnboardingTour";
import InviterWelcomeBanner from "../components/InviterWelcomeBanner";
import ThankInviterModal from "../components/ThankInviterModal";
import UniversalServicesCard from "../components/UniversalServicesCard";
import { SeoHead } from "../components/seo/SeoHead";
import useRefreshable from "../hooks/useRefreshable";

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
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [providerSlug, setProviderSlug] = useState("");
  const [referralSummary, setReferralSummary] = useState(null);

  const isProvider = user?.role === "provider";
  const firstName = (user?.name || "").trim().split(/\s+/)[0] || (user?.email || "").split("@")[0];

  // Featured + jobs — fetched on mount AND on pull-to-refresh.
  const fetchFeaturedAndJobs = useCallback(async () => {
    try {
      const [f, j] = await Promise.allSettled([
        api.get("/providers/featured"),
        api.get("/gigs", { params: { limit: 3, sort: "recent" } }),
      ]);
      if (f.status === "fulfilled") {
        setFeatured(Array.isArray(f.value.data) ? f.value.data.slice(0, 6) : []);
      }
      if (j.status === "fulfilled") {
        const d = j.value.data;
        setRecentJobs(Array.isArray(d) ? d : (d?.items || []));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchFeaturedAndJobs(); }, [fetchFeaturedAndJobs]);

  // Auth-dependent fetches: conversations, and provider slug. (Notifications
  // are now owned by the <NotificationBell /> component which has its own
  // dropdown — no more navigate to a non-existent /notifications route.)
  const fetchAuthData = useCallback(async () => {
    if (!user) {
      setUnreadMessages(0);
      setProviderSlug("");
      return;
    }
    try {
      const conv = await api.get("/conversations");
      const list = Array.isArray(conv.data) ? conv.data : [];
      setUnreadMessages(list.filter(c => c.unread).length);
    } catch { /* ignore */ }
    if (user.role === "provider") {
      try {
        const r = await api.get("/providers/me");
        setProviderSlug(r.data?.slug || "");
      } catch { /* ignore */ }
      try {
        const r = await api.get("/user-referrals/me");
        setReferralSummary(r.data);
      } catch { /* ignore */ }
    }
  }, [user]);

  useEffect(() => { fetchAuthData(); }, [fetchAuthData]);

  // Register both for pull-to-refresh
  useRefreshable(fetchFeaturedAndJobs);
  useRefreshable(fetchAuthData);

  return (
    <div className="min-h-screen bg-[#F0F9FF]">
      <SeoHead
        title={lang === "en"
          ? "Trusted service pros near you"
          : "Profesionales de confianza cerca de ti"}
        description={lang === "en"
          ? "Plumbers, electricians, cleaning, landscaping & more — verified pros with real reviews across the US."
          : "Plomeros, electricistas, limpieza, jardinería y más — profesionales verificados con reseñas reales en todo USA."}
        lang={lang}
      />
      {/* ── Sticky compact header ─────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 bg-white border-b border-slate-100"
        style={{ paddingTop: "var(--safe-top, 0px)" }}
        data-testid="apphome-header"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-extrabold text-[22px] tracking-tight" style={{ letterSpacing: "-0.5px" }}>
            <img src="/getamano-logo-mark.png" alt="" className="w-9 h-9 object-contain flex-shrink-0" />
            <span>
              <span style={{ color: "#03045E" }}>get</span>
              <span style={{ color: "#111827" }}>amano</span>
            </span>
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
                {/* Bug fix: previously this navigated to /notifications which
                    rendered the 404 page. Now uses NotificationBell which
                    opens an in-place dropdown with the real list. */}
                <NotificationBell />
              </>
            ) : (
              <Link to="/login" className="px-4 h-9 inline-flex items-center rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800" data-testid="apphome-login-btn">
                {lang === "en" ? "Sign in" : "Entrar"}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero with greeting + search (Section 77 — futuristic) ─────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #03045E 0%, #023E8A 55%, #0077B6 100%)" }}
        data-testid="apphome-hero"
      >
        {/* Section 77 — geometric futurist decor (cyan blob, blue blob, grid) */}
        <FuturisticDecor variant="navy" />

        <div className="relative max-w-7xl mx-auto px-5 md:px-6 py-7 md:py-10">
          <p
            className="text-[#90E0EF] text-[13px] md:text-sm mb-1 font-medium gtm-fade-up"
            style={{ animationDelay: "0ms" }}
          >
            {user
              ? (lang === "en" ? `Hi, ${firstName} 👋` : `Hola, ${firstName} 👋`)
              : (lang === "en" ? "Welcome to" : "Bienvenido a")}
          </p>
          <h1
            className={`text-white font-display font-extrabold tracking-tight mb-3 gtm-fade-up ${user ? "text-xl md:text-2xl" : "text-[26px] md:text-4xl"}`}
            style={{ letterSpacing: "-0.5px", lineHeight: 1.1, animationDelay: "80ms" }}
            data-testid="apphome-greeting"
          >
            {user
              ? (lang === "en" ? "What do you need today?" : "¿Qué necesitas hoy?")
              : (lang === "en"
                  ? "Find trusted service professionals near you"
                  : "Encuentra profesionales de confianza cerca de ti")}
          </h1>

          {/* Section 67 — dual-audience subhead + "Latino-built" pride badge */}
          {!user && (
            <p
              className="text-white/90 text-[13px] md:text-[15px] mb-4 max-w-2xl leading-snug gtm-fade-up"
              style={{ animationDelay: "160ms" }}
              data-testid="apphome-subhead"
            >
              {lang === "en"
                ? "Plumbers, electricians, cleaning, landscaping & more — verified pros with real reviews."
                : "Plomeros, electricistas, limpieza, jardinería y más — proveedores verificados con reseñas reales."}
            </p>
          )}
          <div
            className="mb-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 text-[11px] font-semibold text-white gtm-fade-up"
            style={{ animationDelay: "200ms" }}
            data-testid="apphome-latino-built-badge"
          >
            🫂 <span>Latino-built · America-wide</span>
          </div>

          {/* Search trigger — glassmorphism (Section 77 spec) */}
          <button
            type="button"
            onClick={() => navigate("/search")}
            className="group w-full max-w-2xl rounded-2xl px-2 py-2 flex items-center gap-2 text-left transition shadow-2xl shadow-[#00B4D8]/20 hover:shadow-[#00B4D8]/40 gtm-fade-up"
            style={{
              background: "rgba(255, 255, 255, 0.92)",
              backdropFilter: "blur(18px) saturate(140%)",
              WebkitBackdropFilter: "blur(18px) saturate(140%)",
              border: "1px solid rgba(255, 255, 255, 0.4)",
              animationDelay: "280ms",
            }}
            data-testid="apphome-search-trigger"
          >
            <div className="flex-1 flex items-center gap-2 pl-3">
              <Search className="w-5 h-5 flex-shrink-0" style={{ color: "#0077B6" }} />
              <span className="text-slate-500 text-[15px]">
                {lang === "en" ? "What service do you need?" : "¿Qué servicio necesitas?"}
              </span>
            </div>
            <span
              className="hidden sm:inline-flex items-center justify-center h-10 px-4 rounded-xl font-semibold text-white text-sm shadow-md group-hover:brightness-110 transition flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0077B6 0%, #00B4D8 100%)" }}
            >
              {lang === "en" ? "Search" : "Buscar"}
            </span>
            <span
              className="sm:hidden inline-flex items-center justify-center h-10 w-10 rounded-xl text-white shadow-md flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0077B6 0%, #00B4D8 100%)" }}
            >
              <Search className="w-4 h-4" />
            </span>
          </button>

          {/* Section 77 — quick search tags as glass pills */}
          {!user && (
            <div
              className="mt-3 flex flex-wrap gap-2 gtm-fade-up"
              style={{ animationDelay: "360ms" }}
              data-testid="apphome-quick-tags"
            >
              {[
                { es: "Limpieza", en: "Cleaning", slug: "limpieza" },
                { es: "Plomería", en: "Plumbing", slug: "plomeria" },
                { es: "Electricidad", en: "Electrical", slug: "electricidad" },
                { es: "Jardinería", en: "Gardening", slug: "jardineria" },
              ].map((q) => (
                <button
                  key={q.slug}
                  type="button"
                  onClick={() => navigate(`/search?category=${q.slug}`)}
                  className="px-3 h-8 rounded-full text-[12px] font-semibold text-white border border-white/30 hover:border-white/60 hover:bg-white/10 transition"
                  data-testid={`apphome-quick-tag-${q.slug}`}
                >
                  {lang === "en" ? q.en : q.es}
                </button>
              ))}
            </div>
          )}
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

      {/* ── Quick actions grid 4 cols (Section 77 — surface + Ocean Blue) */}
      <section className="max-w-7xl mx-auto px-5 pt-5 md:pt-7" data-testid="apphome-quick-actions">
        <div className="grid grid-cols-4 gap-2">
          <QuickAction
            icon={<Search className="w-[22px] h-[22px]" style={{ color: "#0077B6" }} />}
            label={lang === "en" ? "Search" : "Buscar"}
            bgColor="#CAF0F8"
            onClick={() => navigate("/search")}
            testid="apphome-qa-search"
          />
          <QuickAction
            icon={<Briefcase className="w-[22px] h-[22px]" style={{ color: "#0077B6" }} />}
            label={lang === "en" ? "Jobs" : "Chambas"}
            bgColor="#CAF0F8"
            onClick={() => navigate("/empleos")}
            testid="apphome-qa-jobs"
          />
          <QuickAction
            icon={<HeartHandshake className="w-[22px] h-[22px]" style={{ color: "#00B4D8" }} />}
            label={lang === "en" ? "Community" : "Comunidad"}
            bgColor="#CAF0F8"
            onClick={() => navigate("/comunidad")}
            testid="apphome-qa-community"
          />
          <QuickAction
            icon={<IdCard className="w-[22px] h-[22px]" style={{ color: "#03045E" }} />}
            label={isProvider
              ? (lang === "en" ? "My eCard" : "Mi eCard")
              : (lang === "en" ? "Be a provider" : "Ser proveedor")}
            bgColor="#CAF0F8"
            onClick={() => {
              if (isProvider) {
                if (providerSlug) navigate(`/p/${providerSlug}`);
                else navigate("/dashboard/provider");
              } else {
                navigate("/register?role=provider");
              }
            }}
            testid="apphome-qa-ecard"
          />
        </div>
      </section>

      {/* ── Sprint A: Inviter welcome banner — shows ONCE to users who
            signed up via a /r/{code} referral link. ────────────────────── */}
      {user && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4" data-testid="apphome-inviter-banner-section">
          <InviterWelcomeBanner />
        </div>
      )}

      {/* ── Earnings + Referral widgets (providers only) ─────────────── */}
      {isProvider && (
        <section className="pt-4 md:pt-6" data-testid="apphome-earnings-section">
          <div className="max-w-7xl mx-auto px-4 md:px-6 grid md:grid-cols-2 gap-4">
            <EarningsWidget />
            <ReferralProgressCard />
          </div>
        </section>
      )}

      {/* ── Milestone of the week — visible to all authenticated users
            (clients can also "cheer" providers and reinforce the loop) ─ */}
      {user && (
        <section className="pt-4" data-testid="apphome-milestone-week-section">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <MilestoneOfTheWeekWidget />
          </div>
        </section>
      )}

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
            style={{ color: "#03045E" }}
            data-testid="apphome-categories-seeall"
          >
            {lang === "en" ? "See all" : "Ver todas"} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-5 pb-2 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
          {POPULAR_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => navigate(`/search?category=${cat.slug}`)}
              className="flex-shrink-0 flex flex-col items-center gap-2 px-2 py-3 bg-white border-[1.5px] border-slate-100 rounded-2xl hover:border-[#0077B6] hover:shadow-md hover:shadow-[#0077B6]/15 transition min-w-[80px] active:scale-95"
              data-testid={`apphome-cat-${cat.id}`}
            >
              <span
                className="flex items-center justify-center w-12 h-12 rounded-full text-2xl"
                style={{ background: "#CAF0F8" }}
              >
                {cat.emoji}
              </span>
              <span className="text-[11px] font-semibold text-[#03045E] whitespace-nowrap">
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
              style={{ color: "#03045E" }}
              data-testid="apphome-featured-seeall"
            >
              {lang === "en" ? "See all" : "Ver todos"} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
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
              style={{ color: "#03045E" }}
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

      {/* ── Section 67 (corrected) — ONE universal services card, no
            ethnic segmentation. Latino pride lives in the footer +
            About page + provider badges, not as a client filter. ───── */}
      <UniversalServicesCard />

      {/* ── Become a provider banner (guests + clients) — Section 77 ─── */}
      {!isProvider && (
        <section className="max-w-7xl mx-auto px-5 pt-6 md:pt-8" data-testid="apphome-provider-banner">
          <div
            className="relative overflow-hidden rounded-3xl p-5 flex items-center justify-between gap-3 shadow-xl shadow-[#0077B6]/20"
            style={{ background: "linear-gradient(135deg, #03045E 0%, #023E8A 60%, #0077B6 100%)" }}
          >
            <FuturisticDecor variant="navy" showGrid={false} />
            <div className="relative min-w-0">
              <p className="text-[#90E0EF] text-[12px] mb-1 font-medium">
                {lang === "en" ? "Are you a service pro?" : "¿Ofreces servicios profesionales?"}
              </p>
              <p className="text-white text-base md:text-lg font-bold mb-3 leading-tight">
                {lang === "en"
                  ? "Create your free profile — open to all"
                  : "Crea tu perfil gratis — para todos"}
              </p>
              <button
                type="button"
                onClick={() => navigate("/register?role=provider")}
                className="inline-flex items-center gap-1 px-4 h-10 rounded-xl text-[#03045E] text-[13px] font-bold transition hover:brightness-110 active:scale-95 shadow-lg"
                style={{ background: "linear-gradient(135deg, #00B4D8 0%, #90E0EF 100%)" }}
                data-testid="apphome-become-provider-btn"
              >
                {lang === "en" ? "Get started" : "Empezar"} <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="relative text-[48px] md:text-[64px] leading-none flex-shrink-0" aria-hidden="true">🧑‍🔧</div>
          </div>
        </section>
      )}

      {/* ── Tagline tail ──────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-5 py-8 text-center">
        <Sparkles className="w-4 h-4 mx-auto mb-1.5" style={{ color: "#F59E0B" }} />
        <p className="text-xs text-slate-500">
          {lang === "en"
            ? "Latino-built · America-wide. Verified service pros across the US."
            : "Latino-built · America-wide. Profesionales verificados en todo EE.UU."}
        </p>
      </div>

      {/* Section 77 — Confetti celebration when a new milestone is unlocked.
          Reads `latest_milestone.credit_id` from the summary and compares
          against localStorage to fire exactly once per new unlock. */}
      {isProvider && referralSummary?.latest_milestone && (
        <MilestoneCelebrationModal
          summary={referralSummary}
          onClose={() => { /* user dismissed — already persisted */ }}
        />
      )}

      {/* Section 81c — Gentle 3-step tour for first-time providers. Auto-skips
          if localStorage marker is present or if the celebration modal is
          already showing. */}
      {isProvider && <OnboardingTour role="provider" />}

      {/* Sprint A — ThankInviterModal: fires on AppHome ONCE when the
          referee just paid their first month (can_thank). Mounted for all
          authenticated users (clients can also have inviters). */}
      {user && <ThankInviterModal />}
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
            style={{ color: "#03045E" }}
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
        <Briefcase className="w-5 h-5" style={{ color: "#03045E" }} />
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
