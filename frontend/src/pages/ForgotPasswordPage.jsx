import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, CheckCircle2, ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import Header from "../components/Header";

export default function ForgotPasswordPage() {
  const { lang } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email: email.trim().toLowerCase(), locale: lang });
      setSent(true);
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo enviar el enlace. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-md mx-auto px-4 sm:px-6 py-10 sm:py-16" data-testid="forgot-password-page">
        <Link to="/login" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-6">
          <ArrowLeft className="w-4 h-4" /> Volver a iniciar sesión
        </Link>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          {!sent ? (
            <>
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#E1F5EE" }}>
                <Mail className="w-5 h-5" style={{ color: "#025F67" }} />
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900 text-center mb-2">¿Olvidaste tu contraseña?</h1>
              <p className="text-sm text-slate-500 text-center mb-6 leading-relaxed">
                Te enviamos un enlace para que crees una nueva. Funciona 60 minutos.
              </p>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Correo electrónico</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    data-testid="forgot-email-input"
                  />
                </div>
                {error && <p className="text-sm text-red-600" data-testid="forgot-error">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-3 rounded-full text-white font-bold disabled:opacity-50 transition"
                  style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
                  data-testid="forgot-submit"
                >
                  {loading ? "Enviando..." : "Enviar enlace"}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center" data-testid="forgot-success">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#D1FAE5" }}>
                <CheckCircle2 className="w-7 h-7" style={{ color: "#059669" }} />
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">¡Listo!</h1>
              <p className="text-sm text-slate-600 leading-relaxed mb-2">
                Si <strong className="text-slate-900">{email}</strong> está registrado, recibirás un correo con el enlace para crear tu nueva contraseña.
              </p>
              <p className="text-xs text-slate-400">Revisa también tu carpeta de Spam.</p>
              <Link to="/login" className="inline-block mt-6 text-sm font-semibold text-teal-700 hover:underline">
                Volver a iniciar sesión
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
