import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Heart, MessageCircle, Share2, Trash2, Trophy, Image as ImageIcon,
  Search, Bell, Users, Sparkles, Bookmark, Settings, X, Send,
  Home as HomeIcon, Briefcase, Loader2, Globe, MapPin
} from "lucide-react";
import { toast } from "sonner";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { getDicebearAvatar } from "../lib/avatar";

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
function StoriesRow() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.get("/community/stories")
      .then(r => { if (alive) setStories(r.data || []); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="h-20 rounded-2xl bg-slate-50 animate-pulse mb-4" />;
  if (stories.length === 0) return null;
  return (
    <div className="mb-4 -mx-4 sm:mx-0" data-testid="comunidad-stories">
      <div className="flex gap-3 overflow-x-auto px-4 sm:px-0 pb-1" style={{ scrollbarWidth: "none" }}>
        <style>{`[data-testid="comunidad-stories"] ::-webkit-scrollbar{display:none}`}</style>
        {stories.map(s => (
          <Link
            key={s.user_id}
            to={`/services/${s.slug}`}
            className="flex flex-col items-center flex-shrink-0 w-16 group"
            data-testid={`comunidad-story-${s.user_id}`}
          >
            <div className="relative p-[2px] rounded-full bg-gradient-to-br from-amber-500 via-rose-500 to-purple-600">
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white bg-slate-100">
                <img src={s.picture || getDicebearAvatar(s.business_name)} alt={s.business_name} className="w-full h-full object-cover" loading="lazy" />
              </div>
            </div>
            <p className="text-[10px] font-semibold text-slate-700 mt-1 truncate w-full text-center">{(s.business_name || "").split(" ")[0]}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

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
        <Link to="/login" className="font-semibold text-teal-700 hover:underline">Inicia sesión</Link> para publicar en la comunidad.
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
        content: content.trim() || "📷",  // backend min 4 — when only image, pad gracefully
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
          src={user.picture || getDicebearAvatar(user.name || "U")}
          alt={user.name}
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
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
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 px-2 py-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
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
              style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
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

// ─── Comments Modal ─────────────────────────────────────────────────────
function CommentsModal({ post, onClose, onCommentCountChanged }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  const load = () => {
    setLoading(true);
    api.get(`/community/posts/${post.post_id}/comments`)
      .then(r => setComments(r.data?.items || []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    setTimeout(() => inputRef.current?.focus(), 100);
    // Lock scroll on body
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.post_id]);

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
      load();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-black/55 backdrop-blur-sm"
      onClick={onClose}
      data-testid="comments-modal"
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] sm:max-h-[80vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <h3 className="font-display font-bold text-slate-900">Comentarios</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100"
            aria-label="Cerrar"
            data-testid="comments-modal-close"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="comments-modal-list">
          {loading && (
            <div className="text-center py-6 text-slate-400 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          )}
          {!loading && comments.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm" data-testid="comments-modal-empty">
              Sé el primero en comentar 💬
            </div>
          )}
          {!loading && comments.map(c => {
            const isOwn = c.user_id === user?.user_id;
            const a = c.author || {};
            const avatar = a.picture || getDicebearAvatar(a.business_name || a.name || "U");
            return (
              <article key={c.comment_id} className="flex gap-2.5 py-2.5" data-testid={`comment-${c.comment_id}`}>
                <Link to={a.slug ? `/services/${a.slug}` : "#"} className="flex-shrink-0">
                  <img src={avatar} alt={a.name} className="w-8 h-8 rounded-full object-cover" loading="lazy" />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {a.slug ? (
                        <Link to={`/services/${a.slug}`} className="text-xs font-bold text-slate-900 hover:underline">{a.business_name || a.name}</Link>
                      ) : (
                        <span className="text-xs font-bold text-slate-900">{a.name}</span>
                      )}
                      {a.is_provider && (
                        <span className="text-[9px] font-bold text-teal-700 bg-teal-100 px-1 py-0.5 rounded">✓</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap" data-testid={`comment-content-${c.comment_id}`}>{c.content}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 px-2 text-[10px] text-slate-400">
                    <span>{relTime(c.created_at)}</span>
                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => remove(c.comment_id)}
                        className="hover:text-red-500 transition"
                        data-testid={`comment-delete-${c.comment_id}`}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="flex-shrink-0 border-t border-slate-100 px-4 py-3">
          {user ? (
            <div className="flex items-end gap-2">
              <img src={user.picture || getDicebearAvatar(user.name || "U")} alt={user.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0 flex items-end gap-2 bg-slate-50 rounded-2xl px-3 py-2">
                <textarea
                  ref={inputRef}
                  value={content}
                  onChange={e => setContent(e.target.value.slice(0, 300))}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Escribe un comentario…"
                  rows={1}
                  className="flex-1 text-sm bg-transparent outline-none resize-none placeholder-slate-400 max-h-24"
                  data-testid="comments-modal-input"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || content.trim().length < 1}
                  className="p-1.5 rounded-full text-white disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
                  aria-label="Enviar"
                  data-testid="comments-modal-send"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ) : (
            <Link to="/login" className="block text-center text-sm font-semibold text-teal-700 hover:underline py-2" data-testid="comments-modal-anon-login">
              Inicia sesión para comentar →
            </Link>
          )}
        </footer>
      </div>
    </div>
  );
}

// ─── Post Card ──────────────────────────────────────────────────────────
function PostCard({ post, onLike, onDelete, onOpenComments, currentUserId }) {
  const isOwn = post.user_id === currentUserId;
  const a = post.author || {};
  const avatar = a.picture || getDicebearAvatar(a.business_name || a.name || "U");
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 mb-3 hover:border-slate-300 transition" data-testid={`comunidad-post-${post.post_id}`}>
      <header className="flex items-start gap-3">
        <Link to={a.slug ? `/services/${a.slug}` : "#"} className="flex-shrink-0">
          <img src={avatar} alt={a.name} className="w-10 h-10 rounded-full object-cover" loading="lazy" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {a.slug ? (
              <Link to={`/services/${a.slug}`} className="font-semibold text-sm text-slate-900 hover:underline truncate">{a.business_name || a.name}</Link>
            ) : (
              <span className="font-semibold text-sm text-slate-900 truncate">{a.name}</span>
            )}
            {a.is_provider && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full">
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
        <button
          type="button"
          onClick={() => onLike(post.post_id)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
            post.liked_by_me ? "text-rose-500 bg-rose-50" : "text-slate-500 hover:bg-slate-50 hover:text-rose-500"
          }`}
          aria-pressed={!!post.liked_by_me}
          data-testid={`comunidad-post-like-${post.post_id}`}
        >
          <Heart className={`w-4 h-4 ${post.liked_by_me ? "fill-rose-500" : ""}`} />
          <span data-testid={`comunidad-post-likes-${post.post_id}`}>{post.likes_count || 0}</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenComments(post)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-teal-700 transition"
          data-testid={`comunidad-post-comments-${post.post_id}`}
          aria-label="Ver comentarios"
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-teal-700 transition ml-auto"
          data-testid={`comunidad-post-share-${post.post_id}`}
        >
          <Share2 className="w-4 h-4" />
        </button>
      </footer>
    </article>
  );
}

// ─── Post Feed ──────────────────────────────────────────────────────────
function PostFeed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextBefore, setNextBefore] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openCommentsPost, setOpenCommentsPost] = useState(null);

  const endpoint = user ? "/community/posts/feed" : "/community/posts";

  const load = (before = null) => {
    const params = { limit: 10 };
    if (before) params.before = before;
    return api.get(endpoint, { params }).then(r => r.data);
  };

  useEffect(() => {
    let alive = true;
    load().then(d => {
      if (!alive) return;
      setPosts(d.items || []);
      setNextBefore(d.next_before);
    }).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  const onPosted = (p) => setPosts(prev => [p, ...prev]);
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

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }
  return (
    <div data-testid="comunidad-feed">
      <NewPostBox onPosted={onPosted} />
      {posts.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm" data-testid="comunidad-empty">
          Sé el primero en publicar algo. ¡La comunidad te espera!
        </div>
      )}
      {posts.map(p => (
        <PostCard
          key={p.post_id}
          post={p}
          onLike={onLike}
          onDelete={onDelete}
          onOpenComments={(post) => setOpenCommentsPost(post)}
          currentUserId={user?.user_id}
        />
      ))}
      {nextBefore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full mt-3 py-2.5 rounded-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:border-teal-300 disabled:opacity-50"
          data-testid="comunidad-load-more"
        >
          {loadingMore ? "Cargando…" : "Cargar más"}
        </button>
      )}
      {openCommentsPost && (
        <CommentsModal
          post={openCommentsPost}
          onClose={() => setOpenCommentsPost(null)}
          onCommentCountChanged={(delta) => {
            setPosts(prev => prev.map(p => p.post_id === openCommentsPost.post_id
              ? { ...p, comments_count: Math.max(0, (p.comments_count || 0) + delta) }
              : p));
          }}
        />
      )}
    </div>
  );
}

// ─── Left Nav (desktop only) ────────────────────────────────────────────
function LeftNav() {
  const { user } = useAuth();
  const items = [
    { to: "/comunidad", icon: HomeIcon, label: "Comunidad", testid: "comunidad-nav-feed" },
    { to: "/search", icon: Search, label: "Explorar", testid: "comunidad-nav-search" },
    { to: "/empleos", icon: Briefcase, label: "Chambas", testid: "comunidad-nav-empleos" },
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
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-teal-700 transition"
            data-testid={it.testid}
          >
            <it.icon className="w-5 h-5" />
            {it.label}
          </Link>
        ))}
        {user?.role === "provider" && (
          <Link
            to="/dashboard/provider"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-teal-700 transition"
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
              <Users className="w-4 h-4 text-teal-700" /> Sugeridos
            </h3>
            <ul className="space-y-2.5">
              {suggested.slice(0, 5).map(p => {
                const isFollowing = follows.has(p.user_id);
                return (
                  <li key={p.provider_id} className="flex items-center gap-2.5" data-testid={`comunidad-suggested-${p.provider_id}`}>
                    <Link to={`/services/${p.slug}`} className="flex-shrink-0">
                      <img
                        src={p.logo_url || p.photo_url || getDicebearAvatar(p.business_name)}
                        alt={p.business_name}
                        className="w-10 h-10 rounded-full object-cover"
                        loading="lazy"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/services/${p.slug}`} className="text-xs font-semibold text-slate-900 hover:underline truncate block">{p.business_name}</Link>
                      <p className="text-[10px] text-slate-500 truncate">{p.main_category} · {p.city}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFollow(p.user_id)}
                      className={`text-[11px] font-bold px-3 py-1 rounded-full border whitespace-nowrap transition ${
                        isFollowing
                          ? "bg-slate-100 border-slate-200 text-slate-700"
                          : "bg-teal-600 border-teal-600 text-white hover:bg-teal-700"
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

        <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4 text-xs text-slate-600 leading-relaxed" data-testid="comunidad-about">
          <p className="font-bold text-teal-800 mb-1">¿Por qué Getamano?</p>
          <p>Conectamos a la comunidad latina en USA con proveedores verificados. Productos y servicios latinos, a la mano.</p>
        </div>
      </div>
    </aside>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────
export default function ComunidadPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50" data-testid="comunidad-page">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        <div className="flex gap-0">
          <LeftNav />
          <div className="flex-1 min-w-0 max-w-2xl mx-auto">
            <header className="mb-5">
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Comunidad</h1>
              <p className="text-sm text-slate-500 mt-1">Lo que está pasando en la comunidad latina en USA — ahora mismo.</p>
            </header>
            <StoriesRow />
            <PostFeed />
          </div>
          <RightSidebar />
        </div>
      </main>
      <Footer />
    </div>
  );
}
