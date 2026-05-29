import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Flame, ArrowRight, MapPin, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * WeeklyDigestPreview — provider dashboard widget.
 *
 * Pulls /api/providers/me/weekly-digest and shows what the email digest
 * will look like *right now*. Renders nothing when there are no matching
 * gigs in the past 7 days (silent zero-state — no fake content).
 */
export default function WeeklyDigestPreview() {
  const { lang } = useI18n();
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get("/providers/me/weekly-digest")
      .then(r => { if (alive) setDigest(r.data); })
      .catch(() => { if (alive) setDigest(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-6 flex items-center gap-3 text-slate-400 text-sm" data-testid="weekly-digest-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> {lang === "en" ? "Loading weekly digest…" : "Cargando resumen semanal…"}
      </div>
    );
  }

  if (!digest?.available) return null;

  const T = lang === "en" ? {
    badge: "Weekly digest",
    title: (n) => `${n} new gig${n !== 1 ? "s" : ""} this week in your area`,
    subtitle: (cat, city) => `${cat} · ${city}`,
    cta: "View all gigs",
    urgent: "Urgent",
  } : {
    badge: "Resumen semanal",
    title: (n) => `${n} chamba${n !== 1 ? "s" : ""} nueva${n !== 1 ? "s" : ""} esta semana en tu zona`,
    subtitle: (cat, city) => `${cat} · ${city}`,
    cta: "Ver todas las chambas",
    urgent: "Urgente",
  };

  return (
    <div
      className="rounded-2xl p-5 mb-6"
      style={{
        background: "linear-gradient(135deg, rgba(2,95,103,0.04) 0%, rgba(47,157,148,0.08) 100%)",
        border: "1px solid rgba(2,95,103,0.18)",
      }}
      data-testid="weekly-digest-preview"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
               style={{ background: "rgba(2,95,103,0.10)", color: "#03045E" }}>
            <Mail className="w-3 h-3" /> {T.badge}
          </div>
          <h3 className="font-display font-bold text-slate-900 text-lg mt-2 leading-tight" data-testid="weekly-digest-title">
            {T.title(digest.total_count)}
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">{T.subtitle(digest.category_name, digest.city)}</p>
        </div>
        <Link to="/empleos" className="px-4 py-2 rounded-full text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm"
              style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
              data-testid="weekly-digest-cta">
          {T.cta} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <ul className="mt-4 space-y-2">
        {digest.gigs.slice(0, 3).map(g => (
          <li key={g.gig_id} className="rounded-xl bg-white border border-slate-200 p-3" data-testid={`weekly-digest-item-${g.gig_id}`}>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">{digest.category_name}</span>
              {g.is_urgent && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: "#FFEDD5", color: "#C2410C" }}>
                  <Flame className="w-2.5 h-2.5" /> {T.urgent}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-900 leading-tight">{g.title}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
              <span className="font-semibold" style={{ color: "#03045E" }}>{g.budget_label}</span>
              {g.city && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="w-3 h-3" /> {g.city}{g.state ? `, ${g.state}` : ""}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {digest.total_count > 3 && (
        <p className="text-[11px] text-slate-400 mt-3 text-center">
          {lang === "en" ? `+${digest.total_count - 3} more — tap "${T.cta}"` : `+${digest.total_count - 3} más — toca "${T.cta}"`}
        </p>
      )}
    </div>
  );
}
