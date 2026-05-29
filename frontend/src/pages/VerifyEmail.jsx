import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, ShieldCheck, RefreshCw, Loader2, ArrowLeft, Check } from "lucide-react";
import Header from "../components/Header";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { toast } from "sonner";

const COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;

/**
 * /verificar-correo — 6-digit OTP confirmation.
 *
 * • Auto-advances between digit boxes
 * • Pastes a full code with ⌘V
 * • Resends with a 60s cooldown timer
 * • Auto-submits when 6 digits are typed
 *
 * Email is read from the auth context (logged-in users) or the
 * `?email=` query param (links from registration).
 */
export default function VerifyEmail() {
  const { user, refresh } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const queryEmail = (params.get("email") || "").trim();
  const email = (user?.email || queryEmail || "").toLowerCase();

  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const [hasRequestedInitial, setHasRequestedInitial] = useState(false);
  const inputs = useRef([]);

  const T = lang === "en" ? {
    title: "Verify your email",
    subtitle: "We sent a 6-digit code to",
    placeholderEmail: "your email",
    enterCode: "Enter your code",
    resend: "Resend code",
    resendIn: (s) => `Resend in ${s}s`,
    verifying: "Verifying…",
    verified: "Verified ✓",
    verifyBtn: "Verify",
    helpTitle: "Didn't get the code?",
    help: "Check your spam folder or wait a minute. If your email is wrong, log out and re-register with the correct one.",
    back: "← Back",
    successTitle: "Email confirmed!",
    successBody: "You're all set. Welcome to getamano.",
    goDashboard: "Go to my dashboard",
    invalid: "Code must be 6 digits.",
  } : {
    title: "Verifica tu correo",
    subtitle: "Te enviamos un código de 6 dígitos a",
    placeholderEmail: "tu correo",
    enterCode: "Ingresa tu código",
    resend: "Reenviar código",
    resendIn: (s) => `Reenviar en ${s}s`,
    verifying: "Verificando…",
    verified: "Verificado ✓",
    verifyBtn: "Verificar",
    helpTitle: "¿No te llegó?",
    help: "Revisa tu carpeta de spam o espera un minuto. Si tu correo está mal, cierra sesión y regístrate con el correcto.",
    back: "← Volver",
    successTitle: "¡Correo confirmado!",
    successBody: "Listo. Bienvenido a getamano.",
    goDashboard: "Ir a mi panel",
    invalid: "El código debe tener 6 dígitos.",
  };

  // Send the initial OTP automatically when the page loads
  useEffect(() => {
    if (!email || hasRequestedInitial) return;
    setHasRequestedInitial(true);
    api.post("/auth/send-otp", { email, locale: lang })
      .then((r) => {
        if (r.data?.already_verified) {
          setVerified(true);
        } else {
          setCooldown(COOLDOWN_SECONDS);
        }
      })
      .catch(() => {});
  }, [email, hasRequestedInitial, lang]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Focus first input on mount
  useEffect(() => { inputs.current[0]?.focus(); }, []);

  const setDigit = (idx, val) => {
    const cleaned = val.replace(/\D/g, "").slice(-1);
    setDigits((arr) => {
      const copy = [...arr];
      copy[idx] = cleaned;
      return copy;
    });
    setError("");
    if (cleaned && idx < CODE_LENGTH - 1) inputs.current[idx + 1]?.focus();
  };

  const onKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) inputs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < CODE_LENGTH - 1) inputs.current[idx + 1]?.focus();
  };

  const onPaste = (e) => {
    const pasted = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (pasted.length === CODE_LENGTH) {
      e.preventDefault();
      setDigits(pasted.split(""));
      // Submit immediately
      setTimeout(() => doVerify(pasted), 50);
    }
  };

  const doVerify = async (codeOverride) => {
    const code = codeOverride || digits.join("");
    if (code.length !== CODE_LENGTH) {
      setError(T.invalid);
      return;
    }
    setVerifying(true);
    setError("");
    try {
      await api.post("/auth/verify-otp", { email, code });
      setVerified(true);
      try { await refresh?.(); } catch (_e) { /* ignore */ }
      toast.success(T.successTitle);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Error";
      setError(msg);
      // clear and refocus on last digit so user can retry
      inputs.current[CODE_LENGTH - 1]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    if (digits.every((d) => d) && !verifying && !verified) {
      doVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const doResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError("");
    try {
      await api.post("/auth/send-otp", { email, locale: lang });
      setCooldown(COOLDOWN_SECONDS);
      toast.success(lang === "en" ? "New code sent" : "Código reenviado");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Error";
      setError(msg);
      // Server-provided cooldown takes priority
      const m = msg.match(/(\d+)\s*seg/);
      if (m) setCooldown(parseInt(m[1], 10));
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <Header />
        <main className="max-w-md mx-auto px-4 py-16 text-center">
          <Mail className="w-10 h-10 mx-auto text-slate-400" />
          <h1 className="font-display font-bold text-2xl text-slate-900 mt-4">
            {lang === "en" ? "Email missing" : "Correo no proporcionado"}
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            {lang === "en"
              ? "Open this page from your registration email or log in first."
              : "Abre esta página desde tu correo de registro o inicia sesión primero."}
          </p>
          <Link to="/login" className="inline-flex mt-5 px-5 py-2.5 rounded-full text-white font-semibold" style={{ backgroundColor: "#03045E" }}>
            {lang === "en" ? "Go to login" : "Ir al login"}
          </Link>
        </main>
      </div>
    );
  }

  if (verified) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <Header />
        <main className="max-w-md mx-auto px-4 py-16">
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-sm" data-testid="verify-email-success">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="font-display font-bold text-2xl text-slate-900 mt-4">{T.successTitle}</h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">{T.successBody}</p>
            <button
              onClick={() => navigate(user ? "/dashboard" : "/")}
              className="mt-6 px-6 py-3 rounded-full text-white font-semibold inline-flex items-center gap-2"
              style={{ backgroundColor: "#03045E" }}
              data-testid="verify-email-go-dashboard"
            >
              {T.goDashboard}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-md mx-auto px-4 py-12 sm:py-16">
        <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 mb-4" data-testid="verify-email-back">
          <ArrowLeft className="w-4 h-4" /> {T.back}
        </button>

        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}>
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-900 leading-tight" data-testid="verify-email-title">{T.title}</h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            {T.subtitle}{" "}
            <span className="font-semibold text-slate-900 break-all" data-testid="verify-email-target">{email || T.placeholderEmail}</span>
          </p>

          <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">{T.enterCode}</p>
          <div className="mt-2 flex gap-2 sm:gap-3 justify-between" onPaste={onPaste} data-testid="verify-email-code-input">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={1}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                disabled={verifying}
                className="flex-1 max-w-[52px] aspect-square text-center text-2xl sm:text-3xl font-bold tabular-nums rounded-xl border-2 border-slate-200 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 outline-none disabled:opacity-60 transition"
                style={{ color: "#03045E" }}
                data-testid={`verify-email-digit-${i}`}
              />
            ))}
          </div>

          {error && <p className="mt-3 text-sm text-red-600" data-testid="verify-email-error">{error}</p>}

          <button
            onClick={() => doVerify()}
            disabled={verifying || digits.some((d) => !d)}
            className="mt-5 w-full py-3 rounded-2xl text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
            data-testid="verify-email-submit"
          >
            {verifying ? <><Loader2 className="w-4 h-4 animate-spin" /> {T.verifying}</> : T.verifyBtn}
          </button>

          <div className="mt-5 text-center">
            <button
              onClick={doResend}
              disabled={cooldown > 0 || resending}
              className="text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: cooldown > 0 ? "#94A3B8" : "#03045E" }}
              data-testid="verify-email-resend"
            >
              <RefreshCw className={`w-4 h-4 ${resending ? "animate-spin" : ""}`} />
              {cooldown > 0 ? T.resendIn(cooldown) : T.resend}
            </button>
          </div>

          <div className="mt-7 pt-5 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500">{T.helpTitle}</p>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{T.help}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
