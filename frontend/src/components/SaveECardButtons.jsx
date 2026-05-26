import { useEffect, useState } from "react";
import { Bookmark, X, Loader2, Pencil, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useNavigate } from "react-router-dom";
import LikeButton from "./LikeButton";

/**
 * SaveECardButtons — Section 55.
 *
 * Two-action save: Like (❤️ public counter) and Bookmark (🔖 + personal note).
 * Shows on the public eCard page for any authenticated visitor (client OR
 * provider). The provider can never save their own eCard.
 *
 * Props:
 *   providerId          required
 *   providerName        for the note modal title
 *   initialLikes        seed counter from server
 *   initialBookmarks    seed counter from server
 *   isOwn               disable everything if this is the visitor's own eCard
 */
export default function SaveECardButtons({ providerId, providerName, initialLikes = 0, initialBookmarks = 0, isOwn = false }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [state, setState] = useState({ save_type: null, personal_note: "" });
  const [likes, setLikes] = useState(initialLikes);
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingState, setLoadingState] = useState(true);

  useEffect(() => {
    if (!user || !providerId || isOwn) { setLoadingState(false); return; }
    let cancelled = false;
    api.get(`/saved-ecards/me/state/${providerId}`).then((r) => {
      if (cancelled) return;
      setState({ save_type: r.data.save_type, personal_note: r.data.personal_note || "" });
      setNoteInput(r.data.personal_note || "");
    }).catch(() => {}).finally(() => { if (!cancelled) setLoadingState(false); });
    return () => { cancelled = true; };
  }, [user, providerId, isOwn]);

  if (isOwn) return null;

  const isLiked = state.save_type === "like" || state.save_type === "both";
  const isBookmarked = state.save_type === "bookmark" || state.save_type === "both";

  const requireAuth = () => {
    if (!user) {
      toast.message(lang === "en" ? "Sign in to save this eCard" : "Inicia sesión para guardar esta eCard");
      navigate("/login", { state: { from: window.location.pathname } });
      return false;
    }
    return true;
  };

  // ---- Toggle Like ----
  const toggleLike = async () => {
    if (!requireAuth()) return;
    if (saving) return;
    const willLike = !isLiked;
    const newType = willLike
      ? (isBookmarked ? "both" : "like")
      : (isBookmarked ? "bookmark" : null);
    setSaving(true);
    // Optimistic counter
    setLikes((c) => Math.max(0, c + (willLike ? 1 : -1)));
    try {
      if (newType === null) {
        await api.delete(`/saved-ecards/${providerId}`);
        setState({ save_type: null, personal_note: "" });
      } else {
        const { data } = await api.put("/saved-ecards", {
          provider_id: providerId,
          save_type: newType,
          personal_note: state.personal_note || null,
        });
        setState({ save_type: data.save_type, personal_note: data.personal_note || "" });
      }
    } catch (e) {
      setLikes((c) => Math.max(0, c + (willLike ? -1 : 1))); // revert
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Couldn't update like" : "No se pudo actualizar el like"));
    } finally {
      setSaving(false);
    }
  };

  // ---- Toggle Bookmark ----
  const toggleBookmark = async () => {
    if (!requireAuth()) return;
    if (saving) return;
    if (!isBookmarked) {
      // first time → open note modal
      setNoteInput(state.personal_note || "");
      setShowNoteModal(true);
      return;
    }
    // already bookmarked → remove it
    const newType = isLiked ? "like" : null;
    setSaving(true);
    setBookmarks((c) => Math.max(0, c - 1));
    try {
      if (newType === null) {
        await api.delete(`/saved-ecards/${providerId}`);
        setState({ save_type: null, personal_note: "" });
      } else {
        const { data } = await api.put("/saved-ecards", {
          provider_id: providerId,
          save_type: newType,
          personal_note: null,
        });
        setState({ save_type: data.save_type, personal_note: "" });
      }
      toast.success(t("saved.removed"));
    } catch (e) {
      setBookmarks((c) => c + 1);
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Couldn't remove from saved" : "No se pudo quitar de guardadas"));
    } finally {
      setSaving(false);
    }
  };

  // ---- Confirm Bookmark (from modal) ----
  const confirmBookmark = async () => {
    if (saving) return;
    setSaving(true);
    const newType = isLiked ? "both" : "bookmark";
    const note = (noteInput || "").trim();
    try {
      const { data } = await api.put("/saved-ecards", {
        provider_id: providerId,
        save_type: newType,
        personal_note: note || null,
      });
      setState({ save_type: data.save_type, personal_note: data.personal_note || "" });
      setShowNoteModal(false);
      // Increment bookmark counter only on first save
      if (!isBookmarked) setBookmarks((c) => c + 1);
      toast.success(isBookmarked ? t("saved.note.added") : (lang === "en" ? `Saved ${providerName} ✓` : `Guardaste a ${providerName} ✓`));
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Couldn't save" : "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="save-ecard-buttons">
      <div className="flex flex-wrap items-center gap-2">
        {/* Like (heart with celebration animation) */}
        <LikeButton
          liked={isLiked}
          count={likes}
          onClick={toggleLike}
          disabled={saving || loadingState}
          size="md"
          testid="save-ecard-like-btn"
          ariaLabel={isLiked ? t("saved.unlike_button") : t("saved.like_button")}
        />

        {/* Bookmark */}
        <button
          type="button"
          onClick={toggleBookmark}
          disabled={saving || loadingState}
          className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-full border transition disabled:opacity-60 ${isBookmarked ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-slate-200 text-slate-600 hover:border-amber-200 hover:text-amber-600"}`}
          data-testid="save-ecard-bookmark-btn"
          aria-pressed={isBookmarked}
        >
          <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-amber-500 text-amber-500" : ""}`} />
          <span className="text-sm font-medium">{isBookmarked ? t("saved.bookmarked_button") : t("saved.bookmark_button")}</span>
        </button>

        {/* Edit note (only when already bookmarked) */}
        {isBookmarked && (
          <button
            type="button"
            onClick={() => { setNoteInput(state.personal_note || ""); setShowNoteModal(true); }}
            className="text-xs text-slate-400 hover:text-teal-600 underline inline-flex items-center gap-1"
            data-testid="save-ecard-edit-note"
          >
            <Pencil className="w-3 h-3" />
            {state.personal_note ? t("common.edit") : t("saved.add_note")}
          </button>
        )}
      </div>

      {/* Personal note preview */}
      {isBookmarked && state.personal_note && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-900" data-testid="save-ecard-note-preview">
          <MessageSquare className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="italic">"{state.personal_note}"</p>
        </div>
      )}

      {/* Note modal */}
      {showNoteModal && (
        <div
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !saving && setShowNoteModal(false)}
          data-testid="save-ecard-note-modal"
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-amber-500 text-2xl">🔖</div>
                <h3 className="font-display font-bold text-lg text-slate-900 mt-1">
                  {state.personal_note ? t("saved.note.modal_title_edit") : `${t("saved.note.modal_title_new")} ${providerName}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !saving && setShowNoteModal(false)}
                disabled={saving}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
                data-testid="save-ecard-note-modal-close"
                aria-label={t("common.close")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              {t("saved.note.modal_body")}
            </p>
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={t("saved.note.modal_placeholder")}
              maxLength={500}
              rows={3}
              className="w-full p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 resize-none"
              data-testid="save-ecard-note-input"
              autoFocus
            />
            <div className="flex items-center justify-between mt-1 text-xs text-slate-400">
              <span>{noteInput.length}/500</span>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => !saving && setShowNoteModal(false)}
                disabled={saving}
                className="flex-1 h-11 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                data-testid="save-ecard-note-cancel"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmBookmark}
                disabled={saving}
                className="flex-1 h-11 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
                data-testid="save-ecard-note-save"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? t("common.loading") : state.personal_note ? t("common.update") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
