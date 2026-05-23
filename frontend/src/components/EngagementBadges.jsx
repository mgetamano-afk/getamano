import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api";

/**
 * EngagementBadges — Section 33 follow-up.
 *
 * Pulls /api/providers/{provider_id}/badges and renders a colorful pill row
 * surfacing engagement signals on the public eCard:
 *   - 🟢 Activo esta semana
 *   - ⚡ Responde rápido
 *   - 🔥 Muy solicitado
 *   - ✨ Top Referrer · N
 *   - 💼 Chamber@ del mes
 *   - 🏆 Founding Member
 *
 * Silent zero-state — returns null when no badges to keep the eCard clean.
 */

const PALETTE = {
  active_week:      { bg: "rgba(16,185,129,0.10)", color: "#047857", border: "rgba(16,185,129,0.30)" },
  fast_responder:   { bg: "rgba(2,132,199,0.10)",  color: "#0369A1", border: "rgba(2,132,199,0.30)" },
  in_demand:        { bg: "rgba(217,70,239,0.10)", color: "#A21CAF", border: "rgba(217,70,239,0.30)" },
  top_referrer:     { bg: "rgba(245,158,11,0.12)", color: "#B45309", border: "rgba(245,158,11,0.35)" },
  referrer:         { bg: "rgba(245,158,11,0.08)", color: "#B45309", border: "rgba(245,158,11,0.25)" },
  chambero:         { bg: "rgba(234,88,12,0.12)",  color: "#C2410C", border: "rgba(234,88,12,0.35)" },
  active_applicant: { bg: "rgba(234,88,12,0.06)",  color: "#9A3412", border: "rgba(234,88,12,0.25)" },
  founding_member:  { bg: "rgba(2,95,103,0.10)",   color: "#025F67", border: "rgba(2,95,103,0.30)" },
  bilingual:        { bg: "linear-gradient(135deg, rgba(2,95,103,0.08) 0%, rgba(30,64,175,0.08) 100%)", color: "#1E40AF", border: "rgba(30,64,175,0.30)" },
  streak:           { bg: "linear-gradient(135deg, #FFF7ED 0%, #FED7AA 100%)", color: "#9A3412", border: "rgba(234,88,12,0.45)" },
};

export default function EngagementBadges({ providerId }) {
  const [badges, setBadges] = useState(null);

  useEffect(() => {
    if (!providerId) return;
    let alive = true;
    api.get(`/providers/${providerId}/badges`)
      .then(r => { if (alive) setBadges(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (alive) setBadges([]); });
    return () => { alive = false; };
  }, [providerId]);

  if (badges === null) {
    return (
      <div className="mt-3 flex items-center gap-2 text-slate-400 text-xs" data-testid="engagement-badges-loading">
        <Loader2 className="w-3 h-3 animate-spin" /> Cargando logros…
      </div>
    );
  }
  if (badges.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="engagement-badges">
      {badges.map(b => {
        const c = PALETTE[b.key] || PALETTE.active_week;
        return (
          <span
            key={b.key}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border"
            style={{ background: c.bg, color: c.color, borderColor: c.border }}
            data-testid={`badge-${b.key}`}
            title={b.label}
          >
            <span>{b.icon}</span>
            {b.label}
          </span>
        );
      })}
    </div>
  );
}
