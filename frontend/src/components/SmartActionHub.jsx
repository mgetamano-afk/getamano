import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sparkles,
  X,
  MessageCircle,
  UserCog,
  Image as ImageIcon,
  Crown,
  Calendar,
  Star,
  Inbox,
  Bookmark,
  Search,
  ArrowRight,
  Lightbulb,
  Rocket,
  Bell,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import FirstStepsPanel, { isFirstStepsSkipped } from "./FirstStepsPanel";
import { ensurePushSubscription, pushSupported, pushPermission } from "../lib/push";

/**
 * SmartActionHub — Section 64.
 *
 * Floating contextual nudges hub (bottom-LEFT, opposite of QuickActionsFAB).
 * Fetches `/api/me/nudges` and shows a stack of prioritized suggestions
 * tailored to the user's current state (missing media, unread messages,
 * plan upgrade, pending requests, etc.).
 *
 * Behavior:
 *   · Hidden if no nudges, on /admin, on auth pages, or for logged-out users.
 *   · Pulsing badge with the count of active nudges.
 *   · Click expands a panel with each nudge as a dismissible card.
 *   · Dismissals persist in localStorage by nudge `id` (TTL: 7 days).
 *   · Auto-refresh on route change (so completing a nudge updates the list).
 */
const HIDE_RE = [
  /^\/admin(\/|$)/,
  /^\/dashboard\/admin(\/|$)/,
  /^\/login/,
  /^\/register/,
  /^\/registro/,
  /^\/verificar-correo/,
  /^\/verify-email/,
  /^\/forgot-password/,
  /^\/reset-password/,
  /^\/install/,
  /^\/instalar/,
];

const STORAGE_KEY = "gtm_dismissed_nudges_v1";
const DISMISS_TTL_MS = 7 * 24 * 3600 * 1000;

const ICONS = {
  MessageCircle, UserCog, Image: ImageIcon, Crown, Calendar, Star, Inbox, Bookmark, Search, Lightbulb, Rocket, Bell,
};

function loadDismissed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    // Clean expired entries
    const cleaned = Object.fromEntries(
      Object.entries(parsed).filter(([, ts]) => typeof ts === "number" && (now - ts) < DISMISS_TTL_MS)
    );
    if (Object.keys(cleaned).length !== Object.keys(parsed).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return {};
  }
}

