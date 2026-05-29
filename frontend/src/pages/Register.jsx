import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import {
  User as UserIcon,
  Mail,
  Lock,
  Loader2,
  Gift,
  X as XIcon,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import LanguageToggle from "../components/onboarding/LanguageToggle";
import CityscapeBackdrop from "../components/CityscapeBackdrop";
import BrandMark from "../components/BrandMark";

/**
 * Register — Section 87.
 *
 * The REAL "create an account" flow. Previously the `/register` and
 * `/registro` routes were wired to LoginPage (the unified login screen),
 * which meant a brand-new visitor who tapped "Create one here" landed
 * back on the login form with nowhere to go — broken signup.
 *
 * Layout
 * ──────
 *   ┌────────────────────────────────────────────┐
 *   │  Cityscape backdrop (CSS, pure shapes)     │
 *   │  ┌─────────── card 28rem max ───────────┐  │
 *   │  │ Logo + title                         │  │
 *   │  │ Role picker (Client / Provider)      │  │
 *   │  │ Referral chip / opener (provider)    │  │
 *   │  │ Continue with Google / Apple / FB    │  │
 *   │  │ ────── or ──────                     │  │
 *   │  │ Name · Email · Password              │  │
 *   │  │ [Crear cuenta] primary button        │  │
 *   │  │ Already? → Sign in                   │  │
 *   │  └──────────────────────────────────────┘  │
 *   └────────────────────────────────────────────┘
 *
 * Mobile-first: the card auto-fills the width with 16px gutter, uses
 * 100dvh container, and the backdrop is fixed so it doesn't overflow
 * the viewport horizontally. Buttons are 48px tall (Apple HIG target).
 */
export default function Register() {
  const { register } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Role can arrive via `?role=` (new) or `?intent=` (legacy)
  const initialRole = (() => {
    const r = (params.get("role") || params.get("intent") || "").toLowerCase();
    if (r === "provider" || r === "client") return r;
    try {
      const stored = localStorage.getItem("gtm_pending_role");
      if (stored === "provider" || stored === "client") return stored;
    } catch { /* private mode */ }
    return "client";
  })();
  const [role, setRole] = useState(initialRole);

  // Section 88 v3 — accepts legacy 6-char codes AND new GM-REF-XXXX format.
  // Normalises to uppercase and caps at 12 chars (max "GM-REF-9999").
  const [refCode, setRefCode] = useState(() => {
    const norm = (s) => (s || "").toUpperCase().trim().replace(/\s+/g, "").slice(0, 12);
    const fromUrl = norm(params.get("ref"));
    if (fromUrl) return fromUrl;
    try {
      return norm(
        sessionStorage.getItem("gtm_ref_code")
        || localStorage.getItem("gtm_pending_ref_code")
        || ""
      );
    } catch { return ""; }
  });
  const [refInputOpen, setRefInputOpen] = useState(false);
  const [refPreview, setRefPreview] = useState(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Persist the resolved role so other flows (OAuth callback, OnboardingLogin
  // when the user navigates back) stay in sync.
  useEffect(() => {
    try { localStorage.setItem("gtm_pending_role", role); } catch { /* */ }
  }, [role]);

  // Persist ref code in both storage spots (matches OnboardingLogin)
  useEffect(() => {
    try {
      if (refCode) {
        localStorage.setItem("gtm_pending_ref_code", refCode);
        sessionStorage.setItem("tx_ref", refCode);
      } else {
        localStorage.removeItem("gtm_pending_ref_code");
        sessionStorage.removeItem("tx_ref");
      }
    } catch { /* */ }
  }, [refCode]);

  // Section 33 — preview the referrer's invitation banner
  useEffect(() => {
    if (!refCode) { setRefPreview(null); return; }
    let alive = true;
    api.get(`/referral/preview/${refCode}`)
      .then(r => { if (alive && r.data?.valid) setRefPreview(r.data); })
      .catch(() => { /* silent */ });
    return () => { alive = false; };
  }, [refCode]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const user = await register(
        { email, password, name, role, preferred_language: lang },
        refCode || null,
      );
      toast.success(
        lang === "en"
          ? "Account created! Check your inbox to verify."
          : "¡Cuenta creada! Revisa tu correo para verificar."
      );
      navigate(`/verificar-correo?email=${encodeURIComponent(user.email || email)}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setLoading(false);
    }
  };

  const googleSignup = () => {
    // REMINDER: DO NOT HARDCODE THE URL — Emergent OAuth requires this exact contract.
    const redirectUrl = window.location.origin + "/dashboard";
    sessionStorage.setItem("tx_intent", role);
    if (refCode) sessionStorage.setItem("tx_ref", refCode);
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const comingSoon = (label) => {
    toast.message(
      lang === "en"
        ? `${label} coming soon — use Google for now.`
        : `${label} próximamente — usa Google por ahora.`
    );
  };

  return (
    <div
      className="relative flex flex-col"
      style={{ minHeight: "100dvh", background: "#CAF0F8" }}
      data-testid="register-page"
    >
      {/* Section 87 — CSS-only cityscape backdrop */}
      <CityscapeBackdrop />

      {/* Top bar with back arrow + language toggle */}
      <header
        className="relative z-10 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <Link
          to="/login"
          className="w-10 h-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-[#03045E] shadow-sm hover:bg-white transition"
          aria-label={lang === "en" ? "Back to sign in" : "Volver al inicio de sesión"}
          data-testid="register-back-link"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <LanguageToggle />
      </header>

      <main className="relative z-10 flex-1 flex items-start sm:items-center justify-center px-4 pb-8">
        <div className="w-full max-w-md">
          {/* Referral preview banner */}
          {refPreview && (
            <div
              className="rounded-2xl mb-4 p-4 flex items-start gap-3 bg-white/90 backdrop-blur-sm border border-[#90E0EF]"
              data-testid="register-ref-banner"
            >
              <Gift className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "#0077B6" }} />
              <div className="min-w-0">
                <p className="font-semibold text-[#03045E] text-sm leading-tight">
                  {lang === "en" ? "Invited by" : "Te invita"}{" "}
                  <span className="font-bold">{refPreview.referrer_name}</span>
                  {refPreview.business_name && (
                    <> · <span className="opacity-80">{refPreview.business_name}</span></>
                  )}
                </p>
                <p className="text-xs text-[#0077B6] mt-1 leading-relaxed">
                  🎁 {lang === "en"
                    ? "Get your first month Pro free when you confirm."
                    : "Al confirmar tu primer mes Pro lo recibes gratis (30 días)."}
                </p>
              </div>
            </div>
          )}

          {/* Card */}
          <div className="bg-white rounded-3xl shadow-2xl shadow-[#0077B6]/15 border border-white/40 p-6 sm:p-8">
            <BrandMark size="lg" className="mx-auto" />
            <h1
              className="font-display mt-3 text-2xl sm:text-3xl font-bold text-center tracking-tight"
              style={{ color: "#03045E" }}
              data-testid="register-title"
            >
              {lang === "en" ? "Create your account" : "Crea tu cuenta"}
            </h1>
            <p className="text-sm text-slate-500 text-center mt-1.5">
              {lang === "en" ? "Join the getamano community" : "Únete a la comunidad getamano"}
            </p>

            {/* Section 88 v3 — single-user model. No role picker on signup.
                Anyone can become a provider later via "Vende tus servicios"
                on /account. We default `role` to "client" in the form payload
                so legacy server-side checks keep working until they're
                ripped out in Phase 2. */}

            {/* Optional referral code (anyone can be referred) */}
            <div className="mt-5" data-testid="register-referral-row">
                {refCode ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-[#90E0EF] bg-[#CAF0F8]/40">
                    <Gift className="w-4 h-4 flex-shrink-0" style={{ color: "#0077B6" }} />
                    <span className="text-sm text-[#03045E] flex-1 min-w-0 truncate">
                      {lang === "en" ? "Referred with code" : "Referido con código"}{" "}
                      <strong className="font-bold tracking-wider">{refCode}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setRefCode("")}
                      className="text-xs font-semibold text-[#0077B6] hover:underline flex items-center gap-0.5"
                      data-testid="register-referral-clear"
                    >
                      <XIcon className="w-3 h-3" /> {lang === "en" ? "Remove" : "Quitar"}
                    </button>
                  </div>
                ) : refInputOpen ? (
                  <input
                    type="text"
                    value={refCode}
                    onChange={(e) =>
                      setRefCode(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9-]/g, "")
                          .slice(0, 12)
                      )
                    }
                    placeholder="GM-REF-1234"
                    maxLength={12}
                    autoFocus
                    className="w-full h-12 px-4 rounded-2xl bg-white border-2 border-[#90E0EF] focus:border-[#0077B6] outline-none text-[#03045E] text-sm font-bold tracking-[0.18em] uppercase placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-400"
                    data-testid="register-referral-input"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setRefInputOpen(true)}
                    className="text-xs font-semibold text-[#0077B6] hover:underline flex items-center gap-1"
                    data-testid="register-referral-open"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    {lang === "en"
                      ? "Have a referral code?"
                      : "¿Tienes un código de referido?"} →
                  </button>
                )}
              </div>

            {/* Social buttons */}
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={googleSignup}
                className="w-full h-12 rounded-full bg-white border-2 border-slate-200 hover:border-[#0077B6] hover:shadow-md active:scale-[0.98] transition flex items-center justify-center gap-2 font-semibold text-[#03045E]"
                data-testid="register-google-button"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {lang === "en" ? "Continue with Google" : "Continuar con Google"}
              </button>
              <button
                type="button"
                onClick={() => comingSoon("Apple")}
                className="w-full h-12 rounded-full bg-black hover:bg-slate-800 active:scale-[0.98] transition flex items-center justify-center gap-2 font-semibold text-white"
                data-testid="register-apple-button"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                {lang === "en" ? "Continue with Apple" : "Continuar con Apple"}
              </button>
              <button
                type="button"
                onClick={() => comingSoon("Facebook")}
                className="w-full h-12 rounded-full bg-[#1877F2] hover:bg-[#1865d8] active:scale-[0.98] transition flex items-center justify-center gap-2 font-semibold text-white"
                data-testid="register-facebook-button"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                {lang === "en" ? "Continue with Facebook" : "Continuar con Facebook"}
              </button>
            </div>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">{lang === "en" ? "or" : "o"}</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Email form */}
            <form onSubmit={onSubmit} className="space-y-3" data-testid="register-form">
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#0077B6]" />
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={lang === "en" ? "Full name" : "Nombre completo"}
                  autoComplete="name"
                  maxLength={80}
                  className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-slate-200 focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8] outline-none text-[#03045E] text-sm placeholder:text-slate-400"
                  data-testid="register-name-input"
                />
              </div>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#0077B6]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={lang === "en" ? "Email" : "Correo electrónico"}
                  inputMode="email"
                  autoComplete="email"
                  maxLength={120}
                  className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-slate-200 focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8] outline-none text-[#03045E] text-sm placeholder:text-slate-400"
                  data-testid="register-email-input"
                />
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#0077B6]" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={lang === "en" ? "Password (min 6)" : "Contraseña (mín 6)"}
                  autoComplete="new-password"
                  className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-slate-200 focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8] outline-none text-[#03045E] text-sm placeholder:text-slate-400"
                  data-testid="register-password-input"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-full font-bold text-white shadow-lg hover:shadow-xl active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #0077B6 0%, #03045E 100%)" }}
                data-testid="register-submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {lang === "en" ? "Creating…" : "Creando…"}
                  </>
                ) : (
                  lang === "en" ? "Create account" : "Crear cuenta"
                )}
              </button>
            </form>

            {/* Footer link */}
            <p className="text-center text-sm text-[#03045E]/70 mt-5">
              {lang === "en" ? "Already have an account?" : "¿Ya tienes cuenta?"}{" "}
              <Link
                to="/login"
                className="font-bold text-[#0077B6] hover:underline"
                data-testid="register-to-login"
              >
                {lang === "en" ? "Sign in" : "Iniciar sesión"}
              </Link>
            </p>
          </div>

          {/* Tiny legal print */}
          <p className="text-center text-[10px] text-[#03045E]/60 mt-4 px-4 leading-relaxed">
            {lang === "en" ? (
              <>By creating an account you agree to our{" "}
                <Link to="/terminos" className="underline hover:text-[#03045E]">Terms</Link>
                {" "}and{" "}
                <Link to="/privacidad" className="underline hover:text-[#03045E]">Privacy</Link>.
              </>
            ) : (
              <>Al crear una cuenta aceptas nuestros{" "}
                <Link to="/terminos" className="underline hover:text-[#03045E]">Términos</Link>
                {" "}y{" "}
                <Link to="/privacidad" className="underline hover:text-[#03045E]">Privacidad</Link>.
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
