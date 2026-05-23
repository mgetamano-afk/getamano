import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import Header from "../components/Header";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const isActivation = params.get("activate") === "1";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const passwordStrong = password.length >= 8;
  const passwordsMatch = password.length > 0 && password === confirm;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      setError("El enlace no es válido. Solicita uno nuevo.");
      return;
    }
    if (!passwordStrong) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (!passwordsMatch) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo cambiar la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-md mx-auto px-4 sm:px-6 py-10 sm:py-16" data-testid="reset-password-page">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          {!done ? (
            <>
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#E1F5EE" }}>
                <KeyRound className="w-5 h-5" style={{ color: "#025F67" }} />
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900 text-center mb-2">
                {isActivation ? "Activa tu cuenta" : "Nueva contraseña"}
              </h1>
              <p className="text-sm text-slate-500 text-center mb-6 leading-relaxed">
                {isActivation
                  ? "¡Bienvenido a getamano! Crea tu contraseña para empezar."
                  : "Crea una contraseña nueva para entrar a tu cuenta."}
              </p>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nueva contraseña</label>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      data-testid="reset-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      tabIndex={-1}
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && (
                    <p className={`text-[11px] mt-1.5 ${passwordStrong ? "text-emerald-600" : "text-amber-600"}`}>
                      {passwordStrong ? "✓ Contraseña válida" : "Debe tener al menos 8 caracteres"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar contraseña</label>
                  <input
                    type={showPwd ? "text" : "password"}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repite la contraseña"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    data-testid="reset-confirm-input"
                  />
                  {confirm && (
                    <p className={`text-[11px] mt-1.5 ${passwordsMatch ? "text-emerald-600" : "text-red-600"}`}>
                      {passwordsMatch ? "✓ Coinciden" : "Las contraseñas no coinciden"}
                    </p>
                  )}
                </div>
                {error && <p className="text-sm text-red-600" data-testid="reset-error">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !passwordStrong || !passwordsMatch}
                  className="w-full py-3 rounded-full text-white font-bold disabled:opacity-50 transition"
                  style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
                  data-testid="reset-submit"
                >
                  {loading ? "Guardando..." : isActivation ? "Activar mi cuenta" : "Cambiar contraseña"}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center" data-testid="reset-success">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#D1FAE5" }}>
                <CheckCircle2 className="w-7 h-7" style={{ color: "#059669" }} />
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">
                {isActivation ? "¡Cuenta activada!" : "Contraseña cambiada"}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                Te llevamos a la pantalla de inicio de sesión en un momento...
              </p>
              <Link to="/login" className="inline-block text-sm font-semibold text-teal-700 hover:underline">
                Iniciar sesión ahora →
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
