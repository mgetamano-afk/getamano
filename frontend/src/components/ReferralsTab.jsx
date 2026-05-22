import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Copy, Share2, Gift } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function ReferralsTab() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/providers/me/referrals").then(r => setData(r.data)).catch(e => console.error(e)); }, []);

  if (!data) return <div className="text-slate-400 text-sm">Cargando...</div>;

  const fullUrl = `${BACKEND_URL}${data.share_url}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(fullUrl); toast.success("Enlace copiado"); }
    catch (e) { console.error("clipboard", e); toast.error("No se pudo copiar"); }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`¡Únete a getamano! Es el directorio latino más completo de USA. Usa mi enlace: ${fullUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div data-testid="referrals-tab">
      <div className="rounded-2xl p-6 mb-5 text-white" style={{ background: "linear-gradient(135deg, #2F9D94, #025F67)" }}>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <Gift className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-display font-bold text-xl text-white">¡Gana 1 mes gratis de tu plan!</h3>
            <p className="text-white/90 text-sm mt-1">
              Comparte tu enlace único con otros proveedores. Cuando se registren y activen un plan de pago, tú recibes 1 mes gratis automáticamente.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 mb-5" style={{ borderColor: "#BCC5CC" }}>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Tu enlace de invitación</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={fullUrl}
            readOnly
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm font-mono"
            style={{ borderColor: "#BCC5CC" }}
            data-testid="ref-share-url"
            onClick={(e) => e.target.select()}
          />
          <button onClick={copy} className="btn-outline inline-flex items-center gap-1 px-4 py-2 text-sm" data-testid="ref-copy">
            <Copy className="w-4 h-4" /> Copiar
          </button>
          <button onClick={shareWhatsApp} className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: "#25D366" }} data-testid="ref-whatsapp">
            <Share2 className="w-4 h-4" /> WhatsApp
          </button>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-3">
          Tu código: <strong style={{ color: "#025F67" }}>{data.ref_code}</strong>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Invitados" value={data.total_referred} testid="ref-stat-invited" />
        <Stat label="Activados" value={data.total_paid} testid="ref-stat-paid" />
        <Stat label="Meses gratis" value={data.credited_months} testid="ref-stat-credited" />
      </div>

      {data.items.length > 0 ? (
        <div className="rounded-xl border bg-white" style={{ borderColor: "#BCC5CC" }}>
          <table className="w-full text-sm" data-testid="ref-table">
            <thead className="text-xs uppercase tracking-wider text-slate-500 border-b" style={{ borderColor: "#BCC5CC" }}>
              <tr>
                <th className="text-left p-3">Fecha</th>
                <th className="text-left p-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r, i) => (
                <tr key={r.referral_id || i} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                  <td className="p-3 text-slate-700">{new Date(r.created_at).toLocaleDateString("es")}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      backgroundColor: r.status === "credited" ? "#DCFCE7" : r.status === "paid" ? "#FEF3C7" : "#F1F5F9",
                      color: r.status === "credited" ? "#15803D" : r.status === "paid" ? "#92400E" : "#475569",
                    }}>
                      {r.status === "credited" ? "Acreditado" : r.status === "paid" ? "Activó plan" : "Registrado"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-6">Aún no has invitado a nadie. ¡Comparte tu enlace y empieza a ganar!</p>
      )}
    </div>
  );
}

function Stat({ label, value, testid }) {
  return (
    <div className="rounded-xl border bg-white p-3 text-center" style={{ borderColor: "#BCC5CC" }} data-testid={testid}>
      <div className="font-display text-2xl font-bold" style={{ color: "#025F67" }}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
