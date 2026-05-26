import { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import Header from "../components/Header";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { Sparkles, Heart, Loader2, ChevronRight, ShieldCheck, ArrowRight, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { buildFileUrl } from "../components/ImageUpload";
import EmptyState from "../components/EmptyState";
import LikeButton from "../components/LikeButton";

const STYLE_FILTERS = [
  { id: "", emoji: "✨", labelEs: "Todos", labelEn: "All" },
  { id: "modern", emoji: "✨", labelEs: "Moderno", labelEn: "Modern" },
  { id: "festive", emoji: "🎉", labelEs: "Festivo", labelEn: "Festive" },
  { id: "professional", emoji: "💼", labelEs: "Profesional", labelEn: "Professional" },
  { id: "minimal", emoji: "🤍", labelEs: "Minimalista", labelEn: "Minimalist" },
  { id: "warm", emoji: "🌅", labelEs: "Cálido", labelEn: "Warm" },
];

export default function BannerGalleryPage() {
  const { user } = useAuth();
  const { lang, changeLang } = useI18n();
  const location = useLocation();
  // Soft URL→language pin: /banner-gallery deep-links should display EN, /galeria-banners ES.
  // We only flip when the route disagrees with current lang to avoid loops.
  useEffect(() => {
    const isEnRoute = location.pathname.startsWith("/banner-gallery");
    const isEsRoute = location.pathname.startsWith("/galeria-banners");
    if (isEnRoute && lang !== "en") changeLang("en");
    else if (isEsRoute && lang !== "es") changeLang("es");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("popular"); // popular | recent
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [likeStates, setLikeStates] = useState({}); // share_id -> boolean
  const [pendingLikes, setPendingLikes] = useState({}); // share_id -> bool (in-flight)
  const [modal, setModal] = useState(null); // selected banner for lightbox

  const fetchPage = useCallback(async (reset = false) => {
    const baseOffset = reset ? 0 : offset;
    if (reset) { setLoading(true); setItems([]); }
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ sort, limit: "18", offset: String(baseOffset) });
      if (filter) params.set("style", filter);
      const { data } = await api.get(`/banners/public?${params.toString()}`);
      const newItems = data.items || [];
      setItems((cur) => reset ? newItems : [...cur, ...newItems]);
      setNextOffset(data.next_offset);
      setOffset(baseOffset + newItems.length);
      // Hydrate like states for authenticated users
      if (user && newItems.length) {
        try {
          const states = await Promise.all(
            newItems.map((it) => api.get(`/banners/${it.share_id}/like-state`).then(r => ({ id: it.share_id, liked: r.data.liked })).catch(() => null))
          );
          setLikeStates((cur) => {
            const next = { ...cur };
            states.forEach((s) => { if (s) next[s.id] = s.liked; });
            return next;
          });
        } catch { /* ignore */ }
      }
    } catch {
      toast.error(lang === "en" ? "Couldn't load gallery" : "No se pudo cargar la galería");
    } finally {
      setLoading(false); setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort, user, lang]);

  useEffect(() => { fetchPage(true); /* eslint-disable-next-line */ }, [filter, sort]);

  const toggleLike = async (share_id, isOwn) => {
    if (isOwn) return; // server will 400 anyway
    if (!user) {
      toast.message(lang === "en" ? "Sign in to like banners" : "Inicia sesión para dar like");
      return;
    }
    if (pendingLikes[share_id]) return;
    setPendingLikes((cur) => ({ ...cur, [share_id]: true }));
    // Optimistic
    const wasLiked = likeStates[share_id];
    setLikeStates((cur) => ({ ...cur, [share_id]: !wasLiked }));
    setItems((cur) => cur.map((it) => it.share_id === share_id ? { ...it, likes: (it.likes || 0) + (wasLiked ? -1 : 1) } : it));
    try {
      const { data } = await api.post(`/banners/${share_id}/like`);
      setLikeStates((cur) => ({ ...cur, [share_id]: data.liked }));
      setItems((cur) => cur.map((it) => it.share_id === share_id ? { ...it, likes: data.likes } : it));
    } catch (e) {
      // revert
      setLikeStates((cur) => ({ ...cur, [share_id]: wasLiked }));
      setItems((cur) => cur.map((it) => it.share_id === share_id ? { ...it, likes: (it.likes || 0) + (wasLiked ? 1 : -1) } : it));
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setPendingLikes((cur) => { const n = { ...cur }; delete n[share_id]; return n; });
    }
  };

  const trackView = (share_id) => {
    api.post(`/banners/${share_id}/view`).catch(() => {});
  };

  const openLightbox = (banner) => {
    setModal(banner);
    trackView(banner.share_id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" data-testid="banner-gallery-page">
      <Header />
      <main className="container mx-auto px-4 md:px-6 py-8 pb-24">
        {/* Hero */}
        <div className="max-w-3xl mx-auto text-center mb-10 animate-fadeSlideUp">
          <div className="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-gradient-to-r from-pink-100 to-orange-100 text-pink-700 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            {lang === "en" ? "Banner showcase" : "Galería de banners"}
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 mt-3 leading-tight">
            {lang === "en"
              ? "The most beautiful banners from our Latino community"
              : "Los banners más bonitos de la comunidad latina"}
          </h1>
          <p className="text-base md:text-lg text-slate-500 mt-4 max-w-2xl mx-auto">
            {lang === "en"
              ? "Real businesses showing off — generated with AI in seconds. Click any banner to see who's behind it, and like the ones that inspire you."
              : "Negocios reales presumiendo lo suyo — generados con IA en segundos. Toca cualquier banner para conocer al proveedor detrás, y dale like a los que te inspiren."}
          </p>
          {user?.role === "provider" && (
            <Link
              to="/dashboard/provider"
              className="inline-flex items-center gap-2 mt-6 px-5 h-11 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-sm font-medium hover:from-pink-600 hover:to-rose-600 transition"
              data-testid="gallery-make-banner-cta"
            >
              <Sparkles className="w-4 h-4" />
              {lang === "en" ? "Create my own banner" : "Crear mi propio banner"}
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Filter + sort row */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-8 max-w-5xl mx-auto">
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="gallery-filters">
            {STYLE_FILTERS.map((f) => (
              <button
                key={f.id || "all"}
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium border transition flex-shrink-0 ${filter === f.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                data-testid={`gallery-filter-${f.id || "all"}`}
              >
                <span>{f.emoji}</span>
                {lang === "en" ? f.labelEn : f.labelEs}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-full p-1 self-start sm:self-auto">
            <button
              onClick={() => setSort("popular")}
              className={`px-3 h-7 rounded-full text-xs font-medium transition ${sort === "popular" ? "bg-slate-900 text-white" : "text-slate-500"}`}
              data-testid="gallery-sort-popular"
            >
              {lang === "en" ? "Popular" : "Populares"}
            </button>
            <button
              onClick={() => setSort("recent")}
              className={`px-3 h-7 rounded-full text-xs font-medium transition ${sort === "recent" ? "bg-slate-900 text-white" : "text-slate-500"}`}
              data-testid="gallery-sort-recent"
            >
              {lang === "en" ? "Recent" : "Recientes"}
            </button>
          </div>
        </div>

        {/* Grid */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="gallery-loading">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-[1200/630] rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="max-w-2xl mx-auto" data-testid="gallery-empty-wrap">
            <EmptyState
              testid="gallery-empty"
              icon={<Sparkles className="w-9 h-9" />}
              title={lang === "en" ? "No banners yet in this category" : "Aún no hay banners en esta categoría"}
              subtitle={lang === "en"
                ? "Be the first to publish — generate your own banner from the Pro Banner tab in your dashboard."
                : "Sé el primero en publicar — genera tu propio banner desde la pestaña Banner Pro en tu panel."}
              primaryAction={user?.role === "provider" ? {
                label: lang === "en" ? "Create my banner" : "Crear mi banner",
                onClick: () => { window.location.href = "/dashboard/provider"; },
              } : null}
              tags={STYLE_FILTERS.filter(f => f.id && f.id !== filter).slice(0, 3).map(f => ({
                label: `${f.emoji} ${lang === "en" ? f.labelEn : f.labelEs}`,
                onClick: () => setFilter(f.id),
              }))}
            />
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-7xl mx-auto" data-testid="gallery-grid">
            {items.map((b) => {
              const isOwn = user && user.user_id === b.provider_user_id;
              const liked = !!likeStates[b.share_id];
              const profilePath = lang === "en" && b.provider_slug ? `/provider/${b.provider_slug}` : (b.provider_slug ? `/p/${b.provider_slug}` : "#");
              return (
                <div
                  key={b.share_id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition duration-300"
                  data-testid={`gallery-card-${b.share_id}`}
                >
                  <button
                    type="button"
                    onClick={() => openLightbox(b)}
                    className="block w-full text-left"
                    data-testid={`gallery-card-open-${b.share_id}`}
                  >
                    <div className="aspect-[1200/630] bg-slate-100 overflow-hidden relative">
                      <img
                        src={buildFileUrl(b.image_url)}
                        alt={b.business_name || ""}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                      {/* Style ribbon */}
                      <span
                        className="absolute top-3 left-3 inline-flex items-center gap-1.5 pl-2 pr-3 h-7 rounded-full bg-white/95 backdrop-blur text-xs font-semibold text-slate-700 shadow-sm"
                        data-testid={`gallery-card-style-${b.share_id}`}
                      >
                        <span
                          className="inline-block w-3.5 h-3.5 rounded-full ring-2 ring-white"
                          style={{ backgroundColor: b.color }}
                          aria-hidden="true"
                        />
                        {STYLE_FILTERS.find((s) => s.id === b.style)?.emoji || "✨"}
                        {STYLE_FILTERS.find((s) => s.id === b.style)?.[lang === "en" ? "labelEn" : "labelEs"] || b.style}
                      </span>
                      {b.pinned && (
                        <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-amber-500 text-white text-[10px] font-bold shadow">
                          ⭐ {lang === "en" ? "Featured" : "Destacado"}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={profilePath} className="flex items-center gap-2 min-w-0 group/name" data-testid={`gallery-card-provider-${b.share_id}`}>
                        {b.logo_url ? (
                          <img src={buildFileUrl(b.logo_url)} alt="" className="w-9 h-9 rounded-full object-cover bg-slate-100" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-sm font-bold text-teal-700">
                            {(b.business_name || "?")[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate group-hover/name:text-teal-700 transition">
                            {b.business_name}
                            {b.verified && <ShieldCheck className="w-3.5 h-3.5 inline-block ml-1 text-emerald-500" />}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {[b.city, b.state].filter(Boolean).join(", ") || "—"}
                          </p>
                        </div>
                      </Link>
                      <LikeButton
                        liked={liked}
                        count={b.likes || 0}
                        onClick={() => toggleLike(b.share_id, isOwn)}
                        disabled={isOwn || !!pendingLikes[b.share_id]}
                        size="sm"
                        testid={`gallery-like-${b.share_id}`}
                        ariaLabel={liked ? (lang === "en" ? "Unlike" : "Quitar like") : (lang === "en" ? "Like" : "Dar like")}
                        disabledTitle={isOwn ? (lang === "en" ? "You can't like your own banner" : "No puedes dar like a tu propio banner") : ""}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {!loading && nextOffset !== null && (
          <div className="text-center mt-8">
            <button
              type="button"
              onClick={() => fetchPage(false)}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-white border border-slate-200 hover:border-slate-400 text-slate-700 text-sm font-medium disabled:opacity-60"
              data-testid="gallery-load-more"
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loadingMore ? (lang === "en" ? "Loading..." : "Cargando...") : (lang === "en" ? "Load more banners" : "Cargar más banners")}
            </button>
          </div>
        )}
      </main>

      {/* Lightbox modal */}
      {modal && (
        <div
          className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-fadeSlideUp"
          onClick={() => setModal(null)}
          data-testid="gallery-modal"
        >
          <div className="max-w-5xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <img
                src={buildFileUrl(modal.image_url)}
                alt={modal.business_name}
                className="w-full aspect-[1200/630] object-cover bg-slate-100"
              />
              <button
                type="button"
                onClick={() => setModal(null)}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur"
                data-testid="gallery-modal-close"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-bold text-xl text-slate-900 truncate">
                    {modal.business_name}
                    {modal.verified && <ShieldCheck className="w-5 h-5 inline-block ml-1 text-emerald-500" />}
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {[modal.city, modal.state].filter(Boolean).join(", ") || "—"} · {STYLE_FILTERS.find((s) => s.id === modal.style)?.[lang === "en" ? "labelEn" : "labelEs"] || modal.style}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <LikeButton
                    liked={!!likeStates[modal.share_id]}
                    count={modal.likes || 0}
                    onClick={() => toggleLike(modal.share_id, user && user.user_id === modal.provider_user_id)}
                    disabled={(user && user.user_id === modal.provider_user_id) || !!pendingLikes[modal.share_id]}
                    size="md"
                    testid="gallery-modal-like"
                    ariaLabel={lang === "en" ? "Like this banner" : "Dar like a este banner"}
                  />
                  <Link
                    to={(lang === "en" && modal.provider_slug) ? `/provider/${modal.provider_slug}` : (modal.provider_slug ? `/p/${modal.provider_slug}` : "#")}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium"
                    data-testid="gallery-modal-view-ecard"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {lang === "en" ? "View eCard" : "Ver eCard"}
                  </Link>
                </div>
              </div>
              {/* CTA */}
              {user?.role === "provider" && (
                <Link
                  to="/dashboard/provider"
                  className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-100 hover:from-pink-100 hover:to-rose-100 transition"
                  data-testid="gallery-modal-make-cta"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-pink-900">
                      {lang === "en" ? "Like this style?" : "¿Te gusta este estilo?"}
                    </p>
                    <p className="text-xs text-pink-700">
                      {lang === "en" ? "Create your own banner in 30 seconds with AI" : "Crea el tuyo en 30 segundos con IA"}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-pink-700" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
