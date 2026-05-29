import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  Image as ImageIcon,
  Type,
  Tag,
  MapPin,
  Phone,
  Clock,
  Camera,
  DollarSign,
  Calendar,
  Star,
  CheckCircle2,
  Circle,
  ChevronRight,
  Sparkles,
  Trophy,
} from "lucide-react";
import { api } from "../lib/api";

/**
 * EcardHealth — Section 43.
 *
 * Gamified eCard setup checklist. Pulls `/providers/me/health` which returns
 * {score, items[]} where each item carries status (done/missing), severity,
 * a deep_link to the relevant dashboard tab, and an impact_message used to
 * nudge proveedores on the highest-leverage gaps.
 *
 * Visual design:
 *  · big ring score + "X/10 listo" subtitle.
 *  · the top missing item is highlighted as the "Next quick win" card.
 *  · the rest of the checklist below, missing items in teal / done in muted.
 */
const ICON_MAP = {
  image: ImageIcon,
  text: Type,
  tag: Tag,
  map: MapPin,
  phone: Phone,
  clock: Clock,
  camera: Camera,
  dollar: DollarSign,
  calendar: Calendar,
  star: Star,
};

const SEVERITY_COLOR = {
  critical: "#DC2626",
  high: "#F59E0B",
  medium: "#0EA5E9",
  low: "#64748B",
};

function ringStrokeColor(score) {
  if (score >= 90) return "#1D9E75";
  if (score >= 70) return "#0077B6";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

export default function EcardHealth() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .get("/providers/me/health")
      .then((r) => alive && setData(r.data))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 animate-pulse" data-testid="ecard-health-loading">
        <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
        <div className="h-3 bg-slate-100 rounded w-full mb-2" />
        <div className="h-3 bg-slate-100 rounded w-5/6" />
      </div>
    );
  }
  if (!data) return null;

  const total = data.items.length || 1;
  const done = data.items.filter((it) => it.status === "done").length;
  const score = data.score ?? 0;
  const missing = data.items.filter((it) => it.status === "missing");
  const nextItem = missing[0] || null;
  const isPerfect = missing.length === 0;
  const ringColor = ringStrokeColor(score);

  // SVG ring math
  const ringRadius = 36;
  const ringStroke = 6;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringDash = (score / 100) * ringCirc;

  const go = (link) => {
    // Section 63 Block 1 — Special-case the "first review" CTA: instead of
    // simply navigating, open the WhatsApp share sheet with a pre-filled
    // message pointing to the provider's eCard reviews anchor. Falls back
    // to clipboard copy if Web Share API is unavailable.
    if (link && /review|resena|reseña/i.test(link)) {
      const slug = data?.slug || user?.slug;
      if (slug) {
        const url = `${window.location.origin}/p/${slug}#resenas`;
        const msg = `¡Hola! ¿Te quedaste contento con mi servicio? Me ayudarías muchísimo con una reseña corta en mi eCard 👇\n${url}`;
        if (navigator.share) {
          navigator.share({ title: "Mi eCard en getamano", text: msg, url }).catch(() => {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(msg).then(() => {
            // best-effort toast hint (no toast lib import here on purpose)
            window.alert("Mensaje copiado — pégalo en WhatsApp");
          }).catch(() => navigate(link));
        } else {
          navigate(link);
        }
        return;
      }
    }
    navigate(link);
  };

  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden"
      style={{ borderColor: isPerfect ? "rgba(29,158,117,0.3)" : "rgba(2,95,103,0.15)" }}
      data-testid="ecard-health"
    >
      {/* Header — score ring + summary */}
      <div className="flex items-center gap-4 p-4 sm:p-5">
        {/* Animated SVG ring */}
        <div className="relative flex-shrink-0">
          <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
            <circle cx="42" cy="42" r={ringRadius} stroke="#F1F5F9" strokeWidth={ringStroke} fill="none" />
            <circle
              cx="42" cy="42" r={ringRadius}
              stroke={ringColor} strokeWidth={ringStroke} fill="none" strokeLinecap="round"
              strokeDasharray={`${ringDash} ${ringCirc}`}
              style={{ transition: "stroke-dasharray 0.8s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-display font-bold text-slate-900 leading-none" data-testid="ecard-health-score">{score}</span>
            <span className="text-[9px] text-slate-400 mt-0.5">de 100</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {isPerfect ? (
              <Trophy className="w-3.5 h-3.5" style={{ color: "#1D9E75" }} />
            ) : (
              <Sparkles className="w-3.5 h-3.5" style={{ color: "#03045E" }} />
            )}
            <h3 className="font-display font-bold text-sm text-slate-900">
              {isPerfect ? "¡Tu eCard está perfecta!" : "Salud de tu eCard"}
            </h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isPerfect ? (
              <>Todos los campos clave están completos. Cada vez que llegue una reseña nueva, tu visibilidad sube.</>
            ) : (
              <>
                <strong className="text-slate-700">{done}/{total} listos</strong>. Completa los pendientes para subir tu posición en búsqueda.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Next quick win — only if there's a missing critical or high item */}
      {nextItem && (
        <button
          type="button"
          onClick={() => go(nextItem.deep_link)}
          className="w-full text-left px-4 sm:px-5 py-3 border-y flex items-center gap-3 hover:bg-slate-50 transition-colors"
          style={{ background: "rgba(2,95,103,0.04)", borderColor: "rgba(2,95,103,0.12)" }}
          data-testid="ecard-health-next"
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "#03045E" }}
          >
            {(() => {
              const Icon = ICON_MAP[nextItem.icon] || Circle;
              return <Icon className="w-4 h-4 text-white" />;
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#03045E" }}>
                Tu próximo paso
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: SEVERITY_COLOR[nextItem.severity] }}>
                +{nextItem.points}
              </span>
            </div>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{nextItem.label}</p>
            {nextItem.impact && (
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{nextItem.impact}</p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </button>
      )}

      {/* Full checklist */}
      <div className="divide-y divide-slate-100" data-testid="ecard-health-items">
        {data.items.map((item) => {
          const Icon = ICON_MAP[item.icon] || Circle;
          const isDone = item.status === "done";
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => go(item.deep_link)}
              className={`w-full flex items-center gap-3 px-4 sm:px-5 py-2.5 text-left transition-colors ${
                isDone ? "opacity-60 hover:opacity-100 hover:bg-slate-50" : "hover:bg-slate-50"
              }`}
              data-testid={`ecard-health-item-${item.key}`}
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                background: isDone ? "#F0FDF4" : "#F8FAFC",
              }}>
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4" style={{ color: "#1D9E75" }} />
                ) : (
                  <Icon className="w-4 h-4 text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${isDone ? "text-slate-500 line-through" : "text-slate-900 font-medium"}`}>
                  {item.label}
                </p>
              </div>
              <span className="text-[10px] font-bold text-slate-400 flex-shrink-0">+{item.points}</span>
              {!isDone && <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
