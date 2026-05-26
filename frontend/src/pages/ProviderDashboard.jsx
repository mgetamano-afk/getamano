import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import AddressAutocomplete from "../components/AddressAutocomplete";
import ImageUpload, { buildFileUrl } from "../components/ImageUpload";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { Eye, Phone, Star, ShieldCheck, ExternalLink, Home, Building2, MessageCircle, CreditCard, Image as ImageIcon, Settings, Trash2, Check, Inbox, Trophy, DollarSign, Calendar } from "lucide-react";
import { toast } from "sonner";
import ProviderGreeting from "../components/ProviderGreeting";
import MilestoneCelebration from "../components/MilestoneCelebration";
import AchievementJournal from "../components/AchievementJournal";
import ShareLinkCard from "../components/ShareLinkCard";
import ShareStatsCard from "../components/ShareStatsCard";
import ShareRewardsCard from "../components/ShareRewardsCard";
import ProviderRates from "../components/ProviderRates";
import MarketPulseCard from "../components/MarketPulseCard";
import DashboardGallery from "../components/DashboardGallery";
import ProfileCompletion from "../components/ProfileCompletion";
import ReferralsTab from "../components/ReferralsTab";
import LicenseSection from "../components/LicenseSection";
import InboxView from "../components/InboxView";
import CalendarTab from "../components/CalendarTab";
import SubscriptionManager from "../components/SubscriptionManager";
import ChambasNearby from "../components/ChambasNearby";
import WeeklyDigestPreview from "../components/WeeklyDigestPreview";
import ReferralPanel from "../components/ReferralPanel";
import StreakWidget from "../components/StreakWidget";
import LeaderboardWidget from "../components/LeaderboardWidget";
import CouponsCard from "../components/CouponsCard";
import ProviderLeftNav from "../components/ProviderLeftNav";  // eslint-disable-line no-unused-vars -- kept for fast rollback (Section 44)
import ECardPreviewModal from "../components/ECardPreviewModal";
import SmartSubcategoryPicker from "../components/SmartSubcategoryPicker";
import EcardHealth from "../components/EcardHealth";
import WeeklyHealthEmailPreview from "../components/WeeklyHealthEmailPreview";
import WaitingClientsBadge from "../components/WaitingClientsBadge";
import DescriptionFieldWithAI from "../components/DescriptionFieldWithAI";
import CitySearchInput from "../components/CitySearchInput";
import BusinessCardScanner from "../components/BusinessCardScanner";
import { ScanLine } from "lucide-react";
import { MAIN_CATEGORIES } from "../data/categoryMap";
import { US_STATES, getStateByAbbr } from "../data/usLocations";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TABS = [
  { id: "perfil", label: "Perfil", Icon: Settings },
  { id: "tarifas", label: "Mis Tarifas", Icon: DollarSign },
  { id: "galeria", label: "Galería", Icon: ImageIcon },
  { id: "citas", label: "Citas", Icon: Calendar },
  { id: "solicitudes", label: "Solicitudes", Icon: Inbox },
  { id: "mensajes", label: "Mensajes", Icon: MessageCircle },
  { id: "referidos", label: "Referidos", Icon: Trophy },
  { id: "diario", label: "Mi diario", Icon: Trophy },
  { id: "suscripcion", label: "Suscripción", Icon: CreditCard },
];

