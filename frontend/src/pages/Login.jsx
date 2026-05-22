import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import Header from "../components/Header";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(t("auth.welcome"));
      navigate(user.role === "admin" ? "/dashboard/admin" : user.role === "provider" ? "/dashboard/provider" : "/dashboard/client");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <img src="/getamano-logo-mark.png" alt="getamano" className="w-16 h-16 mx-auto mb-3 object-contain" />
          <h1 className="font-display text-3xl font-bold text-center" style={{ color: "#025F67" }} data-testid="login-title">{t("auth.welcome")}</h1>
          <p className="text-slate-500 text-center mt-2">{t("auth.login")}</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" data-testid="login-form">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("auth.email")}</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                inputMode="email" autoComplete="email"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("auth.password")}</label>
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
                data-testid="login-password-input"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center" data-testid="login-submit">
              {loading ? t("common.loading") : t("auth.login")}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-sm text-slate-400">o</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="space-y-2">
            <button onClick={googleLogin} className="w-full h-12 rounded-full border-2 border-slate-200 hover:border-slate-300 flex items-center justify-center gap-2 font-medium text-slate-700" data-testid="login-google-button">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
              {t("auth.google")}
            </button>
            <button disabled title="Próximamente" className="w-full h-12 rounded-full border-2 border-slate-200 flex items-center justify-center gap-2 font-medium text-slate-400 cursor-not-allowed bg-slate-50/50" data-testid="login-apple-button">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M16.365 1.43c0 1.14-.41 2.21-1.215 3.018-.91.967-2.297 1.628-3.518 1.512-.157-1.078.41-2.213 1.214-3.02C13.846 1.94 15.214 1.29 16.365 1.43zM20.5 17.2c-.51 1.165-.7 1.685-1.34 2.715-.91 1.43-2.19 3.21-3.78 3.22-1.418.015-1.785-.92-3.71-.91-1.925.01-2.328.926-3.748.91-1.589-.014-2.802-1.618-3.712-3.048C1.652 16.06.83 11.59 2.61 8.62c1.26-2.107 3.252-3.341 5.123-3.341 1.905 0 3.103 1.043 4.677 1.043 1.527 0 2.457-1.045 4.66-1.045 1.667 0 3.435.91 4.694 2.476-4.126 2.262-3.456 8.16-.464 9.45z" /></svg>
              Apple (próximamente)
            </button>
            <button disabled title="Próximamente" className="w-full h-12 rounded-full border-2 border-slate-200 flex items-center justify-center gap-2 font-medium text-slate-400 cursor-not-allowed bg-slate-50/50" data-testid="login-facebook-button">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
              Facebook (próximamente)
            </button>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            {t("auth.no_account")} <Link to="/register" className="text-blue-600 font-medium hover:underline" data-testid="login-to-register">{t("auth.signup")}</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
