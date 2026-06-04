import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Briefcase, ChevronRight, Loader2, Hash, Camera, Film, Heart, ImagePlus,
  Info, MapPin, Instagram, Music2, Facebook, Linkedin, Twitter, Mail, KeyRound,
  Trash2, Upload, X, Edit3, ExternalLink, Globe2, LogOut, Star,
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
  const { user, logout, loading: authLoading } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  // V19.2 — Default tab depends on role: clients land on Favoritos (their
  // most-frequent intent on the personal page), providers on Photos.
  const [tab, setTab] = useState("photos");
  const [activating, setActivating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
  }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/users/me/profile");
      setProfile(r.data);
      if (r.data && !r.data.is_provider && tab === "photos") {
        // Clients land on favorites by default unless they manually
        // switched to another tab earlier.
        setTab((prev) => prev === "photos" ? "favoritos" : prev);
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {/* V19.2 — Completa tu perfil banner. Fires when the user hasn't
            uploaded an avatar OR a cover yet — these are the two visual
            assets that make the profile feel finished and trustworthy. */}
        {(!profile.avatar_url || !profile.cover_url) && (
          <CompleteProfileBanner profile={profile} lang={lang} onEdit={() => setEditOpen(true)} />
        )}

        {/* Header */}
        <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden" data-testid="user-profile-header">
          <CoverUploader profile={profile} onChange={load} lang={lang} />
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
            ...(profile.is_provider
              ? [{ id: "reels", label: "Reels", Icon: Film }]
              : [{ id: "favoritos", label: lang === "en" ? "Favorites" : "Favoritos", Icon: Heart }]
            ),
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
          {tab === "photos"    && <PhotosTab lang={lang} />}
          {tab === "reels"     && profile.is_provider && <ReelsTab lang={lang} />}
          {tab === "favoritos" && !profile.is_provider && <FavoritesTab lang={lang} />}
          {tab === "about"     && (
            <AboutTab
              profile={profile}
              onChange={load}
              lang={lang}
              onChangePassword={() => setPasswordOpen(true)}
              onLogout={async () => { await logout(); navigate("/"); }}
            />
          )}
        </div>
      </main>

      {editOpen && <EditProfileModal profile={profile} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} lang={lang} />}
      {passwordOpen && <ChangePasswordPrompt email={profile.email} onClose={() => setPasswordOpen(false)} lang={lang} />}
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
function AboutTab({ profile, onChange, lang, onChangePassword, onLogout }) {
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
      {/* V19.2 — Account section. Email shown as read-only (changing it
          requires re-verifying, which lives in the existing forgot/OTP
          flow). Password change opens the modal that walks the user
          through the email-OTP recovery flow. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="user-profile-account-section">
        <h3 className="font-display font-bold text-base text-[#03045E] mb-3">{lang === "en" ? "Account" : "Cuenta"}</h3>
        <ul className="space-y-2.5">
          <li className="flex items-center gap-3 text-sm">
            <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="flex-1 min-w-0 truncate">{profile.email}</span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 flex-shrink-0">{lang === "en" ? "Email" : "Correo"}</span>
          </li>
          <li>
            <button
              type="button"
              onClick={onChangePassword}
              className="w-full flex items-center gap-3 text-sm hover:bg-slate-50 -mx-2 px-2 py-2 rounded-lg transition"
              data-testid="user-profile-change-password"
            >
              <KeyRound className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="flex-1 text-left">{lang === "en" ? "Change password" : "Cambiar contraseña"}</span>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center gap-3 text-sm text-rose-600 hover:bg-rose-50 -mx-2 px-2 py-2 rounded-lg transition"
              data-testid="user-profile-logout"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{lang === "en" ? "Sign out" : "Cerrar sesión"}</span>
            </button>
          </li>
        </ul>
      </div>

      {/* V19.2 — Quick action: clients post a chamba (job request). Lives
          here so the personal profile is the one-stop hub for everything
          a client does on the platform. */}
      {!profile.is_provider && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4" data-testid="user-profile-post-chamba">
          <h3 className="font-display font-bold text-base text-amber-700 mb-2 inline-flex items-center gap-1.5">
            <Briefcase className="w-4 h-4" /> {lang === "en" ? "Post a job" : "Publicar chamba"}
          </h3>
          <p className="text-xs text-amber-700/80 mb-3">
            {lang === "en"
              ? "Describe what you need and let providers come to you."
              : "Describe lo que necesitas y deja que los proveedores te contacten."}
          </p>
          <Link
            to="/empleos?post=1"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
            data-testid="user-profile-post-chamba-cta"
          >
            <Briefcase className="w-3.5 h-3.5" />
            {lang === "en" ? "Post a job" : "Publicar chamba"}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

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

// ─── V19.2 · Complete-profile banner ────────────────────────────────
function CompleteProfileBanner({ profile, lang, onEdit }) {
  const steps = [
    { id: "avatar", done: !!profile.avatar_url, label: lang === "en" ? "Add profile photo" : "Sube tu foto" },
    { id: "cover",  done: !!profile.cover_url,  label: lang === "en" ? "Add cover image"   : "Sube tu portada" },
    { id: "bio",    done: !!(profile.bio && profile.bio.trim()), label: lang === "en" ? "Write a short bio" : "Escribe una bio corta" },
    { id: "city",   done: !!(profile.city && profile.city.trim()), label: lang === "en" ? "Add your city"   : "Agrega tu ciudad" },
  ];
  const remaining = steps.filter(s => !s.done);
  if (remaining.length === 0) return null;
  const total = steps.length;
  const completed = total - remaining.length;
  const pct = Math.round((completed / total) * 100);
  return (
    <section className="mb-4 rounded-2xl bg-gradient-to-br from-[#0077B6] to-[#00B4D8] text-white p-4 shadow-sm" data-testid="complete-profile-banner">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-extrabold text-lg leading-tight">
            {lang === "en" ? "Finish setting up your profile" : "Completa tu perfil"}
          </h2>
          <p className="text-xs text-white/80 mt-0.5">
            {lang === "en" ? `${completed} of ${total} steps done` : `${completed} de ${total} pasos listos`}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="h-9 px-3.5 rounded-full bg-white text-[#0077B6] text-xs font-bold inline-flex items-center gap-1 hover:bg-white/90"
          data-testid="complete-profile-cta"
        >
          {lang === "en" ? "Complete" : "Completar"}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden">
        <div className="h-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {remaining.map(s => (
          <li key={s.id} className="text-[11px] px-2 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20">
            {s.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── V19.2 · Cover banner uploader ──────────────────────────────────
function CoverUploader({ profile, onChange, lang }) {
  const [uploading, setUploading] = useState(false);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    upload(f);
    e.target.value = "";
  };
  const upload = async (file) => {
    const fd = new FormData(); fd.append("file", file);
    try {
      setUploading(true);
      await api.post("/users/me/cover", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await onChange();
      toast.success(lang === "en" ? "Cover updated" : "Portada actualizada");
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
    finally { setUploading(false); }
  };
  const remove = async () => {
    try {
      await api.delete("/users/me/cover");
      await onChange();
    } catch { /* noop */ }
  };

  const url = profile.cover_url ? (profile.cover_url.startsWith("http") ? profile.cover_url : `${process.env.REACT_APP_BACKEND_URL}${profile.cover_url}`) : "";
  return (
    <div className="relative h-32 sm:h-40 bg-gradient-to-br from-[#03045E] via-[#0077B6] to-[#00B4D8]" data-testid="user-profile-cover">
      {url && (
        <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
      <label className="absolute top-3 right-3 h-9 px-3 rounded-full bg-black/55 backdrop-blur-md text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:bg-black/70 transition" data-testid="user-profile-cover-upload">
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
        {profile.cover_url ? (lang === "en" ? "Change cover" : "Cambiar portada") : (lang === "en" ? "Add cover" : "Agregar portada")}
        <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={uploading} />
      </label>
      {profile.cover_url && (
        <button
          type="button"
          onClick={remove}
          className="absolute top-3 right-3 -translate-y-[150%] h-7 w-7 rounded-full bg-black/55 backdrop-blur-md text-white inline-flex items-center justify-center hover:bg-black/70 transition"
          aria-label={lang === "en" ? "Remove cover" : "Quitar portada"}
          data-testid="user-profile-cover-remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── V19.2 · Favorites tab ──────────────────────────────────────────
function FavoritesTab({ lang }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get("/favorites");
        if (alive) setItems(r.data || []);
      } catch { if (alive) setItems([]); }
    })();
    return () => { alive = false; };
  }, []);
  if (items === null) return <Center><Loader2 className="w-5 h-5 animate-spin text-[#0077B6]" /></Center>;
  if (items.length === 0) {
    return (
      <Empty
        msg={
          <span>
            {lang === "en" ? "You haven't favorited any provider yet. " : "Aún no marcaste favorito a ningún proveedor. "}
            <Link to="/proveedores" className="text-[#0077B6] font-bold hover:underline" data-testid="favorites-empty-cta">
              {lang === "en" ? "Browse providers" : "Ver proveedores"}
            </Link>
          </span>
        }
      />
    );
  }
  return (
    <ul className="space-y-2" data-testid="favorites-list">
      {items.map((f) => (
        <li key={f.favorite_id || f.provider_id} className="rounded-xl border border-slate-200 bg-white p-3 hover:border-[#0077B6] transition" data-testid={`favorite-${f.provider_id}`}>
          <Link to={`/p/${f.provider_slug}`} className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
              {f.logo_url ? <img src={f.logo_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center font-bold text-teal-700">{(f.business_name || "?")[0]}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-slate-900 truncate">{f.business_name}</p>
              <p className="text-xs text-slate-500 truncate">{f.category || ""} {f.city ? `· ${f.city}` : ""}</p>
              {typeof f.rating === "number" && f.rating > 0 && (
                <p className="text-xs text-amber-500 inline-flex items-center gap-0.5 mt-0.5">
                  <Star className="w-3 h-3 fill-amber-500 stroke-amber-500" />
                  {f.rating.toFixed(1)}
                </p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ─── V19.2 · Change password prompt ─────────────────────────────────
function ChangePasswordPrompt({ email, onClose, lang }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const trigger = async () => {
    try {
      setSending(true);
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
    finally { setSending(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="change-password-modal">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-display font-bold text-lg text-[#03045E] inline-flex items-center gap-1.5">
            <KeyRound className="w-5 h-5" />
            {lang === "en" ? "Change password" : "Cambiar contraseña"}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="close"><X className="w-5 h-5" /></button>
        </div>
        {sent ? (
          <>
            <p className="text-sm text-slate-700 mb-1">{lang === "en" ? "Check your inbox!" : "¡Revisa tu correo!"}</p>
            <p className="text-xs text-slate-500 mb-4">
              {lang === "en"
                ? `We sent a 6-digit code to ${email}. Use it to set a new password.`
                : `Enviamos un código de 6 dígitos a ${email}. Úsalo para crear una contraseña nueva.`}
            </p>
            <Link
              to={`/reset-password?email=${encodeURIComponent(email)}`}
              className="w-full h-11 rounded-full bg-[#0077B6] text-white font-bold text-sm inline-flex items-center justify-center"
              data-testid="change-password-continue"
            >
              {lang === "en" ? "Enter the code" : "Ingresar el código"}
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-700 mb-1">{email}</p>
            <p className="text-xs text-slate-500 mb-4">
              {lang === "en"
                ? "For your safety, we'll email you a 6-digit code. Use it to set a new password."
                : "Por tu seguridad, te enviaremos un código de 6 dígitos por correo. Úsalo para crear una contraseña nueva."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 h-11 rounded-full border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50" data-testid="change-password-cancel">
                {lang === "en" ? "Cancel" : "Cancelar"}
              </button>
              <button type="button" onClick={trigger} disabled={sending} className="flex-1 h-11 rounded-full bg-[#0077B6] hover:bg-[#0096C7] text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60" data-testid="change-password-send">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {lang === "en" ? "Email me a code" : "Enviarme el código"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
