import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Trophy, Lock, Sparkles, CheckCircle2, Loader2 } from "lucide-react";

/**
 * ShareRewardsCard — gamification on top of share tracking.
 *
 * Shows the next unlockable reward tier with progress bars. Tier becomes
 * "eligible" once the provider crosses both thresholds; click "Reclamar" to
 * extend their subscription 30 days + upgrade to the tier's min_plan (if below).
 *
 * Server is the source of truth — frontend is purely presentational.
 */
export default function ShareRewardsCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(null);
  const [celebrate, setCelebrate] = useState(null);

  const load = async () => {
    try {
      const r = await api.get("/providers/me/share-rewards");
      setData(r.data);
    } catch (_e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onClaim = async (tier) => {
    setClaiming(tier.tier_id);
    try {
      const r = await api.post(`/providers/me/share-rewards/claim/${tier.tier_id}`);
      toast.success(`🎉 ¡Recompensa desbloqueada! Plan ${r.data.plan} extendido ${r.data.bonus_days} días.`);
      setCelebrate(tier.tier_id);
      setTimeout(() => setCelebrate(null), 4000);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo reclamar");
    } finally {
      setClaiming(null);
    }
  };

  if (loading || !data) return null;
  // Only show ONE active tier at a time — pick the first unclaimed.
  const nextTier = data.tiers.find((t) => t.status !== "claimed") || data.tiers[0];
  if (!nextTier) return null;

  return (
    <div
      className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-5 mb-6 relative overflow-hidden"
      data-testid="share-rewards-card"
    >
      {celebrate === nextTier.tier_id && <Confetti />}

      <div className="flex items-start gap-3">
        <div className="text-3xl flex-shrink-0">{nextTier.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900">{nextTier.label_es}</h3>
            <StatusBadge status={nextTier.status} />
          </div>
          <p className="text-xs text-slate-600 mt-1 leading-snug">{nextTier.description_es}</p>
        </div>
      </div>

      {/* Progress bars only when not yet claimed */}
      {nextTier.status !== "claimed" && (
        <div className="mt-4 space-y-2.5">
          <ProgressRow
            label="Shares"
            value={data.share_count}
            target={nextTier.min_shares}
            pct={nextTier.shares_pct}
            remaining={nextTier.shares_remaining}
            testid="share-rewards-progress-shares"
          />
          <ProgressRow
            label="Visitas referidas"
            value={data.referred_view_count}
            target={nextTier.min_referred_views}
            pct={nextTier.views_pct}
            remaining={nextTier.views_remaining}
            testid="share-rewards-progress-views"
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {nextTier.status === "eligible" && (
          <button
            type="button"
            onClick={() => onClaim(nextTier)}
            disabled={claiming === nextTier.tier_id}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white transition disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" }}
            data-testid={`share-rewards-claim-${nextTier.tier_id}`}
          >
            {claiming === nextTier.tier_id ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Reclamando…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Reclamar mi recompensa</>
            )}
          </button>
        )}
        {nextTier.status === "claimed" && (
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            Reclamada el {new Date(nextTier.claimed_at).toLocaleDateString("es-ES")}
          </div>
        )}
        {nextTier.status === "locked" && (
          <span className="text-xs text-slate-500 italic">
            💡 Sigue compartiendo tu eCard para desbloquear.
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === "claimed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" /> Reclamada
      </span>
    );
  }
  if (status === "eligible") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300 animate-pulse">
        <Trophy className="w-3 h-3" /> ¡Desbloqueada!
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
      <Lock className="w-3 h-3" /> En progreso
    </span>
  );
}

function ProgressRow({ label, value, target, pct, remaining, testid }) {
  const done = pct >= 100;
  return (
    <div data-testid={testid}>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={`font-mono ${done ? "text-emerald-700" : "text-slate-600"}`}>
          {value} / {target}
          {!done && <span className="ml-2 text-amber-600">faltan {remaining}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white overflow-hidden border border-amber-100">
        <div
          className={`h-full transition-all duration-700 ${done ? "bg-emerald-500" : "bg-gradient-to-r from-amber-400 to-orange-500"}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function Confetti() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <style>{`@keyframes confetti-fall{0%{transform:translateY(-20px) rotate(0)}100%{transform:translateY(280px) rotate(720deg)}}`}</style>
      {Array.from({ length: 18 }).map((_, i) => {
        const colors = ["#f97316", "#10b981", "#0ea5e9", "#facc15", "#ec4899"];
        const left = (i * 5.7) % 100;
        const delay = (i % 6) * 100;
        const duration = 1600 + (i % 5) * 200;
        return (
          <span
            key={i}
            className="absolute -top-3 w-2 h-3 rounded-sm"
            style={{
              left: `${left}%`,
              background: colors[i % colors.length],
              animation: `confetti-fall ${duration}ms cubic-bezier(.16,.84,.44,1) ${delay}ms forwards`,
            }}
          />
        );
      })}
    </div>
  );
}
