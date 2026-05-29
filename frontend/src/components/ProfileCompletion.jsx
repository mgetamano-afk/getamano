import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { CheckCircle2, ArrowRight, Sparkles } from "lucide-react";

/**
 * ProfileCompletion — sticky progress bar at the top of the provider dashboard.
 * Shows score (0–100), color-coded bar, and tappable suggestions for the missing items.
 */
export default function ProfileCompletion({ onTabChange }) {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/providers/me/completion").then(r => setData(r.data)).catch(e => console.error(e)); }, []);

  if (!data) return null;
  const { score, missing } = data;
  const barColor = score >= 80 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";

  const handleTap = (deepLink) => {
    const url = new URL(deepLink, window.location.origin);
    const tab = url.searchParams.get("tab");
    if (tab && typeof onTabChange === "function") onTabChange(tab);
    else window.location.href = deepLink;
  };

  return (
    <div className="rounded-2xl p-5 mb-6 border bg-white" style={{ borderColor: "#BCC5CC" }} data-testid="profile-completion">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {score >= 80 ? <Sparkles className="w-5 h-5" style={{ color: "#10B981" }} /> : <CheckCircle2 className="w-5 h-5 text-slate-400" />}
          <h3 className="font-display font-semibold text-base" style={{ color: "#03045E" }}>
            Tu perfil está al <span style={{ color: barColor }} data-testid="completion-score">{score}%</span>
          </h3>
        </div>
        <span className="text-xs text-slate-500">{missing.length === 0 ? "¡Perfil completo!" : `${10 - missing.length}/10 secciones`}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden bg-slate-100">
        <div className="h-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: barColor }} data-testid="completion-bar" />
      </div>
      {missing.length > 0 && (
        <div className="mt-3" data-testid="completion-suggestions">
          <p className="text-xs text-slate-500 mb-2">Complétalo para aparecer más alto en búsquedas:</p>
          <ul className="space-y-1.5">
            {missing.slice(0, 3).map((m, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => handleTap(m.deep_link)}
                  className="inline-flex items-center gap-1 text-sm hover:underline"
                  style={{ color: "#0077B6" }}
                  data-testid={`completion-suggestion-${i}`}
                >
                  → {m.label} <span className="text-slate-400">(+{m.points}%)</span> <ArrowRight className="w-3 h-3" />
                </button>
              </li>
            ))}
            {missing.length > 3 && (
              <li className="text-xs text-slate-400">…y {missing.length - 3} más</li>
            )}
          </ul>
        </div>
      )}
      {missing.length === 0 && (
        <p className="text-xs mt-3" style={{ color: "#10B981" }}>
          ✨ Tu perfil aparece más alto en resultados de búsqueda.
        </p>
      )}
    </div>
  );
}
