import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Heart, MessageCircle, Sparkles, ArrowUpRight } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { getDicebearAvatar, resolveAvatar } from "../lib/avatar";

/**
 * MilestoneOfTheWeekWidget — Section 81.
 *
 * Compact sidebar widget that surfaces the top 3 milestone posts of the
 * last 7 days. Each row shows: ranked avatar, who unlocked + how many
 * months, engagement counts, and an action button "👏 Felicitar" that
 * scrolls to / opens the post so the user can like or comment.
 *
 * Why this matters:
 *   Reactions on milestone posts are the engine of the social loop. Today
 *   reactions only happen if you scroll the regular feed and stumble on a
 *   milestone post. This widget puts 3 of them front-and-center on the
 *   AppHome → way more reactions → way more notifications to the unlocked
 *   provider → way more recurring engagement.
 */
export default function MilestoneOfTheWeekWidget() {
  const { lang } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get("/community/posts/top-milestones-week", { params: { limit: 3 } })
      .then((r) => {
        if (!mounted) return;
        const arr = Array.isArray(r.data) ? r.data : (r.data?.items || []);
        setItems(arr);
      })
      .catch(() => { if (mounted) setItems([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) return null;
  if (!items.length) return null;

  const T = lang === "es" ? {
    title: "Hitos de la semana",
    subtitle: "Provedores que ganaron meses gratis",
    seeAll: "Ver todos",
    congrats: "Felicitar",
    unlockedShort: (n) => n === 1 ? "1 mes" : `${n} meses`,
    referrals: (n) => `${n} ${n === 1 ? "referido" : "referidos"}`,
    rankLabels: ["🥇", "🥈", "🥉"],
  } : {
    title: "Milestones of the week",
    subtitle: "Providers who earned free months",
    seeAll: "See all",
    congrats: "Cheer",
    unlockedShort: (n) => n === 1 ? "1 month" : `${n} months`,
    referrals: (n) => `${n} ${n === 1 ? "referral" : "referrals"}`,
    rankLabels: ["🥇", "🥈", "🥉"],
  };

  return (
    <div
      className="rounded-2xl border border-amber-200 overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 70%)",
        boxShadow: "0 4px 16px -8px rgba(245, 158, 11, 0.18)",
      }}
      data-testid="milestone-of-the-week-widget"
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b border-amber-100"
        style={{ background: "linear-gradient(90deg, rgba(245,158,11,0.08) 0%, transparent 100%)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-sm">
            <Trophy className="w-3.5 h-3.5 text-white" />
            <Sparkles
              className="absolute -top-1 -right-1 w-2.5 h-2.5 text-yellow-300"
              style={{ animation: "mtw-spark 2.4s ease-in-out infinite" }}
            />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 leading-none">{T.title}</div>
            <div className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate">{T.subtitle}</div>
          </div>
        </div>
        <Link
          to="/comunidad?filter=hitos"
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-900 transition group/link"
          data-testid="milestone-week-see-all"
        >
          {T.seeAll}
          <ArrowUpRight className="w-3 h-3 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" />
        </Link>
      </div>

      {/* Top 3 rows */}
      <ul className="divide-y divide-amber-100/60">
        {items.map((post, idx) => {
          const author = post.author || {};
          const name = author.business_name || author.name || "Proveedor";
          const avatar = resolveAvatar({
            logo_url: author.logo_url,
            picture: author.picture,
            user_id: author.user_id || author.provider_id,
            name,
            gender: author.gender,
          });
          const milestoneIdx = post.milestone_index || 1;
          const paidCount = post.milestone_paid_count ?? 0;
          return (
            <li key={post.post_id} className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-amber-50/40 transition" data-testid={`milestone-week-row-${idx}`}>
              {/* Rank */}
              <div className="text-[15px] shrink-0" aria-hidden="true">{T.rankLabels[idx]}</div>
              {/* Avatar */}
              <div className="relative shrink-0">
                <img
                  src={avatar}
                  alt=""
                  loading="lazy"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-amber-300"
                  onError={(e) => { e.currentTarget.src = getDicebearAvatar(name); }}
                />
              </div>
              {/* Name + meta */}
              <Link
                to={post.author?.slug ? `/p/${post.author.slug}` : `/comunidad/post/${post.post_id}`}
                className="flex-1 min-w-0 leading-tight"
              >
                <div className="text-[12px] font-bold text-slate-900 truncate">{name}</div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                  <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700">
                    <Trophy className="w-2.5 h-2.5" /> {T.unlockedShort(milestoneIdx)}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="truncate">{T.referrals(paidCount)}</span>
                </div>
              </Link>
              {/* Engagement counts */}
              <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-0.5">
                  <Heart className="w-2.5 h-2.5 text-rose-500" />
                  <span className="tabular-nums">{post.likes_count || 0}</span>
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <MessageCircle className="w-2.5 h-2.5 text-slate-400" />
                  <span className="tabular-nums">{post.comments_count || 0}</span>
                </span>
              </div>
              {/* CTA */}
              <Link
                to={`/comunidad/post/${post.post_id}`}
                className="shrink-0 inline-flex items-center justify-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 active:scale-95 text-white font-bold text-[10px] px-2.5 py-1 rounded-full shadow-sm transition"
                aria-label={T.congrats}
                data-testid={`milestone-week-cheer-${idx}`}
              >
                👏
                <span className="hidden sm:inline">{T.congrats}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <style>{`
        @keyframes mtw-spark {
          0%, 100% { opacity: 0.6; transform: scale(1) rotate(0deg); }
          50%      { opacity: 1; transform: scale(1.2) rotate(15deg); }
        }
      `}</style>
    </div>
  );
}
