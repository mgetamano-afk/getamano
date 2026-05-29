import { useMemo, useState } from "react";
import { Star, ShieldCheck, Clock, Award, MessageCircleWarning } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * ReviewsTabs — Section 73e (review grouping).
 *
 * Replaces the flat list with three filter tabs so a client browsing an
 * eCard can quickly see what social proof is freshest, what 5-star moments
 * the provider has earned, and how the provider handles less-favorable
 * feedback. Tabs:
 *
 *   - "Recientes"      → all reviews, newest first (last 6 months default)
 *   - "5 estrellas"    → only ratings === 5
 *   - "No favorables"  → ratings <= 3 (so clients can read with full context)
 *
 * Empty-state per tab is intentional: e.g. a provider with zero negative
 * feedback gets a celebratory empty state in the "No favorables" tab,
 * which builds trust without hiding the tab.
 *
 * Reviews carry `verified` + `verification_source` from Section 50;
 * those badges keep rendering identically across all tabs.
 */
export default function ReviewsTabs({ reviews }) {
  const { t } = useI18n();
  const [active, setActive] = useState("recent");

  const safe = Array.isArray(reviews) ? reviews : [];

  // Sort by `created_at` desc; tolerate ISO strings + missing values.
  const sortedByDate = useMemo(() => {
    return [...safe].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });
  }, [safe]);

  // Recientes = last 90 days OR (if not enough) the 6 freshest, whichever fills.
  // We don't want a "Recientes" tab that's empty for a provider with all
  // old reviews — so the cutoff is a soft hint, not a strict filter.
  const recent = useMemo(() => {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const within = sortedByDate.filter(r => {
      const t = r.created_at ? Date.parse(r.created_at) : 0;
      return t >= ninetyDaysAgo;
    });
    return within.length >= 3 ? within : sortedByDate.slice(0, 6);
  }, [sortedByDate]);

  const fiveStar = useMemo(
    () => sortedByDate.filter(r => Number(r.rating) === 5),
    [sortedByDate]
  );

  const negative = useMemo(
    () => sortedByDate.filter(r => Number(r.rating) <= 3),
    [sortedByDate]
  );

  const TABS = [
    { id: "recent",   label: t("reviews.tab_recent"),   Icon: Clock,                  count: recent.length },
    { id: "5star",    label: t("reviews.tab_5star"),    Icon: Award,                  count: fiveStar.length },
    { id: "negative", label: t("reviews.tab_negative"), Icon: MessageCircleWarning,   count: negative.length },
  ];

  const visible = active === "recent" ? recent : active === "5star" ? fiveStar : negative;

  return (
    <div data-testid="reviews-tabs">
      {/* Tab bar */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-none" role="tablist">
        {TABS.map(({ id, label, Icon, count }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setActive(id)}
              className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-[#03045E] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              data-testid={`reviews-tab-${id}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              <span
                className={`min-w-[20px] h-[18px] px-1 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${
                  isActive ? "bg-white/22 text-white" : "bg-slate-200/70 text-slate-600"
                }`}
                aria-hidden="true"
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      {visible.length === 0 ? (
        <EmptyState tab={active} t={t} />
      ) : (
        <ul className="space-y-4" data-testid="reviews-list">
          {visible.map(r => (
            <ReviewRow key={r.review_id} review={r} t={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewRow({ review: r, t }) {
  return (
    <li
      className="border-b border-slate-100 last:border-0 pb-4 last:pb-0"
      data-testid={`review-item-${r.review_id}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-slate-900">{r.user_name}</span>
        <div className="flex">
          {[...Array(Number(r.rating) || 0)].map((_, i) => (
            <Star key={i} className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
          ))}
        </div>
        {r.verified && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
            style={{ backgroundColor: "#ECFDF5", color: "#047857", borderColor: "#A7F3D0" }}
            title={t(`review.verified_tooltip.${r.verification_source || "messaging"}`)}
            data-testid={`review-verified-${r.review_id}`}
          >
            <ShieldCheck className="w-3 h-3" /> {t("review.verified")}
          </span>
        )}
      </div>
      {r.comment && <p className="text-slate-600 text-sm mt-1">{r.comment}</p>}
    </li>
  );
}

function EmptyState({ tab, t }) {
  // Celebratory empty for "No favorables" — clients should see this as a
  // positive signal. The other two tabs get a neutral "no reviews yet" copy.
  if (tab === "negative") {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-6 text-center" data-testid="reviews-empty-negative">
        <Award className="w-8 h-8 text-emerald-500 mx-auto mb-2" strokeWidth={2.2} />
        <p className="text-sm font-bold text-emerald-800">{t("reviews.empty_negative_title")}</p>
        <p className="text-xs text-emerald-700/80 mt-1">{t("reviews.empty_negative_desc")}</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-6 text-center" data-testid={`reviews-empty-${tab}`}>
      <p className="text-sm text-slate-500">{t("reviews.empty_generic")}</p>
    </div>
  );
}
