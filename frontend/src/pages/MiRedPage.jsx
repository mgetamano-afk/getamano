import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, UserPlus, MapPin, Star, ShieldCheck, DollarSign } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import FollowButton from "../components/FollowButton";
import EarningsPanel from "../components/EarningsPanel";
import MyInvitesPanel from "../components/MyInvitesPanel";
import EmptyState from "../components/EmptyState";

/**
 * MiRedPage — Section 65 (Red de Aliados).
 *
 * Provider dashboard view showing the provider's network:
 *  · Tab "Sigo a"      — people the provider follows (peers)
 *  · Tab "Me siguen"   — clients/providers following them
 *  · "Sugerencias"     — verified providers in same category to discover/follow
 *
 * Designed to power future referral-commission flows: once 2 providers
 * follow each other, they can refer leads to one another (5% comission).
 */
const TABS = [
  { id: "invites",     labelEs: "Invitaciones", labelEn: "Invites" },
  { id: "following",   labelEs: "Sigo a",     labelEn: "Following" },
  { id: "followers",   labelEs: "Me siguen",  labelEn: "Followers" },
  { id: "suggestions", labelEs: "Sugerencias", labelEn: "Suggestions" },
  { id: "earnings",    labelEs: "Comisiones",  labelEn: "Commissions" },
];

export default function MiRedPage() {
  const { lang } = useI18n();
  const [tab, setTab] = useState("invites");
  const [following, setFollowing] = useState(null);
  const [followers, setFollowers] = useState(null);
  const [network, setNetwork] = useState(null);

  useEffect(() => {
    api.get("/follows/me/network").then(r => setNetwork(r.data)).catch(() => setNetwork({}));
    api.get("/follows/me/following").then(r => setFollowing(r.data || [])).catch(() => setFollowing([]));
    api.get("/follows/me/followers").then(r => setFollowers(r.data || [])).catch(() => setFollowers([]));
  }, []);

  const counts = {
    following: following?.length ?? network?.following_count ?? 0,
    followers: followers?.length ?? network?.followers_count ?? 0,
    suggestions: network?.suggestions?.length || 0,
    earnings: 0,
  };

  const data = tab === "following" ? following
             : tab === "followers" ? followers
             : tab === "suggestions" ? (network?.suggestions || null)
             : null; // earnings handled by EarningsPanel

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden" data-testid="mi-red-page">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
          >
            <Users className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display font-extrabold text-slate-900 text-lg leading-tight">
              {lang === "en" ? "My network" : "Mi red"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {lang === "en"
                ? "Verified Latino allies. Refer jobs, grow together."
                : "Aliados latinos verificados. Refieran trabajos, crezcan juntos."}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat label={lang === "en" ? "Following" : "Sigo a"} value={counts.following} testid="net-stat-following" />
          <Stat label={lang === "en" ? "Followers" : "Me siguen"} value={counts.followers} testid="net-stat-followers" />
          <Stat label={lang === "en" ? "Suggestions" : "Sugerencias"} value={counts.suggestions} testid="net-stat-suggestions" />
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 -mb-1">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 h-9 rounded-full text-[13px] font-semibold transition ${
                tab === t.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              data-testid={`mi-red-tab-${t.id}`}
            >
              {lang === "en" ? t.labelEn : t.labelEs}
              <span className="ml-1.5 text-[11px] opacity-70">{counts[t.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        {tab === "invites" ? (
          <MyInvitesPanel />
        ) : tab === "earnings" ? (
          <EarningsPanel network={network} />
        ) : data === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={<UserPlus className="w-12 h-12" />}
              title={
                tab === "following"
                  ? (lang === "en" ? "You don't follow anyone yet" : "Aún no sigues a nadie")
                  : tab === "followers"
                  ? (lang === "en" ? "No followers yet" : "Aún no tienes seguidores")
                  : (lang === "en" ? "No suggestions for now" : "Sin sugerencias por ahora")
              }
              subtitle={
                tab === "following"
                  ? (lang === "en"
                      ? "Follow other verified providers to build your network and refer jobs."
                      : "Sigue a otros proveedores verificados para crear tu red y referir trabajos.")
                  : tab === "followers"
                  ? (lang === "en"
                      ? "Share your eCard so clients and allies can follow you."
                      : "Comparte tu eCard para que clientes y aliados te sigan.")
                  : (lang === "en"
                      ? "Complete your category in the profile to unlock smart suggestions."
                      : "Completa tu categoría en el perfil para desbloquear sugerencias inteligentes.")
              }
            />
          </div>
        ) : (
          <ul className="space-y-2" data-testid={`mi-red-list-${tab}`}>
            {data.map((u, idx) => (
              <NetworkRow key={u.user_id || idx} u={u} lang={lang} kind={tab} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, testid }) {
  return (
    <div className="bg-slate-50 rounded-2xl px-3 py-2.5" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-xl font-extrabold text-slate-900 mt-0.5 leading-none">{value}</div>
    </div>
  );
}

function NetworkRow({ u, lang, kind }) {
  const prof = u.provider;
  const isProvider = u.role === "provider" && prof;
  const initial = (u.name || "?").trim().charAt(0).toUpperCase();
  const logo = prof?.logo_url;
  const ratingAvg = prof?.rating_avg || 0;
  const ratingCount = prof?.rating_count || 0;

  const NameWrapper = (props) => isProvider && prof?.slug
    ? <Link to={`/p/${prof.slug}`} {...props} />
    : <div {...props} />;

  return (
    <li
      className="flex items-center gap-3 p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition"
      data-testid={`mi-red-row-${u.user_id}`}
    >
      <NameWrapper className="flex items-center gap-3 flex-1 min-w-0">
        <span className="w-11 h-11 rounded-2xl bg-slate-200 flex-shrink-0 overflow-hidden">
          {logo ? (
            <img src={logo} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-slate-600 font-bold text-base">{initial}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[14px] font-bold text-slate-900 truncate">
              {isProvider ? prof.business_name : u.name}
            </span>
            {prof?.verification_status === "approved" && (
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#03045E" }} />
            )}
          </div>
          <div className="text-[12px] text-slate-500 truncate flex items-center gap-1.5">
            {isProvider && ratingCount > 0 && (
              <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: "#F59E0B" }}>
                <Star className="w-3 h-3 fill-current" /> {ratingAvg.toFixed(1)}
              </span>
            )}
            {prof?.city && (
              <span className="inline-flex items-center gap-0.5 truncate">
                <MapPin className="w-3 h-3" /> {prof.city}{prof.state ? `, ${prof.state}` : ""}
              </span>
            )}
            {!isProvider && (
              <span className="text-slate-400">{lang === "en" ? "Client" : "Cliente"}</span>
            )}
          </div>
        </div>
      </NameWrapper>
      <FollowButton targetUserId={u.user_id} compact />
    </li>
  );
}
