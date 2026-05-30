import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Briefcase, ChevronRight, Loader2, Hash, Camera, Film,
  Info, MapPin, Instagram, Music2, Facebook, Linkedin, Twitter,
  Trash2, Upload, X, Edit3, ExternalLink, Globe2,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import Header from "../components/Header";
import { toast } from "sonner";
import VerifiedBadge from "../components/VerifiedBadge";

/**
 * UserProfile — V9 Part 1 social rebuild.
 *
 * Tabbed social profile for every user.
 *   · Header: avatar, name, @username, bio, GM-XXXX (provider), CTA.
 *   · Tab "Fotos"     — grid of personal photos (≤30) + upload.
 *   · Tab "Reels"     — vertical thumbs of my reels (provider only).
 *   · Tab "Acerca de" — city, social links, lang, delete account.
 *
 * Keeps the "Vende tus servicios" sell-CTA from Section 88 since that's
 * the primary conversion path from regular user → provider.
 */
export default function UserProfile() {
  const { user, loading: authLoading } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("photos"); // "photos" | "reels" | "about"
  const [activating, setActivating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
  }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/users/me/profile");
      setProfile(r.data);
    } catch { /* noop */ }
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  const activateProvider = async () => {
    setActivating(true);
    try {
      await api.post("/users/me/activate-provider");
      navigate("/dashboard/provider?tab=perfil");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setActivating(false); }
  };

  if (authLoading || !user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#0077B6]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6" data-testid="user-profile-page">
        {/* Header */}
        <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden" data-testid="user-profile-header">
          <div className="h-20 bg-gradient-to-br from-[#03045E] via-[#0077B6] to-[#00B4D8]" />
          <div className="px-5 pb-5 -mt-12">
            <AvatarUploader profile={profile} onChange={load} lang={lang} />
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display font-extrabold text-2xl text-[#03045E] truncate">
                  {profile.full_name || "—"}
                  {profile.provider_verified && <VerifiedBadge size={20} className="ml-1.5 inline-block align-middle" />}
                </h1>
                <p className="text-sm text-slate-500">@{profile.username}</p>
                {profile.getamano_code && (
                  <p className="mt-1 font-mono text-xs font-bold text-[#0077B6] inline-flex items-center gap-1">
                    <Hash className="w-3 h-3" /> {profile.getamano_code}
                    {profile.provider_slug && (
                      <Link to={`/p/${profile.provider_slug}`} className="ml-1.5 text-slate-500 hover:text-[#0077B6] inline-flex items-center" data-testid="user-profile-view-ecard">
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </p>
                )}
                {profile.bio && (
                  <p className="text-sm text-slate-700 mt-2 leading-snug" data-testid="user-profile-bio">{profile.bio}</p>
                )}
                {profile.city && (
                  <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {profile.city}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="h-9 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 inline-flex items-center gap-1"
                data-testid="user-profile-edit"
              >
                <Edit3 className="w-3.5 h-3.5" />
                {lang === "en" ? "Edit" : "Editar"}
              </button>
            </div>
          </div>
        </section>

        {/* Sell CTA — keeps Section 88's primary conversion path */}
        {!profile.is_provider && (
          <section
            className="mt-4 rounded-2xl bg-gradient-to-br from-[#03045E] to-[#0077B6] text-white p-5 flex items-start gap-3"
            data-testid="user-profile-sell-cta"
          >
            <Briefcase className="w-6 h-6 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-lg">
                {lang === "en" ? "Sell your services on getamano" : "Vende tus servicios en getamano"}
              </h2>
              <p className="text-sm opacity-80 mt-1">
                {lang === "en"
                  ? "Open your eCard, post Reels, and start getting clients in 2 minutes."
                  : "Abre tu eCard, sube Reels y empieza a recibir clientes en 2 minutos."}
              </p>
              <button
                type="button"
                onClick={activateProvider}
                disabled={activating}
                className="mt-3 inline-flex items-center gap-1 h-10 px-4 rounded-full bg-white text-[#03045E] font-bold disabled:opacity-50"
                data-testid="user-profile-activate-provider"
              >
                {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {lang === "en" ? "Activate eCard" : "Activar mi eCard"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        )}

        {/* Tabs */}
        <nav className="mt-4 flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1" data-testid="user-profile-tabs">
          {[
            { id: "photos", label: lang === "en" ? "Photos" : "Fotos", Icon: Camera },
            ...(profile.is_provider ? [{ id: "reels", label: "Reels", Icon: Film }] : []),
            { id: "about",  label: lang === "en" ? "About"  : "Acerca de", Icon: Info },
          ].map(t => {
            const active = tab === t.id;
            const Icon = t.Icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 h-10 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition ${
                  active ? "bg-[#0077B6] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                }`}
                data-testid={`user-profile-tab-${t.id}`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className="mt-4">
          {tab === "photos" && <PhotosTab lang={lang} />}
          {tab === "reels"  && profile.is_provider && <ReelsTab lang={lang} />}
          {tab === "about"  && <AboutTab profile={profile} onChange={load} lang={lang} />}
        </div>
      </main>

      {editOpen && <EditProfileModal profile={profile} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} lang={lang} />}
    </div>
  );
}

// ─── Avatar uploader ─────────────────────────────────────────────────
function AvatarUploader({ profile, onChange, lang }) {
  const [uploading, setUploading] = useState(false);
  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/users/me/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await onChange();
      toast.success(lang === "en" ? "Avatar updated" : "Avatar actualizado");
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || "Error");
    } finally { setUploading(false); }
  };
  return (
    <label className="relative inline-flex" data-testid="user-profile-avatar">
      <div className="w-24 h-24 rounded-full bg-white ring-4 ring-white shadow-md overflow-hidden">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#90E0EF] to-[#00B4D8] flex items-center justify-center text-white text-3xl font-display font-extrabold">
            {(profile.full_name || profile.username || "?").charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#0077B6] text-white flex items-center justify-center shadow ring-2 ring-white cursor-pointer" data-testid="user-profile-avatar-edit">
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
      </span>
      <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={uploading} data-testid="user-profile-avatar-input" />
    </label>
  );
}

// ─── Photos tab ──────────────────────────────────────────────────────
function PhotosTab({ lang }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get("/users/me/photos"); setPhotos(r.data || []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/users/me/photos", fd, { headers: { "Content-Type": "multipart/form-data" } });
      refresh();
      toast.success(lang === "en" ? "Photo uploaded" : "Foto subida");
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || "Error");
    } finally { setUploading(false); e.target.value = ""; }
  };

  const remove = async (id) => {
    if (!confirm(lang === "en" ? "Delete this photo?" : "¿Eliminar esta foto?")) return;
    try { await api.delete(`/users/me/photos/${id}`); refresh(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  if (loading) return <Center><Loader2 className="w-6 h-6 animate-spin text-[#0077B6]" /></Center>;
  return (
    <section data-testid="user-profile-photos-tab">
      <header className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">{photos.length}/30 {lang === "en" ? "photos" : "fotos"}</p>
        <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#0077B6] hover:bg-[#005f93] text-white text-xs font-bold cursor-pointer" data-testid="user-profile-photos-upload">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {lang === "en" ? "Upload" : "Subir"}
          <input type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading || photos.length >= 30} />
        </label>
      </header>
      {photos.length === 0 ? (
        <Empty msg={lang === "en" ? "No photos yet. Upload your first one!" : "Sin fotos aún. ¡Sube la primera!"} />
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2" data-testid="user-profile-photos-grid">
          {photos.map(p => (
            <li key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group" data-testid={`user-profile-photo-${p.id}`}>
              <img src={p.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                data-testid={`user-profile-photo-delete-${p.id}`}
                aria-label="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Reels tab (provider only) ──────────────────────────────────────
function ReelsTab({ lang }) {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/reels", { params: { limit: 24 } })
      .then(r => { setReels(r.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  if (loading) return <Center><Loader2 className="w-6 h-6 animate-spin text-[#0077B6]" /></Center>;
  return (
    <section data-testid="user-profile-reels-tab">
      <header className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">{reels.length} reels</p>
        <Link to="/reels" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold" data-testid="user-profile-reels-create">
          <Film className="w-3.5 h-3.5" />
          {lang === "en" ? "Create reel" : "Crear reel"}
        </Link>
      </header>
      {reels.length === 0 ? (
        <Empty msg={lang === "en" ? "No reels yet. Post one to get discovered." : "Sin reels todavía. Sube uno y empieza a destacar."} />
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2" data-testid="user-profile-reels-grid">
          {reels.map(r => (
            <li key={r.reel_id} className="relative aspect-[9/16] rounded-xl bg-black overflow-hidden" data-testid={`user-profile-reel-${r.reel_id}`}>
              <Link to={`/reels?r=${r.reel_id}`} className="block w-full h-full">
                {r.thumbnail_url ? (
                  <img src={r.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <video src={r.video_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── About tab ───────────────────────────────────────────────────────
function AboutTab({ profile, onChange, lang }) {
  const social = profile.social_links || {};
  const items = [
    { k: "instagram", label: "Instagram", Icon: Instagram, prefix: "https://instagram.com/" },
    { k: "tiktok",    label: "TikTok",    Icon: Music2,    prefix: "https://tiktok.com/@" },
    { k: "facebook",  label: "Facebook",  Icon: Facebook,  prefix: "https://facebook.com/" },
    { k: "linkedin",  label: "LinkedIn",  Icon: Linkedin,  prefix: "https://linkedin.com/in/" },
    { k: "twitter",   label: "Twitter",   Icon: Twitter,   prefix: "https://twitter.com/" },
  ];

  const deleteAccount = async () => {
    const ok = window.confirm(
      lang === "en"
        ? "Delete your account? This wipes your photos, reels, posts and comments. Can't be undone."
        : "¿Eliminar tu cuenta? Borrarás tus fotos, reels, publicaciones y comentarios. No se puede deshacer."
    );
    if (!ok) return;
    const phrase = window.prompt(lang === "en" ? "Type DELETE to confirm" : "Escribe ELIMINAR para confirmar");
    if (!(phrase === "DELETE" || phrase === "ELIMINAR")) return;
    try {
      await api.delete("/users/me");
      try { await api.post("/auth/logout"); } catch { /* noop */ }
      window.location.href = "/";
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  return (
    <section className="space-y-4" data-testid="user-profile-about-tab">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-display font-bold text-base text-[#03045E] mb-2">{lang === "en" ? "Social links" : "Redes sociales"}</h3>
        {items.every(i => !social[i.k]) ? (
          <p className="text-xs text-slate-500">{lang === "en" ? "No links added yet. Tap Edit to add." : "Aún no agregaste enlaces. Toca Editar para sumar."}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.filter(i => social[i.k]).map(i => (
              <a
                key={i.k}
                href={`${i.prefix}${social[i.k]}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                data-testid={`user-profile-social-${i.k}`}
              >
                <i.Icon className="w-3.5 h-3.5" />
                {social[i.k]}
              </a>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-display font-bold text-base text-[#03045E] mb-2">{lang === "en" ? "Privacy" : "Privacidad"}</h3>
        <PrivacyToggle profile={profile} onChange={onChange} lang={lang} />
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
        <h3 className="font-display font-bold text-base text-rose-700 mb-2">{lang === "en" ? "Danger zone" : "Zona peligrosa"}</h3>
        <p className="text-xs text-rose-600 mb-2">
          {lang === "en"
            ? "Permanently delete your account. This cannot be undone."
            : "Elimina tu cuenta permanentemente. No se puede deshacer."}
        </p>
        <button
          type="button"
          onClick={deleteAccount}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold"
          data-testid="user-profile-delete-account"
        >
          <Trash2 className="w-4 h-4" />
          {lang === "en" ? "Delete my account" : "Eliminar mi cuenta"}
        </button>
      </div>
    </section>
  );
}

function PrivacyToggle({ profile, onChange, lang }) {
  const [isPublic, setIsPublic] = useState(!!profile.is_public);
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    const next = !isPublic;
    setIsPublic(next); setSaving(true);
    try {
      await api.put("/users/me/profile", { is_public: next });
      await onChange();
    } catch { setIsPublic(!next); } finally { setSaving(false); }
  };
  return (
    <label className="flex items-center justify-between cursor-pointer" data-testid="user-profile-privacy-toggle">
      <span className="text-sm font-medium text-slate-700">
        {lang === "en" ? "Profile is public" : "Perfil público"}
      </span>
      <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${isPublic ? "bg-emerald-500" : "bg-slate-300"} ${saving ? "opacity-50" : ""}`}>
        <input type="checkbox" checked={isPublic} onChange={toggle} className="sr-only" disabled={saving} />
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${isPublic ? "translate-x-6" : "translate-x-1"}`} />
      </span>
    </label>
  );
}

// ─── Edit modal ──────────────────────────────────────────────────────
function EditProfileModal({ profile, onClose, onSaved, lang }) {
  const [form, setForm] = useState({
    full_name: profile.full_name || "",
    username:  profile.username  || "",
    bio:       profile.bio       || "",
    city:      profile.city      || "",
    phone:     profile.phone     || "",
    preferred_lang: profile.preferred_lang || "es",
    social_links: { ...(profile.social_links || {}) },
  });
  const [saving, setSaving] = useState(false);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateSocial = (k, v) => setForm(f => ({ ...f, social_links: { ...f.social_links, [k]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/users/me/profile", form);
      toast.success(lang === "en" ? "Profile saved" : "Perfil guardado");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }} data-testid="user-profile-edit-modal">
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        <header className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-display font-bold text-lg">{lang === "en" ? "Edit profile" : "Editar perfil"}</h3>
          <button type="button" onClick={onClose} disabled={saving} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400" data-testid="user-profile-edit-close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label={lang === "en" ? "Full name" : "Nombre completo"} value={form.full_name} onChange={v => update("full_name", v)} testid="user-profile-edit-name" />
          <Field label="@username" value={form.username} onChange={v => update("username", v.toLowerCase().replace(/[^a-z0-9_]/g, ""))} maxLength={24} testid="user-profile-edit-username" hint={lang === "en" ? "Letters, numbers and _ (3-24)" : "Letras, números y _ (3-24)"} />
          <Field label="Bio" value={form.bio} onChange={v => update("bio", v)} maxLength={160} multiline testid="user-profile-edit-bio" />
          <Field label={lang === "en" ? "City" : "Ciudad"} value={form.city} onChange={v => update("city", v)} testid="user-profile-edit-city" />
          <Field label={lang === "en" ? "Phone" : "Teléfono"} value={form.phone} onChange={v => update("phone", v)} testid="user-profile-edit-phone" />
          <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mt-3">{lang === "en" ? "Social handles" : "Redes (sin @)"}</p>
          <Field label="Instagram" value={form.social_links.instagram || ""} onChange={v => updateSocial("instagram", v)} testid="user-profile-edit-instagram" />
          <Field label="TikTok"    value={form.social_links.tiktok    || ""} onChange={v => updateSocial("tiktok",    v)} testid="user-profile-edit-tiktok" />
          <Field label="Facebook"  value={form.social_links.facebook  || ""} onChange={v => updateSocial("facebook",  v)} testid="user-profile-edit-facebook" />
          <Field label="LinkedIn"  value={form.social_links.linkedin  || ""} onChange={v => updateSocial("linkedin",  v)} testid="user-profile-edit-linkedin" />
          <Field label="Twitter"   value={form.social_links.twitter   || ""} onChange={v => updateSocial("twitter",   v)} testid="user-profile-edit-twitter" />
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">
              <Globe2 className="w-3 h-3 inline mr-1" /> {lang === "en" ? "Preferred language" : "Idioma preferido"}
            </label>
            <select value={form.preferred_lang} onChange={e => update("preferred_lang", e.target.value)} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20" data-testid="user-profile-edit-lang">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium disabled:opacity-50" data-testid="user-profile-edit-cancel">
            {lang === "en" ? "Cancel" : "Cancelar"}
          </button>
          <button type="button" onClick={save} disabled={saving} className="flex-1 h-11 rounded-full bg-[#0077B6] hover:bg-[#005f93] text-white font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5" data-testid="user-profile-edit-save">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {lang === "en" ? "Save" : "Guardar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, testid, maxLength, multiline, hint }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          maxLength={maxLength || 240}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20 resize-none"
          data-testid={testid}
        />
      ) : (
        <input
          type="text"
          value={value}
          maxLength={maxLength || 80}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20"
          data-testid={testid}
        />
      )}
      {hint && <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>}
    </label>
  );
}

function Center({ children }) { return <div className="py-10 flex items-center justify-center">{children}</div>; }
function Empty({ msg }) { return <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500" data-testid="user-profile-empty">{msg}</div>; }
