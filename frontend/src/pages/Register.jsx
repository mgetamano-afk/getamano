import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import Header from "../components/Header";
import { Search as SearchIcon, Store, Briefcase, Gift } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

export default function Register() {
  const { register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const refCode = (params.get("ref") || "").toUpperCase().slice(0, 6) || null;
  const langFromUrl = (params.get("lang") || "").toLowerCase();
  const initialLanguage = langFromUrl === "en" ? "en" : langFromUrl === "es" ? "es" : "es";
  const [step, setStep] = useState(params.get("intent") ? 2 : 1);
  const [intent, setIntent] = useState(params.get("intent") || (refCode ? "provider" : "client"));
  const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [refPreview, setRefPreview] = useState(null);

  // Section 33 — fetch referrer banner data
  useEffect(() => {
    if (!refCode) return;
    let alive = true;
    api.get(`/referral/preview/${refCode}`)
      .then(r => { if (alive && r.data?.valid) setRefPreview(r.data); })
      .catch(() => { /* silent — invalid codes won't render */ });
    return () => { alive = false; };
  }, [refCode]);

  const intentToRole = (i) => (i === "provider" || i === "existing" ? "provider" : "client");

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const role = intentToRole(intent);
      const user = await register({ email, password, name, role, preferred_language: preferredLanguage }, refCode);
      toast.success(preferredLanguage === "en" ? "Account created! Verify your email to continue." : "¡Cuenta creada! Verifica tu correo para continuar.");
      // Section 24: route every new account through email verification first.
      navigate(`/verificar-correo?email=${encodeURIComponent(user.email || email)}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setLoading(false);
    }
  };

  const googleSignup = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    sessionStorage.setItem("tx_intent", intent);
    if (refCode) sessionStorage.setItem("tx_ref", refCode);
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const intentOptions = [
    { id: "client", label: t("auth.intent.explore"), icon: SearchIcon, color: "bg-blue-50 text-blue-600 border-blue-200" },
    { id: "provider", label: t("auth.intent.sell"), icon: Store, color: "bg-orange-50 text-orange-600 border-orange-200" },
    { id: "existing", label: t("auth.intent.existing"), icon: Briefcase, color: "bg-green-50 text-green-600 border-green-200" },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {refPreview && (
            <div
              className="rounded-2xl mb-4 p-4 flex items-start gap-3"
              style={{ background: "linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)", border: "1px solid #FED7AA" }}
              data-testid="register-ref-banner"
            >
              <Gift className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "#C2410C" }} />
              <div className="min-w-0">
                <p className="font-semibold text-amber-900 text-sm leading-tight">
                  Te invita <span className="font-bold">{refPreview.referrer_name}</span> · <span className="opacity-80">{refPreview.business_name}</span>
                </p>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  🎁 Crea tu cuenta y al confirmar tu primer mes Pro lo recibes <strong>gratis (30 días)</strong>. {refPreview.referrer_name} suma puntos para ganar su próximo mes gratis — cada 2 amigos suscritos = 1 mes para quien refiere.
                </p>
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <img src="/getamano-logo-mark.png" alt="getamano" className="w-16 h-16 mx-auto mb-3 object-contain" />
          {step === 1 ? (
            <>
              <h1 className="font-display text-3xl font-bold text-center" style={{ color: "#03045E" }} data-testid="register-intent-title">{t("auth.welcome")}</h1>
              <p className="text-slate-500 text-center mt-2">{t("auth.intent")}</p>
              <div className="mt-8 space-y-3">
                {intentOptions.map(o => (
                  <button
                    key={o.id}
                    onClick={() => { setIntent(o.id); setStep(2); }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all hover:shadow-md ${intent === o.id ? o.color : "border-slate-200 hover:border-slate-300"}`}
                    data-testid={`register-intent-${o.id}`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${o.color}`}>
                      <o.icon className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-slate-900 text-left">{o.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold text-center" style={{ color: "#03045E" }} data-testid="register-form-title">{t("auth.signup")}</h1>
              <p className="text-slate-500 text-center mt-2">{intentOptions.find(o => o.id === intent)?.label}</p>

              <form onSubmit={onSubmit} className="mt-8 space-y-4" data-testid="register-form">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {preferredLanguage === "en" ? "I prefer to use Getamano in" : "Prefiero usar Getamano en"}
                  </label>
                  <div className="grid grid-cols-2 gap-2" data-testid="register-language-toggle">
                    <button
                      type="button"
                      onClick={() => setPreferredLanguage("es")}
                      className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition ${preferredLanguage === "es" ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                      data-testid="register-language-es"
                    >
                      🇲🇽 Español
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreferredLanguage("en")}
                      className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition ${preferredLanguage === "en" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                      data-testid="register-language-en"
                    >
                      🇺🇸 English
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("auth.name")}</label>
                  <input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid="register-name-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("auth.email")}</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} inputMode="email" autoComplete="email" className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid="register-email-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("auth.password")}</label>
                  <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid="register-password-input" />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center" data-testid="register-submit">
                  {loading ? t("common.loading") : t("auth.signup")}
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-sm text-slate-400">o</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="space-y-2">
                <button onClick={googleSignup} className="w-full h-12 rounded-full border-2 border-slate-200 hover:border-slate-300 flex items-center justify-center gap-2 font-medium text-slate-700" data-testid="register-google-button">
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  {t("auth.google")}
                </button>
                <button disabled title="Próximamente" className="w-full h-12 rounded-full border-2 border-slate-200 flex items-center justify-center gap-2 font-medium text-slate-400 cursor-not-allowed bg-slate-50/50" data-testid="register-apple-button">
                  Apple (próximamente)
                </button>
                <button disabled title="Próximamente" className="w-full h-12 rounded-full border-2 border-slate-200 flex items-center justify-center gap-2 font-medium text-slate-400 cursor-not-allowed bg-slate-50/50" data-testid="register-facebook-button">
                  Facebook (próximamente)
                </button>
              </div>

              <div className="mt-4 flex justify-between text-sm">
                <button onClick={() => setStep(1)} className="text-slate-500 hover:underline" data-testid="register-back-intent">{t("common.back")}</button>
                <Link to="/login" className="text-blue-600 hover:underline" data-testid="register-to-login">{t("auth.have_account")} {t("auth.login")}</Link>
              </div>
            </>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}
