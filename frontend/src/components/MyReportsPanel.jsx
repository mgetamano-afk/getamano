import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Loader2, AlertTriangle, FileWarning, CheckCircle2, Clock, ShieldCheck } from "lucide-react";

/**
 * MyReportsPanel — Section 45 — single component that powers BOTH the
 * "Mis reportes enviados" and "Reportes contra mí" tabs in any dashboard.
 *
 * Modes:
 *   - mode="filed"   → /reports/mine (reports the user submitted)
 *   - mode="against" → /reports/against-me (reports filed against the user)
 *
 * The component is intentionally read-only. Submitting a new report is done
 * via the existing `ReportModal` component triggered from the relevant card.
 */
const STATUS_META = {
  pending:   { Icon: Clock,        label: "En revisión",  color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  resolved:  { Icon: CheckCircle2, label: "Resuelto",     color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  dismissed: { Icon: ShieldCheck,  label: "Desestimado",  color: "text-slate-500",   bg: "bg-slate-50",   border: "border-slate-200" },
};

export default function MyReportsPanel({ mode = "filed", title }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = mode === "against" ? "/reports/against-me" : "/reports/mine";
    api.get(url)
      .then((r) => setItems(r.data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [mode]);

  const heading = title || (mode === "against" ? "Reportes contra mí" : "Mis reportes enviados");

  return (
    <div className="space-y-3" data-testid={`my-reports-panel-${mode}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          {mode === "against" ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <FileWarning className="w-4 h-4 text-slate-500" />}
          {heading}
        </h3>
        {!loading && items.length > 0 && (
          <span className="text-xs text-slate-400">{items.length}</span>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400">
          <Loader2 className="w-5 h-5 mx-auto animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
          {mode === "against"
            ? "Nadie te ha reportado. 🌟 Sigue así."
            : "Aún no has reportado a nadie."}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => {
            const meta = STATUS_META[r.status] || STATUS_META.pending;
            const Icon = meta.Icon;
            return (
              <li
                key={r.report_id}
                className={`rounded-2xl border ${meta.border} ${meta.bg} p-3`}
                data-testid={`report-row-${r.report_id}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.color} bg-white border ${meta.border}`}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </span>
                      <span className="text-xs text-slate-700 font-medium">{r.reason_label}</span>
                      {mode === "against" && r.reporter_role && (
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                          de un {r.reporter_role}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1.5 line-clamp-3">{r.description}</p>
                    {r.action_taken && (
                      <p className="text-xs text-slate-700 mt-2">
                        <strong>Acción tomada:</strong> {r.action_taken}
                      </p>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 whitespace-nowrap">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString("es-ES") : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
