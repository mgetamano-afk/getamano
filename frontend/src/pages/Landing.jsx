import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { Search, MapPin, Sparkles, ShieldCheck, Star, ArrowRight, Heart, TrendingUp, ChevronLeft, ChevronRight, CheckCircle2, ChevronDown, Globe2, Award, Video, Play, Smartphone, Check } from "lucide-react";
import FoundingCounter from "../components/FoundingCounter";
import OwnerIdentityBadge from "../components/OwnerIdentityBadge";
import { buildFileUrl } from "../components/ImageUpload";
import { openInstallModal } from "../components/InstallAppModal";
import useIsPwaInstalled from "../lib/useIsPwaInstalled";
import CategoryCard from "../components/CategoryCard";
import SmartServiceSearch from "../components/SmartServiceSearch";
import CitySearchInput from "../components/CitySearchInput";
import DownloadBadgesSection from "../components/DownloadBadgesSection";
import FeaturedProvidersReel from "../components/FeaturedProvidersReel";
import ProviderCTASection from "../components/ProviderCTASection";
import LiveActivityTicker from "../components/LiveActivityTicker";
import PushOptInBanner from "../components/PushOptInBanner";

const HERO_IMG = "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1400";

function useCounter(target, durationMs = 1500) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / durationMs);
      setVal(target * (0.2 + 0.8 * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
      else setVal(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

function Typewriter({ text, speed = 70, className }) {
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (n < text.length) {
      const t = setTimeout(() => setN(n + 1), speed);
      return () => clearTimeout(t);
    }
    const t2 = setTimeout(() => setDone(true), 2000);
    return () => clearTimeout(t2);
  }, [n, text, speed]);
  return (
    <span className={className}>
      {text.slice(0, n)}
      {!done && <span className="inline-block w-1 h-[0.9em] bg-orange-400 ml-1 animate-pulse align-middle" />}
    </span>
  );
}

export default function Landing() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const isPwaInstalled = useIsPwaInstalled();
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [withVideo, setWithVideo] = useState([]);
  const [playingVideo, setPlayingVideo] = useState(null); // provider_id or null
  const [stats, setStats] = useState({ providers: 500, states: 38, rating: 4.9 });
  const [founding, setFounding] = useState({ available: true, used: 0, max: 50 });
  const [openFaq, setOpenFaq] = useState(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const sliderRef = useRef(null);
  const providersCount = useCounter(stats.providers);
  const statesCount = useCounter(stats.states);
  const ratingCount = useCounter(stats.rating);

  useEffect(() => {
    api.get("/categories").then(r => setCategories(r.data));
    api.get("/providers/featured").then(r => setFeatured(r.data));
    api.get("/providers", { params: { has_video: "true", limit: 6 } }).then(r => setWithVideo(r.data || [])).catch(() => {});
    api.get("/public/stats").then(r => setStats(r.data)).catch(() => {});
    api.get("/promo-codes/founding-status").then(r => setFounding(r.data)).catch(() => {});
  }, []);

  // Auto-advance slider
  useEffect(() => {
    if (categories.length === 0) return;
    const t = setInterval(() => setSlideIdx(i => (i + 1) % categories.length), 4000);
    return () => clearInterval(t);
  }, [categories.length]);

  const onSearch = (e) => {
    if (e?.preventDefault) e.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (loc) p.set("city", loc);
    navigate(`/buscar?${p.toString()}`);
  };

  // Geolocation chip on the hero — hand the work off to /buscar via
  // ?nearme=1 so the public search page (which already owns the
  // useGeolocation hook + radius selector) takes over from there.
  const handleNearMe = () => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("nearme", "1");
    navigate(`/buscar?${p.toString()}`);
  };

  // SmartServiceSearch tells us when the user picked a canonical service
  // (e.g. clicked "Limpieza" in the dropdown). Navigate to /buscar with the
  // ES label so the backend's smart search re-expands it correctly + carry
  // the slug for direct category filtering when available.
  const onPickService = (match) => {
    const p = new URLSearchParams();
    p.set("q", match.label);
    if (match.slug) p.set("category", match.slug);
    if (loc) p.set("city", loc);
    navigate(`/buscar?${p.toString()}`);
  };

  const testimonials = [
    { name: "Carmen R.", city: "Tulsa, OK", text: lang === "es" ? "Encontré una catering latina increíble. ¡Toda mi familia quedó feliz!" : "Found an amazing Latino catering. My family was so happy!" },
    { name: "Roberto M.", city: "Dallas, TX", text: lang === "es" ? "Como proveedor, getamano me trajo más clientes que cualquier red social en un mes." : "As a provider, getamano brought me more clients than any social network." },
    { name: "Lupita V.", city: "Phoenix, AZ", text: lang === "es" ? "Por fin una plataforma seria, en español, hecha para nosotros." : "Finally, a serious platform in Spanish, made for us." },
  ];

  const faqs = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />

      {/* FOUNDING MEMBER BANNER */}
      {founding.available && (
        <Link to="/registro?intent=provider&promo=GETAMANO50" className="block bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 text-white py-2.5 text-center text-sm font-medium hover:brightness-110 transition" data-testid="founding-banner">
          <Award className="w-4 h-4 inline mr-1.5" /> <strong>Founding Members</strong> · Plan Pro gratis hasta 2027 con código <code className="bg-white/20 px-1.5 py-0.5 rounded">GETAMANO50</code> · {founding.max - founding.used} cupos restantes <ArrowRight className="w-4 h-4 inline ml-1" />
        </Link>
      )}

      {/* HERO with animated background */}
      <section className="hero-section relative overflow-hidden">
        <div className="hero-background absolute inset-0" style={{
          background: "linear-gradient(135deg, #063154 0%, #0A4D5E 50%, #025F67 100%)",
          backgroundSize: "300% 300%",
          animation: "auroraShift 60s ease infinite",
        }} />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
        <style>{`
          @keyframes auroraShift { 0%,100%{background-position:0% 50%}50%{background-position:100% 50%} }
          @keyframes shimmer { 0%{transform:translateX(-100%)}100%{transform:translateX(200%)} }
          @keyframes float { 0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)} }
          @keyframes pulse-dot { 0%,100%{opacity:1}50%{opacity:.4} }
          @keyframes draw-divider { from{transform:scaleX(0)}to{transform:scaleX(1)} }
          @keyframes scroll-x { from{transform:translateX(0)}to{transform:translateX(-50%)} }

          /* SECTION 21 — Mobile-only hero gradient. Desktop unchanged.
             The default 3-stop teal gradient is too saturated when it covers
             100% of a phone viewport — it reads as a wall of green. On mobile
             we transition from deep brand black to a very desaturated teal,
             letting #025F67 show only as a soft accent at the bottom. */
          @media (max-width: 767px) {
            .hero-background {
              background: linear-gradient(170deg, #0A0A0A 0%, #0D1F1E 45%, #0A3535 75%, #025F67 100%) !important;
              background-size: 100% 100% !important;
              animation: none !important;
            }
            .hero-section {
              min-height: auto;
            }
          }
        `}</style>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 md:pt-20 md:pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-300 text-xs font-semibold tracking-widest uppercase border border-orange-400/20">
                <Sparkles className="w-3.5 h-3.5" /> {t("hero.eyebrow")}
              </span>
              <h1 className="font-display mt-5 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1] break-words">
                <Typewriter text={t("hero.typewriter")} className="inline" />
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed animate-in fade-in-50 duration-700 delay-700">
                {t("hero.subtitle")}
              </p>

              <form onSubmit={onSearch} className="mt-8 bg-white rounded-2xl p-2 flex flex-col md:flex-row gap-2 transition-shadow" style={{ boxShadow: "0 0 40px rgba(255, 107, 44, 0.25)" }} data-testid="hero-search-form">
                <div className="flex-1 min-w-0">
                  <SmartServiceSearch
                    value={q}
                    onChange={setQ}
                    onSelect={onPickService}
                    onSubmit={(qq) => { setQ(qq); onSearch(); }}
                    placeholder={lang === "en" ? "What service do you need?" : "¿Qué servicio buscas?"}
                    testid="hero-smart-search"
                    className="[&_input]:!h-11 [&_input]:!border-0 [&_input]:!ring-0 [&_input]:!rounded-xl"
                  />
                </div>
                <div className="md:max-w-[260px] min-w-0 md:border-l border-slate-200 md:pl-2">
                  <CitySearchInput
                    value={loc}
                    onChange={(c, _stateName, stateAbbr) => {
                      const display = c && stateAbbr ? `${c}, ${stateAbbr}` : c || "";
                      setLoc(display);
                    }}
                    placeholder={lang === "en" ? "City or ZIP" : "Ciudad o ZIP"}
                    compact
                    onUseGeolocation={handleNearMe}
                  />
                </div>
                <button type="submit" className="relative overflow-hidden btn-secondary flex items-center justify-center gap-1 w-full md:w-auto" data-testid="hero-search-submit">
                  <span className="relative z-10">Buscar</span>
                  <ArrowRight className="w-4 h-4 relative z-10" />
                  <span className="absolute inset-0 -translate-x-full" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)", animation: "shimmer 3s infinite" }} />
                </button>
              </form>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link to="/registro?intent=provider" className="btn-primary" data-testid="hero-cta-open-ecard">Quiero abrir mi eCard</Link>
                <Link to="/buscar" className="px-6 py-3 rounded-full text-white/90 border border-white/20 hover:bg-white/10 font-medium" data-testid="hero-cta-explore">Explorar servicios</Link>
                {isPwaInstalled ? (
                  <span
                    className="px-5 py-3 rounded-full font-semibold text-sm inline-flex items-center gap-2"
                    style={{
                      background: "linear-gradient(135deg, rgba(34,197,94,0.22) 0%, rgba(34,197,94,0.12) 100%)",
                      border: "1px solid rgba(74,222,128,0.5)",
                      color: "#86EFAC",
                      backdropFilter: "blur(12px)",
                    }}
                    data-testid="hero-app-installed-badge"
                  >
                    <Check className="w-4 h-4" />
                    {lang === "en" ? "App installed" : "App instalada"}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={openInstallModal}
                    className="group relative px-5 py-3 rounded-full font-semibold text-sm inline-flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.99]"
                    style={{
                      background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 100%)",
                      border: "1px solid rgba(255,255,255,0.35)",
                      color: "white",
                      backdropFilter: "blur(12px)",
                    }}
                    data-testid="hero-cta-download-app"
                  >
                    <Smartphone className="w-4 h-4" />
                    {lang === "en" ? "Get the app" : "Descarga la app"}
                    <span
                      className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full"
                      style={{ background: "#FF6B2C", boxShadow: "0 0 0 4px rgba(255,107,44,0.25)", animation: "pulse-dot 1.8s infinite" }}
                    />
                  </button>
                )}
              </div>

              {/* Founding Members live urgency counter */}
              <div className="mt-5 max-w-xl">
                <FoundingCounter variant="hero" />
              </div>

              {/* Animated stats */}
              <div className="mt-8 flex flex-wrap gap-2">
                <StatPill icon={ShieldCheck} value={`${Math.round(providersCount)}+`} label="proveedores verificados" />
                <StatPill icon={Globe2} value={`${Math.round(statesCount)}`} label="estados cubiertos" />
                <StatPill icon={Star} value={ratingCount.toFixed(1)} label="calificación promedio" />
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="absolute -inset-6 bg-gradient-to-br from-blue-500/20 via-transparent to-orange-500/20 rounded-[3rem] blur-3xl" />
              <img src={HERO_IMG} alt="getamano marketplace" className="relative rounded-[2rem] shadow-2xl object-cover w-full h-[520px]" loading="lazy" />
              <div className="absolute -bottom-4 -left-4 rounded-2xl p-4 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.2)", animation: "float 4s ease-in-out infinite" }} data-testid="hero-rating-card">
                <div className="flex -space-x-2">
                  <div className="w-9 h-9 rounded-full bg-orange-400 border-2 border-white/40" />
                  <div className="w-9 h-9 rounded-full bg-blue-400 border-2 border-white/40" />
                  <div className="w-9 h-9 rounded-full bg-green-400 border-2 border-white/40" />
                </div>
                <div className="text-white">
                  <div className="flex items-center gap-1"><Star className="w-4 h-4 fill-orange-400 text-orange-400" /> {ratingCount.toFixed(1)} / 5</div>
                  <div className="text-xs text-white/70 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ animation: "pulse-dot 1.5s infinite" }} /> En vivo · +1,200 reseñas</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live ticker — fed by /api/activity-feed */}
        <LiveActivityTicker />
      </section>

      {/* SECTION 33 — Featured paid providers reel */}
      <FeaturedProvidersReel />

      {/* CATEGORY SLIDER */}
      <section className="bg-white py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <span className="inline-block text-xs uppercase tracking-widest font-semibold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">✦ Servicios disponibles</span>
          <h2 className="font-display mt-3 text-3xl md:text-5xl font-bold text-slate-900 tracking-tight">Encuentra el profesional perfecto</h2>
          <p className="text-slate-500 mt-2">Más de {stats.providers} proveedores verificados en todo Estados Unidos</p>
        </div>
        <div className="relative">
          <div ref={sliderRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-4 sm:px-6 lg:px-8 pb-4 scroll-smooth scrollbar-none" style={{ scrollbarWidth: "thin" }} data-testid="category-slider">
            {categories.map((c) => (
              <CategoryCard
                key={c.category_id}
                category={c}
                name={lang === "es" ? c.name_es : c.name_en}
                providerCount={c.provider_count || 0}
                lang={lang}
              />
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 hidden md:flex items-center pl-2">
            <button onClick={() => sliderRef.current?.scrollBy({ left: -340, behavior: "smooth" })} className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center" data-testid="slider-prev"><ChevronLeft className="w-5 h-5" /></button>
          </div>
          <div className="absolute inset-y-0 right-0 hidden md:flex items-center pr-2">
            <button onClick={() => sliderRef.current?.scrollBy({ left: 340, behavior: "smooth" })} className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center" data-testid="slider-next"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA (dark) */}
      <section className="how-it-works-section relative text-white py-16 md:py-24 overflow-hidden" style={{ backgroundColor: "#063154" }}>
        <style>{`
          /* SECTION 21 — Soften this dark section on mobile so it doesn't read
             as a second wall of saturated navy after the hero. */
          @media (max-width: 767px) {
            .how-it-works-section {
              background-color: #0A1F2E !important;
              padding-top: 56px !important;
              padding-bottom: 56px !important;
            }
          }
        `}</style>
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,140,68,0.18), transparent 50%)" }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight text-white">Cómo funciona</h2>
          <div className="mt-12 grid md:grid-cols-3 gap-6 relative">
            {[
              { icon: Search, title: "Busca", desc: "Filtra por ciudad, categoría, idioma o reputación.", color: "from-blue-500/20 to-blue-500/0", border: "border-blue-400/30" },
              { icon: Heart, title: "Conecta", desc: "Llama, escribe o pide cotización directamente.", color: "from-orange-500/20 to-orange-500/0", border: "border-orange-400/30" },
              { icon: ShieldCheck, title: "Confía", desc: "Todos los destacados están verificados.", color: "from-green-500/20 to-green-500/0", border: "border-green-400/30" },
            ].map((s, i) => (
              <div key={i} className={`relative p-8 rounded-3xl border ${s.border} backdrop-blur bg-gradient-to-br ${s.color}`} data-testid={`how-step-${i + 1}`}>
                <div className="absolute -top-4 -left-4 w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center font-display font-bold text-2xl text-white">{i + 1}</div>
                <s.icon className="w-12 h-12 mx-auto mb-4 text-white" />
                <h3 className="font-display font-bold text-2xl text-white">{s.title}</h3>
                <p className="text-white/80 mt-3 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DUAL AUDIENCE split */}
      <section className="grid md:grid-cols-2">
        <div className="text-white p-12 md:p-16" style={{ backgroundColor: "#063154" }}>
          <h3 className="font-display text-3xl font-bold text-white">Para clientes</h3>
          <ul className="mt-6 space-y-3 text-white/90">
            {["Servicios reales y verificados", "Profesionales que hablan tu idioma", "Reseñas auténticas de la comunidad"].map((b, i) => (
              <li key={i} className="flex items-start gap-3"><CheckCircle2 className="w-5 h-5 text-orange-300 mt-0.5" /> {b}</li>
            ))}
          </ul>
          <Link to="/buscar" className="btn-primary inline-flex mt-8">Explorar servicios</Link>
        </div>
        <div className="relative text-white p-12 md:p-16 overflow-hidden" style={{ background: "linear-gradient(135deg, #2F9D94, #025F67)" }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(45deg, white 0, white 1px, transparent 1px, transparent 20px)" }} />
          <div className="relative">
            <h3 className="font-display text-3xl font-bold text-white">Para proveedores</h3>
            <ul className="mt-6 space-y-3 text-white/95">
              {["Tu eCard digital profesional", "Más clientes en tu zona", "Analytics y solicitudes en un lugar"].map((b, i) => (
                <li key={i} className="flex items-start gap-3"><TrendingUp className="w-5 h-5 text-white mt-0.5" /> {b}</li>
              ))}
            </ul>
            <Link to="/registro?intent=provider" className="inline-flex mt-8 px-6 py-3 rounded-full bg-white text-orange-600 font-medium hover:brightness-105">Quiero abrir mi eCard</Link>
          </div>
        </div>
      </section>

      {/* FEATURED */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Proveedores destacados</h2>
          <p className="text-slate-500 mt-2">Profesionales verificados por getamano.</p>
          <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map(p => (
              <Link key={p.provider_id} to={`/proveedor/${p.slug}`} className={`card-lift bg-white rounded-2xl border ${p.plan === "premium" ? "border-orange-300 shadow-orange-100 shadow-xl" : "border-slate-200"} overflow-hidden block`} data-testid={`featured-provider-${p.slug}`}>
                <div className="h-40 bg-slate-100 relative">
                  {p.cover_url && <img src={p.cover_url} alt={p.business_name} className="w-full h-full object-cover" loading="lazy" />}
                  <div className="absolute top-3 left-3 badge-verified"><ShieldCheck className="w-3.5 h-3.5" /> Verificado</div>
                  {p.owner_identity && <span className="absolute top-3 right-3"><OwnerIdentityBadge identity={p.owner_identity} size="sm" /></span>}
                </div>
                <div className="p-5">
                  <h3 className="font-display font-semibold text-lg text-slate-900">{p.business_name}</h3>
                  <p className="text-sm text-slate-500">{p.city}{p.state ? `, ${p.state}` : ""}</p>
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    {p.rating_count > 0 && <span className="flex items-center gap-1 text-slate-800"><Star className="w-4 h-4 fill-orange-500 text-orange-500" /> {p.rating_avg.toFixed(1)}</span>}
                    {(p.likes_count || 0) > 0 && <span className="text-slate-600">👍 {p.likes_count}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* DESTACADOS CON VIDEO — palanca de conversión Free → Pro */}
      {withVideo.length > 0 && (
        <section
          className="py-16 md:py-24"
          style={{ background: "linear-gradient(180deg, #F7F6F2 0%, #EBF8F7 100%)" }}
          data-testid="landing-featured-video-section"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3" style={{ backgroundColor: "#025F67", color: "#FFFFFF" }}>
                  <Video className="w-3.5 h-3.5" /> NUEVO
                </div>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight" style={{ color: "#025F67" }}>
                  Conoce a tu próximo proveedor en video
                </h2>
                <p className="text-slate-600 mt-2 max-w-xl">
                  Mira cómo trabajan, escucha su historia y elige con confianza. Estos proveedores Pro grabaron un video corto para ti.
                </p>
              </div>
              <Link
                to="/buscar?has_video=true"
                className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
                style={{ color: "#025F67" }}
                data-testid="landing-video-see-all"
              >
                Ver todos con video <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {withVideo.slice(0, 3).map(p => {
                const isPlaying = playingVideo === p.provider_id;
                return (
                  <div
                    key={p.provider_id}
                    className="card-lift bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col"
                    data-testid={`landing-video-card-${p.slug}`}
                  >
                    <div className="relative aspect-video bg-slate-900 overflow-hidden">
                      {isPlaying ? (
                        <video
                          src={buildFileUrl(p.video_url)}
                          controls
                          autoPlay
                          preload="metadata"
                          className="absolute inset-0 w-full h-full object-cover"
                          data-testid={`landing-video-player-${p.slug}`}
                        />
                      ) : (
                        <>
                          {p.cover_url ? (
                            <img src={p.cover_url} alt={p.business_name} className="absolute inset-0 w-full h-full object-cover opacity-80" loading="lazy" />
                          ) : (
                            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #2F9D94 0%, #025F67 100%)" }} />
                          )}
                          <button
                            type="button"
                            onClick={() => setPlayingVideo(p.provider_id)}
                            className="absolute inset-0 flex items-center justify-center group bg-black/20 hover:bg-black/30 transition"
                            data-testid={`landing-video-play-${p.slug}`}
                            aria-label={`Reproducir video de ${p.business_name}`}
                          >
                            <span className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                              <Play className="w-7 h-7 ml-1" style={{ color: "#025F67" }} fill="currentColor" />
                            </span>
                          </button>
                          <span
                            className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white"
                            style={{ backgroundColor: "rgba(2, 95, 103, 0.92)" }}
                          >
                            <Video className="w-3 h-3" /> Video
                          </span>
                        </>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display font-semibold text-base truncate" style={{ color: "#025F67" }}>
                          {p.business_name}
                        </h3>
                        {p.rating_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold flex-shrink-0" style={{ color: "#063154" }}>
                            <Star className="w-3.5 h-3.5 fill-current" style={{ color: "#F59E0B" }} /> {Number(p.rating_avg).toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {p.city}{p.state ? `, ${p.state}` : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {p.verification_status === "approved" && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#EBF8F7", color: "#025F67", border: "1px solid #A6E1DA" }}>
                            <ShieldCheck className="w-2.5 h-2.5" /> Verificado
                          </span>
                        )}
                        <OwnerIdentityBadge identity={p.owner_identity} size="sm" />
                      </div>
                      <Link
                        to={`/proveedor/${p.slug}`}
                        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                        style={{ color: "#025F67" }}
                        data-testid={`landing-video-card-link-${p.slug}`}
                      >
                        Ver perfil completo <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* TESTIMONIALS dark */}
      <section className="relative text-white py-16 md:py-24 overflow-hidden" style={{ backgroundColor: "#063154" }}>
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 50% 100%, rgba(255,140,68,0.22), transparent 60%)" }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight text-center text-white">Lo que dice la comunidad</h2>
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {testimonials.map((tt, i) => (
              <div key={i} className="relative p-6 rounded-3xl border border-white/10 backdrop-blur" style={{ background: "rgba(255,255,255,0.04)" }} data-testid={`testimonial-${i}`}>
                <span className="absolute top-0 left-2 font-display text-[120px] leading-none text-orange-500/20 select-none">"</span>
                <div className="relative flex items-center gap-1 text-orange-400 mb-3">
                  {[...Array(5)].map((_, k) => <Star key={k} className="w-4 h-4 fill-orange-400" />)}
                </div>
                <p className="relative text-white/85 leading-relaxed">"{tt.text}"</p>
                <div className="relative mt-4 text-sm"><div className="font-semibold">{tt.name}</div><div className="text-white/50">{tt.city}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-slate-900 tracking-tight text-center">Preguntas frecuentes</h2>
        <div className="mt-10 space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full px-6 py-5 flex items-center justify-between text-left font-medium text-slate-900" data-testid={`faq-item-${i}`}>
                {f.q}
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
              </button>
              {openFaq === i && <div className="px-6 pb-5 text-slate-600 leading-relaxed">{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Section 28 — Download badges + QR strip */}
      <DownloadBadgesSection />

      <ProviderCTASection />

      <Footer />
      <PushOptInBanner />
    </div>
  );
}

function StatPill({ icon: Icon, value, label }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm text-white" style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.15)" }}>
      <Icon className="w-4 h-4 text-orange-400" />
      <strong>{value}</strong> <span className="text-white/70">{label}</span>
    </span>
  );
}
