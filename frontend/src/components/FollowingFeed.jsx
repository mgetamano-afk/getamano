import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Camera, FileImage, MessageSquare, Users, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import EmptyState from "./EmptyState";

/**
 * FollowingFeed — Section 67.
 *
 * Personalized feed showing recent activity from accounts the viewer
 * follows. Powered by GET /api/follows/me/feed which aggregates events
 * across: stories, banner_shares, community_posts. Each event is a
 * lightweight card with avatar + action verb + media thumbnail + ts.
 *
 * If guest: shows a friendly prompt to sign in (no feed visible).
 * If logged in but following 0 users: encourages discovery.
 */
const ICONS = {
  story:  Camera,
  banner: FileImage,
  post:   MessageSquare,
};

export default function FollowingFeed() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);

  useEffect(() => {
    if (!user) { setEvents([]); return; }
    api.get("/follows/me/feed", { params: { limit: 30 } })
      .then(r => setEvents(Array.isArray(r.data) ? r.data : []))
      .catch(() => setEvents([]));
  }, [user]);

  if (!user) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center" data-testid="following-feed-guest">
        <span
          className="inline-flex w-12 h-12 rounded-2xl items-center justify-center text-white mb-3"
          style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
        >
          <Users className="w-6 h-6" />
        </span>
        <h3 className="font-display font-bold text-slate-900">
          {lang === "en" ? "Sign in to see your feed" : "Inicia sesión para ver tu feed"}
        </h3>
        <p className="text-sm text-slate-500 mt-1.5 mb-4">
          {lang === "en"
            ? "Follow providers and friends to see their latest activity here."
            : "Sigue proveedores y amigos para ver su actividad aquí."}
        </p>
        <button
          type="button"
          onClick={() => navigate("/login?redirect=/comunidad")}
          className="px-5 h-10 rounded-full text-white font-bold text-sm transition hover:brightness-110"
          style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
          data-testid="following-feed-signin-btn"
        >
          {lang === "en" ? "Sign in" : "Iniciar sesión"}
        </button>
      </div>
    );
  }

  if (events === null) {
    return (
      <div className="space-y-3" data-testid="following-feed-loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-slate-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-slate-100 rounded w-1/3" />
                <div className="h-2 bg-slate-100 rounded w-1/4" />
              </div>
            </div>
            <div className="h-40 bg-slate-100 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-6">
        <EmptyState
          icon={<Sparkles className="w-12 h-12" />}
          title={lang === "en" ? "Nothing to show yet" : "Aún no hay nada que ver"}
          subtitle={lang === "en"
            ? "Follow verified providers to see their stories, new banners and posts here."
            : "Sigue proveedores verificados para ver sus historias, nuevos banners y publicaciones aquí."}
        />
      </div>
    );
  }

  return (
    <ul className="space-y-3" data-testid="following-feed-list">
      {events.map(e => <EventCard key={`${e.kind}:${e.id}`} e={e} lang={lang} />)}
    </ul>
  );
}

function EventCard({ e, lang }) {
  const Icon = ICONS[e.kind] || Sparkles;
  const summary = lang === "en" ? e.summary_en : e.summary_es;
  const initial = (e.actor_name || "?").trim().charAt(0).toUpperCase();
  const relTime = formatRelative(e.created_at, lang);

  return (
    <li
      className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-md transition"
      data-testid={`following-feed-card-${e.kind}-${e.id}`}
    >
      <div className="p-3.5 flex items-start gap-3">
        <Link to={e.actor_slug ? `/p/${e.actor_slug}` : "#"} className="flex-shrink-0">
          <span className="block w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
            {e.actor_avatar ? (
              <img src={e.actor_avatar} alt="" className="w-full h-full object-cover" loading="lazy" onError={(ev) => { ev.currentTarget.style.display = "none"; }} />
            ) : (
              <span className="w-full h-full flex items-center justify-center font-bold text-slate-600">{initial}</span>
            )}
          </span>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-700 leading-snug">
            <Link
              to={e.actor_slug ? `/p/${e.actor_slug}` : "#"}
              className="font-bold text-slate-900 hover:underline"
              data-testid={`following-feed-actor-${e.id}`}
            >
              {e.actor_name}
            </Link>
            <span className="text-slate-500"> {summary}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
            <Icon className="w-3 h-3" />
            <span>{relTime}</span>
          </div>
        </div>
      </div>

      {e.media && (
        <Link to={e.url || "#"} className="block">
          <div className={`bg-slate-100 overflow-hidden ${e.kind === "banner" ? "aspect-[1200/630]" : "aspect-square sm:aspect-[4/3]"}`}>
            <img
              src={e.media}
              alt={e.actor_name}
              className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-500"
              loading="lazy"
              onError={(ev) => { ev.currentTarget.style.display = "none"; }}
            />
          </div>
        </Link>
      )}

      {e.body_excerpt && (
        <div className="px-4 pb-3 pt-1">
          <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">{e.body_excerpt}</p>
        </div>
      )}
    </li>
  );
}

function formatRelative(iso, lang) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return lang === "en" ? "just now" : "ahora";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} d`;
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "es-MX", { month: "short", day: "numeric" });
}
