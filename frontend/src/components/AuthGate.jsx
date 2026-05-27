import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Lock, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";

/**
 * AuthGate — Section 66 (login required for high-value actions).
 *
 * Wraps any clickable element. When the viewer is logged in, the child
 * onClick is invoked normally. When guest, a friendly modal pops up
 * asking them to sign in / register, preserving where they were so the
 * action runs automatically after auth.
 *
 * Usage:
 *   <AuthGate action="message">
 *     <button onClick={handleSendMessage}>Send</button>
 *   </AuthGate>
 *
 * Or via render prop:
 *   <AuthGate action="quote">
 *     {(guard) => <button onClick={guard(handleQuote)}>Cotizar</button>}
 *   </AuthGate>
 *
 * Recognized `action` keys (drive the modal copy + analytics):
 *   message · quote · book · apply · contact · phone · share-private
 */
const COPY = {
  message: {
    es: { title: "Inicia sesión para enviar mensajes", body: "Mensajea proveedores y guarda tu conversación protegida." },
    en: { title: "Sign in to send messages",            body: "Message providers and keep your chats secured." },
  },
  quote: {
    es: { title: "Inicia sesión para cotizar",          body: "Recibe propuestas de proveedores verificados." },
    en: { title: "Sign in to request a quote",          body: "Get quotes from verified providers." },
  },
  book: {
    es: { title: "Inicia sesión para reservar cita",    body: "Tu calendario y tus reservas quedan sincronizados." },
    en: { title: "Sign in to book",                     body: "Your calendar stays in sync." },
  },
  apply: {
    es: { title: "Inicia sesión para aplicar",          body: "Aplica a chambas con un click. Tu perfil habla por ti." },
    en: { title: "Sign in to apply",                    body: "Apply to jobs with one click — your profile speaks for you." },
  },
  contact: {
    es: { title: "Inicia sesión para contactar",        body: "Protegemos los datos del proveedor de spam." },
    en: { title: "Sign in to contact",                  body: "We protect provider details from spam." },
  },
  phone: {
    es: { title: "Inicia sesión para llamar",           body: "Solo usuarios registrados pueden ver el número." },
    en: { title: "Sign in to call",                     body: "Only registered users can view the number." },
  },
  default: {
    es: { title: "Inicia sesión para continuar",        body: "Solo te toma un segundo crear una cuenta gratis." },
    en: { title: "Sign in to continue",                 body: "Takes one second to create a free account." },
  },
};

export default function AuthGate({ children, action = "default", onIntercept }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // If the viewer is logged in, pass the child through untouched.
  if (user) {
    if (typeof children === "function") return children((fn) => fn);
    return children;
  }

  // Guest: wrap or render-prop with a guard
  const guard = (fn) => (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    onIntercept?.(action);
    setOpen(true);
  };

  if (typeof children === "function") {
    return (
      <>
        {children(guard)}
        {open && <LoginPrompt action={action} onClose={() => setOpen(false)} />}
      </>
    );
  }

  // Element children: intercept their onClick
  return (
    <>
      <span
        onClickCapture={(e) => {
          if (e.target.closest("a")) e.preventDefault();
          e.stopPropagation();
          onIntercept?.(action);
          setOpen(true);
        }}
        className="contents"
        data-testid={`auth-gate-${action}`}
      >
        {children}
      </span>
      {open && <LoginPrompt action={action} onClose={() => setOpen(false)} />}
    </>
  );
}

function LoginPrompt({ action, onClose }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const copy = (COPY[action] || COPY.default)[lang === "en" ? "en" : "es"];

  const redirectTo = encodeURIComponent(location.pathname + location.search + location.hash);
  const goLogin = () => navigate(`/login?redirect=${redirectTo}`);
  const goRegister = () => navigate(`/register?redirect=${redirectTo}`);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
      data-testid="auth-gate-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-sm bg-white rounded-t-3xl md:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4"
        role="dialog"
        aria-label={copy.title}
      >
        <div className="relative px-5 pt-6 pb-5">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
            aria-label="Close"
            data-testid="auth-gate-close"
          >
            <X className="w-4 h-4" />
          </button>
          <span
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-3"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
          >
            <Lock className="w-6 h-6" />
          </span>
          <h3 className="font-display font-extrabold text-slate-900 text-lg leading-tight" data-testid="auth-gate-title">
            {copy.title}
          </h3>
          <p className="text-sm text-slate-600 mt-1.5 leading-snug">{copy.body}</p>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={goLogin}
              className="w-full h-11 rounded-xl text-white font-bold text-sm transition hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
              data-testid="auth-gate-login-btn"
            >
              {lang === "en" ? "Sign in" : "Iniciar sesión"}
            </button>
            <button
              type="button"
              onClick={goRegister}
              className="w-full h-11 rounded-xl text-slate-700 font-semibold text-sm border border-slate-200 hover:bg-slate-50 transition"
              data-testid="auth-gate-register-btn"
            >
              {lang === "en" ? "Create free account" : "Crear cuenta gratis"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-3 text-center">
            {lang === "en"
              ? "Free forever for clients. No credit card needed."
              : "Gratis para siempre para clientes. Sin tarjeta."}
          </p>
        </div>
      </div>
    </div>
  );
}
