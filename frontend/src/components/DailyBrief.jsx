import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Coffee, Sparkles, RefreshCw, Mail, MessageCircle, Users, Trophy, ShieldAlert, Crown, DollarSign, Copy, Check, Target, TrendingUp, LifeBuoy, Megaphone, Heart, AlertTriangle, Zap, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const ICON_MAP = {
  users: Users,
  trophy: Trophy,
  shield: ShieldAlert,
  crown: Crown,
  dollar: DollarSign,
  target: Target,
  growth: TrendingUp,
  support: LifeBuoy,
  marketing: Megaphone,
  retention: Heart,
  urgent: AlertTriangle,
};

const PRIO_STYLE = {
  high:   { ring: "ring-red-400/50",    badge: "bg-red-500/20 text-red-200 border-red-400/40",       label: "Prioridad alta" },
  medium: { ring: "ring-amber-400/40",  badge: "bg-amber-500/15 text-amber-200 border-amber-400/30", label: "Prioridad media" },
  low:    { ring: "ring-slate-400/30",  badge: "bg-slate-500/15 text-slate-200 border-slate-400/30", label: "Cuando puedas" },
};

const HOUR_GREETING = () => {
  const h = new Date().getHours();
  if (h < 12) return { text: "Tu café matutino", emoji: "☕" };
  if (h < 19) return { text: "Tu brief de la tarde", emoji: "🌤️" };
  return { text: "Tu cierre del día", emoji: "🌙" };
};

