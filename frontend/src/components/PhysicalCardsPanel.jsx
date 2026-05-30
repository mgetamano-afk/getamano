import { useEffect, useState } from "react";
import { Package, Loader2, CheckCircle2, Truck, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import VerifiedBadge from "./VerifiedBadge";
import AiCardDesigner from "./AiCardDesigner";

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
  const [profile, setProfile] = useState(null);
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
  useEffect(() => {
    refresh();
    // V13 — pull the provider profile so we can render the LIVE physical
    // card preview at the top of the panel, generated from the eCard data.
    api.get("/providers/me").then(r => setProfile(r.data)).catch(() => {});
  }, []);

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

      {/* V13 — Live preview of the physical card mock-up generated from
          the current eCard data. V14 — adds the AI background designer
          and overlays the active design on the front of the preview. */}
      {profile && <AiCardDesigner profile={profile} onDesignChange={() => refresh()} />}
      {profile && <PhysicalCardPreview profile={profile} />}

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

/**
 * PhysicalCardPreview — V13. Renders a deck of two cards (front + back)
 * generated from the live provider profile. The front shows the business
 * name, category, city/state + verified badge; the back has the NFC tap
 * mark and the eCard URL.
 *
 * Adds 2 CTAs:
 *   · "Descargar PDF de muestra" → GET /physical-cards/preview-pdf
 *   · "Imprimir con getamano"    → POST /physical-cards/print-orders
 *                                  (admin sees + downloads pdf to print)
 */
function PhysicalCardPreview({ profile }) {
  const verified = profile?.verification_status === "approved";
  const code = profile?.getamano_code || "";
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [activeDesign, setActiveDesign] = useState(null);

  // V14 — pull the active AI design once (and re-pull every 8s in case the
  // sibling AiCardDesigner just generated a new one). Cheap because the
  // endpoint returns a single doc.
  useEffect(() => {
    let alive = true;
    const fetchActive = () => api.get("/physical-cards/ai-design/active")
      .then(r => { if (alive) setActiveDesign(r.data); })
      .catch(() => {});
    fetchActive();
    const id = setInterval(fetchActive, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const palette = activeDesign?.palette || [];
  const frontStyle = activeDesign?.preview_data_url
    ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${activeDesign.preview_data_url})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: `linear-gradient(135deg, ${palette[0] || "#03045E"} 0%, ${palette[1] || "#0077B6"} 100%)` };

  const downloadPreviewPdf = async () => {
    setDownloading(true);
    try {
      const res = await api.get("/physical-cards/preview-pdf", { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `getamano-card-${profile.slug || "preview"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo descargar el PDF");
    } finally {
      setDownloading(false);
    }
  };

  const submitPrintOrder = async () => {
    if (!profile?.provider_id) return;
    if (!window.confirm("¿Enviar esta tarjeta a imprimir con getamano? El equipo te contactará para el pago + envío.")) return;
    setPrinting(true);
    try {
      const body = { provider_id: profile.provider_id, packs: 1 };
      if (activeDesign?.design_id) body.design_id = activeDesign.design_id;
      await api.post("/physical-cards/print-orders", body);
      toast.success("Orden enviada al equipo de getamano 🎉");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo enviar la orden");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5" data-testid="physical-card-preview">
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-3">
        Vista previa de tu tarjeta
      </p>
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
        {/* FRONT */}
        <div
          className="relative w-[280px] h-[170px] rounded-2xl text-white p-4 shadow-xl hover:scale-[1.02] transition-transform duration-300 overflow-hidden"
          style={frontStyle}
          data-testid="physical-card-preview-front"
        >
          <div className="absolute top-3 right-3 flex items-center gap-1">
            {verified && <VerifiedBadge size={20} darkBg />}
          </div>
          {profile?.logo_url ? (
            <img src={profile.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover bg-white/15 mb-2 backdrop-blur" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur mb-2 flex items-center justify-center font-display font-bold text-white">
              {(profile?.business_name || "?")[0]?.toUpperCase()}
            </div>
          )}
          <p className="font-display font-bold text-lg leading-tight drop-shadow" data-testid="physical-card-preview-name">
            {profile?.business_name || "Tu negocio"}
          </p>
          <p className="text-xs text-white/90 mt-0.5 drop-shadow">
            {[profile?.city, profile?.state].filter(Boolean).join(", ")}
          </p>
          <p className="absolute bottom-3 left-4 text-[10px] uppercase tracking-widest text-white/70 font-bold">
            get<span style={{ color: palette[2] || "#90E0EF" }}>amano</span>
            {code && <span className="ml-2 text-white/70">{code}</span>}
          </p>
          {activeDesign?.design_id && (
            <span className="absolute top-2 left-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-violet-600/80 text-white font-bold backdrop-blur" data-testid="physical-card-ai-badge">
              IA
            </span>
          )}
        </div>

        {/* BACK */}
        <div
          className="relative w-[280px] h-[170px] rounded-2xl bg-white border border-slate-200 p-4 shadow-md hover:scale-[1.02] transition-transform duration-300"
          data-testid="physical-card-preview-back"
        >
          <div className="absolute top-3 right-3 w-8 h-8 rounded-full border-2 border-slate-300 flex items-center justify-center">
            <span className="text-[9px] font-bold text-slate-400">NFC</span>
          </div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Tap to open</p>
          <p className="font-display font-bold text-[#03045E] text-base mt-1 leading-tight truncate">
            {profile?.business_name}
          </p>
          {profile?.slug && (
            <p className="text-xs text-slate-500 mt-1 font-mono truncate" data-testid="physical-card-preview-slug">
              getamano.us/p/{profile.slug}
            </p>
          )}
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
            <p className="text-[10px] text-slate-400 max-w-[160px] leading-tight">
              Toca esta tarjeta con un celular para abrir mi eCard pública.
            </p>
            <div className="w-10 h-10 rounded bg-slate-100 grid grid-cols-3 gap-px p-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className={`rounded-[1px] ${i % 2 ? "bg-slate-300" : "bg-slate-700"}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        <button
          type="button"
          onClick={downloadPreviewPdf}
          disabled={downloading}
          className="flex-1 h-11 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-[#0077B6] hover:text-[#0077B6] active:scale-95 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
          data-testid="physical-card-download-pdf"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Descargar PDF de muestra
        </button>
        <button
          type="button"
          onClick={submitPrintOrder}
          disabled={printing}
          className="flex-1 h-11 rounded-full bg-gradient-to-r from-[#0077B6] to-[#03045E] text-white text-sm font-semibold hover:shadow-lg active:scale-95 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
          data-testid="physical-card-print-with-getamano"
        >
          {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
          Imprimir con getamano
        </button>
      </div>

      <p className="text-[11px] text-slate-500 text-center mt-3">
        Los datos se actualizan en vivo desde tu eCard. Cambia tu nombre, foto o ciudad y la tarjeta se imprime con la última versión.
      </p>
    </div>
  );
}
