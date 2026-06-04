import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  MessageCircle, Share2, Trash2, Trophy, Image as ImageIcon,
  Search, Bell, Users, Sparkles, Bookmark, Settings, X, Send,
  Home as HomeIcon, Briefcase, Loader2, Globe, MapPin, ArrowUp, RefreshCw, HeartHandshake, Compass
} from "lucide-react";
import { toast } from "sonner";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import EmptyState from "../components/EmptyState";
import StoriesCarousel from "../components/StoriesCarousel";
import LikeButton from "../components/LikeButton";
import { useAuth } from "../contexts/AuthContext";
import { getDicebearAvatar, getDefaultAvatar, resolveAvatar } from "../lib/avatar";
import MentionedText from "../components/MentionedText";
import FollowingFeed from "../components/FollowingFeed";
import { SeoHead } from "../components/seo/SeoHead";
import useRefreshable from "../hooks/useRefreshable";
import {
  useBarrio,
  BarrioHeader,
  FeaturedStrip,
  InlineTrustCard,
  barrioCityFilter,
} from "../components/BarrioOverlay";

const MAX_LEN = 500;

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
  try { return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }); } catch (_e) { return ""; }
}

// ─── Stories Row ────────────────────────────────────────────────────────
// Section 76 — `StoriesRow` (provider directory mini-carousel) merged
// into the main `StoriesCarousel` so users see ONE Instagram-style row
// per provider, not two stacked rows. The new component handles both
// "providers with active stories" and "add your own story" via the
// + tile.

