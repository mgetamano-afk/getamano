import { useEffect, useState } from "react";
import { Package, Loader2, CheckCircle2, Truck } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

/**
 * PhysicalCardsPanel — V7 Item 3 (provider self-service).
 *
 * Provider places an order for NFC tappable business cards pre-encoded
 * with their eCard URL. Form has 2 steps:
 *   1. Quantity (packs of 10 cards · $29 each · free shipping)
 *   2. Shipping address
 * After submit, the panel lists existing orders + current status.
 */

const PACKS_OPTIONS = [1, 2, 3, 5];
const PRICE_PER_PACK = 29;
const CARDS_PER_PACK = 10;

const STATUS_LABEL = {
  ordered:   "Recibida",
  printing:  "En imprenta",
  shipped:   "Enviada",
  delivered: "Entregada",
  cancelled: "Cancelada",
};

export default function PhysicalCardsPanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "", line1: "", line2: "", city: "", state: "", zip: "", phone: "",
  });
  const total = packs * PRICE_PER_PACK;
  const cards = packs * CARDS_PER_PACK;

  const refresh = async () => {
    setLoading(true);
    try { const r = await api.get("/physical-cards/orders/me"); setOrders(r.data || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.line1 || !form.city || !form.state || !form.zip) {
      toast.error("Completa la dirección.");
      return;
    }
    setCreating(true);
    try {
      await api.post("/physical-cards/orders", { packs, shipping: form });
      toast.success("¡Orden enviada!");
      setForm({ name: "", line1: "", line2: "", city: "", state: "", zip: "", phone: "" });
      refresh();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || "Error");
    } finally { setCreating(false); }
  };

  return (
    <div data-testid="physical-cards-panel" className="space-y-5 max-w-2xl">
      <header>
        <h3 className="font-display font-bold text-lg text-slate-900 inline-flex items-center gap-2">
          <Package className="w-5 h-5 text-[#0077B6]" />
          Tarjetas físicas NFC
        </h3>
        <p className="text-sm text-slate-500">
          Cada tarjeta abre tu eCard al tap. {CARDS_PER_PACK} tarjetas por pack · ${PRICE_PER_PACK}/pack · envío gratis en USA.
        </p>
      </header>

      {/* ── Order form ── */}
      <form onSubmit={onSubmit} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3" data-testid="physical-cards-form">
        <div>
          <label className="block text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-1.5">
            Cantidad
          </label>
          <div className="flex flex-wrap gap-2">
            {PACKS_OPTIONS.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setPacks(n)}
                className={`h-9 px-3.5 rounded-full text-sm font-bold ${packs === n ? "bg-[#0077B6] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                data-testid={`physical-cards-packs-${n}`}
              >
                {n} pack{n > 1 ? "s" : ""} · ${n * PRICE_PER_PACK}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input label="Nombre"   value={form.name}  onChange={v => setForm(f => ({ ...f, name: v }))}  testid="physical-cards-name" />
          <Input label="Teléfono" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} testid="physical-cards-phone" />
        </div>
        <Input label="Dirección" value={form.line1} onChange={v => setForm(f => ({ ...f, line1: v }))} testid="physical-cards-line1" />
        <Input label="Depto / Suite (opcional)" value={form.line2} onChange={v => setForm(f => ({ ...f, line2: v }))} testid="physical-cards-line2" />
        <div className="grid grid-cols-3 gap-2">
          <Input label="Ciudad" value={form.city}  onChange={v => setForm(f => ({ ...f, city: v }))}  testid="physical-cards-city" />
          <Input label="Estado" value={form.state} onChange={v => setForm(f => ({ ...f, state: v }))} maxLength={2} testid="physical-cards-state" />
          <Input label="ZIP"    value={form.zip}   onChange={v => setForm(f => ({ ...f, zip: v }))}   testid="physical-cards-zip" />
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900 font-bold">{cards} tarjetas</strong> · ${total} total
          </p>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-[#0077B6] text-white font-bold disabled:opacity-50 active:scale-95"
            data-testid="physical-cards-submit"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            Confirmar orden
          </button>
        </div>
      </form>

      {/* ── Orders list ── */}
      <section>
        <h4 className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-2">
          Mis órdenes
        </h4>
        {loading ? (
          <div className="py-6 flex items-center justify-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no tienes órdenes.</p>
        ) : (
          <ul className="space-y-2" data-testid="physical-cards-orders-list">
            {orders.map(o => (
              <li key={o.order_id} className="rounded-xl bg-white border border-slate-200 p-3 flex items-center gap-2 text-sm" data-testid={`physical-cards-order-${o.order_id}`}>
                <CheckCircle2 className={`w-4 h-4 ${o.status === "delivered" ? "text-emerald-500" : "text-slate-400"}`} />
                <span className="font-mono text-[10px] text-slate-400">{o.order_id.slice(-6)}</span>
                <span className="font-semibold flex-1 truncate">
                  {o.qty_cards} tarjetas · ${o.total_usd}
                </span>
                <span className={`text-[11px] font-bold uppercase tracking-wider px-2 h-6 inline-flex items-center rounded-full ${
                  o.status === "delivered" ? "bg-emerald-50 text-emerald-700"
                  : o.status === "shipped" ? "bg-sky-50 text-sky-700"
                  : o.status === "printing" ? "bg-violet-50 text-violet-700"
                  : "bg-slate-100 text-slate-600"
                }`}>
                  {STATUS_LABEL[o.status] || o.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Input({ label, value, onChange, testid, maxLength }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={maxLength || 120}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20"
        data-testid={testid}
      />
    </label>
  );
}