function persistDismissed(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export default function SmartActionHub() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [nudges, setNudges] = useState([]);
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [provider, setProvider] = useState(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const fetchNudges = useCallback(async () => {
    if (!user) { setNudges([]); return; }
    try {
      const res = await api.get("/me/nudges");
      setNudges(Array.isArray(res.data) ? res.data : []);
    } catch {
      setNudges([]);
    }
  }, [user]);

  // Provider profile + onboarding signals (only when role=provider)
  const fetchProvider = useCallback(async () => {
    if (!user || user.role !== "provider") { setProvider(null); return; }
    try {
      const [p, s] = await Promise.all([
        api.get("/providers/me"),
        api.get("/providers/me/share-rewards").catch(() => ({ data: {} })),
      ]);
      // Gallery already lives inside the provider response (`gallery` field).
      const galleryLen = Array.isArray(p.data?.gallery) ? p.data.gallery.length : 0;
      const totalShares = s.data?.total_shares || 0;
      setProvider({ ...p.data, __gallery_count: galleryLen, __total_shares: totalShares });
    } catch { setProvider(null); }
  }, [user]);

  useEffect(() => { fetchNudges(); fetchProvider(); }, [fetchNudges, fetchProvider, location.pathname]);

  // Close panel on outside click / escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  if (!user) return null;
  if (HIDE_RE.some((re) => re.test(location.pathname))) return null;

  // Build first-steps nudge (only for providers with pending tasks)
  let firstStepsNudge = null;
  if (provider && user.role === "provider" && !isFirstStepsSkipped()) {
    const hasBio = (provider.description || "").trim().length >= 40;
    const completed = [
      !!provider.logo_url,
      hasBio,
      !!provider.banner_url || !!provider.cover_url,
      (provider.__gallery_count || 0) >= 3,
      (provider.__total_shares || 0) > 0,
      (provider.rating_count || 0) > 0,
    ].filter(Boolean).length;

    if (completed < 6) {
      firstStepsNudge = {
        id: "first-steps",
        type: "onboarding",
        priority: 1,
        title: lang === "en"
          ? `Activate your eCard (${completed}/6)`
          : `Activa tu eCard (${completed}/6)`,
        message: lang === "en"
          ? "Logo, bio, banner, photos, share & first review — guided onboarding."
          : "Logo, descripción, banner, fotos, compartir y reseña — todo guiado.",
        cta_label: lang === "en" ? "Continue setup" : "Continuar",
        cta_url: "#first-steps",
        icon: "Rocket",
      };
    }
  }

  // Section 68 — Push opt-in nudge (logged-in users on supported browsers)
  let pushNudge = null;
  if (user && pushSupported() && pushPermission() === "default") {
    pushNudge = {
      id: "enable-push",
      type: "settings",
      priority: 3,
      title: lang === "en" ? "Enable instant notifications" : "Activa notificaciones al instante",
      message: lang === "en"
        ? "Get a ping when clients message you or refer a job."
        : "Recibe un aviso cuando un cliente te escriba o te refieran un trabajo.",
      cta_label: lang === "en" ? "Enable" : "Activar",
      cta_url: "#enable-push",
      icon: "Bell",
    };
  }

  // Don't double-display: if the FirstSteps nudge owns the profile flow,
  // hide the standalone "complete-profile" and "add-gallery-photos" nudges.
  let mergedNudges = nudges;
  if (firstStepsNudge) {
    mergedNudges = nudges.filter((n) => n.type !== "profile" && n.type !== "media");
  }
  if (pushNudge) mergedNudges = [pushNudge, ...mergedNudges];

  const merged = firstStepsNudge ? [firstStepsNudge, ...mergedNudges] : mergedNudges;
  const visible = merged.filter((n) => !dismissed[n.id]);
  if (visible.length === 0 && !stepsOpen) return null;

  const dismissOne = (id) => {
    const next = { ...dismissed, [id]: Date.now() };
    setDismissed(next);
    persistDismissed(next);
  };

  const handleCta = (n) => {
    setOpen(false);
    if (n.cta_url === "#first-steps") {
      setStepsOpen(true);
    } else if (n.cta_url === "#enable-push") {
      ensurePushSubscription().then((r) => {
        if (r?.ok) {
          // Dismiss the nudge — re-renders will skip it (permission != default)
        }
      });
    } else {
      navigate(n.cta_url);
    }
  };

  const urgent = visible.filter((n) => n.priority <= 2).length;
  const showPulse = urgent > 0;

  return (
    <div
      ref={wrapperRef}
      className="fixed left-4 sm:left-6 z-50 flex flex-col items-start gap-2"
      style={{ bottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}
      data-testid="smart-action-hub"
    >
      {/* Expanded panel */}
      {open && (
        <div
          className="w-[320px] sm:w-[360px] max-h-[60vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200 mb-1 animate-in slide-in-from-bottom-2 fade-in"
          data-testid="smart-action-hub-panel"
          role="dialog"
          aria-label={lang === "en" ? "Smart suggestions" : "Sugerencias inteligentes"}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-white"
                style={{ background: "linear-gradient(135deg, #F59E0B 0%, #F97316 100%)" }}
              >
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <div className="text-sm font-bold text-slate-900 leading-tight">
                  {lang === "en" ? "Smart suggestions" : "Sugerencias para ti"}
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  {visible.length} {visible.length === 1
                    ? (lang === "en" ? "action" : "acción")
                    : (lang === "en" ? "actions" : "acciones")}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              aria-label="Close"
              data-testid="smart-action-hub-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <ul className="p-3 space-y-2.5">
            {visible.map((n) => {
              const Icon = ICONS[n.icon] || Lightbulb;
              const ringColor = n.priority === 1
                ? "#EF4444"
                : n.priority === 2
                ? "#F59E0B"
                : "#0EA5E9";
              return (
                <li
                  key={n.id}
                  className="relative rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3.5 hover:shadow-md transition-shadow"
                  data-testid={`smart-action-card-${n.id}`}
                >
                  <button
                    type="button"
                    onClick={() => dismissOne(n.id)}
                    className="absolute top-2 right-2 p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                    aria-label="Dismiss"
                    data-testid={`smart-action-dismiss-${n.id}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-start gap-3 pr-6">
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ring-2 ring-offset-1"
                      style={{ background: "white", borderColor: ringColor, ringColor }}
                    >
                      <Icon className="w-4.5 h-4.5" style={{ color: ringColor }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900 leading-snug">
                        {n.title}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 leading-snug">
                        {n.message}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCta(n)}
                        className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900 group"
                        data-testid={`smart-action-cta-${n.id}`}
                      >
                        <span>{n.cta_label}</span>
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* FAB button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="relative w-12 h-12 rounded-full text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
        style={{
          background: open
            ? "#0F172A"
            : "linear-gradient(135deg, #F59E0B 0%, #F97316 100%)",
          boxShadow: "0 8px 24px -6px rgba(249,115,22,0.55)",
        }}
        aria-label={open
          ? (lang === "en" ? "Close suggestions" : "Cerrar sugerencias")
          : (lang === "en" ? "Open smart suggestions" : "Abrir sugerencias inteligentes")}
        aria-expanded={open}
        data-testid="smart-action-hub-button"
      >
        {open ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}

        {/* Counter badge */}
        {!open && visible.length > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-orange-600 text-[11px] font-extrabold flex items-center justify-center ring-2 ring-white shadow"
            data-testid="smart-action-hub-count"
          >
            {visible.length > 9 ? "9+" : visible.length}
          </span>
        )}

        {/* Pulse halo when urgent */}
        {!open && showPulse && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "rgba(245,158,11,0.45)" }}
            aria-hidden="true"
          />
        )}
      </button>

      {/* First-Steps onboarding modal (providers only) */}
      <FirstStepsPanel
        provider={provider}
        open={stepsOpen}
        onClose={() => setStepsOpen(false)}
        onProfileUpdated={(p) => { setProvider(p); fetchNudges(); }}
      />
    </div>
  );
}
