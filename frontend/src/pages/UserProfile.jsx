import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, ShieldCheck, ChevronRight, Loader2, Hash } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import Header from "../components/Header";
import { toast } from "sonner";

/**
 * UserProfile — "Mi cuenta" page.
 *
 * Section 88 (v3 social-first) adds the "¿Ofreces algún servicio?" CTA.
 * The card has three states:
 *
 *  1. NOT A PROVIDER ─ shows a teaser card titled "Vende tus servicios"
 *     that creates a stub provider profile on click and redirects the
 *     user to the existing 6-step provider onboarding wizard.
 *
 *  2. PROVIDER, NOT VERIFIED ─ "Tu eCard ya está activa" with a CTA
 *     "Verificarme por $10/mes" (gives the GM-XXXX code).
 *
 *  3. PROVIDER + VERIFIED ─ shows the GM-XXXX code, a "Ver mi panel"
 *     link, and a small "Compartir mi código" button (copies the code).
 */
export default function UserProfile() {
  const { user, loading: authLoading, refresh } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", phone: "", language: "es" });
  const [saving, setSaving] = useState(false);
  const [providerStatus, setProviderStatus] = useState(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    setForm({ name: user.name || "", phone: user.phone || "", language: user.language || "es" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api.get("/users/me/provider-status")
      .then(r => { if (alive) setProviderStatus(r.data); })
      .catch(() => { /* silent */ });
    return () => { alive = false; };
  }, [user]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/users/me", form);
      await refresh();
      toast.success(lang === "en" ? "Profile updated" : "Perfil actualizado");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  const activateProvider = async () => {
    if (activating) return;
    setActivating(true);
    try {
      const { data } = await api.post("/users/me/activate-provider");
      toast.success(lang === "en" ? "Welcome aboard! Finish your profile." : "¡Bienvenido! Termina tu perfil.");
      if (data.needs_onboarding) {
        navigate("/provider/onboarding");
      } else if (data.slug) {
        navigate(`/p/${data.slug}`);
      } else {
        navigate("/dashboard/provider");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setActivating(false);
    }
  };

  const copyCode = () => {
    if (!providerStatus?.getamano_code) return;
    navigator.clipboard.writeText(providerStatus.getamano_code);
    toast.success(lang === "en" ? "Code copied" : "Código copiado");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F0F9FF]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8" data-testid="user-profile-page">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#03045E]">
          {lang === "en" ? "My account" : "Mi cuenta"}
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          {lang === "en" ? "Update your personal info" : "Actualiza tus datos personales"}
        </p>

        {/* Section 88 — provider activation card (or status if already a provider) */}
        {providerStatus && (
          <ProviderCard
            status={providerStatus}
            lang={lang}
            onActivate={activateProvider}
            activating={activating}
            onCopyCode={copyCode}
            onGoToDashboard={() => navigate("/dashboard/provider")}
            onVerify={() => navigate("/dashboard/provider?tab=suscripcion")}
          />
        )}

        <form onSubmit={save} className="mt-6 bg-white rounded-2xl border border-slate-200 p-5 md:p-6 space-y-4" data-testid="user-profile-form">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{lang === "en" ? "Full name" : "Nombre completo"}</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8] outline-none" data-testid="user-profile-name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{lang === "en" ? "Email" : "Correo electrónico"}</label>
            <input value={user.email} disabled className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500" data-testid="user-profile-email" />
            <p className="text-xs text-slate-400 mt-1">{lang === "en" ? "Email can't be changed." : "El correo no se puede cambiar."}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{lang === "en" ? "Phone" : "Teléfono"}</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8] outline-none" data-testid="user-profile-phone" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{lang === "en" ? "Preferred language" : "Idioma preferido"}</label>
            <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} className="w-full h-12 px-4 rounded-xl border border-slate-200 outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]" data-testid="user-profile-language">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <button type="submit" disabled={saving} className="w-full sm:w-auto h-12 px-6 rounded-full text-white font-semibold shadow-lg active:scale-[0.98] transition disabled:opacity-60" style={{ background: "linear-gradient(135deg, #0077B6 0%, #03045E 100%)" }} data-testid="user-profile-save">
            {saving ? (lang === "en" ? "Saving…" : "Guardando…") : (lang === "en" ? "Save changes" : "Guardar cambios")}
          </button>
        </form>
      </main>
    </div>
  );
}

/**
 * ProviderCard — three-state card.
 *
 * Section 88 design lives here so the parent form stays simple. The
 * gradient backgrounds keep the page Ocean Blue end-to-end.
 */