// ─── New Post Box ───────────────────────────────────────────────────────
function NewPostBox({ onPosted }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-4 text-center text-sm text-slate-600" data-testid="comunidad-newpost-anon">
        <Link to="/login" className="font-semibold text-[#0077B6] hover:underline">Inicia sesión</Link> para publicar en la comunidad.
      </div>
    );
  }

  const pickImage = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpe?g|png|webp|gif|heic)$/i.test(file.type)) {
      toast.error("Solo imágenes (jpg/png/webp/gif/heic)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La imagen supera 10 MB");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImageUrl(r.data?.url || null);
      toast.success("Imagen lista");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No se pudo subir la imagen");
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    }
  };

  const removeImage = () => setImageUrl(null);

  const submit = async () => {
    if (content.trim().length < 4 && !imageUrl) {
      toast.error("Escribe al menos 4 caracteres o sube una imagen.");
      return;
    }
    setPosting(true);
    try {
      const r = await api.post("/community/posts", {
        content: content.trim(),
        image_url: imageUrl,
      });
      onPosted?.(r.data);
      setContent("");
      setImageUrl(null);
      toast.success("¡Publicado!");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No se pudo publicar.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4" data-testid="comunidad-newpost">
      <div className="flex gap-3">
        <img
          src={resolveAvatar({picture: user.picture, user_id: user.user_id, name: user.name, gender: user.gender})}
          alt={user.name}
          className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-slate-100"
          onError={(e) => {
            if (e.currentTarget.dataset.fellback) return;
            e.currentTarget.dataset.fellback = "1";
            e.currentTarget.src = getDefaultAvatar({ user_id: user.user_id, name: user.name, gender: user.gender });
          }}
        />
        <div className="flex-1 min-w-0">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value.slice(0, MAX_LEN))}
            placeholder="¿Qué quieres compartir con la comunidad?"
            rows={2}
            className="w-full text-sm border-none outline-none resize-none placeholder-slate-400"
            data-testid="comunidad-newpost-textarea"
          />
          {imageUrl && (
            <div className="relative mt-2 inline-block" data-testid="comunidad-newpost-preview">
              <img src={imageUrl} alt="" className="max-h-40 rounded-xl border border-slate-200" />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/85"
                aria-label="Quitar imagen"
                data-testid="comunidad-newpost-remove-image"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/heic"
            className="hidden"
            onChange={handleFileChange}
            data-testid="comunidad-newpost-file-input"
          />
          <div className="flex items-center justify-between mt-2 gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={pickImage}
                disabled={uploading || !!imageUrl}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0077B6] hover:bg-[#CAF0F8]/40 px-2 py-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
                data-testid="comunidad-newpost-image-button"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                {uploading ? "Subiendo…" : "Foto"}
              </button>
              <span className="text-[11px] text-slate-400" data-testid="comunidad-newpost-counter">{content.length}/{MAX_LEN}</span>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={posting || uploading || (content.trim().length < 4 && !imageUrl)}
              className="px-5 py-2 rounded-full text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
              data-testid="comunidad-newpost-submit"
            >
              {posting ? "Publicando…" : "Publicar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Comments Thread (replaces modal — Section 36b) ─────────────
function InlineComments({ post, expanded, onCommentCountChanged }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  // Lazy-load when expanded the first time
  useEffect(() => {
    if (expanded && !loaded) {
      setLoading(true);
      api.get(`/community/posts/${post.post_id}/comments`)
        .then(r => setComments(r.data?.items || []))
        .catch(() => setComments([]))
        .finally(() => { setLoading(false); setLoaded(true); });
    }
  }, [expanded, loaded, post.post_id]);

  if (!expanded) return null;

  const send = async () => {
    if (content.trim().length < 1) return;
    if (!user) { toast.info("Inicia sesión para comentar"); return; }
    setSending(true);
    try {
      const r = await api.post(`/community/posts/${post.post_id}/comments`, { content: content.trim() });
      setComments(prev => [...prev, r.data]);
      setContent("");
      onCommentCountChanged?.(1);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No se pudo comentar");
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId) => {
    if (!window.confirm("¿Eliminar comentario?")) return;
    setComments(prev => prev.filter(c => c.comment_id !== commentId));
    try {
      await api.delete(`/community/comments/${commentId}`);
      onCommentCountChanged?.(-1);
      toast.success("Comentario eliminado");
    } catch (_e) {
      toast.error("No se pudo eliminar");
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100" data-testid={`inline-comments-${post.post_id}`}>
      {loading && (
        <div className="text-center py-2 text-slate-400 text-xs flex items-center justify-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando comentarios…
        </div>
      )}

      {/* Thread — same post, threaded layout (avatar rail on the left) */}
      {!loading && comments.length > 0 && (
        <ul className="space-y-2.5 mb-3" data-testid={`inline-comments-list-${post.post_id}`}>
          {comments.map(c => {
            const isOwn = c.user_id === user?.user_id;
            const a = c.author || {};
            const avatar = resolveAvatar({picture: a.picture, logo_url: a.logo_url, user_id: a.user_id || a.provider_id, name: a.business_name || a.name, gender: a.gender});
            return (
              <li key={c.comment_id} className="flex gap-2.5" data-testid={`inline-comment-${c.comment_id}`}>
                <Link to={a.slug ? `/provider/${a.slug}` : "#"} className="flex-shrink-0">
                  <img src={avatar} alt={a.name} className="w-7 h-7 rounded-full object-cover" loading="lazy" />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {a.slug ? (
                        <Link to={`/provider/${a.slug}`} className="text-xs font-bold text-slate-900 hover:underline">{a.business_name || a.name}</Link>
                      ) : (
                        <span className="text-xs font-bold text-slate-900">{a.name}</span>
                      )}
                      {a.is_provider && (
                        <span className="text-[9px] font-bold text-[#0077B6] bg-[#CAF0F8] px-1 py-0.5 rounded">✓</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap" data-testid={`inline-comment-content-${c.comment_id}`}>
                      <MentionedText text={c.content} />
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 px-2 text-[10px] text-slate-400">
                    <span>{relTime(c.created_at)}</span>
                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => remove(c.comment_id)}
                        className="hover:text-red-500 transition"
                        data-testid={`inline-comment-delete-${c.comment_id}`}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && comments.length === 0 && loaded && (
        <p className="text-xs text-slate-400 text-center py-2" data-testid={`inline-comments-empty-${post.post_id}`}>
          Sé el primero en comentar 💬
        </p>
      )}

      {/* Composer */}
      {user ? (
        <div className="flex items-end gap-2">
          <img
            src={resolveAvatar({picture: user.picture, user_id: user.user_id, name: user.name, gender: user.gender})}
            alt={user.name}
            className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-slate-100"
            onError={(e) => {
              if (e.currentTarget.dataset.fb === "1") return;
              e.currentTarget.dataset.fb = "1";
              e.currentTarget.src = getDefaultAvatar({ user_id: user.user_id, name: user.name, gender: user.gender });
            }}
          />
          <div className="flex-1 min-w-0 flex items-end gap-2 bg-slate-50 rounded-2xl px-3 py-1.5">
            <textarea
              ref={inputRef}
              value={content}
              onChange={e => setContent(e.target.value.slice(0, 300))}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Escribe un comentario…"
              rows={1}
              className="flex-1 text-sm bg-transparent outline-none resize-none placeholder-slate-400 max-h-24 py-1"
              data-testid={`inline-comments-input-${post.post_id}`}
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || content.trim().length < 1}
              className="p-1.5 rounded-full text-white disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
              aria-label="Enviar"
              data-testid={`inline-comments-send-${post.post_id}`}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      ) : (
        <Link to="/login" className="block text-center text-xs font-semibold text-[#0077B6] hover:underline py-2" data-testid={`inline-comments-anon-${post.post_id}`}>
          Inicia sesión para comentar →
        </Link>
      )}
    </div>
  );
}

// ─── Post Card ──────────────────────────────────────────────────────────
function PostCard({ post, onLike, onDelete, currentUserId, onCommentCountChanged }) {
  const isOwn = post.user_id === currentUserId;
  const a = post.author || {};
  const avatar = resolveAvatar({picture: a.picture, logo_url: a.logo_url, user_id: a.user_id || a.provider_id, name: a.business_name || a.name, gender: a.gender});
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Section 77 — milestone posts get a celebratory ring + badge for social proof.
  const isMilestone = post.type === "milestone";
  return (
    <article
      className={`rounded-2xl bg-white p-4 mb-3 hover:border-slate-300 transition ${isMilestone ? "border-2 border-amber-300 shadow-[0_8px_24px_-12px_rgba(245,158,11,0.35)]" : "border border-slate-200"}`}
      style={isMilestone ? { background: "linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 60%)" } : {}}
      data-testid={`comunidad-post-${post.post_id}`}
    >
      {isMilestone && (
        <div className="-mt-1 -mx-1 mb-3 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm" data-testid="milestone-post-badge">
            🏆 Hito de la comunidad
          </span>
          {post.milestone_paid_count != null && (
            <span className="text-[10px] font-semibold text-amber-700">
              {post.milestone_paid_count} amigos suscritos
            </span>
          )}
        </div>
      )}
      <header className="flex items-start gap-3">
        <Link to={a.slug ? `/provider/${a.slug}` : "#"} className="flex-shrink-0">
          <img
            src={avatar}
            alt={a.name}
            className="w-10 h-10 rounded-full object-cover"
            loading="lazy"
            onError={(e) => {
              // Section 83 — if uploaded/OAuth photo fails (e.g. Google's
              // googleusercontent 4xx, expired CDN url), fall back to our
              // illustrated library. One retry only.
              if (e.currentTarget.dataset.fb !== "1") {
                e.currentTarget.dataset.fb = "1";
                e.currentTarget.src = resolveAvatar({
                  user_id: a.user_id || a.provider_id,
                  name: a.business_name || a.name,
                  gender: a.gender,
                });
              }
            }}
          />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {a.slug ? (
              <Link to={`/provider/${a.slug}`} className="font-semibold text-sm text-slate-900 hover:underline truncate">{a.business_name || a.name}</Link>
            ) : (
              <span className="font-semibold text-sm text-slate-900 truncate">{a.name}</span>
            )}
            {a.is_provider && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#0077B6] bg-[#CAF0F8]/40 border border-[#90E0EF] px-1.5 py-0.5 rounded-full">
                ✓ Verificado
              </span>
            )}
            <span className="text-xs text-slate-400">· {relTime(post.created_at)}</span>
          </div>
          {a.city && (
            <p className="text-[11px] text-slate-500 flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />{a.city}{a.state ? `, ${a.state}` : ""}
            </p>
          )}
        </div>
        {isOwn && (
          <button
            type="button"
            onClick={() => onDelete(post.post_id)}
            className="text-slate-300 hover:text-red-500 transition p-1"
            title="Eliminar"
            data-testid={`comunidad-post-delete-${post.post_id}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </header>

      <p className="mt-3 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed" data-testid={`comunidad-post-content-${post.post_id}`}>
        {post.content}
      </p>

      {post.image_url && (
        <img src={post.image_url} alt="" className="mt-3 rounded-xl border border-slate-200 max-h-96 w-full object-cover" loading="lazy" />
      )}

      <footer className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1">
        <LikeButton
          liked={!!post.liked_by_me}
          count={post.likes_count || 0}
          onClick={() => onLike(post.post_id)}
          size="sm"
          variant="ghost"
          testid={`comunidad-post-like-${post.post_id}`}
          celebrationLevel={isMilestone ? "milestone" : "default"}
        />
        <button
          type="button"
          onClick={() => setCommentsOpen(v => !v)}
          aria-expanded={commentsOpen}
          aria-controls={`inline-comments-${post.post_id}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${commentsOpen ? "text-[#0077B6] bg-[#CAF0F8]/40" : "text-slate-500 hover:bg-slate-50 hover:text-[#0077B6]"}`}
          data-testid={`comunidad-post-comments-${post.post_id}`}
        >
          <MessageCircle className="w-4 h-4" />
          <span data-testid={`comunidad-post-comments-count-${post.post_id}`}>{post.comments_count || 0}</span>
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              const url = `${window.location.origin}/comunidad?p=${post.post_id}`;
              if (navigator.share) {
                await navigator.share({ title: a.business_name || "getamano", text: post.content.slice(0, 80), url });
              } else {
                await navigator.clipboard.writeText(url);
                toast.success("¡Enlace copiado!");
              }
            } catch (_e) {/* user cancelled */}
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-[#0077B6] transition ml-auto"
          data-testid={`comunidad-post-share-${post.post_id}`}
        >
          <Share2 className="w-4 h-4" />
        </button>
      </footer>

      <InlineComments
        post={post}
        expanded={commentsOpen}
        onCommentCountChanged={onCommentCountChanged}
      />
    </article>
  );
}

// ─── Post Feed ──────────────────────────────────────────────────────────
function PostFeed({ barrio = false }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const activeFilter = searchParams.get("filter") || "";
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextBefore, setNextBefore] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Section 57 — auto-refresh state
  const [newPostsAvailable, setNewPostsAvailable] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchRef = useRef(Date.now());
  const mountedAtRef = useRef(Date.now());
  // Pull-to-refresh state (mobile)
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const pullStartRef = useRef(0);
  const PULL_THRESHOLD = 80;

  const endpoint = user ? "/community/posts/feed" : "/community/posts";

  const load = (before = null) => {
    const params = { limit: 10 };
    if (before) params.before = before;
    // Section 77 — propagate ?filter=hitos to backend
    if (activeFilter) params.filter = activeFilter;
    return api.get(endpoint, { params }).then(r => r.data);
  };

  // Silent refresh — no spinner, replaces feed with latest
  const silentRefresh = useCallback(async () => {
    try {
      const d = await load(null);
      setPosts(d.items || []);
      setNextBefore(d.next_before);
      setNewPostsAvailable(0);
      lastFetchRef.current = Date.now();
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  // Section 75 — pull-to-refresh: reuse the silentRefresh path
  useRefreshable(silentRefresh);

  // Polling: count posts strictly newer than what we have on screen
  const checkForNewPosts = useCallback(async () => {
    if (!posts.length) return;
    try {
      const d = await load(null);
      const ourLatest = posts[0]?.created_at;
      if (!ourLatest) return;
      const fresh = (d.items || []).filter(p => p.created_at > ourLatest).length;
      if (fresh > 0) setNewPostsAvailable(fresh);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  // Tap the "new posts" banner
  const showNewPosts = async () => {
    setRefreshing(true);
    await silentRefresh();
    setRefreshing(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load().then(d => {
      if (!alive) return;
      setPosts(d.items || []);
      setNextBefore(d.next_before);
      lastFetchRef.current = Date.now();
    }).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  // Re-fetch when the user logs in OR when the ?filter= query param changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id, activeFilter]);

  // CAPA 1 — Visibility API: refresh on tab-return after 2+ min
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const minSinceFetch = (Date.now() - lastFetchRef.current) / 60000;
      if (minSinceFetch >= 2) silentRefresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [silentRefresh]);

  // CAPA 2 — 60s polling while tab is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - mountedAtRef.current < 5000) return; // 5s grace
      checkForNewPosts();
    }, 60000);
    return () => clearInterval(interval);
  }, [checkForNewPosts]);

  // Pull-to-refresh (mobile touch)
  useEffect(() => {
    const onTouchStart = (e) => {
      if (window.scrollY > 0) return;
      pullStartRef.current = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
      if (window.scrollY > 0) return;
      const dy = e.touches[0].clientY - pullStartRef.current;
      if (dy > 0) {
        setPullDistance(Math.min(dy, PULL_THRESHOLD + 30));
        setIsPulling(dy > PULL_THRESHOLD);
      }
    };
    const onTouchEnd = async () => {
      if (isPulling) {
        setRefreshing(true);
        await silentRefresh();
        setRefreshing(false);
      }
      setPullDistance(0); setIsPulling(false);
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isPulling, silentRefresh]);

  const onPosted = (p) => {
    setPosts(prev => [p, ...prev]);
    lastFetchRef.current = Date.now();
    setNewPostsAvailable(0);
  };
  const onLike = async (postId) => {
    if (!user) { toast.info("Inicia sesión para dar me gusta"); return; }
    setPosts(prev => prev.map(p => p.post_id === postId
      ? { ...p, liked_by_me: !p.liked_by_me, likes_count: Math.max(0, (p.likes_count || 0) + (p.liked_by_me ? -1 : 1)) }
      : p));
    try { await api.post(`/community/posts/${postId}/like`); }
    catch (_e) {
      setPosts(prev => prev.map(p => p.post_id === postId
        ? { ...p, liked_by_me: !p.liked_by_me, likes_count: Math.max(0, (p.likes_count || 0) + (p.liked_by_me ? -1 : 1)) }
        : p));
    }
  };
  const onDelete = async (postId) => {
    if (!window.confirm("¿Eliminar este post?")) return;
    setPosts(prev => prev.filter(p => p.post_id !== postId));
    try { await api.delete(`/community/posts/${postId}`); toast.success("Eliminado"); }
    catch (_e) { toast.error("No se pudo eliminar"); }
  };
  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await load(nextBefore);
      setPosts(prev => [...prev, ...(d.items || [])]);
      setNextBefore(d.next_before);
    } finally { setLoadingMore(false); }
  };

  // Section 89 v4 — always call the hook (React rules); only render
  // the chrome and apply the city filter when `barrio` is on.
  const barrioCtx = useBarrio();
  const renderPosts = barrio ? barrioCityFilter(posts, barrioCtx.city) : posts;
  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }
  return (
    <div data-testid="comunidad-feed" className="relative">
      {/* Pull-to-refresh indicator */}
      {pullDistance > 20 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-2 z-20 transition-all"
          style={{ transform: `translateX(-50%) translateY(${pullDistance - 30}px)`, opacity: Math.min(1, pullDistance / 80) }}
          data-testid="comunidad-pull-indicator"
        >
          <div className="w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center">
            <RefreshCw className={`w-5 h-5 text-[#0077B6] transition-transform ${isPulling ? "rotate-180" : ""}`} />
          </div>
        </div>
      )}

      {/* Section 57 — "New posts" sticky banner (Facebook/Instagram pattern) */}
      {newPostsAvailable > 0 && (
        <button
          type="button"
          onClick={showNewPosts}
          disabled={refreshing}
          className="sticky top-2 z-30 mx-auto mb-3 px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg flex items-center gap-2 transition hover:scale-105 active:scale-95 animate-fadeSlideUp disabled:opacity-70"
          style={{ background: "#0D7377", left: 0, right: 0, width: "fit-content", display: "flex" }}
          data-testid="comunidad-new-posts-banner"
        >
          <ArrowUp className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {newPostsAvailable === 1
            ? "Hay 1 post nuevo — toca para ver"
            : `Hay ${newPostsAvailable} posts nuevos — toca para ver`}
        </button>
      )}

      {/* Section 89 v4 (Barrio) — city chip + 5-radius selector */}
      {barrio && (
        <BarrioHeader
          city={barrioCtx.city}
          state={barrioCtx.state}
          radius={barrioCtx.radius}
          onRadiusChange={barrioCtx.setRadius}
        />
      )}

      {/* Section 60 — Stories carousel (24h ephemeral) — appears first */}
      <StoriesCarousel />

      {/* Section 89 v4 (Barrio) — featured providers carousel */}
      {barrio && (
        <FeaturedStrip
          providers={barrioCtx.featured}
          loading={barrioCtx.featuredLoading}
          city={barrioCtx.city}
        />
      )}

      <NewPostBox onPosted={onPosted} />
      {renderPosts.length === 0 && !loading && (
        <EmptyState
          testid="comunidad-empty"
          icon={<HeartHandshake className="w-9 h-9" />}
          title="¡La comunidad te espera!"
          subtitle="Sé el primero en publicar algo. Comparte un trabajo, una recomendación o pregunta lo que necesites — los demás latinos están aquí para ayudarte."
          tip="💡 Tip: las publicaciones con foto reciben 3× más respuestas"
        />
      )}
      {renderPosts.map((p, idx) => (
        <div key={p.post_id}>
          <PostCard
            post={p}
            onLike={onLike}
            onDelete={onDelete}
            currentUserId={user?.user_id}
            onCommentCountChanged={(delta) => {
              setPosts(prev => prev.map(post => post.post_id === p.post_id
                ? { ...post, comments_count: Math.max(0, (post.comments_count || 0) + delta) }
                : post));
            }}
          />
          {/* Section 89 v4 — inline Trust Score nudge between posts #3 and #4 */}
          {barrio && barrioCtx.myProfile?.provider_id && idx === 2 && (
            <InlineTrustCard profile={barrioCtx.myProfile} />
          )}
        </div>
      ))}
      {nextBefore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full mt-3 py-2.5 rounded-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:border-[#90E0EF] disabled:opacity-50"
          data-testid="comunidad-load-more"
        >
          {loadingMore ? "Cargando…" : "Cargar más"}
        </button>
      )}
    </div>
  );
}

// ─── Left Nav (desktop only) ────────────────────────────────────────────
function LeftNav() {
  const { user } = useAuth();
  // Section 62 — mirrors the new mobile TabBar (Feed / Explorar / Ranking / HoF).
  // "Chambas" removed (already accessible from Header + BottomNav as "Empleos/Gigs").
  // Renamed "Comunidad" → "Feed" so the sub-section is named consistently.
  const items = [
    { to: "/comunidad", icon: HeartHandshake, label: "Feed", testid: "comunidad-nav-feed" },
    { to: "/comunidad/explorar", icon: Compass, label: "Explorar", testid: "comunidad-nav-explorar" },
    { to: "/ranking", icon: Trophy, label: "Ranking", testid: "comunidad-nav-ranking" },
    { to: "/wall", icon: Sparkles, label: "Wall of Fame", testid: "comunidad-nav-wall" },
  ];
  return (
    <aside className="hidden lg:block w-64 flex-shrink-0 pr-4" data-testid="comunidad-leftnav">
      <nav className="sticky top-24 space-y-1">
        {items.map(it => (
          <Link
            key={it.to}
            to={it.to}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-[#0077B6] transition"
            data-testid={it.testid}
          >
            <it.icon className="w-5 h-5" />
            {it.label}
          </Link>
        ))}
        {user?.role === "provider" && (
          <Link
            to="/dashboard/provider"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-[#0077B6] transition"
            data-testid="comunidad-nav-dashboard"
          >
            <Settings className="w-5 h-5" />
            Mi dashboard
          </Link>
        )}
      </nav>
    </aside>
  );
}

// ─── Right Sidebar (desktop only) ───────────────────────────────────────
function RightSidebar() {
  const { user } = useAuth();
  const [suggested, setSuggested] = useState([]);
  const [trending, setTrending] = useState([]);
  const [follows, setFollows] = useState(new Set());

  useEffect(() => {
    let alive = true;
    api.get("/community/trending").then(r => { if (alive) setTrending(r.data || []); }).catch(() => {});
    if (user) {
      api.get("/community/suggested").then(r => { if (alive) setSuggested(r.data || []); }).catch(() => {});
      api.get("/community/me/follows").then(r => { if (alive) setFollows(new Set(r.data?.items || [])); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [user?.user_id]);

  const toggleFollow = async (uid) => {
    if (!user) { toast.info("Inicia sesión para seguir"); return; }
    const isFollowing = follows.has(uid);
    const next = new Set(follows);
    if (isFollowing) { next.delete(uid); } else { next.add(uid); }
    setFollows(next);
    try {
      if (isFollowing) await api.delete(`/community/follows/${uid}`);
      else await api.post(`/community/follows/${uid}`);
    } catch (_e) {
      // revert on failure
      setFollows(follows);
      toast.error("No se pudo guardar");
    }
  };

  return (
    <aside className="hidden xl:block w-80 flex-shrink-0 pl-4" data-testid="comunidad-rightsidebar">
      <div className="sticky top-24 space-y-4">
        {/* Trending */}
        {trending.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="comunidad-trending">
            <h3 className="font-display font-bold text-slate-900 text-sm mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" /> Tendencias
            </h3>
            <ul className="space-y-1">
              {trending.slice(0, 6).map(t => (
                <li key={t.category_id}>
                  <Link
                    to={`/categoria/${t.slug || t.category_id}`}
                    className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 transition"
                  >
                    <span className="text-sm text-slate-700 flex items-center gap-1.5">
                      {/* Only render icon if it looks like an emoji (1-3 visual chars, no ASCII letters) */}
                      {t.icon && !/^[A-Za-z]+$/.test(t.icon) && <span className="text-base">{t.icon}</span>}
                      {t.name_es}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">{t.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggested */}
        {user && suggested.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="comunidad-suggested">
            <h3 className="font-display font-bold text-slate-900 text-sm mb-3 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#0077B6]" /> Sugeridos
            </h3>
            <ul className="space-y-2.5">
              {suggested.slice(0, 5).map(p => {
                const isFollowing = follows.has(p.user_id);
                return (
                  <li key={p.provider_id} className="flex items-center gap-2.5" data-testid={`comunidad-suggested-${p.provider_id}`}>
                    <Link to={`/provider/${p.slug}`} className="flex-shrink-0">
                      <img
                        src={resolveAvatar({picture: p.photo_url, logo_url: p.logo_url, user_id: p.user_id || p.provider_id, name: p.business_name, gender: p.gender})}
                        alt={p.business_name}
                        className="w-10 h-10 rounded-full object-cover"
                        loading="lazy"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/provider/${p.slug}`} className="text-xs font-semibold text-slate-900 hover:underline truncate block">{p.business_name}</Link>
                      <p className="text-[10px] text-slate-500 truncate">{p.main_category} · {p.city}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFollow(p.user_id)}
                      className={`text-[11px] font-bold px-3 py-1 rounded-full border whitespace-nowrap transition ${
                        isFollowing
                          ? "bg-slate-100 border-slate-200 text-slate-700"
                          : "bg-[#0077B6] border-[#0077B6] text-white hover:bg-[#03045E]"
                      }`}
                      data-testid={`comunidad-follow-${p.provider_id}`}
                    >
                      {isFollowing ? "Siguiendo" : "Seguir"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="rounded-2xl bg-[#CAF0F8]/40 border border-[#90E0EF] p-4 text-xs text-slate-600 leading-relaxed" data-testid="comunidad-about">
          <p className="font-bold text-[#03045E] mb-1">¿Por qué Getamano?</p>
          <p>Conectamos a la comunidad latina en USA con proveedores verificados. Productos y servicios latinos, a la mano.</p>
        </div>
      </div>
    </aside>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────
export default function ComunidadPage({ embedded = false, barrio = false }) {
  const seoNode = !embedded ? (
    <SeoHead
      title={barrio ? "Barrio" : "Comunidad"}
      description={barrio
        ? "Lo que está pasando en tu barrio — ahora mismo."
        : "Lo que está pasando en la comunidad latina en USA — ahora mismo."}
      lang="es"
    />
  ) : null;
  const body = (
    <main className={`flex-1 ${embedded ? "" : "max-w-7xl mx-auto"} px-4 sm:px-6 lg:px-8 py-6 w-full`}>
      <div className="flex gap-0">
        {!embedded && <LeftNav />}
        <div className="flex-1 min-w-0 max-w-2xl mx-auto">
          {!embedded && (
            <header className="mb-5">
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
                {barrio ? "Barrio" : "Comunidad"}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {barrio
                  ? "Lo que está pasando en tu barrio — ahora mismo."
                  : "Lo que está pasando en la comunidad latina en USA — ahora mismo."}
              </p>
            </header>
          )}
          <PostFeed barrio={barrio} />
        </div>
        {!embedded && <RightSidebar />}
      </div>
    </main>
  );
  if (embedded) {
    return <div className="tab-content-enter" data-testid={barrio ? "barrio-page" : "comunidad-feed-embedded"}>{body}</div>;
  }
  return (
    <div className="min-h-screen flex flex-col bg-slate-50" data-testid={barrio ? "barrio-page" : "comunidad-page"}>
      {seoNode}
      <Header />
      {body}
      <Footer />
    </div>
  );
}
