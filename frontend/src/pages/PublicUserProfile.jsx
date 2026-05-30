import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Camera, Film, Loader2, MapPin, Lock, Hash,
  Instagram, Music2, Facebook, Linkedin, Twitter, ExternalLink,
} from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import Header from "../components/Header";
import Footer from "../components/Footer";
import VerifiedBadge from "../components/VerifiedBadge";

/**
 * PublicUserProfile — V9 Part 1.
 *
 * Route: /u/:username
 *
 * Read-only view of any user's public social profile. Renders the same
 * 3 tabs (Photos / Reels / About). Falls back gracefully when the user
 * is private (just renders the basic header + a privacy banner).
 */
export default function PublicUserProfile() {
  const { username } = useParams();
  const { lang } = useI18n();
  const [profile, setProfile] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [reels, setReels] = useState([]);
  const [tab, setTab] = useState("photos");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get(`/users/${username}/profile`).then(r => {
      if (!alive) return;
      setProfile(r.data);
      if (r.data?.is_public !== false) {
        api.get(`/users/${username}/photos`).then(rr => alive && setPhotos(rr.data || [])).catch(() => {});
        api.get(`/users/${username}/reels`).then(rr => alive && setReels(rr.data || [])).catch(() => {});
      }
    }).catch(() => setNotFound(true)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#0077B6]" />
      </div>
    );
  }
  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6 text-center">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-700">@{username}</h1>
            <p className="text-sm text-slate-500 mt-2">
              {lang === "en" ? "User not found." : "Usuario no encontrado."}
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const isPrivate = profile.is_public === false;
  const social = profile.social_links || {};
  const socialItems = [
    { k: "instagram", Icon: Instagram, prefix: "https://instagram.com/" },
    { k: "tiktok",    Icon: Music2,    prefix: "https://tiktok.com/@" },
    { k: "facebook",  Icon: Facebook,  prefix: "https://facebook.com/" },
    { k: "linkedin",  Icon: Linkedin,  prefix: "https://linkedin.com/in/" },
    { k: "twitter",   Icon: Twitter,   prefix: "https://twitter.com/" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-6" data-testid="public-user-profile">
        <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
          <div className="h-20 bg-gradient-to-br from-[#03045E] via-[#0077B6] to-[#00B4D8]" />
          <div className="px-5 pb-5 -mt-12">
            <div className="w-24 h-24 rounded-full bg-white ring-4 ring-white shadow-md overflow-hidden">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#90E0EF] to-[#00B4D8] flex items-center justify-center text-white text-3xl font-display font-extrabold">
                  {(profile.full_name || profile.username || "?").charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <h1 className="mt-3 font-display font-extrabold text-2xl text-[#03045E]">
              {profile.full_name}
              {profile.provider_verified && <VerifiedBadge size={20} className="ml-1.5 inline-block align-middle" />}
            </h1>
            <p className="text-sm text-slate-500">@{profile.username}</p>
            {profile.getamano_code && (
              <p className="mt-1 font-mono text-xs font-bold text-[#0077B6] inline-flex items-center gap-1">
                <Hash className="w-3 h-3" /> {profile.getamano_code}
                {profile.provider_slug && (
                  <Link to={`/p/${profile.provider_slug}`} className="ml-1.5 inline-flex items-center text-slate-500 hover:text-[#0077B6]" data-testid="public-user-view-ecard">
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </p>
            )}
            {profile.bio && <p className="text-sm text-slate-700 mt-2 leading-snug">{profile.bio}</p>}
            {profile.city && (
              <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {profile.city}
              </p>
            )}
          </div>
        </section>

        {isPrivate ? (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-10 text-center" data-testid="public-user-private-banner">
            <Lock className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">
              {lang === "en" ? "This profile is private." : "Este perfil es privado."}
            </p>
          </section>
        ) : (
          <>
            <nav className="mt-4 flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1">
              <TabBtn id="photos" Icon={Camera} label={lang === "en" ? "Photos" : "Fotos"} tab={tab} setTab={setTab} />
              {profile.is_provider && <TabBtn id="reels" Icon={Film} label="Reels" tab={tab} setTab={setTab} />}
              <TabBtn id="about"  Icon={MapPin} label={lang === "en" ? "About" : "Acerca de"} tab={tab} setTab={setTab} />
            </nav>

            <div className="mt-4">
              {tab === "photos" && (
                photos.length === 0 ? <Empty msg={lang === "en" ? "No photos." : "Sin fotos."} /> : (
                  <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {photos.map(p => (
                      <li key={p.id} className="aspect-square rounded-xl overflow-hidden bg-slate-100">
                        <img src={p.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </li>
                    ))}
                  </ul>
                )
              )}
              {tab === "reels" && (
                reels.length === 0 ? <Empty msg={lang === "en" ? "No reels." : "Sin reels."} /> : (
                  <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {reels.map(r => (
                      <li key={r.reel_id} className="relative aspect-[9/16] rounded-xl bg-black overflow-hidden">
                        <Link to={`/reels?r=${r.reel_id}`} className="block w-full h-full">
                          {r.thumbnail_url ? <img src={r.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                            : <video src={r.video_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )
              )}
              {tab === "about" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  {socialItems.every(i => !social[i.k]) ? (
                    <p className="text-sm text-slate-500">{lang === "en" ? "No social links." : "Sin redes sociales."}</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {socialItems.filter(i => social[i.k]).map(i => (
                        <a
                          key={i.k}
                          href={`${i.prefix}${social[i.k]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                        >
                          <i.Icon className="w-3.5 h-3.5" />
                          {social[i.k]}
                        </a>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function TabBtn({ id, Icon, label, tab, setTab }) {
  const active = tab === id;
  return (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex-1 h-10 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 transition ${
        active ? "bg-[#0077B6] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
      }`}
      data-testid={`public-user-tab-${id}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function Empty({ msg }) {
  return <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{msg}</div>;
}
