import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Header";
import AddressAutocomplete from "../components/AddressAutocomplete";
import ImageUpload from "../components/ImageUpload";
import ChipInput from "../components/ChipInput";
import ServiceAreasInput from "../components/ServiceAreasInput";
import { Check, ChevronRight, ChevronLeft, Sparkles, Home, Building2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import BusinessCardScanner from "../components/BusinessCardScanner";
import AIDescriptionAssistant from "../components/AIDescriptionAssistant";
import { getRelatedCategories, normalizeCategoryKey } from "../data/categoryGroups";

const STEPS = [
  { id: "plan", title: "Elige tu plan" },
  { id: "info", title: "Datos de tu negocio" },
  { id: "location", title: "Ubicación" },
  { id: "services", title: "Servicios y horarios" },
  { id: "media", title: "Logo y galería" },
  { id: "review", title: "Revisar y publicar" },
];

export default function ProviderOnboarding() {
  const { user, loading: authLoading, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [plans, setPlans] = useState([]);
  const [categories, setCategories] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    selected_plan: "free",
    business_name: "", legal_name: "", category_id: "", additional_categories: [],
    description: "", phone: "", email: "", website: "",
    is_home_based: false,
    address: "", city: "", state: "", zip_code: "", latitude: null, longitude: null,
    languages: ["es", "en"], services: [], service_areas: [],
    hours: { mon: "9:00-18:00", tue: "9:00-18:00", wed: "9:00-18:00", thu: "9:00-18:00", fri: "9:00-18:00", sat: "Cerrado", sun: "Cerrado" },
    logo_url: "", cover_url: "", photos: [], gallery: [],
    social: {}, price_range: "$$",
    owner_identity: null,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    Promise.all([api.get("/plans"), api.get("/categories"), api.get("/providers/me")]).then(([pl, c, p]) => {
      setPlans(pl.data); setCategories(c.data);
      if (p.data) {
        // already onboarded
        navigate("/dashboard/provider", { replace: true });
      }
    });
  }, [user, authLoading, navigate]);

  const update = (k, v) => setForm(f => {
    // CAMBIO B — when the main category changes, clear the additional ones
    // because the previously-selected sub-services may belong to a different
    // vertical and would no longer be visible in the chip list.
    if (k === "category_id" && f.additional_categories?.length) {
      return { ...f, [k]: v, additional_categories: [] };
    }
    return { ...f, [k]: v };
  });
  const updateList = (k, v) => setForm(f => ({ ...f, [k]: v.split(",").map(s => s.trim()).filter(Boolean) }));
  const updateHour = (d, v) => setForm(f => ({ ...f, hours: { ...f.hours, [d]: v } }));

  const canNext = () => {
    if (step === 1) return form.business_name && form.category_id;
    if (step === 2 && !form.is_home_based) return form.city && form.state;
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = { ...form };
      delete payload.selected_plan;
      const { data } = await api.post("/providers", payload);
      if (form.selected_plan !== "free") {
        await api.post("/providers/me/plan", { plan: form.selected_plan }).catch(() => {});
      }
      await refresh();
      toast.success("¡Tu eCard está lista!");
      navigate(`/provider/${data.slug}`, { replace: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8" data-testid="provider-onboarding">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-8 overflow-x-auto" data-testid="onboarding-stepper">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? "bg-green-500 text-white" : i === step ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`w-6 md:w-12 h-0.5 ${i < step ? "bg-green-500" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900">{STEPS[step].title}</h1>

          {step === 0 && (
            <div className="mt-6 grid md:grid-cols-3 gap-4" data-testid="onboarding-plans">
              {plans.map(p => (
                <button
                  key={p.id} type="button"
                  onClick={() => update("selected_plan", p.id)}
                  className={`text-left p-5 rounded-2xl border-2 transition ${form.selected_plan === p.id ? "border-orange-500 bg-orange-50/50" : "border-slate-200 hover:border-slate-300"}`}
                  data-testid={`onboarding-plan-${p.id}`}
                >
                  {p.highlight && <Sparkles className="w-5 h-5 text-orange-500 mb-1" />}
                  <div className="font-display font-bold text-xl text-slate-900">{p.name}</div>
                  <div className="text-2xl font-display font-bold mt-1">${p.price_monthly}<span className="text-sm text-slate-500 font-normal">/mes</span></div>
                  <ul className="mt-3 space-y-1">
                    {p.features_es.slice(0, 3).map((f, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-start gap-1"><Check className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" /> {f}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="mt-6 space-y-4">
              {/* Section 18A — Card scanner CTA */}
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-dashed hover:bg-teal-50/50 transition group"
                style={{ borderColor: "#2F9D9466", backgroundColor: "#F0FDFA" }}
                data-testid="onboarding-open-scanner"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#025F6720" }}>
                  <ScanLine className="w-5 h-5" style={{ color: "#025F67" }} />
                </div>
                <div className="text-left flex-1">
                  <div className="text-sm font-semibold text-slate-900">¿Tienes tarjeta de presentación?</div>
                  <div className="text-xs text-slate-500">Escanea y llenamos el formulario por ti — ahorra 60 segundos.</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-700 transition" />
              </button>
              <Field label="Nombre del negocio *" value={form.business_name} onChange={v => update("business_name", v)} testid="onboarding-business-name" />
              <Field label="Nombre legal (LLC, Inc., etc.)" value={form.legal_name} onChange={v => update("legal_name", v)} testid="onboarding-legal-name" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoría principal *</label>
                <select value={form.category_id} onChange={e => update("category_id", e.target.value)} className="w-full h-12 px-4 rounded-xl border border-slate-200" data-testid="onboarding-category">
                  <option value="">Selecciona...</option>
                  {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.name_es}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Categorías adicionales (opcional)</label>
                <p className="text-xs text-slate-500 mb-2">Selecciona los servicios complementarios <strong>dentro de tu mismo giro</strong>.</p>
                {(() => {
                  const mainCat = categories.find(c => c.category_id === form.category_id);
                  const mainKey = mainCat ? (mainCat.name_es || "") : "";
                  const related = mainCat ? getRelatedCategories(mainKey) : [];
                  const relatedSet = new Set(related.map(normalizeCategoryKey));
                  // Filter the DB-known additional categories down to those whose
                  // name_es (or name_en) matches the vertical map. If nothing maps,
                  // fall back to showing nothing (better than showing irrelevant rubros).
                  const allowed = related.length
                    ? categories.filter(c => {
                        if (c.category_id === form.category_id) return false;
                        const es = normalizeCategoryKey(c.name_es || "");
                        const en = normalizeCategoryKey(c.name_en || "");
                        return relatedSet.has(es) || relatedSet.has(en);
                      })
                    : [];
                  if (!form.category_id) {
                    return <div className="text-xs text-slate-400 italic" data-testid="onboarding-addcat-empty-pick-main">Primero selecciona tu categoría principal.</div>;
                  }
                  if (allowed.length === 0) {
                    return <div className="text-xs text-slate-400 italic" data-testid="onboarding-addcat-empty-no-related">No hay servicios complementarios catalogados para este giro todavía.</div>;
                  }
                  return (
                    <div className="flex flex-wrap gap-2" data-testid="onboarding-addcat-list">
                      {allowed.map(c => {
                        const active = form.additional_categories.includes(c.category_id);
                        return (
                          <button
                            key={c.category_id} type="button"
                            onClick={() => update("additional_categories", active ? form.additional_categories.filter(x => x !== c.category_id) : [...form.additional_categories, c.category_id])}
                            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${active ? "bg-teal-600 text-white border-teal-600" : "bg-white border-slate-200 text-slate-700 hover:border-teal-400"}`}
                            data-testid={`onboarding-addcat-${c.slug}`}
                          >
                            {c.name_es}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                {form.category_id && (
                  <div className="mt-3 rounded-xl p-3 text-xs leading-relaxed" style={{ background: "rgba(2,95,103,0.06)", border: "1px solid rgba(2,95,103,0.15)", color: "#0F4D52" }} data-testid="onboarding-addcat-note">
                    💡 <strong>¿Tienes otro tipo de negocio diferente?</strong> Por ejemplo, si además de tu giro principal haces algo totalmente distinto, crea una <strong>segunda eCard separada</strong>. Cada perfil tiene su propia calificación y visibilidad.
                  </div>
                )}
              </div>
              <div>
                <Field label="Descripción corta" value={form.description} onChange={v => update("description", v)} textarea testid="onboarding-description" />
                <AIDescriptionAssistant
                  value={form.description}
                  category={form.category_slug}
                  businessName={form.business_name}
                  onAccept={(improved) => update("description", improved)}
                  testid="ai-description-assistant"
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Teléfono" value={form.phone} onChange={v => update("phone", v)} testid="onboarding-phone" type="tel" inputMode="tel" autoComplete="tel" />
                <Field label="Email de contacto" value={form.email} onChange={v => update("email", v)} testid="onboarding-email" type="email" inputMode="email" autoComplete="email" />
              </div>
              <Field label="Sitio web (opcional)" value={form.website} onChange={v => update("website", v)} testid="onboarding-website" type="url" inputMode="url" autoComplete="url" />
            </div>
          )}

          {step === 2 && (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => update("is_home_based", false)} className={`p-5 rounded-2xl border-2 text-left ${!form.is_home_based ? "border-blue-600 bg-blue-50/50" : "border-slate-200"}`} data-testid="onboarding-location-physical">
                  <Building2 className="w-6 h-6 text-blue-600 mb-2" />
                  <div className="font-semibold text-slate-900">Local físico</div>
                  <div className="text-xs text-slate-500 mt-1">Tienes una tienda, oficina o local</div>
                </button>
                <button type="button" onClick={() => update("is_home_based", true)} className={`p-5 rounded-2xl border-2 text-left ${form.is_home_based ? "border-orange-500 bg-orange-50/50" : "border-slate-200"}`} data-testid="onboarding-location-home">
                  <Home className="w-6 h-6 text-orange-500 mb-2" />
                  <div className="font-semibold text-slate-900">Desde casa / móvil</div>
                  <div className="text-xs text-slate-500 mt-1">Trabajas desde casa o visitas clientes</div>
                </button>
              </div>

              {!form.is_home_based && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dirección *</label>
                  <AddressAutocomplete
                    value={form.address}
                    onSelect={(a) => setForm(f => ({ ...f, ...a, address: a.address }))}
                    placeholder="Empieza a escribir tu dirección..."
                    testid="onboarding-address-autocomplete"
                  />
                  {form.city && <p className="text-xs text-slate-500 mt-2">Detectado: {form.address}, {form.city}, {form.state} {form.zip_code}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Zonas que cubres</label>
                <ServiceAreasInput
                  value={form.service_areas || []}
                  onChange={(arr) => setForm(f => ({ ...f, service_areas: arr }))}
                  stateFilter={form.state}
                  stateName={form.state}
                  testid="onboarding-service-areas"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Servicios ofrecidos</label>
                <ChipInput
                  value={form.services || []}
                  onChange={(arr) => setForm(f => ({ ...f, services: arr }))}
                  placeholder="ej. Limpieza profunda, presiona Enter o coma para añadir"
                  max={20}
                  testid="onboarding-services"
                />
                <p className="text-xs text-slate-400 mt-1">Escribe un servicio y presiona <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">Enter</kbd> o coma para añadirlo</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Horarios</label>
                <div className="grid md:grid-cols-2 gap-2">
                  {["mon","tue","wed","thu","fri","sat","sun"].map(d => (
                    <div key={d} className="flex items-center gap-2">
                      <span className="w-12 capitalize text-sm text-slate-600">{d}</span>
                      <input value={form.hours[d] || ""} onChange={e => updateHour(d, e.target.value)} className="flex-1 h-10 px-3 rounded-xl border border-slate-200" data-testid={`onboarding-hour-${d}`} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Idiomas de atención</label>
                <div className="flex gap-2">
                  {[["es", "Español"], ["en", "English"]].map(([code, label]) => {
                    const active = form.languages.includes(code);
                    return (
                      <button key={code} type="button" onClick={() => update("languages", active ? form.languages.filter(l => l !== code) : [...form.languages, code])} className={`px-4 py-2 rounded-full border ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-700"}`} data-testid={`onboarding-lang-${code}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">¿Cómo describes tu negocio? <span className="text-slate-400 font-normal">(opcional)</span></label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: "latino", label: "Dueño Latino", emoji: "🤝", bg: "#E1F5EE", color: "#025F67", border: "#A6E1DA" },
                    { id: "american", label: "Dueño Americano", emoji: "🤝", bg: "#E6F1FB", color: "#185FA5", border: "#BFD9F2" },
                    { id: null, label: "Prefiero no indicarlo", emoji: "", bg: "#F7F6F2", color: "#475569", border: "#BCC5CC" },
                  ].map(opt => {
                    const active = form.owner_identity === opt.id;
                    return (
                      <button
                        key={String(opt.id)}
                        type="button"
                        onClick={() => update("owner_identity", opt.id)}
                        className={`p-3 rounded-2xl border-2 text-left transition ${active ? "shadow-md scale-[1.02]" : "hover:border-slate-300"}`}
                        style={{ borderColor: active ? opt.color : opt.border, backgroundColor: active ? opt.bg : "white" }}
                        data-testid={`onboarding-owner-identity-${opt.id || "none"}`}
                      >
                        <div className="flex items-center gap-2">
                          {opt.emoji && <span className="text-lg">{opt.emoji}</span>}
                          <span className="font-medium text-sm" style={{ color: active ? opt.color : "#0F172A" }}>{opt.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-2">Es opcional y puedes cambiarlo después desde tu panel.</p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-6 grid md:grid-cols-2 gap-4">
              <ImageUpload label="Logo" value={form.logo_url} onChange={v => update("logo_url", v)} testid="onboarding-logo-upload" aspect="1/1" />
              <ImageUpload label="Portada" value={form.cover_url} onChange={v => update("cover_url", v)} testid="onboarding-cover-upload" aspect="16/9" />
              <p className="md:col-span-2 text-sm text-slate-500">Podrás agregar fotos de tus trabajos a la galería después de crear tu perfil.</p>
            </div>
          )}

          {step === 5 && (
            <div className="mt-6 space-y-3 text-sm">
              <Row label="Plan" value={plans.find(p => p.id === form.selected_plan)?.name} />
              <Row label="Negocio" value={form.business_name} />
              <Row label="Categoría" value={categories.find(c => c.category_id === form.category_id)?.name_es} />
              <Row label="Ubicación" value={form.is_home_based ? "Desde casa / móvil" : `${form.address}, ${form.city}, ${form.state}`} />
              <Row label="Servicios" value={form.services.join(", ") || "—"} />
              <Row label="Idiomas" value={form.languages.join(", ").toUpperCase()} />
              <p className="text-xs text-slate-500 pt-4 border-t border-slate-100">Tu perfil pasará a estado "Pendiente" hasta que getamano lo verifique. Mientras tanto, puedes editar todo desde tu panel.</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-slate-100">
            <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-outline disabled:opacity-30" data-testid="onboarding-prev">
              <ChevronLeft className="w-4 h-4 inline" /> Atrás
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => canNext() && setStep(step + 1)} disabled={!canNext()} className="btn-primary disabled:opacity-50" data-testid="onboarding-next">
                Siguiente <ChevronRight className="w-4 h-4 inline" />
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={submitting} className="btn-secondary" data-testid="onboarding-submit">
                {submitting ? "Publicando..." : "Publicar mi eCard"}
              </button>
            )}
          </div>
        </div>
      </main>
      <BusinessCardScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onExtracted={(ext) => {
          // Merge extracted fields into form, but only fill empty values so we
          // never override anything the user already typed.
          setForm(f => ({
            ...f,
            business_name: f.business_name || ext.business_name || "",
            legal_name: f.legal_name || ext.owner_name || "",
            phone: f.phone || ext.phone || "",
            email: f.email || ext.email || "",
            website: f.website || ext.website || "",
            city: f.city || ext.city || "",
            state: f.state || ext.state || "",
            zip_code: f.zip_code || ext.zip_code || "",
          }));
          toast.success("Datos importados de la tarjeta — revisa antes de continuar.");
        }}
      />
    </div>
  );
}

function Field({ label, value, onChange, textarea, testid, placeholder, type, inputMode, autoComplete }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {textarea
        ? <textarea value={value || ""} onChange={e => onChange(e.target.value)} rows={3} placeholder={placeholder} className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-blue-600" data-testid={testid} />
        : <input
            type={type || "text"}
            inputMode={inputMode}
            autoComplete={autoComplete}
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full h-12 px-4 rounded-xl border border-slate-200 outline-none focus:border-blue-600"
            data-testid={testid}
          />}
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 text-right max-w-md truncate">{value || "—"}</span>
    </div>
  );
}
