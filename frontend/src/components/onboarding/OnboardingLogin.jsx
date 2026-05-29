import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Lock, Loader2, User, Briefcase, Flame } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { api } from "../../lib/api";
import { toast } from "sonner";
import LanguageToggle from "./LanguageToggle";

/**
 * OnboardingLogin — Section 70 (screen 3 of 3).
 *
 * The "Sign in or sign up" screen that closes the onboarding. Three entry
 * paths in priority order:
 *   1. Google OAuth (via Emergent's hosted flow — same redirect contract
 *      the rest of the app uses, so the user lands on /dashboard after).
 *   2. Email + password (existing /auth/login endpoint via AuthContext).
 *   3. Create new account → routes to /register, which already exists.
 *
 * Role selector
 * ─────────────
 * Before sign-in, the user picks a role (Client / Provider). This is
 * stored in localStorage so it can prefill the registration wizard if
 * they tap "Create one here". Existing login does not require the role.
 */
export default function OnboardingLogin({ onFinish }) {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState(() => localStorage.getItem("gtm_pending_role") || "client");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [founderStatus, setFounderStatus] = useState(null); // Section 73 — {slots_remaining}

  // Fetch founder status once so we can show urgency for providers
  useEffect(() => {
    let alive = true;
    api.get("/founders/status")
      .then(r => { if (alive) setFounderStatus(r.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const pickRole = (r) => {
    setRole(r);
    try { localStorage.setItem("gtm_pending_role", r); } catch { /* private mode */ }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      onFinish?.();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = () => {
    // Mark onboarding seen so the post-auth landing doesn't loop back here.
    try { localStorage.setItem("gtm_onboarding_seen", "true"); } catch { /* */ }
    // DO NOT HARDCODE THE URL OR ADD FALLBACKS — Emergent auth contract.
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  // Apple & Facebook need their own provider credentials (Apple Developer
  // account + Facebook App ID) which the user hasn't provisioned yet.
  // Buttons are shown for design preview; tap → "coming soon" toast.
  const comingSoon = (provider) => {
    toast.message(`${provider} ${t("onb.login.soon")}`);
  };

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center font-poppins"
      style={{
        backgroundColor: "var(--gtm-blue-surface, #CAF0F8)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
      }}
      data-testid="onb-login"
    >
      {/* Top-right language toggle */}
      <div className="w-full px-4 flex justify-end">
        <LanguageToggle />
      </div>

      <div className="flex-1 w-full max-w-md mx-auto px-6 py-6 flex flex-col">
        <img src="/getamano-logo-mark.png" alt="getamano" className="w-16 h-16 mx-auto mb-4 object-contain" draggable={false} />
        <h1 className="text-2xl font-bold text-center" style={{ letterSpacing: "-0.02em", color: "#03045E" }} data-testid="onb-login-title">
          {t("onb.login.title")}
        </h1>
        <p className="text-sm text-center text-[#03045E]/65 mt-1.5 mb-6">
          {t("onb.login.subtitle")}
        </p>

        {/* Role picker (Client / Provider) */}
        <div className="grid grid-cols-2 gap-2 mb-5" data-testid="onb-login-role">
          {[
            { id: "client",   label: t("onb.login.client"),   Icon: User },
            { id: "provider", label: t("onb.login.provider"), Icon: Briefcase },
          ].map(({ id, label, Icon }) => {
            const active = role === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pickRole(id)}
                aria-pressed={active}
                className={`h-14 rounded-2xl border-2 flex items-center justify-center gap-2 transition-colors font-semibold ${
                  active
                    ? "border-[#0077B6] bg-white text-[#03045E] shadow-sm"
                    : "border-transparent bg-white/65 text-[#03045E]/65"
                }`}
                data-testid={`onb-login-role-${id}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Section 73 — Founder Discount urgency banner.
            Shown ONLY when the user is in "Proveedor" role and there are
            still slots available. Designed to nudge providers to register
            faster (FOMO loop). */}
        {role === "provider" && founderStatus && founderStatus.slots_remaining > 0 && (
          <div
            className="mb-5 px-4 py-3 rounded-2xl text-white text-sm flex items-start gap-3 shadow-sm"
            style={{
              background: "linear-gradient(120deg, #03045E 0%, #0077B6 100%)",
            }}
            data-testid="onb-founder-banner"
          >
            <Flame className="w-5 h-5 mt-0.5 shrink-0" fill="currentColor" strokeWidth={0} />
            <div className="flex-1 leading-snug">
              <p className="font-bold mb-0.5">{t("founder.banner_title")}</p>
              <p className="text-white/85 text-[12px]">
                {t("founder.banner_left_prefix")}{" "}
                <span className="font-bold">{founderStatus.slots_remaining}</span>{" "}
                {t("founder.banner_left_suffix")}
              </p>
            </div>
          </div>
        )}

        {/* Section 70b — Social auth row: Google (live) + Apple + Facebook
            (visual preview, awaiting provider credentials). All three follow
            the same pill spec for visual consistency. */}
        <div className="space-y-2.5 mb-5" data-testid="onb-social-row">
          <button
            type="button"
            onClick={googleLogin}
            className="w-full h-12 rounded-2xl bg-white border border-slate-200 hover:border-[#0077B6] hover:shadow-sm flex items-center justify-center gap-2.5 font-semibold text-[#03045E] transition"
            data-testid="onb-login-google"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18A10.997 10.997 0 0 0 1 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            {t("onb.login.google")}
          </button>

          <button
            type="button"
            onClick={() => comingSoon("Apple")}
            className="w-full h-12 rounded-2xl bg-black hover:bg-neutral-800 active:scale-[0.99] flex items-center justify-center gap-2.5 font-semibold text-white transition"
            data-testid="onb-login-apple"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
              <path d="M17.05 12.04c-.03-3.04 2.49-4.5 2.6-4.57-1.42-2.08-3.63-2.37-4.42-2.4-1.88-.19-3.67 1.11-4.62 1.11-.97 0-2.43-1.08-4-1.05-2.06.03-3.97 1.2-5.03 3.04-2.14 3.71-.55 9.21 1.53 12.23 1.02 1.48 2.23 3.14 3.82 3.08 1.53-.06 2.11-.99 3.96-.99 1.85 0 2.37.99 4 .96 1.65-.03 2.7-1.5 3.71-2.99 1.17-1.72 1.65-3.39 1.68-3.47-.04-.02-3.22-1.24-3.25-4.95zM14.04 3.04C14.87 2.03 15.43.61 15.27-.79c-1.19.05-2.64.79-3.5 1.79-.77.88-1.45 2.32-1.27 3.69 1.33.1 2.69-.67 3.54-1.65z" />
            </svg>
            {t("onb.login.apple")}
          </button>

          <button
            type="button"
            onClick={() => comingSoon("Facebook")}
            className="w-full h-12 rounded-2xl text-white font-semibold flex items-center justify-center gap-2.5 active:scale-[0.99] transition"
            style={{ backgroundColor: "#1877F2" }}
            data-testid="onb-login-facebook"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            {t("onb.login.facebook")}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5 text-xs text-[#03045E]/50">
          <div className="h-px flex-1 bg-[#03045E]/12" />
          <span>{t("onb.login.divider")}</span>
          <div className="h-px flex-1 bg-[#03045E]/12" />
        </div>

        {/* Email / password form */}
        <form onSubmit={onSubmit} className="space-y-3" data-testid="onb-login-form">
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#03045E]/50" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("onb.login.email")}
              className="w-full h-12 pl-10 pr-3 rounded-2xl bg-white border border-slate-200 outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20 text-[#03045E]"
              data-testid="onb-login-email"
            />
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#03045E]/50" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("onb.login.password")}
              className="w-full h-12 pl-10 pr-3 rounded-2xl bg-white border border-slate-200 outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20 text-[#03045E]"
              data-testid="onb-login-password"
            />
          </div>
          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-xs font-semibold text-[#0077B6] hover:underline"
              data-testid="onb-login-forgot"
            >
              {t("onb.login.forgot")}
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-md active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--gtm-blue-primary, #0077B6)" }}
            data-testid="onb-login-submit"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("onb.login.cta")}
          </button>
        </form>

        <p className="text-center text-sm text-[#03045E]/70 mt-6">
          {t("onb.login.signup_q")}{" "}
          <Link
            to="/register"
            className="font-bold text-[#0077B6] hover:underline"
            onClick={onFinish}
            data-testid="onb-login-signup"
          >
            {t("onb.login.signup_cta")}
          </Link>
        </p>
      </div>
    </div>
  );
}
