import { useEffect, useState, createElement } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import AddressAutocomplete from "../components/AddressAutocomplete";
import ImageUpload, { buildFileUrl } from "../components/ImageUpload";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { Eye, Phone, Star, ShieldCheck, ExternalLink, Home, Building2, MessageCircle, CreditCard, Image as ImageIcon, Settings, Trash2, Check, Inbox, Trophy, DollarSign, Calendar, Sparkles, ChevronRight, Menu } from "lucide-react";
import { toast } from "sonner";
import ProviderGreeting from "../components/ProviderGreeting";
import ProviderSideNav from "../components/ProviderSideNav";
import MiRedPage from "./MiRedPage";
import MilestoneCelebration from "../components/MilestoneCelebration";
import AchievementJournal from "../components/AchievementJournal";
import ShareLinkCard from "../components/ShareLinkCard";
import ShareStatsCard from "../components/ShareStatsCard";
import ShareRewardsCard from "../components/ShareRewardsCard";
import ProviderRates from "../components/ProviderRates";
import MarketPulseCard from "../components/MarketPulseCard";
import UploadPhotoBanner from "../components/UploadPhotoBanner";
import DashboardGallery from "../components/DashboardGallery";
import ProfileCompletion from "../components/ProfileCompletion";
import ReferralsTab from "../components/ReferralsTab";
import LicenseSection from "../components/LicenseSection";
import ProviderPreferences from "../components/ProviderPreferences";
import GMCodeBadge from "../components/GMCodeBadge";
import Portfolio from "../components/Portfolio";
import TrustScore from "../components/TrustScore";
import LeadPipeline from "../components/LeadPipeline";
import DashboardHomeV7 from "../components/DashboardHomeV7";
import PhysicalCardsPanel from "../components/PhysicalCardsPanel";
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
import BannerGenerator from "../components/BannerGenerator";
import SmartSubcategoryPicker from "../components/SmartSubcategoryPicker";
import CategoryTreePicker from "../components/CategoryTreePicker";
import EcardHealth from "../components/EcardHealth";
import WeeklyHealthEmailPreview from "../components/WeeklyHealthEmailPreview";
import WaitingClientsBadge from "../components/WaitingClientsBadge";
import DescriptionFieldWithAI from "../components/DescriptionFieldWithAI";
import CitySearchInput from "../components/CitySearchInput";
import ChipInput from "../components/ChipInput";
import ServiceAreasInput from "../components/ServiceAreasInput";
import BusinessCardScanner from "../components/BusinessCardScanner";
import ProfileVersionsPanel from "../components/ProfileVersionsPanel";
import EcardsManagerPanel from "../components/EcardsManagerPanel";
import VerificationCenter from "../components/VerificationCenter";
import { ScanLine, History } from "lucide-react";
import { MAIN_CATEGORIES } from "../data/categoryMap";
import { US_STATES, getStateByAbbr } from "../data/usLocations";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Section V13 — Mobile top-bar label resolution. The TAB_KEYS list went
// away with the horizontal strip; we use a flat map so the mobile header
// can show the active tab name without re-importing the sidebar groups.
const MOBILE_TAB_LABELS = {
  dashboard:    { es: "Inicio",        en: "Home" },
  perfil:       { es: "Mi perfil",     en: "My profile" },
  ecard:        { es: "Mis eCards",    en: "My eCards" },
  galeria:      { es: "Portafolio",    en: "Portfolio" },
  banner:       { es: "Banner Pro",    en: "Banner Pro" },
  reels:        { es: "Mis Reels",     en: "My Reels" },
  analytics:    { es: "Analytics",     en: "Analytics" },
  mensajes:     { es: "Mensajes",      en: "Messages" },
  solicitudes:  { es: "Solicitudes",   en: "Requests" },
  citas:        { es: "Citas",         en: "Appointments" },
  tarifas:      { es: "Mis tarifas",   en: "Pricing" },
  destacar:     { es: "Destacarme",    en: "Feature me" },
  red:          { es: "Referidos",     en: "Referrals" },
  diario:       { es: "Mi diario",     en: "My diary" },
  tarjetas:     { es: "Tarjetas físicas", en: "Physical cards" },
  preferencias: { es: "Preferencias",  en: "Preferences" },
  verificarme:  { es: "Verificarme",   en: "Get verified" },
  versiones:    { es: "Versiones",     en: "Versions" },
};
const CURRENT_TAB_LABEL = (tab, lang) =>
  (MOBILE_TAB_LABELS[tab] || { es: "Dashboard", en: "Dashboard" })[lang === "en" ? "en" : "es"];