export default function ProviderDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [categories, setCategories] = useState([]);
  const [plans, setPlans] = useState([]);
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("perfil");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [ecardPreviewOpen, setEcardPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    Promise.all([
      api.get("/categories"),
      api.get("/providers/me"),
      api.get("/plans"),
      api.get("/messaging/unread-count").catch(() => ({ data: { unread: 0 } })),
    ]).then(([c, p, pl, u]) => {
      setCategories(c.data); setPlans(pl.data); setUnread(u.data.unread || 0);
      if (!p.data) { navigate("/provider/onboarding", { replace: true }); return; }
      setProfile(p.data);
      setForm(initForm(p.data));
    }).finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [user, authLoading]);

  // Poll unread count every 30s while dashboard is open
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      api.get("/messaging/unread-count").then(r => setUnread(r.data.unread || 0)).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [user]);

  const initForm = (p) => ({
    business_name: p.business_name || "", legal_name: p.legal_name || "",
    category_id: p.category_id || "", additional_categories: p.additional_categories || [],
    description: p.description || "",
    phone: p.phone || "", email: p.email || "", website: p.website || "",
    is_home_based: !!p.is_home_based,
    address: p.address || "", city: p.city || "", state: p.state || "", zip_code: p.zip_code || "",
    latitude: p.latitude, longitude: p.longitude,
    languages: p.languages || ["es"], services: p.services || [],
    service_areas: p.service_areas || [], hours: p.hours || {},
    logo_url: p.logo_url || "", cover_url: p.cover_url || "",
    photos: p.photos || [], gallery: p.gallery || [],
    social: p.social || {}, price_range: p.price_range || "quote",
    owner_identity: p.owner_identity ?? null,
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateList = (k, v) => setForm(f => ({ ...f, [k]: v.split(",").map(s => s.trim()).filter(Boolean) }));
  const updateHour = (d, v) => setForm(f => ({ ...f, hours: { ...f.hours, [d]: v } }));

  const onSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put("/providers/me", form);
      setProfile(data); setForm(initForm(data));
      toast.success("Guardado");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  const onGalleryUploaded = (item) => {
    setProfile(p => ({ ...p, gallery: [...(p.gallery || []), item] }));
  };

  const removeGalleryItem = async (id) => {
    try {
      await api.delete(`/providers/me/gallery/${id}`);
      setProfile(p => ({ ...p, gallery: p.gallery.filter(g => g.id !== id) }));
      toast.success("Foto eliminada");
    } catch { toast.error("Error"); }
  };

  const changePlan = async (planId) => {
    try {
      await api.post("/providers/me/plan", { plan: planId });
      setProfile(p => ({ ...p, plan: planId }));
      toast.success("Plan actualizado");
    } catch { toast.error("Error"); }
  };

  if (loading || !profile || !form) return <div className="min-h-screen flex items-center justify-center text-slate-500">{t("common.loading")}</div>;

  // Compute messaging unread badge via the dedicated endpoint
  // (set in the effect above; nothing to compute here.)

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Header />
      <ECardPreviewModal
        open={ecardPreviewOpen}
        onClose={() => setEcardPreviewOpen(false)}
        slug={profile?.slug}
      />
      <BusinessCardScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onExtracted={(fields) => {
          // Map Vision-extracted fields into the form. We only overwrite empty
          // fields so the provider's previous edits are preserved.
          setForm((prev) => {
            const next = { ...prev };
            const setIfEmpty = (k, v) => { if (v && !((next[k] || "").trim())) next[k] = v; };
            setIfEmpty("business_name", fields.business_name);
            setIfEmpty("phone", fields.phone);
            setIfEmpty("email", fields.email);
            setIfEmpty("website", fields.website);
            setIfEmpty("city", fields.city);
            setIfEmpty("state", fields.state);
            setIfEmpty("zip_code", fields.zip_code);
            return next;
          });
          toast.success("Campos rellenados desde la tarjeta. Revisa y guarda.");
        }}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8" data-testid="provider-dashboard">
        <MilestoneCelebration />

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:items-start">
          {/* Section 44 — Removed ProviderLeftNav (duplicate top menu).
              Single source of truth is the TABS bar below ("Dashboard / Mensajes /
              Citas / Solicitudes / Referidos / Mi Diario / Suscripción"). */}

          {/* COLUMNA CENTRO — Contenido principal scrolleable */}
          <section className="min-w-0 space-y-6" data-testid="provider-dashboard-center">
            <div className="animate-fadeSlideUp" style={{ animationDelay: "0ms" }}>
              <ProviderGreeting
                user={user}
                profile={profile}
                unreadMessages={unread}
                newRequests={(requests || []).filter(r => r.status === "pending" || r.status === "new").length}
              />
            </div>

            {/* Racha + Ranking lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeSlideUp" style={{ animationDelay: "80ms" }} data-testid="provider-dashboard-streak-ranking-row">
              <StreakWidget />
              <LeaderboardWidget />
            </div>

            {/* Pulso semanal (centro) */}
            <div className="animate-fadeSlideUp" style={{ animationDelay: "160ms" }}>
              <MarketPulseCard />
            </div>

            <div className="animate-fadeSlideUp" style={{ animationDelay: "200ms" }}>
              <ShareLinkCard slug={profile.slug} businessName={profile.business_name} />
              <ShareStatsCard />
              <ShareRewardsCard />
            </div>

            {/* Section 30 — Chambas board CTA + nearby teaser */}
            <div className="rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap animate-fadeSlideUp"
                 style={{ background: "linear-gradient(135deg, rgba(2,95,103,0.06) 0%, rgba(47,157,148,0.10) 100%)", border: "1px solid rgba(2,95,103,0.18)", animationDelay: "240ms" }}
                 data-testid="provider-dashboard-chambas-promo">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
                     style={{ background: "rgba(255,107,44,0.15)", color: "#C2410C" }}>
                  Nuevo · Beta
                </div>
                <h3 className="font-display font-bold text-slate-900 text-lg mt-2 leading-tight">
                  ¿Necesitas ayuda extra esta semana?
                </h3>
                <p className="text-sm text-slate-600 mt-1 max-w-xl">
                  Publica una <strong>chamba temporal</strong> y recibe propuestas de otros proveedores latinos verificados. O aplica tú a chambas abiertas para sumar ingresos extra.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link to="/empleos" target="_blank" className="px-4 py-2.5 rounded-full text-white text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap shadow-sm"
                      style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
                      data-testid="provider-dashboard-publish-chamba">
                  Publicar chamba →
                </Link>
                <Link to="/empleos" className="px-4 py-2.5 rounded-full text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:border-teal-500 inline-flex items-center justify-center gap-2 whitespace-nowrap"
                      data-testid="provider-dashboard-browse-chambas">
                  Ver chambas activas
                </Link>
              </div>
            </div>

            <div className="animate-fadeSlideUp" style={{ animationDelay: "280ms" }}>
              <ChambasNearby city={profile.city} role="provider" limit={3} />
            </div>

            <div className="animate-fadeSlideUp" style={{ animationDelay: "320ms" }}>
              <WeeklyDigestPreview />
            </div>

            {/* Mobile-only: mirror del sidebar derecho al final */}
            <div className="lg:hidden space-y-6" data-testid="provider-dashboard-mobile-sidebar-mirror">
              <WaitingClientsBadge />
              <EcardHealth />
              <WeeklyHealthEmailPreview />
              <CouponsCard />
              <ReferralPanel />
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4 pt-2 animate-fadeSlideUp" style={{ animationDelay: "360ms" }}>
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">Tu panel de control</h2>
            <p className="text-slate-500 text-sm mt-0.5">Gestiona tu negocio, tus clientes y tu eCard.</p>
          </div>
          <button
            type="button"
            onClick={() => setEcardPreviewOpen(true)}
            className="btn-outline flex items-center gap-1 text-sm"
            data-testid="view-public-ecard"
          >
            Ver mi eCard <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* SECTION 16A — Profile Completion */}
        <ProfileCompletion onTabChange={setTab} />

        {/* Analytics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Eye} label="Vistas" value={profile.views || 0} color="text-blue-600" testid="stat-views" />
          <StatCard icon={Phone} label="Contactos" value={profile.contact_clicks || 0} color="text-orange-500" testid="stat-clicks" />
          <StatCard icon={Star} label="Calificación" value={(profile.rating_avg || 0).toFixed(1)} color="text-yellow-500" testid="stat-rating" />
          <StatCard icon={ShieldCheck} label="Estado" value={profile.verification_status} color="text-green-600" capitalize testid="stat-status" />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex overflow-x-auto border-b border-slate-100" data-testid="dashboard-tabs">
            {TABS.map(tt => (
              <button
                key={tt.id}
                onClick={() => setTab(tt.id)}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition flex-shrink-0 ${tab === tt.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-900"}`}
                data-testid={`dashboard-tab-${tt.id}`}
              >
                <tt.Icon className="w-4 h-4" /> {tt.label}
                {tt.id === "mensajes" && unread > 0 && <span className="ml-1 bg-orange-500 text-white text-xs rounded-full px-2 py-0.5">{unread}</span>}
              </button>
            ))}
          </div>

          <div className="p-6 md:p-8">
            {tab === "perfil" && (
              <form onSubmit={onSave} className="space-y-8" data-testid="provider-form">
                {/* Media row */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <ImageUpload label="Logo" value={form.logo_url} onChange={v => update("logo_url", v)} testid="form-logo-upload" aspect="1/1" />
                  </div>
                  <div className="md:col-span-2">
                    <ImageUpload label="Portada" value={form.cover_url} onChange={v => update("cover_url", v)} testid="form-cover-upload" aspect="16/9" />
                  </div>
                </div>

                <Section title="Información del negocio">
                  {/* Section 18A — scan a business card to auto-fill fields */}
                  <div className="md:col-span-2 -mt-2 mb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setScannerOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline"
                      data-testid="provider-scan-card-btn"
                    >
                      <ScanLine className="w-4 h-4" /> Escanear tarjeta de negocio
                    </button>
                  </div>
                  <Field label="Nombre del negocio *" value={form.business_name} onChange={v => update("business_name", v)} required testid="form-business-name" />
                  <Field label="Nombre legal" value={form.legal_name} onChange={v => update("legal_name", v)} testid="form-legal-name" />
                  <SelectField label="Categoría principal *" value={form.category_id} onChange={v => update("category_id", v)} options={categories.filter(c => MAIN_CATEGORIES.includes(c.name_es)).sort((a, b) => MAIN_CATEGORIES.indexOf(a.name_es) - MAIN_CATEGORIES.indexOf(b.name_es)).map(c => ({ value: c.category_id, label: lang === "es" ? c.name_es : c.name_en }))} testid="form-category-select" />
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Categorías adicionales <span className="text-slate-400 font-normal">(opcional)</span></label>
                    <p className="text-xs text-slate-500 mb-3">Agrega las especializaciones específicas que ofreces dentro de tu categoría.</p>
                    <SmartSubcategoryPicker
                      mainCategory={categories.find(c => c.category_id === form.category_id)?.name_es || ""}
                      selectedSubs={form.additional_categories || []}
                      onChange={subs => update("additional_categories", subs)}
                    />
                  </div>
                  <Field label="Teléfono" value={form.phone} onChange={v => update("phone", v)} testid="form-phone" />
                  <Field label="Email" value={form.email} onChange={v => update("email", v)} testid="form-email" />
                  <Field label="Sitio web" value={form.website} onChange={v => update("website", v)} testid="form-website" />
                  <div className="md:col-span-2">
                    <DescriptionFieldWithAI
                      value={form.description}
                      onChange={(v) => update("description", v)}
                      mainCategory={categories.find((c) => c.category_id === form.category_id)?.name_es || ""}
                      subcategories={form.additional_categories || []}
                      businessName={form.business_name}
                      city={form.city}
                      state={form.state}
                      lang={lang}
                    />
                  </div>
                </Section>

                <Section title="Identidad del negocio (opcional)">
                  <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                          className={`p-3 rounded-2xl border-2 text-left transition ${active ? "shadow-sm" : "hover:border-slate-300"}`}
                          style={{ borderColor: active ? opt.color : opt.border, backgroundColor: active ? opt.bg : "white" }}
                          data-testid={`form-owner-identity-${opt.id || "none"}`}
                        >
                          <div className="flex items-center gap-2">
                            {opt.emoji && <span className="text-lg">{opt.emoji}</span>}
                            <span className="font-medium text-sm" style={{ color: active ? opt.color : "#0F172A" }}>{opt.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="md:col-span-2 text-xs text-slate-500">getamano sirve a toda la comunidad latina. Esta selección es opcional, sin banderas ni etiquetas por país.</p>
                </Section>

                <Section title="Tipo de operación y ubicación">
                  <div className="md:col-span-2 grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => update("is_home_based", false)} className={`p-4 rounded-2xl border-2 text-left ${!form.is_home_based ? "border-blue-600 bg-blue-50/50" : "border-slate-200"}`} data-testid="loc-physical">
                      <Building2 className="w-5 h-5 text-blue-600 mb-1" />
                      <div className="font-medium text-slate-900 text-sm">Local físico</div>
                    </button>
                    <button type="button" onClick={() => update("is_home_based", true)} className={`p-4 rounded-2xl border-2 text-left ${form.is_home_based ? "border-orange-500 bg-orange-50/50" : "border-slate-200"}`} data-testid="loc-home">
                      <Home className="w-5 h-5 text-orange-500 mb-1" />
                      <div className="font-medium text-slate-900 text-sm">Desde casa / móvil</div>
                    </button>
                  </div>
                  {!form.is_home_based && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Buscar dirección</label>
                      <AddressAutocomplete
                        value={form.address}
                        onSelect={(a) => setForm(f => ({ ...f, ...a, address: a.address }))}
                        placeholder="Escribe tu dirección..."
                        testid="form-address-autocomplete"
                      />
                    </div>
                  )}
                  {!form.is_home_based && (
                    <>
                      <Field label="Dirección" value={form.address} onChange={v => update("address", v)} testid="form-address" />
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
                        <select
                          value={form.state || ""}
                          onChange={(e) => { update("state", e.target.value); if (e.target.value !== form.state) update("city", ""); }}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                          data-testid="form-state"
                        >
                          <option value="">Selecciona un estado</option>
                          {US_STATES.map((s) => (
                            <option key={s.abbreviation} value={s.abbreviation}>{s.name} ({s.abbreviation})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Ciudad o pueblo</label>
                        <CitySearchInput
                          stateFilter={form.state}
                          stateName={getStateByAbbr(form.state)?.name || ""}
                          value={form.city}
                          onChange={(city, _state, stateAbbr) => {
                            update("city", city);
                            if (stateAbbr && stateAbbr !== form.state) update("state", stateAbbr);
                          }}
                        />
                        {form.city && form.state && (
                          <div className="flex items-center gap-2 mt-2 bg-teal-50 border border-teal-100 rounded-lg px-3 py-1.5" data-testid="location-confirmation">
                            <span className="text-sm">📍</span>
                            <span className="text-xs text-teal-700 font-medium">{form.city}, {form.state}</span>
                            <button type="button" onClick={() => update("city", "")} className="ml-auto text-teal-400 hover:text-teal-600 text-[11px] underline">Cambiar</button>
                          </div>
                        )}
                      </div>
                      <Field label="ZIP" value={form.zip_code} onChange={v => update("zip_code", v)} testid="form-zip" />
                    </>
                  )}
                  <Field full label="Zonas de servicio (separadas por comas)" value={(form.service_areas || []).join(", ")} onChange={v => updateList("service_areas", v)} testid="form-service-areas" />
                </Section>

                <Section title="Servicios y horarios">
                  <Field full label="Servicios ofrecidos (separados por comas)" value={(form.services || []).join(", ")} onChange={v => updateList("services", v)} testid="form-services" />
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Horarios</label>
                    <div className="grid md:grid-cols-2 gap-2">
                      {DAYS.map(d => (
                        <div key={d} className="flex items-center gap-2">
                          <span className="w-12 capitalize text-sm text-slate-600">{d}</span>
                          <input value={form.hours[d] || ""} onChange={e => updateHour(d, e.target.value)} placeholder="ej. 9:00-17:00 o Cerrado" className="flex-1 h-10 px-3 rounded-xl border border-slate-200" data-testid={`form-hour-${d}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Idiomas de atención</label>
                    <div className="flex gap-2">
                      {[["es", "Español"], ["en", "English"]].map(([code, label]) => {
                        const active = form.languages.includes(code);
                        return (
                          <button key={code} type="button" onClick={() => update("languages", active ? form.languages.filter(l => l !== code) : [...form.languages, code])} className={`px-4 py-2 rounded-full border ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-700"}`} data-testid={`form-lang-${code}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Section>

                <Section title="Redes sociales (opcional)">
                  <div className="md:col-span-2 text-xs text-slate-500 mb-1">Solo tu usuario (ej. <code>migrand_negocio</code>) — sin la @. También puedes pegar la URL completa.</div>
                  <Field label="Instagram" value={form.social?.instagram || ""} onChange={v => update("social", { ...form.social, instagram: v })} placeholder="mi_negocio" testid="form-social-instagram" />
                  <Field label="Facebook" value={form.social?.facebook || ""} onChange={v => update("social", { ...form.social, facebook: v })} placeholder="mipaginafb" testid="form-social-facebook" />
                  <Field label="TikTok" value={form.social?.tiktok || ""} onChange={v => update("social", { ...form.social, tiktok: v })} placeholder="mi_negocio_tk" testid="form-social-tiktok" />
                  <Field label="YouTube" value={form.social?.youtube || ""} onChange={v => update("social", { ...form.social, youtube: v })} placeholder="canalYT o URL" testid="form-social-youtube" />
                  <Field label="LinkedIn" value={form.social?.linkedin || ""} onChange={v => update("social", { ...form.social, linkedin: v })} placeholder="usuario-li" testid="form-social-linkedin" />
                </Section>

                {/* SECTION 15 — Licencia */}
                <LicenseSection profile={profile} setProfile={setProfile} />

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                  <button type="submit" disabled={saving} className="btn-primary" data-testid="provider-save-button">
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </form>
            )}

            {tab === "galeria" && (
              <DashboardGallery profile={profile} setProfile={setProfile} />
            )}

            {tab === "citas" && (
              <CalendarTab />
            )}

            {tab === "solicitudes" && (
              <div data-testid="dashboard-requests">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-display font-semibold text-lg text-slate-900">Solicitudes de cotización</h3>
                    <p className="text-sm text-slate-500">{requests.filter(r => r.status === "pending").length} pendientes</p>
                  </div>
                  <Link to="/requests" className="btn-outline text-sm">Ver todas</Link>
                </div>
                {requests.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-500">
                    <Inbox className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p>Aún no recibes solicitudes.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
                    {requests.slice(0, 5).map(r => (
                      <Link key={r.request_id} to="/requests" className="block p-4 hover:bg-slate-50">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-slate-900 text-sm">{r.client_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "pending" ? "bg-yellow-50 text-yellow-700" : r.status === "accepted" ? "bg-blue-50 text-blue-700" : r.status === "completed" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{r.status}</span>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-1">{r.message}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "mensajes" && (
              <InboxView currentUser={user} />
            )}

            {tab === "referidos" && (
              <ReferralsTab />
            )}

            {tab === "tarifas" && (
              <ProviderRates plan={profile?.plan} />
            )}

            {tab === "diario" && (
              <AchievementJournal businessNameProp={profile?.business_name} logoUrl={profile?.logo_url} />
            )}

            {tab === "suscripcion" && (
              <div data-testid="dashboard-subscription" className="space-y-6">
                {/* Subscription Manager — current plan + cancel/reactivate */}
                <SubscriptionManager />

                {/* Plan picker grid (legacy beta mode — change plan without payment) */}
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">Cambios libres durante la beta</div>
                    <div className="text-xs text-slate-500">El cobro real con Stripe estará disponible próximamente. Mientras tanto, puedes cambiar de plan sin costo.</div>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {plans.map(p => (
                    <div key={p.id} className={`rounded-2xl border-2 p-5 ${p.highlight ? "border-orange-500" : "border-slate-200"} ${profile.plan === p.id ? "ring-2 ring-blue-500" : ""}`} data-testid={`sub-plan-${p.id}`}>
                      <div className="font-display font-bold text-xl text-slate-900">{p.name}</div>
                      <div className="text-2xl font-display font-bold mt-1">${p.price_monthly}<span className="text-sm text-slate-500 font-normal">/mes</span></div>
                      <ul className="mt-3 space-y-1 min-h-[120px]">
                        {p.features_es.slice(0, 4).map((f) => <li key={f} className="text-xs text-slate-600 flex items-start gap-1"><Check className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />{f}</li>)}
                      </ul>
                      <button
                        onClick={() => changePlan(p.id)}
                        disabled={profile.plan === p.id}
                        className={`mt-4 w-full ${profile.plan === p.id ? "bg-slate-100 text-slate-400 cursor-default" : p.highlight ? "btn-secondary" : "btn-primary"} text-sm justify-center`}
                        data-testid={`sub-choose-${p.id}`}
                      >
                        {profile.plan === p.id ? "Plan actual" : "Cambiar a este plan"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* fin tabs panel (center) */}
          </section>

          {/* COLUMNA DERECHA — Sidebar sticky con Urgente + Salud + Recompensas + Referidos */}
          <aside
            className="hidden lg:flex lg:flex-col lg:gap-4 lg:sticky lg:top-20 lg:self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 [&_li]:!flex-col [&_li]:!items-stretch [&_li]:!gap-2"
            data-testid="provider-dashboard-right-sidebar"
          >
            <div className="animate-fadeSlideUp" style={{ animationDelay: "40ms" }}>
              <WaitingClientsBadge />
            </div>
            <div className="animate-fadeSlideUp" style={{ animationDelay: "80ms" }}>
              <EcardHealth />
            </div>
            <div className="animate-fadeSlideUp" style={{ animationDelay: "140ms" }}>
              <WeeklyHealthEmailPreview />
            </div>
            <div className="animate-fadeSlideUp" style={{ animationDelay: "200ms" }}>
              <CouponsCard />
            </div>
            <div className="animate-fadeSlideUp" style={{ animationDelay: "260ms" }}>
              <ReferralPanel />
            </div>
          </aside>
        </div>
        {/* fin 3-column grid */}
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, capitalize, testid }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid={testid}>
      <div className={`flex items-center gap-2 text-sm ${color}`}><Icon className="w-4 h-4" /> <span className="text-slate-500">{label}</span></div>
      <div className={`font-display text-3xl font-bold mt-1 text-slate-900 ${capitalize ? "text-base capitalize mt-2" : ""}`}>{value}</div>
    </div>
  );
}
function Field({ label, value, onChange, required, testid, textarea, full, placeholder }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {textarea
        ? <textarea required={required} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-600 outline-none" data-testid={testid} />
        : <input required={required} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid={testid} />}
    </div>
  );
}
function SelectField({ label, value, onChange, options, testid }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full h-12 px-4 rounded-xl border border-slate-200" data-testid={testid}>
        <option value="">Selecciona...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div>
      <h3 className="font-display text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="grid md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}
