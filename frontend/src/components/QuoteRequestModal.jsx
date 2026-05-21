import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { X, ArrowRight, ArrowLeft, MessageCircle, Phone as PhoneIcon, Mail, Check } from "lucide-react";
import { toast } from "sonner";

const SIZES = [
  { id: "small",  emoji: "🟢", label: "Pequeño",  hint: "menos de 2 horas / trabajo sencillo" },
  { id: "medium", emoji: "🟡", label: "Mediano",  hint: "medio día / trabajo moderado" },
  { id: "large",  emoji: "🔴", label: "Grande",   hint: "día completo o más" },
];
const BUDGETS = [
  { id: "<100",     label: "Menos de $100" },
  { id: "100-300",  label: "$100 – $300" },
  { id: "300-700",  label: "$300 – $700" },
  { id: "700-1500", label: "$700 – $1,500" },
  { id: ">1500",    label: "Más de $1,500" },
  { id: "unknown",  label: "No lo sé todavía" },
];
const CONTACTS = [
  { id: "whatsapp", Icon: MessageCircle, label: "WhatsApp" },
  { id: "call",     Icon: PhoneIcon,     label: "Llamada" },
  { id: "email",    Icon: Mail,          label: "Email" },
];

export default function QuoteRequestModal({ open, provider, onClose }) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    description: "", category: provider?.category_name || "",
    project_size: "", requested_date: "", budget_range: "unknown",
    client_name: user?.name || "", client_phone: user?.phone || "", client_email: user?.email || "",
    preferred_contact: "whatsapp",
  });

  useEffect(() => {
    if (open) {
      setStep(1); setDone(false);
      setForm(f => ({ ...f, client_name: user?.name || "", client_phone: user?.phone || "", client_email: user?.email || "", category: provider?.category_name || "" }));
    }
  }, [open, user, provider]);

  if (!open) return null;

  const update = (k, v) => setForm({ ...form, [k]: v });
  const canNext = () => {
    if (step === 1) return form.description.trim().length >= 5;
    if (step === 2) return !!form.project_size;
    if (step === 3) return form.client_name && (form.client_phone || form.client_email);
    return false;
  };

  const submit = async () => {
    if (!provider?.provider_id) return;
    setSubmitting(true);
    try {
      await api.post("/quote-requests", { provider_id: provider.provider_id, ...form });
      setDone(true);
    } catch { toast.error("No se pudo enviar la solicitud"); }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose} data-testid="quote-modal">
      <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden my-6" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-slate-900">Pedir cotización</h3>
            <p className="text-xs text-slate-500">a {provider?.business_name || "este proveedor"}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center" data-testid="quote-modal-close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Progress */}
        {!done && (
          <div className="px-5 pt-4">
            <div className="flex items-center gap-2 mb-4">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex-1">
                  <div className={`h-1.5 rounded-full ${s <= step ? "bg-gradient-to-r from-orange-500 to-amber-400" : "bg-slate-200"}`} />
                  <div className={`mt-1 text-[10px] uppercase tracking-widest font-semibold ${s === step ? "text-orange-600" : "text-slate-400"}`}>Paso {s}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 pb-5">
          {done ? (
            <div className="py-8 text-center" data-testid="quote-success">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-3"><Check className="w-7 h-7 text-emerald-600" /></div>
              <h4 className="font-display text-xl font-bold text-slate-900">¡Solicitud enviada!</h4>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Tu solicitud fue enviada a <strong>{provider?.business_name}</strong>. Te contactarán pronto por <strong>{CONTACTS.find(c => c.id === form.preferred_contact)?.label}</strong>.
              </p>
              <button onClick={onClose} className="mt-5 btn-primary" data-testid="quote-close-success">¡Gracias!</button>
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-3" data-testid="quote-step-1">
                  <h4 className="font-display font-bold text-slate-900">Describe tu proyecto</h4>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">¿Qué necesitas?</label>
                    <textarea value={form.description} onChange={e => update("description", e.target.value)} rows={4} placeholder="Ej: Necesito limpiar un apartamento de 2 habitaciones antes de una mudanza..." className="w-full p-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none" data-testid="quote-description" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                    <input value={form.category} onChange={e => update("category", e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-200" data-testid="quote-category" />
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-4" data-testid="quote-step-2">
                  <h4 className="font-display font-bold text-slate-900">Detalles del trabajo</h4>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tamaño del proyecto</label>
                    <div className="space-y-2">
                      {SIZES.map(s => (
                        <button key={s.id} type="button" onClick={() => update("project_size", s.id)}
                          className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition ${form.project_size === s.id ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}
                          data-testid={`quote-size-${s.id}`}>
                          <span className="text-xl">{s.emoji}</span>
                          <div className="flex-1">
                            <div className="font-medium text-slate-900 text-sm">{s.label}</div>
                            <div className="text-xs text-slate-500">{s.hint}</div>
                          </div>
                          {form.project_size === s.id && <Check className="w-4 h-4 text-orange-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">¿Cuándo lo necesitas? <span className="text-slate-400 font-normal">(opcional)</span></label>
                    <input type="date" value={form.requested_date} onChange={e => update("requested_date", e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-200" data-testid="quote-date" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">¿Tienes un presupuesto en mente?</label>
                    <select value={form.budget_range} onChange={e => update("budget_range", e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-200" data-testid="quote-budget">
                      {BUDGETS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-3" data-testid="quote-step-3">
                  <h4 className="font-display font-bold text-slate-900">Tus datos de contacto</h4>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                    <input value={form.client_name} onChange={e => update("client_name", e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-200" data-testid="quote-name" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                      <input value={form.client_phone} onChange={e => update("client_phone", e.target.value)} placeholder="+1 555..." className="w-full h-11 px-3 rounded-xl border border-slate-200" data-testid="quote-phone" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <input value={form.client_email} onChange={e => update("client_email", e.target.value)} placeholder="tu@email.com" className="w-full h-11 px-3 rounded-xl border border-slate-200" data-testid="quote-email" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">¿Cómo prefieres que te contacten?</label>
                    <div className="grid grid-cols-3 gap-2">
                      {CONTACTS.map(c => (
                        <button key={c.id} type="button" onClick={() => update("preferred_contact", c.id)}
                          className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition ${form.preferred_contact === c.id ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                          data-testid={`quote-contact-${c.id}`}>
                          <c.Icon className="w-4 h-4" />
                          <span className="text-xs font-medium">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="mt-5 flex items-center justify-between gap-2">
                {step > 1 ? (
                  <button onClick={() => setStep(step - 1)} className="inline-flex items-center gap-1 px-4 py-2.5 rounded-full text-slate-600 hover:bg-slate-100 text-sm font-medium" data-testid="quote-back">
                    <ArrowLeft className="w-4 h-4" /> Atrás
                  </button>
                ) : <span />}
                {step < 3 ? (
                  <button onClick={() => setStep(step + 1)} disabled={!canNext()} className="btn-primary inline-flex items-center gap-1 disabled:opacity-50" data-testid="quote-next">
                    Siguiente <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={submit} disabled={!canNext() || submitting} className="btn-primary inline-flex items-center gap-1 disabled:opacity-50" data-testid="quote-submit">
                    {submitting ? "Enviando..." : "Enviar solicitud"} <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