export default function ProviderDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  // Section 74 BUG-6 / Section 75 — `/wallet`, `/referrals`, `/referidos` and
  // any other shortcut redirects land here with `?tab=...`. The dashboard
  // honours that param so the user lands on the right pane in one hop
  // (otherwise they had to click into "Referidos" themselves).
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [categories, setCategories] = useState([]);
  const [plans, setPlans] = useState([]);
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => {
    const initial = searchParams.get("tab") || "dashboard";
    // Aliases — wallet/red both point at the referrals tab (the live UI
    // already lives at "referidos"). V13 — sidebar uses "red" as item id
    // but the panel renders under "referidos" too.
    if (initial === "wallet" || initial === "red") return "referidos";
    return initial;
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Sidebar emits "red" for the Referrals item — translate that into the
  // existing "referidos" panel key so the renderer (and URL) stay stable.
  const handleTabChange = (next) => setTab(next === "red" ? "referidos" : next);

  // Sync tab → URL so deep-link sharing works (and back/forward updates the
  // visible pane). Doesn't push history — uses replace to avoid bloat.
  useEffect(() => {
    const current = searchParams.get("tab");
    if (current !== tab) {
      const next = new URLSearchParams(searchParams);
      if (tab === "dashboard") next.delete("tab"); else next.set("tab", tab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [ecardPreviewOpen, setEcardPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false); // Section 80

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
    // Section 89 v9 Part 4C — surfaces the "Servicio a domicilio" badge
    // on Search + eCard when on. Independent from is_home_based.
    offers_home_service: !!p.offers_home_service,
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
        {/* Section 80 — Hierarchical service picker (used by main category edit) */}
        <CategoryTreePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          value={(categories.find(c => c.category_id === form?.category_id) || {}).slug}
          onSelect={(sub) => {
            const cat = categories.find(c => c.slug === sub.slug);
            if (cat) {
              setForm(f => ({ ...f, category_id: cat.category_id, additional_categories: [] }));
            }
          }}
        />

        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)_320px] lg:gap-6 lg:items-start">
          {/* Section V13 — Unified vertical sidebar drives the whole
              dashboard. Desktop renders it as a sticky rail; mobile
              opens it as a slide-out drawer (mobileOpen controls). */}
          <ProviderSideNav
            tab={tab === "referidos" ? "red" : tab}
            onChange={handleTabChange}
            unreadMessages={unread}
            pendingRequests={(requests || []).filter(r => r.status === "pending" || r.status === "new").length}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />

          {/* COLUMNA CENTRO — Contenido principal scrolleable */}
          <section className="min-w-0 space-y-6" data-testid="provider-dashboard-center">
            {/* Mobile-only top bar: hamburger + current tab label */}
            <div className="lg:hidden flex items-center gap-2 bg-white rounded-2xl border border-slate-200 px-3 py-2 sticky top-16 z-30 shadow-sm">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="p-2 -ml-1 rounded-xl hover:bg-slate-100 active:scale-95 transition"
                aria-label="Open dashboard menu"
                data-testid="provider-dashboard-mobile-menu-btn"
              >
                <Menu className="w-5 h-5 text-slate-700" />
              </button>
              <span className="font-display font-semibold text-sm text-slate-800 truncate" data-testid="provider-dashboard-mobile-tab-label">
                {CURRENT_TAB_LABEL(tab, lang)}
              </span>
            </div>

            {/* ── HOME (Inicio) overview — visible only when tab === "dashboard" ── */}
            {tab === "dashboard" && (
              <DashboardHomeV7
                profile={profile}
                unread={unread}
                requests={requests}
                onTabChange={setTab}
              />
            )}
            {/* ── END Home (V7 rebuild) ── */}

        {/* Section V13 — Center content panel. The horizontal tab strip
            that used to live here was removed in favor of the single
            vertical sidebar. */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fadeSlideUp" data-testid="dashboard-panel">
          <div className="p-6 md:p-8">
            {tab === "red" && (
              <MiRedPage />
            )}
            {tab === "preferencias" && (
              <ProviderPreferences />
            )}
            {tab === "reels" && (
              <div data-testid="dashboard-tab-reels" className="space-y-4">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900">Mis Reels</h3>
                  <p className="text-sm text-slate-500">Gestiona tus videos cortos verticales.</p>
                </div>
                <Link
                  to="/reels"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-sm font-bold active:scale-95"
                  data-testid="dashboard-reels-open"
                >
                  Abrir Reels →
                </Link>
              </div>
            )}
            {tab === "ecard" && (
              <EcardsManagerPanel />
            )}
            {tab === "analytics" && (
              <div data-testid="dashboard-tab-analytics" className="space-y-4">
                <h3 className="font-display font-bold text-lg text-slate-900">Analytics</h3>
                <p className="text-sm text-slate-500">Métricas de tu perfil.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon={Eye} label="Vistas totales" value={profile.views || 0} color="text-blue-600" testid="analytics-views" />
                  <StatCard icon={Phone} label="Contactos" value={profile.contact_clicks || 0} color="text-orange-500" testid="analytics-clicks" />
                  <StatCard icon={Star} label="Calificación" value={(profile.rating_count || 0) > 0 ? (profile.rating_avg || 0).toFixed(1) : "—"} color="text-yellow-500" testid="analytics-rating" />
                  <StatCard icon={ShieldCheck} label="Estado" value={profile.verification_status} color="text-green-600" capitalize testid="analytics-status" />
                </div>
                <MarketPulseCard />
              </div>
            )}
            {tab === "destacar" && (
              <div data-testid="dashboard-tab-destacar" className="space-y-3 max-w-2xl">
                <h3 className="font-display font-bold text-lg text-slate-900">Destacar mi perfil</h3>
                <p className="text-sm text-slate-500">
                  Aparece pin-arriba del carrusel de Barrio en tu ciudad durante 7 días.
                </p>
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-rose-50 p-5">
                  <p className="text-2xl font-display font-bold text-[#03045E]">$9.99 / semana</p>
                  <p className="text-sm text-slate-600 mt-1">Cancelas cuando quieras. Disponible cuando activemos pagos.</p>
                  <button
                    type="button"
                    disabled
                    className="mt-3 h-10 px-4 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white text-sm font-bold disabled:opacity-60"
                    data-testid="dashboard-destacar-cta"
                  >
                    Próximamente
                  </button>
                </div>
              </div>
            )}
            {tab === "tarjetas" && (
              <PhysicalCardsPanel />
            )}
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Categoría principal *</label>
                    {(() => {
                      const picked = categories.find(c => c.category_id === form.category_id);
                      return (
                        <button
                          type="button"
                          onClick={() => setPickerOpen(true)}
                          className={`w-full h-12 px-4 rounded-xl border flex items-center gap-3 text-left transition ${picked ? "border-teal-400 bg-teal-50/40" : "border-slate-200 hover:border-teal-400 bg-white"}`}
                          data-testid="form-category-picker-btn"
                        >
                          {picked ? (
                            <>
                              <span className="text-xl leading-none">{picked.emoji || "🛠️"}</span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-slate-900 truncate">{lang === "es" ? picked.name_es : picked.name_en}</span>
                                <span className="block text-[11px] text-slate-500 truncate">{picked.sector_label || ""}</span>
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </>
                          ) : (
                            <>
                              <span className="text-xl leading-none">🧭</span>
                              <span className="flex-1 text-sm text-slate-500">{lang === "es" ? "Elige tu servicio…" : "Pick your service…"}</span>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </>
                          )}
                        </button>
                      );
                    })()}
                  </div>
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

                {/* Section 89 v9 Part 3 — "Identidad del negocio" UI
                    removed per user request. The `owner_identity` field
                    is preserved in the data model for backward compat
                    but no longer surfaced for new edits. */}

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
                  {/* Section 89 v9 Part 4C — Home service toggle */}
                  <label className="md:col-span-2 flex items-center justify-between p-4 rounded-2xl border-2 border-slate-200 hover:border-emerald-400 cursor-pointer" data-testid="form-offers-home-service">
                    <span>
                      <span className="font-medium text-slate-900 text-sm inline-flex items-center gap-1.5">
                        🏠 Ofrezco servicio a domicilio
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        Mostraremos el badge <strong>"A domicilio"</strong> en tu eCard y en los resultados de búsqueda.
                      </span>
                    </span>
                    <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${form.offers_home_service ? "bg-emerald-500" : "bg-slate-300"}`}>
                      <input
                        type="checkbox"
                        checked={!!form.offers_home_service}
                        onChange={(e) => update("offers_home_service", e.target.checked)}
                        className="sr-only"
                      />
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${form.offers_home_service ? "translate-x-6" : "translate-x-1"}`} />
                    </span>
                  </label>
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
                          {US_STATES.map((s) => {
                            // Use React.createElement to bypass JSX visual-editor wrapper
                            // which otherwise injects <span data-ve-dynamic> inside <option>.
                            return createElement(
                              "option",
                              { key: s.abbreviation, value: s.abbreviation },
                              s.name + " (" + s.abbreviation + ")"
                            );
                          })}
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Zonas de servicio</label>
                    <ServiceAreasInput
                      value={form.service_areas || []}
                      onChange={(arr) => setForm(f => ({ ...f, service_areas: arr }))}
                      stateFilter={form.state}
                      stateName={form.state}
                      testid="form-service-areas"
                    />
                  </div>
                </Section>

                <Section title="Servicios y horarios">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Servicios ofrecidos</label>
                    <ChipInput
                      value={form.services || []}
                      onChange={(arr) => setForm(f => ({ ...f, services: arr }))}
                      placeholder="Escribe un servicio y presiona Enter o coma para añadir"
                      max={20}
                      testid="form-services"
                    />
                  </div>
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Idiomas que hablas</label>
                    <p className="text-xs text-slate-500 mb-2">Los clientes verán esto en tu perfil y podrán filtrar por idioma.</p>
                    <div className="flex flex-wrap gap-2">
                      {[["es", "🇲🇽", "Español"], ["en", "🇺🇸", "English"], ["pt", "🇧🇷", "Português"]].map(([code, flag, label]) => {
                        const active = form.languages.includes(code);
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => update("languages", active ? form.languages.filter(l => l !== code) : [...form.languages, code])}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border-2 text-sm font-semibold transition ${active ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                            data-testid={`form-lang-${code}`}
                          >
                            <span aria-hidden="true">{flag}</span>
                            <span>{label}</span>
                            {active && <span className="text-teal-700 text-xs">✓</span>}
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

            {tab === "banner" && (
              <BannerGenerator profile={profile} />
            )}

            {tab === "citas" && (
              <CalendarTab />
            )}

            {tab === "solicitudes" && (
              <div data-testid="dashboard-requests">
                <LeadPipeline />
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

            {tab === "versiones" && (
              <ProfileVersionsPanel />
            )}

            {tab === "verificarme" && (
              <VerificationCenter profile={profile} />
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
        {options.map(o => createElement("option", { key: o.value, value: o.value }, o.label))}
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
