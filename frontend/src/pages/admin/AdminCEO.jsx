import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { buildFileUrl } from "../../components/ImageUpload";
import {
  Crown, DollarSign, TrendingUp, Users, Briefcase, Sparkles, MapPin, Flame,
  Eye, Phone, Star, MessageSquare, Award, Activity, RefreshCw, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import DailyBrief from "../../components/DailyBrief";

function fmt$(n) {
  if (!n) return "$0";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n}`;
}

function delta(today, yesterday) {
  if (yesterday === 0) return today > 0 ? { up: true, pct: 100 } : null;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  return { up: pct >= 0, pct: Math.abs(pct) };
}

function timeAgo(iso) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const ACTIVITY_ICON = {
  signup: { Icon: Users, color: "text-blue-300", bg: "bg-blue-500/15" },
  milestone: { Icon: Award, color: "text-amber-300", bg: "bg-amber-500/15" },
};

export default function AdminCEO() {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    api.get("/admin/ceo-metrics").then(r => { setData(r.data); setRefreshing(false); }).catch(() => setRefreshing(false));
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 60000); // refresh every 60s
    return () => clearInterval(id);
  }, []);

  if (!data) {
    return <AdminLayout title="Panel CEO"><div className="text-slate-400 text-sm py-12 text-center">Cargando métricas ejecutivas...</div></AdminLayout>;
  }

  const v = data.volume, acq = data.acquisition, eng = data.engagement, rev = data.revenue;
  const signupsDelta = delta(acq.signups.today, acq.signups.yesterday);
  const foundingPct = rev.founding_max ? Math.round((rev.founding_used / rev.founding_max) * 100) : 0;

  return (
    <AdminLayout title="Panel CEO">
      <DailyBrief />

      {/* HERO HEADER */}
      <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 mb-6"
        style={{ background: "linear-gradient(135deg, #1A0A3C 0%, #2D1B69 50%, #7C2D12 120%)" }}
        data-testid="ceo-hero">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-amber-300 text-[10px] font-semibold tracking-widest uppercase mb-2">
              <Crown className="w-3 h-3" /> CEO Dashboard · getmano
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-white">Toda tu app, en un solo lugar 👑</h2>
            <p className="text-sm text-white/70 mt-1">Métricas actualizadas cada 60 segundos. <span className="text-amber-300">Última: {timeAgo(data.generated_at)} atrás</span>.</p>
          </div>
          <button onClick={load} disabled={refreshing} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm transition disabled:opacity-50" data-testid="ceo-refresh">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Actualizar ahora
          </button>
        </div>

        {/* Revenue projection BIG */}
        <div className="relative mt-6 grid md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/10 border border-amber-400/20 p-5">
            <div className="flex items-center gap-1.5 text-amber-300 text-xs font-semibold uppercase tracking-widest mb-1.5">
              <DollarSign className="w-3.5 h-3.5" /> MRR proyectado
            </div>
            <div className="font-display text-4xl font-bold text-white" data-testid="ceo-mrr">{fmt$(rev.mrr_usd)}<span className="text-base text-white/60 font-normal">/mes</span></div>
            <div className="text-xs text-white/60 mt-0.5">ARR: {fmt$(rev.arr_usd)} · sin contar founding</div>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
            <div className="flex items-center gap-1.5 text-orange-300 text-xs font-semibold uppercase tracking-widest mb-1.5">
              <Award className="w-3.5 h-3.5" /> Founding Members
            </div>
            <div className="font-display text-4xl font-bold text-white" data-testid="ceo-founding">{rev.founding_used}<span className="text-base text-white/60 font-normal">/{rev.founding_max}</span></div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${foundingPct}%` }} />
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
            <div className="flex items-center gap-1.5 text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1.5">
              <Flame className="w-3.5 h-3.5" /> Hitos hoy
            </div>
            <div className="font-display text-4xl font-bold text-white" data-testid="ceo-milestones-today">{eng.milestones_today}</div>
            <div className="text-xs text-white/60 mt-0.5">{eng.milestones_week} esta semana · {eng.total_milestones_unlocked} total</div>
          </div>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="ceo-kpi-row">
        <KPI Icon={Users} label="Usuarios totales" value={v.total_users} sub={`${v.total_clients} clientes`} color="text-blue-300" />
        <KPI Icon={Briefcase} label="Proveedores activos" value={v.total_providers} sub={`${v.approved_providers} aprobados`} color="text-orange-300" />
        <KPI Icon={Sparkles} label="Signups hoy" value={acq.signups.today} sub={`${acq.signups.month} este mes`} color="text-emerald-300" deltaPct={signupsDelta} />
        <KPI Icon={Activity} label="Engagement hoy" value={eng.messages_today + eng.requests_today + eng.reviews_today + eng.likes_today} sub="msgs+requests+reviews+likes" color="text-purple-300" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Revenue by plan */}
        <Section title="Ingresos por plan" icon={DollarSign} testid="ceo-plan-dist">
          <div className="space-y-3">
            {["free", "basic", "pro", "premium"].map(p => {
              const count = rev.by_plan[p] || 0;
              const price = rev.plan_prices[p] || 0;
              const total = count * price;
              const maxCount = Math.max(...Object.values(rev.by_plan), 1);
              return (
                <div key={p}>
                  <div className="flex items-center justify-between mb-1 text-sm">
                    <span className="capitalize text-slate-300 font-medium">{p}<span className="text-slate-500"> · ${price}/mes</span></span>
                    <span className="text-white font-semibold">{count} <span className="text-slate-500 text-xs">→ {fmt$(total)}</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full ${p === "premium" ? "bg-gradient-to-r from-fuchsia-500 to-amber-400" : p === "pro" ? "bg-gradient-to-r from-orange-500 to-amber-400" : p === "basic" ? "bg-blue-500" : "bg-slate-600"}`} style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Top States */}
        <Section title="Estados con más negocios" icon={MapPin} testid="ceo-states">
          {data.geography.top_states.length === 0 ? (
            <div className="text-sm text-slate-500 py-4">Sin datos aún</div>
          ) : data.geography.top_states.map((s, i) => (
            <div key={s.state || i} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
              <span className="text-slate-300 text-sm flex items-center gap-2">
                <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
                {s.state || "—"}
              </span>
              <span className="text-white font-semibold text-sm">{s.count}</span>
            </div>
          ))}
        </Section>

        {/* Top categories */}
        <Section title="Categorías top" icon={TrendingUp} testid="ceo-categories">
          {data.categories.top.length === 0 ? (
            <div className="text-sm text-slate-500 py-4">Sin datos aún</div>
          ) : data.categories.top.map((c, i) => (
            <div key={c.category_id} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
              <span className="text-slate-300 text-sm flex items-center gap-2">
                <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
                {c.name}
              </span>
              <span className="text-white font-semibold text-sm">{c.count}</span>
            </div>
          ))}
        </Section>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* Top performers */}
        <div className="lg:col-span-2">
          <Section title="Top 5 proveedores (por vistas)" icon={Star} testid="ceo-top-performers">
            {data.top_performers.length === 0 ? (
              <div className="text-sm text-slate-500 py-4">Sin datos aún</div>
            ) : data.top_performers.map((p, i) => (
              <Link key={p.slug} to={`/p/${p.slug}`} className="flex items-center gap-3 py-2.5 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 -mx-2 px-2 rounded transition" data-testid={`ceo-performer-${p.slug}`}>
                <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
                <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden flex-shrink-0">
                  {p.logo_url && <img src={p.logo_url.startsWith("http") ? p.logo_url : buildFileUrl(p.logo_url)} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{p.business_name}</div>
                  <div className="text-xs text-slate-500 truncate">{p.city}{p.state ? `, ${p.state}` : ""} · <span className="capitalize text-amber-400/80">{p.plan}</span></div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 flex-shrink-0">
                  <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3 text-blue-400" />{p.views || 0}</span>
                  <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3 text-orange-400" />{p.contact_clicks || 0}</span>
                  <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400" />{(p.rating_avg || 0).toFixed(1)}</span>
                </div>
              </Link>
            ))}
          </Section>
        </div>

        {/* Live activity */}
        <Section title="Actividad en vivo" icon={Activity} testid="ceo-activity" liveDot>
          {data.activity.length === 0 ? (
            <div className="text-sm text-slate-500 py-4">Sin actividad reciente</div>
          ) : data.activity.map((a, i) => {
            const style = ACTIVITY_ICON[a.type] || ACTIVITY_ICON.signup;
            return (
              <div key={i} className="flex items-start gap-2 py-2 border-b border-slate-800/60 last:border-0" data-testid={`ceo-activity-${i}`}>
                <div className={`w-7 h-7 rounded-lg ${style.bg} flex items-center justify-center flex-shrink-0`}>
                  <style.Icon className={`w-3.5 h-3.5 ${style.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-300 leading-snug">{a.title}</div>
                  <div className="text-[10px] text-slate-500">hace {timeAgo(a.at)}</div>
                </div>
              </div>
            );
          })}
        </Section>
      </div>
    </AdminLayout>
  );
}

function KPI({ Icon, label, value, sub, color, deltaPct }) {
  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        {deltaPct && (
          <span className={`text-[10px] font-bold inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${deltaPct.up ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
            {deltaPct.up ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}{deltaPct.pct}%
          </span>
        )}
      </div>
      <div className="font-display text-2xl font-bold text-white leading-none">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function Section({ title, icon: Icon, testid, children, liveDot }) {
  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4" data-testid={testid}>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
        <h3 className="font-display font-semibold text-white text-sm">{title}</h3>
        {liveDot && <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}
