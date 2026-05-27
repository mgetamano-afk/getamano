import { useEffect, useState } from "react";
import { UserPlus, UserCheck, Users } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";

/**
 * FollowButton — Section 65 (Red de Aliados / Followers).
 *
 * Reusable button to follow/unfollow another user_id. Auto-fetches the
 * current state on mount and updates optimistically. Hides itself if the
 * viewer is anonymous OR if the target is the viewer themself.
 *
 * Props:
 *   targetUserId: string — the user_id to follow
 *   compact?: boolean   — small variant (icon-only)
 *   onChange?(following: boolean, followers_count: number)
 *   showCount?: boolean — show "N seguidores" beside the button
 */
export default function FollowButton({ targetUserId, compact = false, onChange, showCount = false }) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(false);

  const visible = !!user && targetUserId && user.user_id !== targetUserId;

  useEffect(() => {
    if (!visible) return;
    api.get(`/follows/${targetUserId}/state`).then(r => {
      setFollowing(!!r.data?.following);
      setCount(r.data?.followers_count || 0);
    }).catch(() => {});
  }, [visible, targetUserId]);

  if (!visible) {
    // Public — just show count if asked
    if (showCount && targetUserId) {
      return <PublicCount userId={targetUserId} lang={lang} />;
    }
    return null;
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const prev = following;
    setFollowing(!prev);
    setCount(c => c + (prev ? -1 : 1));
    try {
      if (prev) {
        const r = await api.delete(`/follows/${targetUserId}`);
        setCount(r.data?.followers_count ?? count);
        onChange?.(false, r.data?.followers_count ?? count);
      } else {
        const r = await api.post(`/follows/${targetUserId}`);
        setCount(r.data?.followers_count ?? count);
        onChange?.(true, r.data?.followers_count ?? count);
      }
    } catch {
      // revert on failure
      setFollowing(prev);
      setCount(c => c + (prev ? 1 : -1));
    } finally {
      setBusy(false);
    }
  };

  const label = following
    ? (hovered ? (lang === "en" ? "Unfollow" : "Dejar de seguir") : (lang === "en" ? "Following" : "Siguiendo"))
    : (lang === "en" ? "Follow" : "Seguir");
  const Icon = following ? UserCheck : UserPlus;

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`w-9 h-9 inline-flex items-center justify-center rounded-full transition disabled:opacity-50 ${
          following
            ? (hovered ? "bg-red-100 text-red-600" : "bg-teal-50 text-teal-700")
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
        title={label}
        aria-label={label}
        data-testid="follow-btn"
      >
        <Icon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-bold transition disabled:opacity-50 ${
          following
            ? (hovered
                ? "bg-red-50 text-red-600 ring-1 ring-red-200"
                : "bg-teal-50 text-teal-700 ring-1 ring-teal-200")
            : "text-white hover:brightness-110"
        }`}
        style={!following ? { background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" } : undefined}
        data-testid="follow-btn"
      >
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </button>
      {showCount && count > 0 && (
        <span className="text-[12px] text-slate-500 font-medium inline-flex items-center gap-0.5" data-testid="follow-count">
          <Users className="w-3 h-3" />
          {count}
        </span>
      )}
    </div>
  );
}

function PublicCount({ userId, lang }) {
  const [n, setN] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.get(`/follows/${userId}/stats`).then(r => {
      if (!cancelled) setN(r.data?.followers || 0);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);
  if (n == null || n === 0) return null;
  return (
    <span className="text-[12px] text-slate-500 font-medium inline-flex items-center gap-0.5" data-testid="follow-count-public">
      <Users className="w-3 h-3" />
      {n} {n === 1 ? (lang === "en" ? "follower" : "seguidor") : (lang === "en" ? "followers" : "seguidores")}
    </span>
  );
}
