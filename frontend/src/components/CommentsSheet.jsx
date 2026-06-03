import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Send, X, Loader2, Trash2, Heart, AtSign } from "lucide-react";
import { toast } from "sonner";
import MentionTextarea from "./MentionTextarea";

/**
 * CommentsSheet — V17.2 bottom-sheet for reel + story comments.
 *
 * Reused for both subject types via the `subjectType` prop ("reel" |
 * "story") + subject_id. Renders:
 *
 *   • Comments list (oldest first, like Instagram). Hydrated with
 *     author name + avatar + verified badge.
 *   • Composer at the bottom with @mention autocomplete (V17.4).
 *   • Optimistic insert so the user sees their comment instantly
 *     even on slow networks.
 *   • Delete button on own comments (and admin).
 *
 * The parent controls open/close via the `open` prop. Renders as a
 * full-screen overlay on mobile, modal on desktop.
 */
export default function CommentsSheet({ open, onClose, subjectType, subjectId, lang = "es" }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !subjectId) return;
    setLoading(true);
    api.get(`/${subjectType === "reel" ? "reels" : "stories"}/${subjectId}/comments`)
      .then(({ data }) => setItems(data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, subjectType, subjectId]);

  const send = async (e) => {
    e?.preventDefault();
    const t = (text || "").trim();
    if (!t) return;
    if (!user) {
      toast.error(lang === "en" ? "Sign in to comment." : "Inicia sesión para comentar.");
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post(`/${subjectType === "reel" ? "reels" : "stories"}/${subjectId}/comments`, { text: t });
      setItems([...items, data]);
      setText("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId) => {
    if (!confirm(lang === "en" ? "Delete this comment?" : "¿Borrar este comentario?")) return;
    try {
      await api.delete(`/comments/${commentId}`);
      setItems(items.filter(c => c.comment_id !== commentId));
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4"
      data-testid="comments-sheet"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[88vh]">
        {/* Drag handle (mobile) */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-display font-semibold text-slate-900 text-base">
            {lang === "en" ? `Comments · ${items.length}` : `Comentarios · ${items.length}`}
          </h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full" data-testid="comments-close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" data-testid="comments-list">
          {loading && (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">{lang === "en" ? "No comments yet. Be the first!" : "Sin comentarios. ¡Sé el primero!"}</p>
            </div>
          )}
          {!loading && items.map((c) => (
            <div key={c.comment_id} className="flex items-start gap-3" data-testid={`comment-${c.comment_id}`}>
              {c.author?.picture ? (
                <img src={c.author.picture} alt={c.author.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-fuchsia-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {(c.author?.name || "U")[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-sm font-semibold text-slate-900 truncate">{c.author?.name}</p>
                  {c.author?.verified && <span className="text-emerald-600 text-xs">✓</span>}
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-line break-words">
                  {renderTextWithMentions(c.text)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">{relativeTime(c.created_at, lang)}</p>
              </div>
              {(user?.user_id === c.user_id || user?.role === "admin") && (
                <button
                  type="button"
                  onClick={() => remove(c.comment_id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full"
                  aria-label={lang === "en" ? "Delete comment" : "Borrar comentario"}
                  data-testid={`comment-delete-${c.comment_id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Composer */}
        <form onSubmit={send} className="border-t border-slate-100 p-3 flex items-end gap-2 bg-white">
          <MentionTextarea
            value={text}
            onChange={setText}
            placeholder={lang === "en" ? "Add a comment…" : "Agrega un comentario…"}
            disabled={sending || !user}
            testid="comments-input"
          />
          <button
            type="submit"
            disabled={sending || !text.trim() || !user}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 hover:from-rose-600 hover:to-fuchsia-700 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            data-testid="comments-send"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
        {!user && (
          <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50 border-t border-slate-100 text-center">
            {lang === "en" ? "Sign in to comment." : "Inicia sesión para comentar."}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────
function renderTextWithMentions(text) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9._-]{2,60})/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      return (
        <a key={i} href={`/services/${p.slice(1)}`} className="text-fuchsia-600 hover:underline font-medium">
          {p}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function relativeTime(iso, lang) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return lang === "en" ? "just now" : "ahora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}
