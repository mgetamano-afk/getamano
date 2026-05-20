import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import Header from "../components/Header";
import { Search as SearchIcon, Store, Briefcase } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(params.get("intent") ? 2 : 1);
  const [intent, setIntent] = useState(params.get("intent") || "client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const intentToRole = (i) => (i === "provider" || i === "existing" ? "provider" : "client");

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const role = intentToRole(intent);
      const user = await register({ email, password, name, role });
      toast.success("¡Cuenta creada!");
      navigate(user.role === "provider" ? "/dashboard/provider" : "/dashboard/client");
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
        <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {step === 1 ? (
            <>
              <h1 className="font-display text-3xl font-bold text-slate-900 text-center" data-testid="register-intent-title">{t("auth.welcome")}</h1>
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
              <h1 className="font-display text-3xl font-bold text-slate-900 text-center" data-testid="register-form-title">{t("auth.signup")}</h1>
              <p className="text-slate-500 text-center mt-2">{intentOptions.find(o => o.id === intent)?.label}</p>

              <form onSubmit={onSubmit} className="mt-8 space-y-4" data-testid="register-form">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("auth.name")}</label>
                  <input required value={name} onChange={e => setName(e.target.value)} className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid="register-name-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("auth.email")}</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid="register-email-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("auth.password")}</label>
                  <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid="register-password-input" />
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
              <button onClick={googleSignup} className="w-full h-12 rounded-full border-2 border-slate-200 hover:border-slate-300 font-medium text-slate-700" data-testid="register-google-button">
                {t("auth.google")}
              </button>

              <div className="mt-4 flex justify-between text-sm">
                <button onClick={() => setStep(1)} className="text-slate-500 hover:underline" data-testid="register-back-intent">{t("common.back")}</button>
                <Link to="/login" className="text-blue-600 hover:underline" data-testid="register-to-login">{t("auth.have_account")} {t("auth.login")}</Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
