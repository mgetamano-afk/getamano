import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { DollarSign, Plus, Trash2, Save, TrendingUp, TrendingDown, Minus, Lock } from "lucide-react";
import { toast } from "sonner";

const PRICE_TYPES = [
  { id: "por_hora", label: "Por hora" },
  { id: "por_proyecto", label: "Por proyecto" },
  { id: "por_visita", label: "Por visita" },
  { id: "por_pie_cuadrado", label: "Por pie cuadrado" },
  { id: "precio_fijo", label: "Precio fijo" },
  { id: "a_consultar", label: "A consultar" },
];

export const formatRate = (r) => {
  const t = PRICE_TYPES.find(p => p.id === r.price_type)?.label.toLowerCase() || r.price_type;
  if (r.price_type === "a_consultar") return "A consultar";
  if (r.price_min && r.price_max) return `Desde $${r.price_min} – $${r.price_max} ${t}`;
  if (r.price_min) return `Desde $${r.price_min} ${t}`;
  return t;
};

function emptyRate() { return { service_name: "", price_type: "por_proyecto", price_min: "", price_max: "", unit_note: "" }; }

export default function ProviderRates({ plan }) {
  const [rates, setRates] = useState([emptyRate()]);
  const [saving, setSaving] = useState(false);
  const [benchmark, setBenchmark] = useState(null);

  useEffect(() => {
    api.get("/providers/me/rates").then(r => {
      const list = r.data?.rates || [];
      setRates(list.length ? list : [emptyRate()]);
    }).catch(() => {});
    if (plan === "premium") {
      api.get("/providers/me/benchmark").then(r => setBenchmark(r.data)).catch(() => {});
    }
  }, [plan]);

  const updateRow = (i, field, val) => {
    const copy = [...rates];
    copy[i] = { ...copy[i], [field]: val };
    setRates(copy);
  };
  const removeRow = (i) => setRates(rates.filter((_, idx) => idx !== i));
  const addRow = () => { if (rates.length < 10) setRates([...rates, emptyRate()]); };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        rates: rates
          .filter(r => r.service_name?.trim())
          .map(r => ({
            service_name: r.service_name.trim(),
            price_type: r.price_type,
            price_min: r.price_min !== "" ? parseFloat(r.price_min) : null,
            price_max: r.price_max !== "" ? parseFloat(r.price_max) : null,
            unit_note: r.unit_note || "",
          })),
      };
      const r = await api.put("/providers/me/rates", payload);
      const list = r.data?.rates || [];
      setRates(list.length ? list : [emptyRate()]);
      toast.success("Tarifas guardadas");
      // Refresh benchmark
      if (plan === "premium") api.get("/providers/me/benchmark").then(r => setBenchmark(r.data)).catch(() => {});
    } catch { toast.error("No se pudo guardar"); }
    setSaving(false);
  };

  return (
    <div className="space-y-6" data-testid="provider-rates">
      <div className="rounded-3xl p-5 md:p-6" style={{ background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)" }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-orange-500 flex items-center justify-center"><DollarSign className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">Mis Tarifas</h2>
            <p className="text-xs text-slate-600">Los proveedores con tarifas visibles reciben 3x más solicitudes.</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {rates.map((r, i) => (
          <div key={i} className="rounded-2xl bg-white border border-slate-100 p-4" data-testid={`rate-row-${i}`}>
            <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1.5fr_auto] gap-2 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Servicio</label>
                <input value={r.service_name || ""} onChange={e => updateRow(i, "service_name", e.target.value)} placeholder="ej. Limpieza residencial básica" className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" data-testid={`rate-name-${i}`} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Tipo</label>
                <select value={r.price_type} onChange={e => updateRow(i, "price_type", e.target.value)} className="w-full h-10 px-2 rounded-lg border border-slate-200 text-sm" data-testid={`rate-type-${i}`}>
                  {PRICE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">$ Mín</label>
                <input type="number" min="0" value={r.price_min ?? ""} onChange={e => updateRow(i, "price_min", e.target.value)} placeholder="80" className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" data-testid={`rate-min-${i}`} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">$ Máx</label>
                <input type="number" min="0" value={r.price_max ?? ""} onChange={e => updateRow(i, "price_max", e.target.value)} placeholder="130" className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" data-testid={`rate-max-${i}`} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Nota</label>
                <input value={r.unit_note || ""} onChange={e => updateRow(i, "unit_note", e.target.value)} placeholder="incluye materiales..." className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" data-testid={`rate-note-${i}`} />
              </div>
              <button onClick={() => removeRow(i)} className="h-10 w-10 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center" data-testid={`rate-remove-${i}`} aria-label="Eliminar">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={addRow} disabled={rates.length >= 10} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium disabled:opacity-50" data-testid="rate-add">
          <Plus className="w-4 h-4" /> Agregar tarifa
        </button>
        <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-1.5" data-testid="rate-save">
          <Save className="w-4 h-4" /> {saving ? "Guardando..." : "Guardar tarifas"}
        </button>
      </div>

      {/* Premium benchmark */}
      {plan === "premium" ? (
        <BenchmarkCard benchmark={benchmark} />
      ) : (
        <BenchmarkLocked plan={plan} />
      )}
    </div>
  );
}

function BenchmarkCard({ benchmark }) {
  if (!benchmark) return null;
  const { available, reason, position, message, peer_avg_min, peer_avg_max, own_avg_min, own_avg_max, category, city, sample_size, diff_pct } = benchmark;
  const Icon = position === "below" ? TrendingDown : position === "above" ? TrendingUp : Minus;
  const color = position === "below" ? "text-orange-600" : position === "above" ? "text-blue-600" : "text-emerald-600";

  return (
    <div className="rounded-3xl p-5 md:p-6 border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50/60 via-white to-amber-50/40" data-testid="benchmark-card">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-fuchsia-600" />
        <h3 className="font-display font-bold text-slate-900">Comparativa de mercado</h3>
        <span className="text-[10px] uppercase tracking-widest font-bold text-fuchsia-700 bg-fuchsia-100 px-2 py-0.5 rounded-full">Premium</span>
      </div>
      {!available ? (
        <p className="text-sm text-slate-600">
          {reason === "no_rates" && "Agrega tus tarifas arriba para ver cómo te comparas con otros proveedores en tu ciudad."}
          {reason === "not_enough_data" && "Aún estamos recopilando datos de tu área. Vuelve pronto para ver tu comparativa."}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Categoría: <strong>{category}</strong> · Ciudad: <strong>{city}</strong>{sample_size ? ` · Basado en ${sample_size} proveedores` : ""}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white border border-slate-100 p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Promedio en tu ciudad</div>
              <div className="font-display text-lg font-bold text-slate-900">${peer_avg_min} – ${peer_avg_max}</div>
            </div>
            <div className="rounded-2xl bg-white border border-slate-100 p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Tu tarifa actual</div>
              <div className="font-display text-lg font-bold text-slate-900">${Math.round(own_avg_min)} – ${Math.round(own_avg_max)}</div>
            </div>
          </div>
          <div className={`flex items-start gap-2 rounded-2xl bg-white border border-slate-100 p-3 ${color}`}>
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700 leading-relaxed"><strong>{diff_pct >= 0 ? "+" : ""}{diff_pct}%</strong> respecto al promedio. {message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function BenchmarkLocked({ plan }) {
  return (
    <div className="rounded-3xl p-5 md:p-6 border-2 border-dashed border-slate-200 bg-slate-50/60 text-center" data-testid="benchmark-locked">
      <Lock className="w-6 h-6 mx-auto text-slate-400 mb-2" />
      <h3 className="font-display font-bold text-slate-900">Comparativa de mercado</h3>
      <p className="text-sm text-slate-500 mt-1">Disponible para plan Premium. Mira cómo te comparas con otros proveedores en tu ciudad.</p>
      <a href="/plans" className="inline-block mt-3 text-sm text-orange-600 font-medium hover:underline">Ver Plan Premium →</a>
    </div>
  );
}