function ProviderCard({ status, lang, onActivate, activating, onCopyCode, onGoToDashboard, onVerify }) {
  // Case 1 — guest user is not yet a provider
  if (!status.is_provider) {
    return (
      <div
        className="mt-5 relative overflow-hidden rounded-3xl p-5 sm:p-6 shadow-xl shadow-[#0077B6]/20"
        style={{ background: "linear-gradient(135deg, #03045E 0%, #023E8A 55%, #0077B6 100%)" }}
        data-testid="user-profile-activate-card"
      >
        <div className="relative flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#00B4D8]/25 flex items-center justify-center flex-shrink-0">
            <Briefcase className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-white text-lg leading-tight">
              {lang === "en" ? "Sell your services on getamano" : "Vende tus servicios en getamano"}
            </h2>
            <p className="text-[#CAF0F8] text-sm mt-1 leading-snug">
              {lang === "en"
                ? "Get your free eCard, receive direct contacts, and grow your network."
                : "Obtén tu eCard gratis, recibe contactos directos y crece tu red."}
            </p>
            <button
              type="button"
              onClick={onActivate}
              disabled={activating}
              className="mt-4 inline-flex items-center gap-1.5 px-5 h-11 rounded-xl text-[#03045E] text-sm font-bold transition hover:brightness-110 active:scale-95 shadow-lg disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #00B4D8 0%, #90E0EF 100%)" }}
              data-testid="user-profile-activate-btn"
            >
              {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {activating ? (lang === "en" ? "Activating…" : "Activando…") : (lang === "en" ? "Start now" : "Empezar ahora")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 2 — provider but not verified yet
  if (!status.provider_verified) {
    return (
      <div
        className="mt-5 rounded-3xl p-5 bg-white border-2 border-[#0077B6]/20 shadow-md"
        data-testid="user-profile-unverified-card"
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#CAF0F8] flex items-center justify-center flex-shrink-0">
            <Briefcase className="w-5 h-5 text-[#0077B6]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-[#03045E] text-base leading-tight">
              {lang === "en" ? "Your eCard is live" : "Tu eCard está activa"}
            </h2>
            <p className="text-slate-600 text-sm mt-1 leading-snug">
              {lang === "en"
                ? "Get verified ✓ for $10/mo — get your unique GM code, priority in search and unlimited messaging."
                : "Verifícate ✓ por $10/mes — código GM único, prioridad en búsqueda y mensajes ilimitados."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onGoToDashboard}
                className="inline-flex items-center gap-1 px-4 h-10 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-sm font-semibold transition"
                data-testid="user-profile-dashboard-btn"
              >
                {lang === "en" ? "My dashboard" : "Mi panel"}
              </button>
              <button
                type="button"
                onClick={onVerify}
                className="inline-flex items-center gap-1 px-4 h-10 rounded-full text-white text-sm font-bold transition active:scale-95"
                style={{ background: "linear-gradient(135deg, #0077B6 0%, #03045E 100%)" }}
                data-testid="user-profile-verify-btn"
              >
                <ShieldCheck className="w-4 h-4" />
                {lang === "en" ? "Verify · $10/mo" : "Verificarme · $10/mes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Case 3 — verified provider with GM-XXXX
  return (
    <div
      className="mt-5 relative overflow-hidden rounded-3xl p-5 shadow-xl"
      style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
      data-testid="user-profile-verified-card"
    >
      <div className="relative flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#00B4D8] flex items-center justify-center flex-shrink-0 shadow-lg">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00B4D8]/30 text-[#CAF0F8] text-[10px] font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3" />
              {lang === "en" ? "Verified" : "Verificado"}
            </span>
          </div>
          <h2 className="font-display font-bold text-white text-lg leading-tight">
            {lang === "en" ? "Your unique code" : "Tu código único"}
          </h2>
          <button
            type="button"
            onClick={onCopyCode}
            className="mt-2 inline-flex items-center gap-2 font-mono font-extrabold text-2xl sm:text-3xl text-white tracking-widest hover:text-[#CAF0F8] transition select-all"
            data-testid="user-profile-gm-code"
          >
            <Hash className="w-5 h-5 opacity-70" />
            {status.getamano_code}
          </button>
          <p className="text-[#CAF0F8] text-xs mt-2 leading-relaxed">
            {lang === "en"
              ? "Use this code in your invoices, signs and social media."
              : "Usa este código en tus facturas, anuncios y redes sociales."}
          </p>
          <button
            type="button"
            onClick={onGoToDashboard}
            className="mt-3 inline-flex items-center gap-1 px-4 h-9 rounded-full bg-white text-[#03045E] text-sm font-bold active:scale-95 transition"
            data-testid="user-profile-verified-dashboard-btn"
          >
            {lang === "en" ? "Go to my dashboard" : "Ir a mi panel"} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
