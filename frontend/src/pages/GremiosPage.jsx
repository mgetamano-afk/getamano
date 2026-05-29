import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Users, Plus, ShieldCheck, MessageCircle, Loader2, Send, X, Heart, ArrowLeft, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import EmptyState from "../components/EmptyState";
import { buildFileUrl } from "../components/ImageUpload";
import { resolveAvatar } from "../lib/avatar";

/**
 * GremiosPage — Section 89 v4.
 *
 * Private per-category communities for providers. Mounted at
 * `/comunidad/gremios` (and `/community/gremios`). Two views:
 *
 *   1. List view (default) — a grid of categories sorted by member count.
 *      Joined gremios get a "Miembro" pill; the rest a "Unirse" CTA.
 *      Only providers (users with an active provider_profile) can join.
 *
 *   2. Single-gremio feed — when the user picks one, we render the
 *      internal post stream with a post composer, like + reply actions.
 *      Non-providers can read everything but cannot post (a gentle
 *      lock banner replaces the composer for them).
 *
 * Backend contract: see /app/backend/routes/v4_social.py for the
 * complete endpoint list.
 */

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
  try { return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }); } catch { return ""; }
}

export default function GremiosPage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const [active, setActive] = useState(null); // category slug
  const [activeCategoryDoc, setActiveCategoryDoc] = useState(null);
  const [categories, setCategories] = useState([]);
  const [memberCounts, setMemberCounts] = useState({}); // category -> count
  const [myMemberships, setMyMemberships] = useState(new Set());
  const [myProvider, setMyProvider] = useState(null);

  // Fetch base data on mount
  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get("/categories").then(r => r.data).catch(() => []),
      api.get("/gremios").then(r => r.data).catch(() => []),
      user ? api.get("/providers/me").then(r => r.data).catch(() => null) : Promise.resolve(null),
    ]).then(([cats, gremios, prof]) => {
      if (!alive) return;
      setCategories(cats || []);
      const counts = {};
      (gremios || []).forEach(g => { counts[g.gremio_category] = g.members || 0; });
      setMemberCounts(counts);
      setMyProvider(prof);
    });
    return () => { alive = false; };
  }, [user]);

  // Hydrate my memberships by intersecting categories ∩ gremios I joined.
  // Backend doesn't expose a per-user endpoint yet; we keep an
  // optimistic cache in localStorage so joins are reflected instantly.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("my_gremios");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setMyMemberships(new Set(parsed));
    } catch { /* noop */ }
  }, []);

  const persistMemberships = (next) => {
    try { localStorage.setItem("my_gremios", JSON.stringify(Array.from(next))); } catch { /* noop */ }
  };

  const join = async (slug) => {
    if (!user) { toast.message(lang === "en" ? "Sign in" : "Inicia sesión"); return; }
    if (!myProvider?.provider_id) {
      toast.message(lang === "en"
        ? "Activate your provider profile to join a guild"
        : "Activa tu perfil de proveedor para unirte a un gremio");
      return;
    }
    try {
      await api.post(`/gremios/${slug}/join`);
      const next = new Set(myMemberships); next.add(slug);
      setMyMemberships(next); persistMemberships(next);
      setMemberCounts((cur) => ({ ...cur, [slug]: (cur[slug] || 0) + 1 }));
      toast.success(lang === "en" ? "You're in!" : "¡Estás dentro!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    }
  };

  const leave = async (slug) => {
    try {
      await api.delete(`/gremios/${slug}/leave`);
      const next = new Set(myMemberships); next.delete(slug);
      setMyMemberships(next); persistMemberships(next);
      setMemberCounts((cur) => ({ ...cur, [slug]: Math.max(0, (cur[slug] || 0) - 1) }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    }
  };

  // ─── List view ordering (must be computed before any early return) ──
  // Joined first, then by member count desc, then alphabetical.
  const ordered = useMemo(() => {
    const list = (categories || []).map(c => ({
      ...c,
      _members: memberCounts[c.slug] || 0,
      _joined: myMemberships.has(c.slug),
    }));
    list.sort((a, b) => (b._joined - a._joined) || (b._members - a._members) || a.name_es.localeCompare(b.name_es));
    return list;
  }, [categories, memberCounts, myMemberships]);

  // ─── Detail view ──────────────────────────────────────────────────────
  if (active) {
    return (
      <GremioFeed
        slug={active}
        categoryDoc={activeCategoryDoc}
        onBack={() => { setActive(null); setActiveCategoryDoc(null); }}
        isMember={myMemberships.has(active)}
        canPost={!!myProvider?.provider_id}
        onJoin={() => join(active)}
        onLeave={() => leave(active)}
        lang={lang}
      />
    );
  }

  // ─── List view ────────────────────────────────────────────────────────

  return (
    <div data-testid="gremios-page" className="px-3 sm:px-4 max-w-3xl mx-auto pt-5 pb-12">
      <header className="mb-4">
        <h1 className="font-display font-extrabold text-2xl text-[#03045E] inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-[#0077B6]" />
          {lang === "en" ? "Guilds" : "Gremios"}
        </h1>
        <p className="text-sm text-slate-600 mt-1 leading-snug">
          {lang === "en"
            ? "Private communities by trade. Compare prices, ask for help, post warnings — all between providers of the same craft."
            : "Comunidades privadas por oficio. Comparte precios, pide consejos, advierte de problemas — entre proveedores del mismo gremio."}
        </p>
      </header>

      {!user && (
        <div className="rounded-2xl bg-[#F0F9FF] border border-[#90E0EF] p-3.5 mb-4 text-sm text-[#03045E]" data-testid="gremios-anon">
          <Link to="/login" className="font-bold underline">{lang === "en" ? "Sign in" : "Inicia sesión"}</Link>{" "}
          {lang === "en" ? "to see and join your guilds." : "para ver y unirte a tus gremios."}
        </div>
      )}

      {!ordered.length ? (
        <EmptyState
          icon={<Users className="w-9 h-9" />}
          title={lang === "en" ? "No guilds yet" : "Aún no hay gremios"}
          subtitle={lang === "en" ? "Be the first to spark conversation in your trade." : "Sé la primera persona en encender la conversación de tu oficio."}
          testid="gremios-empty"
        />
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="gremios-list">
          {ordered.map((c) => (
            <li key={c.category_id || c.slug}>
              <button
                type="button"
                onClick={() => { setActive(c.slug); setActiveCategoryDoc(c); }}
                className="w-full text-left rounded-2xl bg-white border border-slate-200 hover:border-[#0077B6] hover:shadow-md transition p-4 group"
                data-testid={`gremio-card-${c.slug}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-[#03045E] text-base truncate">
                      {lang === "en" ? (c.name_en || c.name_es) : c.name_es}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(memberCounts[c.slug] || 0)} {lang === "en" ? "members" : "miembros"}
                    </p>
                  </div>
                  {c._joined ? (
                    <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold flex-shrink-0">
                      <ShieldCheck className="w-3 h-3" />
                      {lang === "en" ? "Member" : "Miembro"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#0077B6] text-white text-[11px] font-bold flex-shrink-0">
                      <Plus className="w-3 h-3" strokeWidth={3} />
                      {lang === "en" ? "Open" : "Abrir"}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Feed view ─────────────────────────────────────────────────────────
function GremioFeed({ slug, categoryDoc, onBack, isMember, canPost, onJoin, onLeave, lang }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/gremios/${slug}/posts`, { params: { limit: 50 } });
      setPosts(r.data || []);
    } finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const title = lang === "en"
    ? (categoryDoc?.name_en || categoryDoc?.name_es || slug)
    : (categoryDoc?.name_es || slug);

  return (
    <div data-testid="gremio-feed" className="px-3 sm:px-4 max-w-3xl mx-auto pt-3 pb-12">
      <header className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
          data-testid="gremio-feed-back"
          aria-label={lang === "en" ? "Back" : "Atrás"}
        >
          <ArrowLeft className="w-5 h-5 text-[#03045E]" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-extrabold text-lg text-[#03045E] truncate">
            <span className="text-[#0077B6] mr-1">●</span>
            {lang === "en" ? `Guild · ${title}` : `Gremio · ${title}`}
          </h1>
          <p className="text-[11px] text-slate-500">
            {posts.length} {lang === "en" ? "posts" : "publicaciones"}
          </p>
        </div>
        {isMember ? (
          <button
            type="button"
            onClick={onLeave}
            className="h-9 px-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
            data-testid="gremio-feed-leave"
          >
            {lang === "en" ? "Leave" : "Salir"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            className="h-9 px-3.5 rounded-full bg-[#0077B6] hover:bg-[#005f93] text-white text-xs font-bold"
            data-testid="gremio-feed-join"
          >
            {lang === "en" ? "Join" : "Unirme"}
          </button>
        )}
      </header>

      {/* Composer / lock banner */}
      {canPost ? (
        <GremioComposer
          slug={slug}
          onPosted={load}
          lang={lang}
          open={composerOpen}
          setOpen={setComposerOpen}
        />
      ) : (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-sm text-amber-900 inline-flex items-center gap-2 mb-3" data-testid="gremio-feed-lock">
          <Lock className="w-4 h-4 flex-shrink-0" />
          {user ? (
            <span>
              {lang === "en"
                ? "Activate your provider profile to post here."
                : "Activa tu perfil de proveedor para publicar aquí."}
            </span>
          ) : (
            <span>
              <Link to="/login" className="font-bold underline">{lang === "en" ? "Sign in" : "Inicia sesión"}</Link>{" "}
              {lang === "en" ? "to participate." : "para participar."}
            </span>
          )}
        </div>
      )}

      {/* Posts */}
      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#0077B6] animate-spin" />
        </div>
      ) : !posts.length ? (
        <EmptyState
          icon={<MessageCircle className="w-9 h-9" />}
          title={lang === "en" ? "Be the first to post" : "Sé la primera persona en publicar"}
          subtitle={lang === "en"
            ? "Talk to other providers in your trade. Prices, gotchas, leads, anything that helps."
            : "Conversa con otras personas del oficio. Precios, advertencias, contactos — lo que sume."}
          testid="gremio-feed-empty"
        />
      ) : (
        <ul className="space-y-3" data-testid="gremio-posts-list">
          {posts.map(p => (
            <li key={p.id}>
              <GremioPostCard post={p} lang={lang} canPost={canPost} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Composer ──────────────────────────────────────────────────────────
function GremioComposer({ slug, onPosted, lang, open, setOpen }) {
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full mb-3 rounded-2xl bg-white border border-slate-200 hover:border-[#0077B6] hover:bg-[#F0F9FF] transition p-3.5 text-sm text-slate-500 text-left"
        data-testid="gremio-composer-trigger"
      >
        {lang === "en" ? "Share something with the guild…" : "Comparte algo con tu gremio…"}
      </button>
    );
  }
  const submit = async () => {
    const txt = content.trim();
    if (!txt) return;
    setPosting(true);
    try {
      await api.post(`/gremios/${slug}/posts`, { content: txt });
      setContent(""); setOpen(false); onPosted();
      toast.success(lang === "en" ? "Posted in the guild" : "Publicado en el gremio");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setPosting(false); }
  };
  return (
    <div className="rounded-2xl bg-white border border-[#90E0EF] p-3.5 mb-3" data-testid="gremio-composer">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value.slice(0, 2000))}
        placeholder={lang === "en" ? "Share prices, tips, warnings…" : "Comparte precios, tips, advertencias…"}
        rows={3}
        className="w-full px-2 py-1.5 text-sm rounded-lg outline-none focus:ring-2 focus:ring-[#90E0EF] resize-none"
        data-testid="gremio-composer-textarea"
        maxLength={2000}
        autoFocus
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-slate-400">{content.length}/2000</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => { setOpen(false); setContent(""); }}
            className="h-9 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
            data-testid="gremio-composer-cancel"
          >
            {lang === "en" ? "Cancel" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={posting || !content.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-gradient-to-r from-[#0077B6] to-[#00B4D8] text-white text-xs font-bold disabled:opacity-50"
            data-testid="gremio-composer-submit"
          >
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {lang === "en" ? "Post" : "Publicar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Post card with replies ────────────────────────────────────────────
function GremioPostCard({ post, lang, canPost }) {
  const author = post.author || {};
  const [likes, setLikes] = useState(post.likes_count || 0);
  const [liked, setLiked] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState([]);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [posting, setPosting] = useState(false);

  const onLike = async () => {
    if (likePending) return;
    setLikePending(true);
    setLiked(!liked); setLikes(n => n + (liked ? -1 : 1));
    try {
      const r = await api.post(`/gremios/posts/${post.id}/like`);
      setLiked(!!r.data?.liked);
    } catch { setLiked(liked); setLikes(post.likes_count || 0); }
    finally { setLikePending(false); }
  };

  const loadReplies = async () => {
    try {
      const r = await api.get(`/gremios/posts/${post.id}/replies`);
      setReplies(r.data || []); setRepliesLoaded(true);
    } catch { /* noop */ }
  };

  const toggleReplies = () => {
    if (!showReplies && !repliesLoaded) loadReplies();
    setShowReplies(s => !s);
  };

  const sendReply = async () => {
    const txt = replyText.trim();
    if (!txt) return;
    setPosting(true);
    try {
      const r = await api.post(`/gremios/posts/${post.id}/replies`, { content: txt });
      setReplies(prev => [...prev, r.data]);
      setReplyText("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setPosting(false); }
  };

  return (
    <article className="rounded-2xl bg-white border border-slate-200 p-4" data-testid={`gremio-post-${post.id}`}>
      <header className="flex items-center gap-3 mb-2">
        <Link
          to={author.slug ? `/p/${author.slug}` : "#"}
          className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 ring-2 ring-white flex-shrink-0"
        >
          <img
            src={resolveAvatar(author.avatar_url, author.business_name || author.name)}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-[#03045E] truncate inline-flex items-center gap-1">
            {author.business_name || author.name || "—"}
            {author.provider_verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
          </p>
          <p className="text-[11px] text-slate-500">
            {relTime(post.created_at)}
            {author.getamano_code && <span className="font-mono ml-1.5">· {author.getamano_code}</span>}
            {post.city && <span className="ml-1.5">· {post.city}</span>}
          </p>
        </div>
      </header>
      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
        {post.content}
      </p>
      {post.image_url && (
        <img
          src={buildFileUrl(post.image_url)}
          alt=""
          className="mt-3 rounded-xl w-full max-h-[420px] object-cover"
          loading="lazy"
        />
      )}
      <footer className="mt-3 flex items-center gap-4 text-xs text-slate-600">
        <button
          type="button"
          onClick={onLike}
          disabled={likePending}
          className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-full transition ${liked ? "text-rose-500 font-bold" : "hover:text-rose-500"}`}
          data-testid={`gremio-post-like-${post.id}`}
        >
          <Heart className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />
          {likes}
        </button>
        <button
          type="button"
          onClick={toggleReplies}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full hover:text-[#0077B6] transition"
          data-testid={`gremio-post-replies-toggle-${post.id}`}
        >
          <MessageCircle className="w-4 h-4" />
          {post.replies_count || replies.length || 0}
        </button>
      </footer>
      {showReplies && (
        <div className="mt-3 pl-4 border-l-2 border-slate-100 space-y-2" data-testid={`gremio-replies-${post.id}`}>
          {replies.map(r => (
            <div key={r.id} className="text-sm" data-testid={`gremio-reply-${r.id}`}>
              <p className="text-[12px] font-semibold text-[#03045E]">
                {r.author?.business_name || r.author?.name || "—"}
                <span className="text-[11px] text-slate-400 font-normal ml-1.5">{relTime(r.created_at)}</span>
              </p>
              <p className="text-slate-700">{r.content}</p>
            </div>
          ))}
          {canPost ? (
            <div className="flex gap-2 pt-1">
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value.slice(0, 1000))}
                placeholder={lang === "en" ? "Add a reply" : "Responde"}
                className="flex-1 h-9 px-3 rounded-full bg-slate-50 border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#90E0EF]"
                data-testid={`gremio-reply-input-${post.id}`}
                onKeyDown={(e) => { if (e.key === "Enter" && !posting) sendReply(); }}
              />
              <button
                type="button"
                onClick={sendReply}
                disabled={posting || !replyText.trim()}
                className="h-9 w-9 rounded-full bg-[#0077B6] text-white disabled:opacity-40 flex items-center justify-center"
                data-testid={`gremio-reply-submit-${post.id}`}
                aria-label={lang === "en" ? "Send reply" : "Enviar respuesta"}
              >
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
