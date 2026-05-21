import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { buildFileUrl } from "./ImageUpload";
import { Crown, Trophy, Medal, MapPin } from "lucide-react";

const RANK_STYLE = {
  1: { Icon: Crown,  ring: "ring-amber-300", grad: "from-amber-400 to-orange-500", label: "🥇 Líder del mes", color: "#F59E0B" },
  2: { Icon: Trophy, ring: "ring-slate-300", grad: "from-slate-300 to-slate-500", label: "🥈 Segundo lugar",  color: "#94A3B8" },
  3: { Icon: Medal,  ring: "ring-orange-300", grad: "from-orange-400 to-orange-600", label: "🥉 Tercer lugar",  color: "#4EBAAE" },
};

/**
 * Leaderboard — Top providers by milestones in current month.
 */
export default function Leaderboard({ period = "month", limit = 5 }) {
  const [data, setData] = useState({ items: [], period: "month" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/community/leaderboard?period=${period}&limit=${limit}`)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period, limit]);

  const periodLabel = period === "month" ? "este mes" : period === "week" ? "esta semana" : "siempre";

  if (loading) return null;
  if (!data.items?.length) return null;

  const [first, ...rest] = data.items;

  return (
    <div className="mb-10" data-testid="leaderboard">
      <div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold tracking-widest uppercase mb-1">
            <Crown className="w-3 h-3" /> Ranking
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900">Top proveedores · <span className="text-amber-600">{periodLabel}</span></h2>
          <p className="text-sm text-slate-500 mt-0.5">Los negocios que más logros desbloquearon. ¿Estarás aquí el próximo mes?</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4" data-testid="leaderboard-grid">
        {/* Featured #1 */}
        {first && (
          <div className="min-w-0"><FeaturedCard item={first} /></div>
        )}
        {/* Rest stacked */}
        <div className="space-y-2 min-w-0">
          {rest.map(it => <RankRow key={it.slug || it.rank} item={it} />)}
          {rest.length === 0 && (
            <div className="rounded-2xl bg-white border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              Aún hay espacio aquí. Activa logros y aparece en el podio. 🏆
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeaturedCard({ item }) {
  const s = RANK_STYLE[1];
  return (
    <Link to={item.slug ? `/p/${item.slug}` : "#"} className="block group" data-testid={`leaderboard-card-${item.rank}`}>
      <div className={`relative rounded-3xl p-6 md:p-7 overflow-hidden bg-gradient-to-br ${s.grad} text-white shadow-xl transition-transform group-hover:-translate-y-0.5`}>
        {/* Decorative */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/15 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-black/15 blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between gap-3 mb-5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-[10px] font-bold tracking-widest uppercase">
            {s.label}
          </div>
          <div className="text-right">
            <div className="font-display text-4xl font-bold leading-none">{item.milestones_count}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-80">logros</div>
          </div>
        </div>

        <div className="relative flex items-center gap-4">
          <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-white/15 backdrop-blur ring-4 ring-white/30 overflow-hidden flex items-center justify-center text-white">
            {item.logo_url ? (
              <img src={buildFileUrl(item.logo_url)} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-3xl font-bold">{(item.first_name || "?")[0]}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-2xl md:text-3xl font-bold leading-tight truncate">{item.business_name || item.first_name}</h3>
            <div className="flex items-center gap-2 text-sm text-white/90 mt-1 flex-wrap">
              <span>por <strong>{item.first_name}</strong></span>
              {item.latino_owned && <span title="Dueño Latino" className="opacity-90">🤝</span>}
              {item.city && <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{item.city}{item.state ? `, ${item.state}` : ""}</span>}
            </div>
          </div>
        </div>

        <div className="relative mt-5 pt-4 border-t border-white/20 flex items-center justify-between text-sm">
          <span className="opacity-90">Visita su eCard →</span>
          <Crown className="w-5 h-5" />
        </div>
      </div>
    </Link>
  );
}

function RankRow({ item }) {
  const s = RANK_STYLE[item.rank] || { ring: "ring-slate-200", grad: "from-slate-200 to-slate-300", color: "#64748B" };
  return (
    <Link to={item.slug ? `/p/${item.slug}` : "#"} className="block group" data-testid={`leaderboard-row-${item.rank}`}>
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-100 hover:border-amber-200 hover:shadow-md transition">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${s.grad} flex items-center justify-center font-display font-bold text-white text-base`}>
          {item.rank}
        </div>
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
          {item.logo_url ? (
            <img src={buildFileUrl(item.logo_url)} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="font-display font-bold text-slate-500">{(item.first_name || "?")[0]}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-slate-900 truncate flex items-center gap-1">
            {item.business_name || item.first_name}
            {item.latino_owned && <span className="text-xs" title="Dueño Latino" style={{ color: "#025F67" }}>🤝</span>}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {item.first_name}{item.city ? ` · ${item.city}${item.state ? `, ${item.state}` : ""}` : ""}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="font-display text-xl font-bold text-slate-900 leading-none">{item.milestones_count}</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400">logros</div>
        </div>
      </div>
    </Link>
  );
}
