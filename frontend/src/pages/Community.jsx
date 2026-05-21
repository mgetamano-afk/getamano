import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { buildFileUrl } from "../components/ImageUpload";
import { Trophy, Sparkles, Users, Flame, Award, ArrowRight, MapPin } from "lucide-react";

const TIER_COLOR = {
  silver:   { ring: "ring-slate-200", glow: "rgba(148,163,184,0.4)",  badge: "bg-slate-100 text-slate-600" },
  gold:     { ring: "ring-amber-300", glow: "rgba(251,191,36,0.45)",  badge: "bg-amber-100 text-amber-700" },
  platinum: { ring: "ring-fuchsia-300", glow: "rgba(244,114,182,0.5)", badge: "bg-fuchsia-100 text-fuchsia-700" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return `hace ${Math.floor(d / 30)} mes${Math.floor(d / 30) === 1 ? "" : "es"}`;
}

function cleanTitle(t) {
  return (t || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*$/u, "").trim();
}

function Tile({ item }) {
  const t = TIER_COLOR[item.tier] || TIER_COLOR.silver;
  const inner = (
    <div className="relative h-full rounded-2xl bg-white border border-slate-100 p-4 transition hover:-translate-y-0.5 hover:shadow-lg overflow-hidden">
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl" style={{ background: t.glow }} />
      <div className="relative flex items-start gap-3">
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl bg-white ring-2 ${t.ring} flex items-center justify-center text-2xl shadow-sm`}>
          {item.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="font-display font-semibold text-sm text-slate-900 truncate">{item.first_name}</span>
            {item.latino_owned && <span className="text-[10px]" title="Latino-owned">🇲🇽</span>}
            {item.city && (
              <span className="text-xs text-slate-500 inline-flex items-center gap-0.5">
                <MapPin className="w-2.5 h-2.5" /> {item.city}{item.state ? `, ${item.state}` : ""}
              </span>
            )}
          </div>
          <div className="text-sm text-slate-700 font-medium leading-snug">
            desbloqueó "<span className="text-orange-600">{cleanTitle(item.title)}</span>"
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span className={`px-2 py-0.5 rounded-full font-semibold uppercase tracking-widest ${t.badge}`}>{item.tier}</span>
            <span className="text-slate-400">{timeAgo(item.unlocked_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
  if (item.slug) {
    return (
      <Link to={`/p/${item.slug}`} className="block" data-testid={`wall-tile-${item.milestone_id}-${item.slug}`}>
        {inner}
      </Link>
    );
  }
  return <div data-testid={`wall-tile-${item.milestone_id}`}>{inner}</div>;
}

export default function Community() {
  const [data, setData] = useState({ items: [], stats: { total_unlocked: 0, total_providers: 0 } });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const fetchWall = () => {
      api.get("/community/wall-of-fame?limit=60").then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
    };
    fetchWall();
    const id = setInterval(fetchWall, 30000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return data.items;
    return data.items.filter(i => i.tier === filter);
  }, [data.items, filter]);

  const top = data.stats || {};

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="pb-16" data-testid="community-page">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0B0F2E 0%, #1A0A3C 55%, #050914 100%)" }} />
          <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-300 text-xs font-semibold tracking-widest uppercase border border-orange-400/20">
                <Trophy className="w-3.5 h-3.5" /> Wall of Fame · getmano
              </span>
              <h1 className="font-display mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.05]">
                La comunidad latina,<br/><span className="text-orange-400">en movimiento.</span>
              </h1>
              <p className="mt-5 text-lg text-slate-300 max-w-2xl leading-relaxed">
                Cada logro aquí es un proveedor latino construyendo confianza en Estados Unidos. Esta pared se actualiza cada 30 segundos con los hitos que nuestra gente desbloquea.
              </p>

              {/* Live stats */}
              <div className="mt-8 grid grid-cols-3 gap-3 max-w-2xl">
                <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-4">
                  <div className="flex items-center gap-1.5 text-orange-300 text-xs font-semibold uppercase tracking-widest mb-1">
                    <Flame className="w-3.5 h-3.5" /> Logros
                  </div>
                  <div className="font-display text-3xl font-bold text-white" data-testid="wall-stat-unlocked">{top.total_unlocked || 0}</div>
                  <div className="text-xs text-white/60">desbloqueados en total</div>
                </div>
                <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-4">
                  <div className="flex items-center gap-1.5 text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">
                    <Users className="w-3.5 h-3.5" /> Negocios
                  </div>
                  <div className="font-display text-3xl font-bold text-white" data-testid="wall-stat-providers">{top.total_providers || 0}</div>
                  <div className="text-xs text-white/60">activos en la red</div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 backdrop-blur border border-orange-400/20 p-4">
                  <div className="flex items-center gap-1.5 text-orange-200 text-xs font-semibold uppercase tracking-widest mb-1">
                    <Sparkles className="w-3.5 h-3.5" /> En vivo
                  </div>
                  <div className="font-display text-3xl font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block animate-pulse" />
                    Wall
                  </div>
                  <div className="text-xs text-white/60">refresca cada 30s</div>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                <Link to="/registro?intent=provider&promo=GETMANO50" className="btn-primary inline-flex items-center gap-1" data-testid="wall-cta-join">
                  <Award className="w-4 h-4" /> Abre tu eCard y aparece aquí
                </Link>
                <Link to="/buscar" className="px-5 py-2.5 rounded-full text-white/90 border border-white/20 hover:bg-white/10 font-medium text-sm inline-flex items-center gap-1">
                  Explorar servicios <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* WALL */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Tier filter */}
          <div className="flex items-center gap-2 mb-6 flex-wrap" data-testid="wall-filters">
            {[
              { id: "all", label: "Todos los logros" },
              { id: "silver", label: "Silver" },
              { id: "gold", label: "Gold" },
              { id: "platinum", label: "Platinum" },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${filter === f.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}
                data-testid={`wall-filter-${f.id}`}>
                {f.label}
              </button>
            ))}
            <div className="ml-auto text-xs text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {filtered.length} logros mostrados
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-sm text-slate-400">Cargando wall of fame...</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-5xl mb-3">✨</div>
              <h3 className="font-display text-xl font-bold text-slate-900">Los primeros logros están en camino</h3>
              <p className="mt-2 text-sm text-slate-500">Sé tú quien estrene el muro. Abre tu eCard y desbloquea tu primer hito.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="wall-grid">
              {filtered.map((it, i) => (
                <div key={`${it.milestone_id}-${it.slug || i}-${it.unlocked_at}`}
                  className="animate-in fade-in-50 slide-in-from-bottom-2"
                  style={{ animationDelay: `${(i % 12) * 50}ms`, animationDuration: "500ms" }}>
                  <Tile item={it} />
                </div>
              ))}
            </div>
          )}

          {/* Bottom CTA */}
          <div className="mt-12 rounded-3xl p-6 md:p-8 text-center" style={{ background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)" }}>
            <h3 className="font-display text-2xl md:text-3xl font-bold text-slate-900">Tu historia merece estar aquí 🧡</h3>
            <p className="mt-2 text-sm text-slate-600 max-w-xl mx-auto">Si eres latino y tienes un negocio en Estados Unidos, este es tu espacio. Únete a la comunidad y empieza a coleccionar logros.</p>
            <Link to="/registro?intent=provider&promo=GETMANO50" className="inline-flex items-center gap-2 mt-5 btn-primary" data-testid="wall-bottom-cta">
              Abrir mi eCard gratis <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
