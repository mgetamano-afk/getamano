import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

export default function AuthCallback() {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) {
      navigate("/login");
      return;
    }
    const session_id = m[1];
    const intent = sessionStorage.getItem("tx_intent") || "client";
    const role = intent === "provider" || intent === "existing" ? "provider" : "client";

    api.post("/auth/google/session", { session_id, role })
      .then(({ data }) => {
        setUser(data.user);
        sessionStorage.removeItem("tx_intent");
        // Clear hash and navigate
        window.history.replaceState({}, "", window.location.pathname);
        const dest = data.user.role === "admin" ? "/dashboard/admin" :
                     data.user.role === "provider" ? "/dashboard/provider" : "/dashboard/client";
        navigate(dest, { state: { user: data.user }, replace: true });
      })
      .catch(() => navigate("/login"));
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-slate-600">Iniciando sesión...</p>
      </div>
    </div>
  );
}
