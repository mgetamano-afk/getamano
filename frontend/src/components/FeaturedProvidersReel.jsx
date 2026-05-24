import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MapPin, Star, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { getDicebearAvatar } from "../lib/avatar";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

/**
 * FeaturedProvidersReel — Section 33.
 * Horizontal-scrolling slider on the landing page that surfaces paid-plan
 * providers (basic / pro / premium). This is the visibility benefit of the
 * paid tiers. Free providers do NOT appear here by design.
 *
 * Engagement features:
 *   • Auto-scroll every 3.5s with smooth snap.
 *   • Click-and-drag style snap on the scroll container.
 *   • Heart pop + 12 red spark particles on "Me gusta" (anon-friendly: stored
 *     in localStorage; persists to backend when the user is signed in).
 *   • Referrals badge "✨ N traídos" — gamification per user request to
 *     surface engagement signals in the reel itself.
 */

const PLAN_LABELS = {
  // DB → UI label + colors. Mirrors the tier mapping in the backend.
  premium: { label: "★ Pro", className: "bg-amber-100 text-amber-800 border-amber-200" },
  pro:     { label: "✓ Plus", className: "bg-teal-100 text-teal-800 border-teal-200" },
  basic:   { label: "Activo", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

const COVER_GRADIENTS = [
  "from-teal-700 to-teal-500",
  "from-blue-700 to-sky-500",
  "from-amber-700 to-orange-500",
  "from-pink-700 to-rose-500",
  "from-purple-700 to-fuchsia-500",
  "from-emerald-700 to-green-500",
];

const SPARK_COLORS = ["#E24B4A", "#D4537E", "#F09595", "#F7C1C1", "#FF6B6B", "#FF4757"];

function spawnSparks(buttonEl) {
  if (!buttonEl || typeof document === "undefined") return;
  const rect = buttonEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 12; i++) {
    const spark = document.createElement("div");
    const angle = (i / 12) * 2 * Math.PI + (Math.random() - 0.5) * 0.8;
    const dist = 30 + Math.random() * 25;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const size = 5 + Math.random() * 5;
    const color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
    const duration = 380 + Math.random() * 200;
    const delay = Math.random() * 60;
    spark.style.cssText = `position:fixed;left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:${color};pointer-events:none;z-index:9999;opacity:0;animation:sparkFly ${duration}ms ease-out ${delay}ms forwards;--tx:${tx}px;--ty:${ty}px;`;
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), duration + delay + 80);
  }
}

function readPersistedLikes() {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem("getamano_likes");
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_e) {
    return new Set();
  }
}

function persistLikes(set) {
  try { localStorage.setItem("getamano_likes", JSON.stringify([...set])); } catch (_e) { /* no-op */ }
}

