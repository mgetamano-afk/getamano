import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { Heart, MapPin } from "lucide-react";

/**
 * RecommendationsSection — public list of named recommendations on the eCard.
 * Shows the top 5 by default with a "Show all (N)" toggle.
 */
export default function RecommendationsSection({ providerId, refreshKey = 0, onRecommendClick }) {
  const { lang } = useI18n();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/providers/${providerId}/recommendations`, { params: { limit: 50 } });
        if (cancelled) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
      } catch (_e) { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    };
    if (providerId) load();
    return () => { cancelled = true; };
  }, [providerId, refreshKey]);

  const visible = expanded ? items : items.slice(0, 5);
  const T = lang === "en" ? {
    title: "Community recommendations",
    empty: "Be the first to recommend this professional.",
    seeAll: (n) => `Show all (${n})`,
    seeLess: "Show fewer",
    cta: "+ I recommend this pro",
  } : {
    title: "Recomendaciones de la comunidad",
    empty: "Sé la primera persona en recomendar a este profesional.",
    seeAll: (n) => `Ver todas (${n})`,
    seeLess: "Ver menos",
    cta: "+ Yo lo/la recomiendo",
  };

  if (loading) return null;

  return (
    <section className="mt-6" data-testid="recommendations-section">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-slate-900 flex items-center gap-2">
          <Heart className="w-4 h-4 fill-red-500 text-red-500" />
          {T.title}
          {total > 0 && (
            <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700" data-testid="recommendations-count">
              {total}
            </span>
          )}
        </h3>
        {onRecommendClick && (
          <button onClick={onRecommendClick} className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1" data-testid="recommendations-add-cta">
            {T.cta}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center" data-testid="recommendations-empty">
          <Heart className="w-7 h-7 mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500 mb-3">{T.empty}</p>
          {onRecommendClick && (
            <button onClick={onRecommendClick} className="px-4 py-2 rounded-full bg-red-600 text-white text-xs font-semibold hover:bg-red-700">
              {T.cta}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {visible.map(r => (
              <RecommendationItem key={r.recommendation_id} rec={r} lang={lang} />
            ))}
          </div>
          {total > 5 && (
            <button onClick={() => setExpanded(e => !e)} className="mt-3 text-xs font-semibold text-slate-600 hover:text-slate-900" data-testid="recommendations-toggle">
              {expanded ? T.seeLess : T.seeAll(total)}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function RecommendationItem({ rec, lang }) {
  const initials = (rec.client_name || "")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase()).join("");
  const date = rec.created_at ? new Date(rec.created_at).toLocaleDateString(lang === "en" ? "en-US" : "es-ES", { month: "short", year: "numeric" }) : "";
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3.5 flex items-start gap-3" data-testid={`recommendation-${rec.recommendation_id}`}>
      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-display font-bold text-xs"
           style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}>
        {initials || "💚"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold text-slate-900 text-sm">{rec.client_name}</span>
          {rec.client_city && (
            <span className="text-[11px] text-slate-500 inline-flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" /> {rec.client_city}
            </span>
          )}
          <span className="text-[11px] text-slate-400">· {date}</span>
        </div>
        {rec.message && (
          <p className="mt-1 text-sm text-slate-700 leading-relaxed">{rec.message}</p>
        )}
      </div>
      <Heart className="w-3.5 h-3.5 fill-red-400 text-red-400 flex-shrink-0 mt-1" />
    </div>
  );
}
