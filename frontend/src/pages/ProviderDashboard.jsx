import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { Eye, Phone, Star, ShieldCheck, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function ProviderDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    business_name: "", legal_name: "", category_id: "", description: "",
    phone: "", email: "", website: "", address: "", city: "", state: "", zip_code: "",
    languages: ["es", "en"], services: [], service_areas: [], hours: {},
    logo_url: "", cover_url: "", photos: [], social: {}, price_range: "quote",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    Promise.all([api.get("/categories"), api.get("/providers/me")]).then(([c, p]) => {
      setCategories(c.data);
      if (p.data) {
        setProfile(p.data);
        setForm({ ...form, ...p.data });
      }
    }).finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [user, authLoading]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateList = (k, v) => setForm(f => ({ ...f, [k]: v.split(",").map(s => s.trim()).filter(Boolean) }));
  const updateHours = (day, v) => setForm(f => ({ ...f, hours: { ...f.hours, [day]: v } }));

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (profile) {
        const { data } = await api.put("/providers/me", form);
        setProfile(data);
      } else {
        const { data } = await api.post("/providers", form);
        setProfile(data);
      }
      toast.success("Guardado");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">{t("common.loading")}</div>;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="provider-dashboard">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-slate-900">{t("dashboard.provider.title")}</h1>
            <p className="text-slate-500 mt-1">Hola, {user?.name}. Administra tu eCard.</p>
          </div>
          {profile && (
            <div className="flex items-center gap-2">
              <a href={`/services/${profile.slug}`} target="_blank" rel="noopener noreferrer" className="btn-outline flex items-center gap-1 text-sm" data-testid="view-public-ecard">
                Ver mi eCard <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Analytics */}
        {profile && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="stat-views">
              <div className="flex items-center gap-2 text-slate-500 text-sm"><Eye className="w-4 h-4" /> Vistas</div>
              <div className="font-display text-3xl font-bold mt-1 text-slate-900">{profile.views || 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="stat-clicks">
              <div className="flex items-center gap-2 text-slate-500 text-sm"><Phone className="w-4 h-4" /> Contactos</div>
              <div className="font-display text-3xl font-bold mt-1 text-slate-900">{profile.contact_clicks || 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="stat-rating">
              <div className="flex items-center gap-2 text-slate-500 text-sm"><Star className="w-4 h-4" /> Calificación</div>
              <div className="font-display text-3xl font-bold mt-1 text-slate-900">{(profile.rating_avg || 0).toFixed(1)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="stat-status">
              <div className="flex items-center gap-2 text-slate-500 text-sm"><ShieldCheck className="w-4 h-4" /> Estado</div>
              <div className="font-display text-base font-semibold mt-2 capitalize text-slate-900">{profile.verification_status}</div>
            </div>
          </div>
        )}

        <form onSubmit={onSave} className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-6" data-testid="provider-form">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-900 mb-4">Información del negocio</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Nombre del negocio *" value={form.business_name} onChange={v => update("business_name", v)} required testid="form-business-name" />
              <Field label="Nombre legal" value={form.legal_name} onChange={v => update("legal_name", v)} testid="form-legal-name" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoría *</label>
                <select required value={form.category_id} onChange={e => update("category_id", e.target.value)} className="w-full h-12 px-4 rounded-xl border border-slate-200" data-testid="form-category-select">
                  <option value="">Selecciona...</option>
                  {categories.map(c => <option key={c.category_id} value={c.category_id}>{lang === "es" ? c.name_es : c.name_en}</option>)}
                </select>
              </div>
              <Field label="Teléfono" value={form.phone} onChange={v => update("phone", v)} testid="form-phone" />
              <Field label="Email" value={form.email} onChange={v => update("email", v)} testid="form-email" />
              <Field label="Sitio web" value={form.website} onChange={v => update("website", v)} testid="form-website" />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
              <textarea value={form.description} onChange={e => update("description", e.target.value)} rows={4} className="w-full p-3 rounded-xl border border-slate-200" data-testid="form-description" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h2 className="font-display text-xl font-semibold text-slate-900 mb-4">Ubicación</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Dirección" value={form.address} onChange={v => update("address", v)} testid="form-address" />
              <Field label="Ciudad" value={form.city} onChange={v => update("city", v)} testid="form-city" />
              <Field label="Estado" value={form.state} onChange={v => update("state", v)} testid="form-state" />
              <Field label="ZIP" value={form.zip_code} onChange={v => update("zip_code", v)} testid="form-zip" />
            </div>
            <Field className="mt-4" label="Zonas de servicio (separadas por comas)" value={form.service_areas.join(", ")} onChange={v => updateList("service_areas", v)} testid="form-service-areas" />
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h2 className="font-display text-xl font-semibold text-slate-900 mb-4">Servicios e imágenes</h2>
            <Field label="Servicios ofrecidos (separados por comas)" value={form.services.join(", ")} onChange={v => updateList("services", v)} testid="form-services" />
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <Field label="URL del logo" value={form.logo_url} onChange={v => update("logo_url", v)} testid="form-logo-url" />
              <Field label="URL de la portada" value={form.cover_url} onChange={v => update("cover_url", v)} testid="form-cover-url" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h2 className="font-display text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2"><Clock className="w-5 h-5" /> Horarios</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {DAYS.map(d => (
                <div key={d} className="flex items-center gap-2">
                  <span className="w-12 capitalize text-sm text-slate-600">{d}</span>
                  <input value={form.hours[d] || ""} onChange={e => updateHours(d, e.target.value)} placeholder="ej. 9:00-17:00 o Cerrado" className="flex-1 h-10 px-3 rounded-xl border border-slate-200" data-testid={`form-hour-${d}`} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="submit" disabled={saving} className="btn-primary" data-testid="provider-save-button">
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </main>
      <Footer />
    </div>
  );
}

function Field({ label, value, onChange, required, className = "", testid }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input required={required} value={value || ""} onChange={e => onChange(e.target.value)} className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid={testid} />
    </div>
  );
}
