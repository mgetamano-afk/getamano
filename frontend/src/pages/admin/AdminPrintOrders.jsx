/**
 * AdminPrintOrders — V13 print-with-getamano queue.
 *
 * Lists every `print_card_orders` row created by providers tapping
 * "Imprimir con getamano" in their dashboard. Admin can download the
 * ready-to-print PDF and move the order through the funnel:
 *   pending_payment → queued_for_print → printing → shipped → delivered
 */
import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { Printer, Loader2, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const STATUS_FLOW = ["pending_payment", "queued_for_print", "printing", "shipped", "delivered"];
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function AdminPrintOrders() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter) params.status = filter;
      const r = await api.get("/admin/print-orders", { params });
      setItems(r.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  const setStatus = async (orderId, status) => {
    try {
      await api.patch(`/admin/print-orders/${orderId}`, null, { params: { status } });
      toast.success("Estado actualizado");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    }
  };

  const downloadPdf = async (orderId) => {
    setDownloadingId(orderId);
    try {
      const res = await api.get(`/admin/print-orders/${orderId}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `getamano-print-${orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo descargar el PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  const counts = STATUS_FLOW.reduce((acc, s) => {
    acc[s] = items.filter(o => o.status === s).length;
    return acc;
  }, {});

  return (
    <AdminLayout title="Órdenes de impresión">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden" data-testid="admin-print-orders-page">
        <header className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display font-bold inline-flex items-center gap-2 text-white">
            <Printer className="w-5 h-5 text-amber-400" />
            Imprimir con getamano
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
              {items.length} totales
            </span>
          </h2>
          <div className="flex flex-wrap gap-1">
            {["", ...STATUS_FLOW, "cancelled"].map(s => (
              <button
                key={s || "all"}
                onClick={() => setFilter(s)}
                className={`px-3 h-7 rounded-full text-[11px] transition ${
                  filter === s ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                data-testid={`admin-print-filter-${s || "all"}`}
              >
                {s || "todas"}{s && counts[s] != null ? ` · ${counts[s]}` : ""}
              </button>
            ))}
          </div>
        </header>
        {loading ? (
          <div className="py-10 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">Sin órdenes de impresión todavía.</div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {items.map((o) => (
              <li key={o.order_id} className="p-4 text-sm" data-testid={`admin-print-order-${o.order_id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-slate-500">{o.order_id.slice(-8)}</span>
                  <span className="font-semibold text-slate-100 truncate flex-1">{o.business_name}</span>
                  <span className="text-[11px] text-slate-400">${o.total_usd} · {o.qty_cards} tarjetas · {o.packs} pack(s)</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                  <span>📅 {new Date(o.created_at).toLocaleString()}</span>
                  <a
                    href={`${BACKEND_URL}/p/${o.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#0077B6] hover:underline inline-flex items-center gap-1"
                    data-testid={`admin-print-order-${o.order_id}-open-ecard`}
                  >
                    Abrir eCard <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {o.notes && (
                  <p className="mt-1 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">
                    Nota: {o.notes}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => downloadPdf(o.order_id)}
                    disabled={downloadingId === o.order_id}
                    className="px-2.5 h-7 rounded-full text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1 disabled:opacity-60"
                    data-testid={`admin-print-order-${o.order_id}-download`}
                  >
                    {downloadingId === o.order_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    PDF
                  </button>
                  {STATUS_FLOW.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(o.order_id, s)}
                      className={`px-2.5 h-7 rounded-full text-[11px] font-semibold transition ${
                        o.status === s
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                      data-testid={`admin-print-order-${o.order_id}-status-${s}`}
                    >
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}
