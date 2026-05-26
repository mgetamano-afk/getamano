import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles, ArrowRight, Home, Briefcase, HeartHandshake } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";

/**
 * NotFoundPage — Section 59.
 *
 * Elegant 404 with auto-redirect:
 *   - Animated countdown ring (5s)
 *   - "Ir ahora" button to skip the wait
 *   - Quick-link pills for popular sections
 *   - Auto-redirect: back if browser history is from same origin, else `/`
 *   - Never shows the failed URL or technical errors
 */
const REDIRECT_SECONDS = 5;
const CIRCUMFERENCE = 100.5; // 2π × 16 px stroke circle

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const { user } = useAuth();
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);

  // Heuristic: same-origin history → go back; otherwise fall back to landing
  const goBackInHistory =
    typeof document !== "undefined" &&
    document.referrer &&
    document.referrer.includes(window.location.hostname);

  const handleRedirect = useCallback(() => {
    if (goBackInHistory) {
      navigate(-1);
    } else if (user) {
      navigate("/dashboard");
    } else {
      navigate("/");
    }
  }, [navigate, goBackInHistory, user]);

  useEffect(() => {
    if (seconds <= 0) {
      handleRedirect();
      return undefined;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, handleRedirect]);

  const strokeOffset = CIRCUMFERENCE * (1 - seconds / REDIRECT_SECONDS);

  const quickLinks = [
    { label: lang === "en" ? "Home" : "Inicio", path: "/", Icon: Home, testid: "nf-link-home" },
    { label: lang === "en" ? "Search" : "Buscar", path: "/search", Icon: Search, testid: "nf-link-search" },
    { label: lang === "en" ? "Community" : "Comunidad", path: "/comunidad", Icon: HeartHandshake, testid: "nf-link-community" },
    { label: lang === "en" ? "Gigs" : "Chambas", path: "/empleos", Icon: Briefcase, testid: "nf-link-empleos" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-slate-50 to-white" data-testid="not-found-page">
      <div className="max-w-md w-full text-center">
        {/* Logo + countdown ring (combined animated SVG) */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="16" fill="none" stroke="#E2E8F0" strokeWidth="2" />
            <circle
              cx="18" cy="18" r="16"
              fill="none" stroke="#0D7377" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeOffset}
              style={{ transition: "stroke-dashoffset 1s linear" }}
              data-testid="not-found-ring"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white font-display font-bold text-2xl shadow-lg" data-testid="not-found-logo">
              G
            </div>
            <span className="text-xs font-semibold text-slate-400 mt-1.5 tabular-nums" data-testid="not-found-seconds">{seconds}s</span>
          </div>
        </div>

        <h1 className="font-display text-3xl md:text-4xl font-bold text-slate-900 mb-3" data-testid="not-found-title">
          {lang === "en" ? "Oops, this page doesn't exist" : "Ups, esta página no existe"}
        </h1>
        <p className="text-slate-500 mb-6 text-base leading-relaxed" data-testid="not-found-sub">
          {lang === "en"
            ? `The link you followed is no longer available or was moved. We're taking you back in ${seconds} second${seconds === 1 ? "" : "s"}.`
            : `El enlace que seguiste ya no está disponible o fue movido. Te llevamos de regreso en ${seconds} segundo${seconds === 1 ? "" : "s"}.`}
        </p>

        <button
          type="button"
          onClick={handleRedirect}
          className="inline-flex items-center gap-2 px-7 h-12 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-semibold transition shadow-md mb-7"
          data-testid="not-found-go-now"
        >
          {lang === "en" ? "Go now" : "Ir ahora"}
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Quick-link pills */}
        <div className="flex flex-wrap gap-2 justify-center mb-8" data-testid="not-found-quick-links">
          {quickLinks.map((q) => (
            <button
              key={q.path}
              type="button"
              onClick={() => navigate(q.path)}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-100 text-sm font-medium transition"
              data-testid={q.testid}
            >
              <q.Icon className="w-3.5 h-3.5" />
              {q.label}
            </button>
          ))}
        </div>

        {/* Soft community footer */}
        <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <Sparkles className="w-3 h-3" />
          {lang === "en"
            ? "Something wrong? Tell us in Community"
            : "¿Algo salió mal? Cuéntanos en Comunidad"}
        </div>
      </div>
    </div>
  );
}
