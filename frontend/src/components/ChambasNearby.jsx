import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, ArrowRight, Flame, MapPin } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * ChambasNearby — Section 30 (CAMBIO C).
 *
 * Compact teaser card that surfaces up to 4 active gigs/chambas to the user.
 * Renders inside the Client and Provider dashboards. Stays silent (returns
 * null) when the board is empty so we never show a sad zero-state inline.
 *
 * Props:
 *   city: optional, narrow listing to a specific city (we pass `category`
 *         pre-filter to the backend; city is rendered for context only).
 *   role: "client" | "provider" — toggles CTA copy.
 *   limit: number, default 3.
 */
export default function ChambasNearby({ city, role = "client", limit = 3 }) {
  const { lang } = useI18n();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get("/gigs", { params: { limit } })
      .then(r => { if (alive) setGigs((r.data || []).slice(0, limit)); })
      .catch(() => { if (alive) setGigs([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [limit]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5" data-testid="chambas-nearby-loading">
        <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
        <div className="mt-4 space-y-3">
          <div className="h-12 bg-slate-50 rounded-xl animate-pulse" />
          <div className="h-12 bg-slate-50 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (gigs.length === 0) return null;

  const T = lang === "en" ? {
    title: "Gigs near you",
    subtitle: city ? `Active gigs in ${city}` : "Quick local jobs from clients",
    seeAll: "See all gigs",
    apply: "I'm interested",
    open: "Open gig",
    budget: "Budget",
    urgent: "Urgent",
  } : {
    title: "💼 Chambas cerca de ti",
    subtitle: city ? `Chambas activas en ${city}` : "Trabajos rápidos publicados por clientes",
    seeAll: "Ver todas las chambas",
    apply: "Me interesa",
    open: "Ver chamba",
    budget: "Presupuesto",
    urgent: "Urgente",
  };

  return (
    <div
      className="rounded-2xl bg-white border border-slate-200 p-5 mb-6"
      data-testid="chambas-nearby"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold text-slate-900 text-base sm:text-lg leading-tight" data-testid="chambas-nearby-title">
            {T.title}
          </h3>
          <p className="text-xs text-slate-500 mt-1">{T.subtitle}</p>
        </div>
        <Link
          to="/empleos"
          className="text-xs font-semibold inline-flex items-center gap-1 hover:underline whitespace-nowrap"
          style={{ color: "#025F67" }}
          data-testid="chambas-nearby-see-all"
        >
          {T.seeAll} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <ul className="mt-4 space-y-2">
        {gigs.map(g => {
          const budget = (g.budget_min || g.budget_max)
            ? `$${g.budget_min || "?"} – $${g.budget_max || "?"}`
            : (lang === "en" ? "Open budget" : "Presupuesto abierto");
          return (
            <li
              key={g.gig_id}
              className="rounded-xl border border-slate-200 p-3 flex items-start justify-between gap-3 hover:border-teal-400 transition"
              data-testid={`chambas-nearby-item-${g.gig_id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">{g.category}</span>
                  {g.is_urgent && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                          style={{ background: "#FFEDD5", color: "#C2410C" }}>
                      <Flame className="w-2.5 h-2.5" /> {T.urgent}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 leading-tight truncate">{g.title}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: "#025F67" }}>{budget}</span>
                  {g.city && (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" /> {g.city}{g.state ? `, ${g.state}` : ""}
                    </span>
                  )}
                </div>
              </div>
              <Link
                to="/empleos"
                className="self-center inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-bold text-white whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
                data-testid={`chambas-nearby-cta-${g.gig_id}`}
              >
                {role === "provider" ? T.apply : T.open}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
        <Briefcase className="w-3 h-3" />
        <span>Beta — Sección 30</span>
      </div>
    </div>
  );
}