export default function DailyBrief() {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async (regenerate = false) => {
    if (regenerate) setRegenerating(true);
    else setLoading(true);
    try {
      const r = await api.get(`/admin/daily-brief${regenerate ? "?regenerate=true" : ""}`);
      setBrief(r.data);
    } catch {
      toast.error("No se pudo generar el brief");
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  };
  useEffect(() => { load(false); }, []);

  const copy = async () => {
    if (!brief?.narrative) return;
    try {
      await navigator.clipboard.writeText(brief.narrative);
      setCopied(true);
      toast.success("Brief copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("No se pudo copiar"); }
  };

  const sendEmail = () => toast.info("Próximamente: Resend integration · tráeme la API key 🧡");
  const sendWA = () => toast.info("Próximamente: Twilio WhatsApp · tráeme las llaves 🧡");

  const greeting = HOUR_GREETING();

  return (
    <div className="relative overflow-hidden rounded-3xl p-6 md:p-7 mb-6"
      style={{ background: "linear-gradient(135deg, #063154 0%, #0A4D5E 50%, #025F67 100%)" }}
      data-testid="daily-brief">
      <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-amber-400/15 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "26px 26px" }} />

      <div className="relative flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-amber-300 text-[10px] font-semibold tracking-widest uppercase mb-2">
            <Coffee className="w-3 h-3" /> Daily Brief · Generado con IA
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-white leading-tight">
            {greeting.text} <span className="inline-block">{greeting.emoji}</span>
          </h2>
          {brief && <p className="text-xs text-white/55 mt-1 capitalize" data-testid="daily-brief-date">{brief.date}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs transition" data-testid="daily-brief-copy" disabled={!brief?.narrative}>
            {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
          </button>
          <button onClick={() => load(true)} disabled={regenerating || loading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs transition disabled:opacity-50" data-testid="daily-brief-regen">
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} /> Regenerar
          </button>
        </div>
      </div>

      {/* Narrative */}
      <div className="relative">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-white/10 rounded w-full" />
            <div className="h-3 bg-white/10 rounded w-11/12" />
            <div className="h-3 bg-white/10 rounded w-9/12" />
            <div className="h-3 bg-white/10 rounded w-10/12" />
          </div>
        ) : (
          <div className="relative rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-5">
            <Sparkles className="absolute top-3 left-3 w-4 h-4 text-amber-300 opacity-60" />
            <p className="pl-7 text-base md:text-lg text-white/95 leading-relaxed font-light whitespace-pre-wrap" data-testid="daily-brief-narrative">
              {brief?.narrative || "Generando tu brief..."}
            </p>
          </div>
        )}
      </div>

      {/* Highlights */}
      {brief?.highlights?.length > 0 && (
        <div className="relative mt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2" data-testid="daily-brief-highlights">
          {brief.highlights.map((h, i) => {
            const Icon = ICON_MAP[h.icon] || Sparkles;
            return (
              <div key={i} className={`relative rounded-xl backdrop-blur p-3 border ${h.urgent ? "bg-red-500/10 border-red-400/30" : "bg-white/5 border-white/10"}`} data-testid={`daily-brief-highlight-${i}`}>
                <Icon className={`w-3.5 h-3.5 ${h.urgent ? "text-red-300" : "text-amber-300"} mb-1.5`} />
                <div className="text-xs font-semibold text-white leading-tight">{h.label}</div>
                {h.sub && <div className="text-[10px] text-white/55 mt-0.5 truncate">{h.sub}</div>}
                {h.delta && <div className={`text-[10px] mt-0.5 ${h.delta.includes("-") ? "text-rose-300" : "text-emerald-300"}`}>{h.delta}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Recommendations — Growth & Traction */}
      {brief?.recommendations?.length > 0 && (
        <div className="relative mt-6" data-testid="daily-brief-recommendations">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-300" />
            <h3 className="font-display font-bold text-white text-base">Acciones para esta semana</h3>
            <span className="text-[10px] uppercase tracking-widest text-amber-300 ml-1 font-semibold">Recomendaciones IA</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {brief.recommendations.map((r, i) => {
              const Icon = ICON_MAP[r.icon] || Target;
              const prio = PRIO_STYLE[r.priority] || PRIO_STYLE.medium;
              return (
                <div
                  key={i}
                  className={`relative rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-4 ring-1 ${prio.ring} transition hover:bg-white/10`}
                  data-testid={`daily-brief-rec-${i}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${r.priority === "high" ? "bg-red-500/20" : r.priority === "medium" ? "bg-amber-500/15" : "bg-slate-500/15"}`}>
                      <Icon className={`w-5 h-5 ${r.priority === "high" ? "text-red-300" : r.priority === "medium" ? "text-amber-300" : "text-slate-300"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase border ${prio.badge}`}>{prio.label}</span>
                        {r.impact_estimate && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-semibold">
                            <ArrowRight className="w-2.5 h-2.5" /> {r.impact_estimate}
                          </span>
                        )}
                      </div>
                      <h4 className="font-display text-sm md:text-base font-bold text-white leading-tight">{r.title}</h4>
                      <p className="mt-1.5 text-xs text-white/70 leading-relaxed" data-testid={`daily-brief-rec-why-${i}`}>
                        <span className="text-amber-300 font-semibold">Por qué:</span> {r.why}
                      </p>
                      <p className="mt-1 text-xs text-white/85 leading-relaxed" data-testid={`daily-brief-rec-action-${i}`}>
                        <span className="text-orange-300 font-semibold">Acción:</span> {r.action}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[10px] text-white/40 text-center">
            💡 Recomendaciones generadas analizando tus métricas reales · Regenera si quieres una nueva perspectiva
          </div>
        </div>
      )}

      {/* Send actions */}
      <div className="relative mt-5 pt-4 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-white/50">
          🧠 Powered by Claude Sonnet 4.5 · cacheado por día (regenerar para refrescar)
        </div>
        <div className="flex gap-2">
          <button onClick={sendEmail} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white/90 text-xs transition" data-testid="daily-brief-email">
            <Mail className="w-3.5 h-3.5" /> Enviar a mi email
          </button>
          <button onClick={sendWA} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white/90 text-xs transition" data-testid="daily-brief-whatsapp">
            <MessageCircle className="w-3.5 h-3.5 text-green-400" /> Enviar a WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
