import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Sparkles, Trophy, Calendar, Lock, Share2, TrendingUp, Heart, Eye, Phone, Star, ThumbsUp, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import AchievementImageGenerator from "./AchievementImageGenerator";
import { buildFileUrl } from "./ImageUpload";

const TIER_STYLE = {
  silver:   { dot: "bg-slate-300",  ring: "ring-slate-200",  label: "text-slate-500",  card: "bg-white" },
  gold:     { dot: "bg-amber-400",  ring: "ring-amber-200",  label: "text-amber-700",  card: "bg-amber-50/40" },
  platinum: { dot: "bg-fuchsia-400", ring: "ring-fuchsia-200", label: "text-fuchsia-700", card: "bg-gradient-to-br from-fuchsia-50/50 to-orange-50/30" },
};

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Hoy";
  if (same(d, yesterday)) return "Ayer";
  const sameYear = d.getFullYear() === today.getFullYear();
  return `${d.getDate()} ${months[d.getMonth()]}${sameYear ? "" : " " + d.getFullYear()}`;
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  if (d < 30) return `hace ${Math.floor(d / 7)} semana${Math.floor(d / 7) === 1 ? "" : "s"}`;
  if (d < 365) return `hace ${Math.floor(d / 30)} mes${Math.floor(d / 30) === 1 ? "" : "es"}`;
  return `hace ${Math.floor(d / 365)} año${Math.floor(d / 365) === 1 ? "" : "s"}`;
}

function StatPill({ Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-100">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-display text-lg font-bold text-slate-900 leading-none">{value}</div>
      </div>
    </div>
  );
}

