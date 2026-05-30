import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { Package, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * AdminPhysicalCards — V7 admin page.
 *
 * Fulfilment table for NFC card orders. Each row exposes the 4 status
 * transitions inline so the admin moves orders forward in one click.
 */
const STATUS_ORDER = ["ordered", "printing", "shipped", "delivered"];

export default function AdminPhysicalCards() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter) params.status = filter;
      const r = await api.get("/admin/physical-cards", { params });
      setItems(r.data || []);
    } finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { refresh(); }, [refresh]);

  const setStatus = async (order_id, status) => {
    try {
      await api.patch(`/admin/physical-cards/${order_id}`, { status });
      toast.success("Actualizado");
      refresh();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  return (
    <AdminLayout title="Tarjetas físicas">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden" data-testid="admin-physical-cards-page">
        <header className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display font-bold inline-flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-400" /> Órdenes
          </h2>
          <div className="flex flex-wrap gap-1">
            {["", ...STATUS_ORDER, "cancelled"].map(s => (
              <button
                key={s || "all"}
                onClick={() => setFilter(s)}
                className={`px-3 h-7 rounded-full text-[11px] ${filter === s ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                data-testid={`admin-physical-filter-${s || "all"}`}
              >
                {s || "todas"}
              </button>
            ))}
          </div>
        </header>
        {loading ? (
          <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">Sin órdenes.</div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {items.map(o => (
              <li key={o.order_id} className="p-4 text-sm" data-testid={`admin-physical-card-${o.order_id}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500">{o.order_id.slice(-6)}</span>
                  <span className="font-semibold text-slate-100 truncate flex-1">{o.business_name}</span>
                  <span className="text-[11px] text-slate-400">${o.total_usd} · {o.qty_cards} tarjetas</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {o.shipping_address?.name} · {o.shipping_address?.line1} · {o.shipping_address?.city}, {o.shipping_address?.state} {o.shipping_address?.zip}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {STATUS_ORDER.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(o.order_id, s)}
                      className={`px-2.5 h-7 rounded-full text-[11px] font-semibold ${
                        o.status === s
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                      data-testid={`admin-physical-card-${o.order_id}-status-${s}`}
                    >
                      {s}
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