function ReelCard({ provider, index, isLiked, onLike, onCardClick }) {
  const planInfo = PLAN_LABELS[provider.plan] || PLAN_LABELS.basic;
  const cover = COVER_GRADIENTS[index % COVER_GRADIENTS.length];
  const avatar = provider.photo_url || getDicebearAvatar(provider.business_name);
  const ratingLabel = provider.rating ? provider.rating.toFixed(1) : "—";

  const likeBtnRef = useRef(null);

  const handleLikeClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLiked && likeBtnRef.current) {
      const el = likeBtnRef.current;
      el.style.animation = "none";
      void el.offsetWidth; // reflow
      el.style.animation = "heartPop 0.35s cubic-bezier(.36,.07,.19,.97) forwards";
      spawnSparks(el);
    }
    onLike(provider.provider_id);
  };

  return (
    <Link
      to={`/provider/${provider.slug}`}
      onClick={onCardClick}
      className="snap-start flex-shrink-0 w-[176px] sm:w-[200px] group"
      data-testid={`reel-card-${provider.provider_id}`}
    >
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col h-full transition-shadow hover:shadow-md">
        {/* Cover */}
        <div className={`h-[78px] bg-gradient-to-br ${cover} relative flex justify-center`}>
          <span
            className={`absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${planInfo.className}`}
            data-testid={`reel-card-plan-${provider.provider_id}`}
          >
            {planInfo.label}
          </span>
          {provider.is_online && (
            <div
              className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 border border-white ring-1 ring-emerald-400/40"
              data-testid={`reel-card-online-${provider.provider_id}`}
            />
          )}
          <div className="absolute -bottom-[22px] w-[52px] h-[52px] rounded-full border-[3px] border-white overflow-hidden bg-slate-100">
            <img
              src={avatar}
              alt={provider.business_name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { e.currentTarget.src = getDicebearAvatar(provider.business_name); }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="pt-7 px-2.5 pb-2.5 flex flex-col gap-1 flex-1">
          <p className="text-[12px] font-bold text-slate-900 leading-tight truncate">{provider.business_name}</p>
          <p className="text-[10px] text-slate-500 truncate">{provider.main_category}</p>

          <div className="flex flex-wrap gap-1 mt-0.5">
            {provider.verified && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full">
                ✅ Verificado
              </span>
            )}
            {provider.referrals_credited > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"
                title="Trajo proveedores verificados a getamano"
                data-testid={`reel-card-referrals-${provider.provider_id}`}
              >
                <Sparkles className="w-2.5 h-2.5" />
                {provider.referrals_credited} {provider.referrals_credited === 1 ? "traíd@" : "traídos"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 mt-0.5">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="text-[10px] font-bold text-slate-900">{ratingLabel}</span>
            <span className="text-[10px] text-slate-400">({provider.reviews_count})</span>
          </div>

          {provider.city && (
            <p className="text-[10px] text-slate-400 flex items-center gap-0.5 truncate">
              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
              {provider.city}{provider.state ? `, ${provider.state}` : ""}
            </p>
          )}

          {/* Footer — like + counter */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
            <button
              ref={likeBtnRef}
              type="button"
              onClick={handleLikeClick}
              className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-1 rounded-lg border transition-all ${
                isLiked
                  ? "border-rose-300 text-rose-500 bg-rose-50"
                  : "border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-500"
              }`}
              data-testid={`reel-card-like-${provider.provider_id}`}
              aria-pressed={isLiked}
            >
              <span style={{ display: "inline-block" }}>{isLiked ? "♥" : "♡"}</span>
              {isLiked ? "Guardado" : "Me gusta"}
            </button>
            <span className="text-[10px] text-slate-400" data-testid={`reel-card-likes-${provider.provider_id}`}>
              {provider.likes_count || 0}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function FeaturedProvidersReel() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLikes, setUserLikes] = useState(() => readPersistedLikes());
  const [activeIndex, setActiveIndex] = useState(0);
  const sliderRef = useRef(null);
  const { user } = useAuth();

  // Insert global keyframes once
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("reel-spark-style")) return;
    const style = document.createElement("style");
    style.id = "reel-spark-style";
    style.textContent = `
      @keyframes sparkFly { 0% { transform: translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; } }
      @keyframes heartPop { 0% { transform: scale(1); } 40% { transform: scale(1.5); } 70% { transform: scale(0.9); } 100% { transform: scale(1.1); } }
    `;
    document.head.appendChild(style);
  }, []);

  // Fetch reel
  useEffect(() => {
    let alive = true;
    api.get("/providers/featured-reel")
      .then((r) => { if (alive) setProviders(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (alive) setProviders([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Auto-scroll every 3.5s — only when we have at least 3 items and the user
  // hasn't interacted with the slider recently.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (providers.length < 2 || paused) return;
    const id = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % providers.length;
        // each card is ~188px wide (176 mobile + gap-3=12) on small screens
        const cardWidth = (sliderRef.current?.firstChild?.firstChild?.offsetWidth || 188) + 12;
        sliderRef.current?.scrollTo({ left: next * cardWidth, behavior: "smooth" });
        return next;
      });
    }, 3500);
    return () => clearInterval(id);
  }, [providers.length, paused]);

  const handleScroll = () => {
    if (!sliderRef.current) return;
    const cardWidth = (sliderRef.current?.firstChild?.firstChild?.offsetWidth || 188) + 12;
    const idx = Math.round(sliderRef.current.scrollLeft / cardWidth);
    setActiveIndex(idx);
  };

  const onUserInteract = () => {
    setPaused(true);
    // Resume auto-scroll after 8s of inactivity
    if (window._reelResumeTimer) clearTimeout(window._reelResumeTimer);
    window._reelResumeTimer = setTimeout(() => setPaused(false), 8000);
  };

  const toggleLike = async (providerId) => {
    const isLiked = userLikes.has(providerId);
    const next = new Set(userLikes);
    if (isLiked) next.delete(providerId); else next.add(providerId);
    setUserLikes(next);
    persistLikes(next);
    // Optimistic counter
    setProviders((arr) => arr.map((p) => p.provider_id === providerId
      ? { ...p, likes_count: Math.max(0, (p.likes_count || 0) + (isLiked ? -1 : 1)) }
      : p
    ));
    // Persist to backend only if signed in. Otherwise stay local.
    if (user) {
      try {
        await api.post(`/providers/${providerId}/like`);
      } catch (_e) {
        // revert
        const back = new Set(next);
        if (isLiked) back.add(providerId); else back.delete(providerId);
        setUserLikes(back);
        persistLikes(back);
      }
    } else if (!isLiked) {
      // Quietly nudge anonymous users — once per session
      try {
        if (!sessionStorage.getItem("reel_like_nudged")) {
          toast.info("Inicia sesión para sincronizar tus favoritos");
          sessionStorage.setItem("reel_like_nudged", "1");
        }
      } catch (_e) { /* no-op */ }
    }
  };

  if (loading) {
    return (
      <section className="py-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
          <div className="mt-4 flex gap-3 overflow-x-hidden">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="w-[176px] h-[220px] bg-slate-100 rounded-2xl animate-pulse flex-shrink-0" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (providers.length === 0) return null; // Hide the section if no paid providers

  const dotCount = Math.min(providers.length, 8);

  return (
    <section className="py-10 bg-white" data-testid="featured-reel-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <span className="inline-block text-[10px] uppercase tracking-widest font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              <Sparkles className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Destacados de la semana
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-2 tracking-tight">
              Proveedores destacados
            </h2>
            <p className="text-sm text-slate-500 mt-1">Verificados · Latinos · Activos esta semana</p>
          </div>
          <Link
            to="/search"
            className="text-teal-700 text-sm font-semibold flex items-center gap-1 hover:text-teal-800 transition mt-2 whitespace-nowrap"
            data-testid="featured-reel-see-all"
          >
            Ver todos <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Slider */}
        <div
          ref={sliderRef}
          onScroll={handleScroll}
          onMouseDown={onUserInteract}
          onTouchStart={onUserInteract}
          className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth"
          style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none", msOverflowStyle: "none" }}
          data-testid="featured-reel-slider"
        >
          <style>{`[data-testid="featured-reel-slider"]::-webkit-scrollbar{display:none}`}</style>
          {providers.map((p, i) => (
            <ReelCard
              key={p.provider_id}
              provider={p}
              index={i}
              isLiked={userLikes.has(p.provider_id)}
              onLike={toggleLike}
              onCardClick={onUserInteract}
            />
          ))}
        </div>

        {/* Dots */}
        {providers.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3" aria-hidden="true">
            {Array.from({ length: dotCount }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === activeIndex % dotCount ? "w-4 bg-teal-600" : "w-1.5 bg-slate-300"
                }`}
              />
            ))}
          </div>
        )}

        {/* Conversion sub-text */}
        <p className="text-center text-xs text-slate-500 mt-4">
          ¿Eres proveedor?{" "}
          <Link to="/plans" className="text-teal-700 hover:underline font-semibold" data-testid="featured-reel-upgrade-link">
            Aparece aquí desde $10/mes →
          </Link>
        </p>
      </div>
    </section>
  );
}