export default function AchievementJournal({ businessNameProp, logoUrl }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("timeline");
  const [imageEntry, setImageEntry] = useState(null);

  useEffect(() => {
    api.get("/providers/me/journal").then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="py-12 text-center text-sm text-slate-400">Cargando tu diario...</div>;

  const { journey_start, business_name, entries = [], locked = [], stats = {} } = data;
  const bizName = businessNameProp || business_name || "tu negocio";
  const logoFullUrl = logoUrl ? buildFileUrl(logoUrl) : null;

  const shareEntry = async (entry) => {
    const url = `${window.location.origin}/`;
    const text = `${entry.title} en getmano · ${entry.message} · ${bizName} · ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: entry.title, text, url }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); toast.success("¡Logro copiado! Compártelo en tus redes."); } catch { toast.error("No se pudo copiar"); }
  };

  return (
    <div className="space-y-6" data-testid="achievement-journal">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl p-6 md:p-8" style={{
        background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 40%, #fef3c7 100%)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.02), 0 12px 40px -16px rgba(255,107,44,0.25)",
      }}>
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)", backgroundSize: "20px 20px" }} />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 backdrop-blur border border-orange-200 text-orange-700 text-[10px] font-semibold tracking-widest uppercase mb-3">
              <Trophy className="w-3 h-3" /> Mi diario · {bizName}
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              Tu historia en getmano <span className="inline-block">📖</span>
            </h2>
            <p className="mt-2 text-sm text-slate-700 max-w-xl leading-relaxed">
              Cada paso que das construye la confianza de tu comunidad. Aquí guardamos tus logros para que los recuerdes siempre.
            </p>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-xs text-slate-500 uppercase tracking-widest">Logros desbloqueados</div>
            <div className="font-display text-4xl font-bold text-slate-900" data-testid="journal-progress-count">
              {stats.total_unlocked || 0}<span className="text-slate-400 text-2xl">/{stats.total_possible || 19}</span>
            </div>
            <div className="mt-1 w-32 h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${Math.round(((stats.total_unlocked || 0) / (stats.total_possible || 19)) * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Stat pills */}
        <div className="relative mt-5 grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatPill Icon={Eye} label="Vistas" value={stats.views || 0} color="bg-blue-500" />
          <StatPill Icon={Phone} label="Contactos" value={stats.contacts || 0} color="bg-orange-500" />
          <StatPill Icon={Star} label="Reseñas" value={stats.reviews || 0} color="bg-yellow-500" />
          <StatPill Icon={ThumbsUp} label="Likes" value={stats.likes || 0} color="bg-pink-500" />
          <StatPill Icon={Heart} label="Rating" value={(stats.rating || 0).toFixed(1)} color="bg-red-500" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200" data-testid="journal-tabs">
        <button onClick={() => setTab("timeline")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "timeline" ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-900"}`} data-testid="journal-tab-timeline">
          <Calendar className="w-4 h-4 inline mr-1.5" />Mi línea de tiempo
        </button>
        <button onClick={() => setTab("upcoming")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "upcoming" ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-900"}`} data-testid="journal-tab-upcoming">
          <TrendingUp className="w-4 h-4 inline mr-1.5" />Próximos hitos
          {locked.length > 0 && <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{locked.length}</span>}
        </button>
      </div>

      {tab === "timeline" && (
        <div className="relative pl-6 md:pl-8" data-testid="journal-timeline">
          {/* Vertical line */}
          <div className="absolute left-2 md:left-3 top-2 bottom-2 w-0.5 bg-gradient-to-b from-orange-300 via-amber-200 to-slate-200" />

          {entries.length === 0 && !journey_start && (
            <div className="py-10 text-center text-slate-400 text-sm">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-orange-300" />
              Tus logros aparecerán aquí pronto.
            </div>
          )}

          {/* Unlocked milestones */}
          {entries.map((e, i) => {
            const s = TIER_STYLE[e.tier] || TIER_STYLE.silver;
            return (
              <div key={e.milestone_id} className="relative pb-6 group" data-testid={`journal-entry-${e.milestone_id}`}>
                <div className={`absolute -left-[18px] md:-left-[22px] top-1.5 w-4 h-4 rounded-full ${s.dot} ring-4 ${s.ring}`} />
                <div className={`text-xs ${s.label} uppercase tracking-widest font-semibold mb-1`}>{fmtDate(e.unlocked_at)} · {timeAgo(e.unlocked_at)}</div>
                <div className={`rounded-2xl ${s.card} border border-slate-100 p-4 hover:border-orange-200 transition`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-3xl shadow-sm">
                      {e.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-base font-bold text-slate-900 leading-tight">{e.title}</h3>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">{e.message}</p>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => setImageEntry(e)} className="w-8 h-8 rounded-full hover:bg-white/80 flex items-center justify-center text-slate-400 hover:text-orange-600 transition" data-testid={`journal-image-${e.milestone_id}`} title="Crear imagen para redes">
                        <ImageIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => shareEntry(e)} className="w-8 h-8 rounded-full hover:bg-white/80 flex items-center justify-center text-slate-400 hover:text-orange-600 transition" data-testid={`journal-share-${e.milestone_id}`} title="Compartir logro">
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Journey start anchor */}
          {journey_start && (
            <div className="relative pb-2" data-testid="journal-journey-start">
              <div className="absolute -left-[20px] md:-left-[24px] top-1 w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 ring-4 ring-orange-100 flex items-center justify-center text-white text-[10px]">
                🌱
              </div>
              <div className="text-xs text-orange-700 uppercase tracking-widest font-semibold mb-1">{fmtDate(journey_start)} · {timeAgo(journey_start)}</div>
              <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-white border border-orange-100 flex items-center justify-center text-3xl shadow-sm">
                    🚪
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-base font-bold text-slate-900 leading-tight">Te uniste a getmano</h3>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                      El día que decidiste abrir tu eCard y compartir tu talento con la comunidad latina. <strong>Aquí empezó todo.</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "upcoming" && (
        <div className="space-y-3" data-testid="journal-upcoming">
          {locked.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-5xl mb-3">🏅</div>
              <h3 className="font-display text-xl font-bold text-slate-900">¡Desbloqueaste todos los hitos!</h3>
              <p className="mt-2 text-sm text-slate-500">Eres parte de los legendarios. Gracias por construir getmano con nosotros.</p>
            </div>
          ) : (
            locked.map((m) => {
              const s = TIER_STYLE[m.tier] || TIER_STYLE.silver;
              const pct = m.progress?.pct || 0;
              const hasProgress = m.progress?.target > 1 || m.progress?.current > 0;
              return (
                <div key={m.milestone_id} className="rounded-2xl bg-white border border-slate-100 p-4 hover:border-orange-200 transition" data-testid={`journal-locked-${m.milestone_id}`}>
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0 w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-3xl grayscale opacity-60">
                      <span>{m.emoji}</span>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                        <Lock className="w-2.5 h-2.5 text-slate-400" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-base font-bold text-slate-700 leading-tight">{m.title}</h3>
                        <span className={`text-[9px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full ${s.label} bg-white border border-slate-100`}>{m.tier}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500 leading-relaxed">{m.message}</p>
                      {hasProgress && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                            <span>Progreso</span>
                            <span className="font-semibold text-slate-700">{m.progress.current} / {m.progress.target}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <AchievementImageGenerator
        open={!!imageEntry}
        entry={imageEntry}
        businessName={bizName}
        logoUrl={logoFullUrl}
        onClose={() => setImageEntry(null)}
      />
    </div>
  );
}
