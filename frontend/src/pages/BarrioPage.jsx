import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { MapPin, Sparkles, ShieldCheck, Users, AlertCircle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import StoriesCarousel from "../components/StoriesCarousel";
import LikeButton from "../components/LikeButton";
import EmptyState from "../components/EmptyState";
import TrustScore, { calcTrustScore } from "../components/TrustScore";
import { buildFileUrl } from "../components/ImageUpload";
import { resolveAvatar } from "../lib/avatar";

/**
 * BarrioPage — Section 89 v4.
 *
 * Hyperlocal feed mounted at `/comunidad/barrio` (and the
 * `/community/barrio` alias). Wraps the community-post feed in:
 *   · a city chip + distance radius selector (10/25/50/100/160 mi)
 *   · a "Destacados esta semana" horizontal carousel of featured
 *     providers in the user's area
 *   · the global Stories carousel (open to all users)
 *   · an inline Trust Score card injected between posts #3 and #4 when
 *     the logged-in user is a provider (gentle nudge to complete the
 *     profile without breaking the scroll rhythm).
 *
 * Posts are filtered client-side by author city. We don't need a new
 * backend endpoint for V4 phase A — the community feed already returns
 * `author_city` per post.
 */

const RADIUS_OPTIONS = [10, 25, 50, 100, 160];
const DEFAULT_RADIUS = 50;
const STORAGE_KEY = "barrio_radius";

function relTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "ahora";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  try {
    return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  } catch { return ""; }
}

function loadRadius() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = parseInt(raw, 10);
    if (RADIUS_OPTIONS.includes(n)) return n;
  } catch { /* noop */ }
  return DEFAULT_RADIUS;
}

function saveRadius(n) {
  try { localStorage.setItem(STORAGE_KEY, String(n)); } catch { /* noop */ }
}

