import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { X, AlertTriangle, Send, CheckCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * ReportModal — bidirectional report flow.
 * Props:
 *  - open, onClose
 *  - targetId (user_id of person being reported)
 *  - targetRole ("client" | "provider")
 *  - targetName (display name for confirmation)
 *  - context (optional: { quote_request_id, provider_slug })
 */
export default function ReportModal({ open, onClose, targetId, targetRole, targetName, context = {} }) {
  const { user } = useAuth();
  const [reasons, setReasons] = useState([]);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(""); setDescription(""); setSubmitted(false);
    api.get("/reports/reasons").then(r => {
      const list = user?.role === "provider" ? r.data.provider_to_client : r.data.client_to_provider;
      setReasons(list || []);
    }).catch(() => setReasons([]));
  }, [open, user?.role]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) { toast.error("Selecciona un motivo"); return; }
    if (description.trim().length < 20) { toast.error("Por favor describe lo ocurrido (mínimo 20 caracteres)"); return; }
    setSubmitting(true);
    try {
      await api.post("/reports", {
        target_id: targetId,
        target_role: targetRole,
        reason,
        description: description.trim(),
        evidence_urls: [],
        related_quote_request_id: context.quote_request_id || null,
        related_provider_slug: context.provider_slug || null,
      });
      setSubmitted(true);
      toast.success("Reporte enviado. Lo revisaremos en 24-48 horas.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error al enviar el reporte");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose} data-testid="report-modal">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "#BCC5CC" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FEF3F2" }}>
              <AlertTriangle className="w-5 h-5" style={{ color: "#DC2626" }} />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg" style={{ color: "#025F67" }}>Reportar {targetRole === "provider" ? "proveedor" : "cliente"}</h3>
              <p className="text-xs text-slate-500">{targetName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100" data-testid="report-close-btn"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        {submitted ? (
          <div className="p-8 text-center" data-testid="report-success">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "#EBF8F7" }}>
              <CheckCircle className="w-8 h-8" style={{ color: "#025F67" }} />
            </div>
            <h4 className="font-display font-bold text-xl mb-2" style={{ color: "#025F67" }}>Reporte enviado</h4>
            <p className="text-sm text-slate-600 mb-5">Nuestro equipo revisará el caso en las próximas 24-48 horas. Te notificaremos por email si tomamos acción.</p>
            <button onClick={onClose} className="btn-primary" data-testid="report-done-btn">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "#025F67" }}>Motivo del reporte</label>
              <div className="space-y-1.5">
                {reasons.map(r => (
                  <label key={r.key} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition ${reason === r.key ? "bg-teal-50" : "hover:bg-slate-50"}`} style={{ borderColor: reason === r.key ? "#2F9D94" : "#BCC5CC" }} data-testid={`report-reason-${r.key}`}>
                    <input type="radio" name="reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="mt-0.5" />
                    <span className="text-sm" style={{ color: "#063154" }}>{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "#025F67" }}>Descripción <span className="text-xs text-slate-400">(mínimo 20 caracteres)</span></label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Cuéntanos lo que pasó. Sé claro y específico."
                className="w-full px-3 py-2 border rounded-lg outline-none focus:border-teal-500"
                style={{ borderColor: "#BCC5CC" }}
                data-testid="report-description-input"
              />
              <div className="text-xs text-slate-400 mt-1 text-right">{description.length}/2000</div>
            </div>
            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
              <strong style={{ color: "#025F67" }}>Importante:</strong> Los reportes falsos o malintencionados pueden resultar en la suspensión de tu cuenta. Solo reporta situaciones reales que violan las <a href="/politica-resenas" target="_blank" rel="noopener" className="underline" style={{ color: "#2F9D94" }}>políticas de getamano</a>.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-full border text-sm font-medium" style={{ borderColor: "#BCC5CC", color: "#025F67" }}>Cancelar</button>
              <button type="submit" disabled={submitting} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60" data-testid="report-submit-btn">
                <Send className="w-4 h-4" />
                {submitting ? "Enviando..." : "Enviar reporte"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
