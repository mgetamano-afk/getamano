import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { Bookmark, Heart, MapPin, Star, Trash2, Pencil, Phone, MessageSquare, ChevronRight, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { buildFileUrl } from "../components/ImageUpload";

export default function SavedECardsPage() {
  const { user, loading: authLoading } = useAuth();
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const FILTERS_LOCAL = [
    { id: "all", label: t("saved.filter.all"), Icon: Sparkles },
    { id: "bookmark", label: t("saved.filter.bookmark"), Icon: Bookmark },
    { id: "like", label: t("saved.filter.like"), Icon: Heart },
  ];

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    let cancelled = false;
    setLoading(true);
    api.get(`/saved-ecards/me?filter=${filter}`).then((r) => {
      if (!cancelled) setItems(r.data || []);
    }).catch(() => {
      if (!cancelled) toast.error(lang === "en" ? "Couldn't load your saved eCards" : "No se pudieron cargar tus eCards guardadas");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, authLoading, filter, navigate, lang]);

  const removeOne = async (providerId) => {
    setSaving(true);
    try {
      await api.delete(`/saved-ecards/${providerId}`);
      setItems((cur) => cur.filter((it) => it.provider_id !== providerId));
      toast.success(t("saved.removed"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Couldn't remove" : "No se pudo eliminar"));
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async (providerId) => {
    setSaving(true);
    try {
      const { data } = await api.put(`/saved-ecards/${providerId}/note`, {
        personal_note: noteDraft.trim() || null,
      });
      setItems((cur) => cur.map((it) => it.provider_id === providerId ? { ...it, personal_note: data.personal_note } : it));
      setEditingId(null);
      toast.success(t("saved.note.added"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Couldn't save note" : "No se pudo guardar la nota"));
    } finally {
      setSaving(false);
    }
  };

  const totalBookmarks = items.filter(i => i.save_type === "bookmark" || i.save_type === "both").length;
  const totalLikes = items.filter(i => i.save_type === "like" || i.save_type === "both").length;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="saved-ecards-page">
      <Header />
      <main className="container mx-auto px-4 md:px-6 py-8 pb-24 max-w-5xl">
        <div className="mb-8 animate-fadeSlideUp">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
            <Bookmark className="w-7 h-7 inline-block mr-2 text-amber-500" />
            {t("saved.title")}
          </h1>
          <p className="text-slate-500 mt-2 max-w-xl">
            {t("saved.subtitle")}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <Bookmark className="w-3.5 h-3.5" /> {t("saved.stats.bookmarks")}
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalBookmarks}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <Heart className="w-3.5 h-3.5" /> {t("saved.stats.likes")}
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalLikes}</p>
          </div>
          <div className="hidden md:block bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl border border-teal-100 p-4">
            <p className="text-xs text-teal-700 font-semibold uppercase tracking-wide">{t("saved.tip.title")}</p>
            <p className="text-sm text-teal-900 mt-1">{t("saved.tip.body")}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {FILTERS_LOCAL.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-medium border transition flex-shrink-0 ${filter === f.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
              data-testid={`saved-filter-${f.id}`}
            >
              <f.Icon className="w-4 h-4" />
              {f.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-16 text-slate-400" data-testid="saved-loading">
            <Loader2 className="w-8 h-8 animate-spin mx-auto" />
            <p className="mt-2 text-sm">{t("saved.loading")}</p>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center" data-testid="saved-empty">
            <Bookmark className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="font-display font-bold text-lg text-slate-700 mb-1">{t("saved.empty.title")}</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {t("saved.empty.body")}
            </p>
            <Link
              to={lang === "en" ? "/search" : "/buscar"}
              className="inline-block mt-5 px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium"
              data-testid="saved-empty-cta"
            >
              {t("saved.empty.cta")}
            </Link>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="space-y-3" data-testid="saved-list">
            {items.map((it) => {
              const p = it.provider || {};
              const isVerified = p.verification_status === "approved";
              const isBookmarked = it.save_type === "bookmark" || it.save_type === "both";
              const isLiked = it.save_type === "like" || it.save_type === "both";
              const slug = p.slug;
              const profileUrl = slug ? `/p/${slug}` : "#";
              return (
                <div
                  key={it.provider_id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 hover:shadow-md transition"
                  data-testid={`saved-item-${it.provider_id}`}
                >
                  <div className="flex gap-4">
                    <Link to={profileUrl} className="flex-shrink-0">
                      {p.logo_url ? (
                        <img
                          src={buildFileUrl(p.logo_url)}
                          alt={p.business_name}
                          className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-cover bg-slate-100"
                        />
                      ) : (
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-2xl font-bold text-teal-700">
                          {(p.business_name || "?")[0]?.toUpperCase()}
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <Link to={profileUrl} className="block group">
                            <h3 className="font-display font-bold text-base md:text-lg text-slate-900 truncate group-hover:text-teal-700 transition" data-testid={`saved-item-name-${it.provider_id}`}>
                              {p.business_name || "—"}
                              {isVerified && <ShieldCheck className="w-4 h-4 inline-block ml-1 text-emerald-500" />}
                            </h3>
                          </Link>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                            {p.rating_avg > 0 && (
                              <span className="ml-2 inline-flex items-center gap-0.5 text-amber-500">
                                <Star className="w-3 h-3 fill-current" />
                                <span className="font-semibold">{p.rating_avg.toFixed(1)}</span>
                                <span className="text-slate-400">({p.rating_count})</span>
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isLiked && (
                            <span className="inline-flex items-center gap-1 px-2 h-7 rounded-full bg-rose-50 text-rose-600 text-[11px] font-medium" title="Te gustó este proveedor">
                              <Heart className="w-3 h-3 fill-current" />
                            </span>
                          )}
                          {isBookmarked && (
                            <span className="inline-flex items-center gap-1 px-2 h-7 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium" title="Lo guardaste">
                              <Bookmark className="w-3 h-3 fill-current" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Personal note */}
                      <div className="mt-3">
                        {editingId === it.provider_id ? (
                          <div className="space-y-2">
                            <textarea
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder={t("saved.note.placeholder")}
                              maxLength={500}
                              rows={2}
                              className="w-full p-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 resize-none"
                              data-testid={`saved-item-note-input-${it.provider_id}`}
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => saveNote(it.provider_id)}
                                disabled={saving}
                                className="px-3 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium disabled:opacity-60"
                                data-testid={`saved-item-note-save-${it.provider_id}`}
                              >
                                {saving ? t("common.loading") : t("saved.note.save")}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="px-3 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium"
                                data-testid={`saved-item-note-cancel-${it.provider_id}`}
                              >
                                {t("saved.note.cancel")}
                              </button>
                              <span className="text-[11px] text-slate-400 ml-auto">{noteDraft.length}/500</span>
                            </div>
                          </div>
                        ) : it.personal_note ? (
                          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-900" data-testid={`saved-item-note-${it.provider_id}`}>
                            <MessageSquare className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="italic flex-1">"{it.personal_note}"</p>
                            <button
                              onClick={() => { setEditingId(it.provider_id); setNoteDraft(it.personal_note || ""); }}
                              className="text-amber-600 hover:text-amber-800 flex-shrink-0"
                              data-testid={`saved-item-note-edit-${it.provider_id}`}
                              aria-label={t("common.edit")}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : isBookmarked ? (
                          <button
                            onClick={() => { setEditingId(it.provider_id); setNoteDraft(""); }}
                            className="text-xs text-slate-400 hover:text-teal-600 underline"
                            data-testid={`saved-item-add-note-${it.provider_id}`}
                          >
                            {t("saved.add_note")}
                          </button>
                        ) : null}
                      </div>

                      {/* Actions row */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          {p.phone && (
                            <a
                              href={`tel:${p.phone}`}
                              className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium"
                              data-testid={`saved-item-call-${it.provider_id}`}
                            >
                              <Phone className="w-3 h-3" /> {t("saved.action.call")}
                            </a>
                          )}
                          <Link
                            to={profileUrl}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-medium"
                            data-testid={`saved-item-open-${it.provider_id}`}
                          >
                            {t("saved.action.open")} <ChevronRight className="w-3 h-3" />
                          </Link>
                        </div>
                        <button
                          onClick={() => removeOne(it.provider_id)}
                          className="text-slate-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50"
                          data-testid={`saved-item-remove-${it.provider_id}`}
                          aria-label={t("common.remove")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