export default function BarrioPage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [radius, setRadius] = useState(loadRadius());
  const [myProfile, setMyProfile] = useState(null);  // for inline TrustScore card
  const [featured, setFeatured] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  // Resolve the user's locality: provider profile city → user country.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    api.get("/providers/me").then(r => {
      if (!alive) return;
      const prof = r.data || null;
      setMyProfile(prof);
      if (prof?.city) setCity(prof.city);
      if (prof?.state) setState(prof.state);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  // Load featured providers (city-aware when we know the city)
  useEffect(() => {
    let alive = true;
    setFeaturedLoading(true);
    const params = { limit: 12 };
    if (city) params.city = city;
    if (state) params.state = state;
    api.get("/providers", { params }).then(r => {
      if (!alive) return;
      const items = (r.data || []).slice(0, 8);
      setFeatured(items);
      setFeaturedLoading(false);
    }).catch(() => { if (alive) setFeaturedLoading(false); });
    return () => { alive = false; };
  }, [city, state]);

  const onRadiusChange = (n) => { setRadius(n); saveRadius(n); };

  return (
    <div data-testid="barrio-page" className="pb-12">
      <BarrioHeader
        city={city}
        state={state}
        radius={radius}
        onRadiusChange={onRadiusChange}
        lang={lang}
      />

      <div className="px-3 sm:px-4 max-w-3xl mx-auto pt-3">
        <StoriesCarousel />

        <FeaturedStrip
          providers={featured}
          loading={featuredLoading}
          city={city}
          lang={lang}
        />

        <BarrioFeed
          city={city}
          radius={radius}
          myProfile={myProfile}
          lang={lang}
        />
      </div>
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────
function BarrioHeader({ city, state, radius, onRadiusChange, lang }) {
  return (
    <div className="sticky z-30 bg-[#F0F9FF]/95 backdrop-blur border-b border-slate-200 px-3 sm:px-4 pt-3 pb-2.5" style={{ top: "var(--barrio-header-top, 0px)" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-display font-extrabold text-xl text-[#03045E] mr-1">
            {lang === "en" ? "Neighborhood" : "Barrio"}
          </h1>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-white border border-slate-200 text-xs font-semibold text-[#0077B6]"
            data-testid="barrio-city-chip"
          >
            <MapPin className="w-3.5 h-3.5" />
            {city ? `${city}${state ? `, ${state}` : ""}` : (lang === "en" ? "Anywhere in the US" : "Toda EE.UU.")}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1" data-testid="barrio-radius-chips">
          {RADIUS_OPTIONS.map((mi) => {
            const active = mi === radius;
            return (
              <button
                key={mi}
                type="button"
                onClick={() => onRadiusChange(mi)}
                className={`flex-shrink-0 h-8 px-3 rounded-full text-xs font-semibold transition ${
                  active
                    ? "bg-[#0077B6] text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-[#0077B6]"
                }`}
                data-testid={`barrio-radius-${mi}`}
                aria-pressed={active}
              >
                {mi} {lang === "en" ? "mi" : "mi"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Featured strip ─────────────────────────────────────────────────────
function FeaturedStrip({ providers, loading, city, lang }) {
  if (loading) {
    return (
      <div className="mt-4 mb-5 flex gap-3 overflow-x-auto scrollbar-none px-1 -mx-1" data-testid="barrio-featured-loading">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-44 h-32 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!providers.length) return null;
  return (
    <section className="mt-4 mb-5" data-testid="barrio-featured-strip">
      <header className="flex items-end justify-between mb-2 px-1">
        <h2 className="text-[13px] uppercase tracking-widest font-bold text-[#03045E] inline-flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-500" />
          {lang === "en" ? "Featured this week" : "Destacados esta semana"}
        </h2>
        {city && (
          <span className="text-[11px] font-medium text-slate-500">{city}</span>
        )}
      </header>
      <div className="flex gap-3 overflow-x-auto scrollbar-none px-1 -mx-1 pb-1">
        {providers.map(p => (
          <Link
            key={p.provider_id}
            to={`/p/${p.slug}`}
            className="flex-shrink-0 w-44 rounded-2xl bg-white border border-slate-200 hover:border-[#0077B6] hover:shadow-md transition overflow-hidden"
            data-testid={`barrio-featured-${p.slug}`}
          >
            <div className="h-20 bg-gradient-to-br from-[#CAF0F8] to-[#90E0EF] relative">
              {p.cover_url && (
                <img src={buildFileUrl(p.cover_url)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              )}
              {p.provider_verified && (
                <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  {lang === "en" ? "Verified" : "Verificado"}
                </span>
              )}
            </div>
            <div className="px-2.5 py-2">
              <p className="font-semibold text-[13px] text-[#03045E] truncate">{p.business_name}</p>
              <p className="text-[11px] text-slate-500 truncate">
                {p.category?.[lang === "en" ? "name_en" : "name_es"] || ""}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <TrustScore profile={p} variant="tile" />
                {p.getamano_code && (
                  <span className="font-mono text-[10px] font-bold text-slate-500">{p.getamano_code}</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Inline Trust Score card (injected between posts) ──────────────────
function InlineTrustCard({ profile, lang }) {
  const score = calcTrustScore(profile);
  if (score === null) return null;
  const nextStep = !profile.provider_verified
    ? (lang === "en" ? "Verify your profile to unlock badge ✓" : "Verifícate y desbloquea tu ✓")
    : (profile.portfolio_count || 0) < 5
      ? (lang === "en" ? "Add 5 portfolio photos to keep growing" : "Suma 5 fotos al portafolio")
      : (profile.reviews_count || 0) < 3
        ? (lang === "en" ? "Ask 3 clients for a review" : "Pide 3 reseñas a tus clientes")
        : (lang === "en" ? "Keep showing up — small steps win" : "Sigue activo cada semana — la constancia gana");
  return (
    <div className="rounded-2xl border border-[#90E0EF] bg-gradient-to-br from-white to-[#F0F9FF] p-4 sm:p-5" data-testid="barrio-inline-trust">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[11px] uppercase tracking-widest font-bold text-[#0077B6]">
          {lang === "en" ? "Your trust score" : "Tu Trust Score"}
        </span>
        <TrustScore profile={profile} variant="tile" />
      </div>
      <p className="text-sm text-slate-700 leading-snug">
        <strong className="font-bold text-[#03045E]">{score}/100.</strong>{" "}
        {nextStep}
      </p>
      <Link
        to="/dashboard/provider"
        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#0077B6] hover:underline"
        data-testid="barrio-inline-trust-cta"
      >
        {lang === "en" ? "Open dashboard" : "Abrir panel"} →
      </Link>
    </div>
  );
}

// ─── Post composer (minimal, reuses /community/posts) ──────────────────
function PostComposer({ user, onPosted, lang }) {
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600" data-testid="barrio-newpost-anon">
        <Link to="/login" className="font-semibold text-[#0077B6] hover:underline">
          {lang === "en" ? "Sign in" : "Inicia sesión"}
        </Link>{" "}
        {lang === "en" ? "to post in your neighborhood." : "para publicar en tu barrio."}
      </div>
    );
  }
  const submit = async () => {
    const txt = content.trim();
    if (!txt) return;
    setPosting(true);
    try {
      await api.post("/community/posts", { content: txt });
      setContent("");
      toast.success(lang === "en" ? "Posted!" : "¡Publicado!");
      onPosted();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setPosting(false); }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4" data-testid="barrio-newpost">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value.slice(0, 500))}
        placeholder={lang === "en" ? "What's happening in your neighborhood?" : "¿Qué pasa en tu barrio?"}
        rows={2}
        className="w-full px-2 py-1.5 text-sm rounded-lg outline-none focus:ring-2 focus:ring-[#90E0EF] resize-none"
        data-testid="barrio-newpost-textarea"
        maxLength={500}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-slate-400">{content.length}/500</span>
        <button
          type="button"
          onClick={submit}
          disabled={posting || !content.trim()}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-gradient-to-r from-[#0077B6] to-[#00B4D8] text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition"
          data-testid="barrio-newpost-submit"
        >
          {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {lang === "en" ? "Post" : "Publicar"}
        </button>
      </div>
    </div>
  );
}

// ─── Feed ───────────────────────────────────────────────────────────────
function BarrioFeed({ city, radius, myProfile, lang }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const endpoint = user ? "/community/posts/feed" : "/community/posts";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(endpoint, { params: { limit: 30 } });
      setPosts(r.data?.items || []);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || "Error");
    } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  // City filter. If we know the user's city, narrow the feed. Otherwise
  // show everything (national).
  const filtered = useMemo(() => {
    if (!city) return posts;
    const cityLower = city.toLowerCase();
    const local = posts.filter(p => ((p.author?.city) || "").toLowerCase() === cityLower);
    // Soft fallback: if hyperlocal is empty, do not show "0 posts" forever
    // — show the broader feed but flag them as "outside your area".
    return local.length ? local : posts;
  }, [posts, city]);

  const renderInlineTrust = user && myProfile && myProfile.provider_id;

  return (
    <section className="mt-2 mb-6 space-y-3" data-testid="barrio-feed">
      <PostComposer user={user} onPosted={load} lang={lang} />
      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#0077B6] animate-spin" />
        </div>
      ) : error ? (
        <EmptyState
          icon={<AlertCircle className="w-9 h-9" />}
          title={lang === "en" ? "Couldn't load the feed" : "No pudimos cargar el feed"}
          subtitle={error}
          primaryAction={{ label: lang === "en" ? "Retry" : "Reintentar", onClick: load }}
          testid="barrio-feed-error"
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={<Users className="w-9 h-9" />}
          title={lang === "en" ? "No posts yet in your area" : "Aún no hay publicaciones en tu zona"}
          subtitle={lang === "en"
            ? `Be the first within ${radius} miles to share something.`
            : `Sé la primera persona en ${radius} millas en compartir algo.`}
          testid="barrio-feed-empty"
        />
      ) : (
        filtered.map((p, idx) => (
          <div key={p.post_id}>
            <PostCard post={p} lang={lang} />
            {renderInlineTrust && idx === 2 && (
              <div className="mt-3">
                <InlineTrustCard profile={myProfile} lang={lang} />
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}

// ─── Post card (compact, V4-styled) ────────────────────────────────────
function PostCard({ post, lang }) {
  const author = post.author || {};
  const [liked, setLiked] = useState(!!post.liked_by_me);
  const [likes, setLikes] = useState(post.likes_count || 0);
  const [pending, setPending] = useState(false);
  const onLike = async () => {
    if (pending) return;
    setPending(true);
    setLiked(!liked);
    setLikes((n) => n + (liked ? -1 : 1));
    try { await api.post(`/community/posts/${post.post_id}/like`); }
    catch { setLiked(liked); setLikes(post.likes_count || 0); }
    finally { setPending(false); }
  };
  const isProvider = author.role === "provider" || !!author.is_provider;
  const verified = !!author.provider_verified;
  const slug = author.slug || null;
  return (
    <article
      className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm"
      data-testid={`barrio-post-${post.post_id}`}
    >
      <header className="flex items-center gap-3 mb-2">
        <Link
          to={slug ? `/p/${slug}` : "#"}
          className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 ring-2 ring-white flex-shrink-0"
        >
          <img
            src={resolveAvatar(author.picture, author.name)}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-[#03045E] truncate inline-flex items-center gap-1">
            {author.business_name || author.name || "—"}
            {verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
          </p>
          <p className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
            <span>{relTime(post.created_at)}</span>
            {author.city && (
              <span className="inline-flex items-center gap-0.5">· <MapPin className="w-2.5 h-2.5" />{author.city}</span>
            )}
            {author.getamano_code && (
              <span className="font-mono">· {author.getamano_code}</span>
            )}
          </p>
        </div>
        {isProvider && verified && slug && (
          <Link
            to={`/p/${slug}`}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-[#0077B6] text-white text-xs font-bold active:scale-95"
            data-testid={`barrio-post-contact-${post.post_id}`}
          >
            {lang === "en" ? "Contact" : "Contactar"}
          </Link>
        )}
        {isProvider && !verified && slug && (
          <Link
            to={`/p/${slug}`}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-slate-100 text-slate-700 text-xs font-bold active:scale-95"
            data-testid={`barrio-post-view-${post.post_id}`}
          >
            {lang === "en" ? "View" : "Ver"}
          </Link>
        )}
      </header>
      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
        {post.content}
      </p>
      {post.image_url && (
        <img
          src={buildFileUrl(post.image_url)}
          alt=""
          className="mt-3 rounded-xl w-full max-h-[480px] object-cover"
          loading="lazy"
        />
      )}
      <footer className="mt-3 flex items-center gap-3">
        <LikeButton
          liked={liked}
          count={likes}
          onClick={onLike}
          disabled={pending}
          size="md"
          testid={`barrio-post-like-${post.post_id}`}
        />
        {post.comments_count > 0 && (
          <span className="text-xs text-slate-500" data-testid={`barrio-post-comments-count-${post.post_id}`}>
            {post.comments_count} {lang === "en" ? "comments" : "comentarios"}
          </span>
        )}
      </footer>
    </article>
  );
}
