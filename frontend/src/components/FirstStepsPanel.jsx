import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Image as ImageIcon,
  FileImage,
  FileText,
  Camera,
  Share2,
  Star,
  Check,
  ArrowRight,
  Sparkles,
  Trophy,
} from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import MediaChooser from "./MediaChooser";

/**
 * FirstStepsPanel — Section 64.
 *
 * Gamified onboarding for new providers: a 6-step checklist that drives
 * activation from sign-up to first review. Each completed step lifts a
 * confetti micro-celebration and updates the overall progress bar.
 *
 * Steps:
 *   1) Add a logo            (AI or upload)        — required for trust
 *   2) Write the bio         (40+ chars)           — required for SEO
 *   3) Add a banner          (AI or upload)        — strengthens identity
 *   4) Upload 3 gallery pix  (or single set)       — proof of work
 *   5) Share your eCard      (any channel)         — drives discovery
 *   6) Earn your first review                       — closes the loop
 *
 * Visibility:
 *   - Only renders for role==="provider".
 *   - Auto-hides when ALL 6 steps are complete (or dismissed for 30 days
 *     via the "skip" button).
 *
 * Layout:
 *   - Slides up from bottom-LEFT (same anchor as SmartActionHub but
 *     positioned slightly higher when both are open simultaneously).
 *   - On md+: opens as a centered modal.
 */
const SKIP_KEY = "gtm_first_steps_skipped_until";
const SKIP_DAYS = 30;

export default function FirstStepsPanel({ provider, open, onClose, onProfileUpdated }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [chooserTarget, setChooserTarget] = useState(null); // "logo" | "banner" | null
  const [hasShare, setHasShare] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [gallerySize, setGallerySize] = useState(0);

  // Pull review count + gallery count from provider data already loaded by parent
  useEffect(() => {
    if (!open || !provider?.provider_id) return;
    const galleryLen = (provider.__gallery_count != null)
      ? provider.__gallery_count
      : (Array.isArray(provider.gallery) ? provider.gallery.length : 0);
    setGallerySize(galleryLen);
    setReviewCount(provider.rating_count || provider.review_count || 0);
    api.get("/providers/me/share-rewards").then(r => setHasShare((r.data?.total_shares || 0) > 0)).catch(() => {});
  }, [open, provider]);

  const steps = useMemo(() => {
    const hasBio = (provider?.description || "").trim().length >= 40;
    return [
      { id: "logo",    icon: ImageIcon,  done: !!provider?.logo_url,                  titleEs: "Sube o crea tu logo",          titleEn: "Add your logo",         descEs: "Generado con IA o tu propia foto.",      descEn: "Generated with AI or your own image.",   cta: "logo" },
      { id: "bio",     icon: FileText,   done: hasBio,                                titleEs: "Escribe tu descripción",       titleEn: "Write your bio",        descEs: "Mínimo 40 caracteres. Cuenta tu historia.", descEn: "At least 40 characters. Tell your story.", cta: "navigate", path: "/dashboard/provider?tab=perfil" },
      { id: "banner",  icon: FileImage,  done: !!provider?.banner_url || !!provider?.cover_url, titleEs: "Sube o crea tu banner",       titleEn: "Add your banner",       descEs: "Imagen principal de tu eCard.",          descEn: "Hero image for your eCard.",             cta: "banner" },
      { id: "gallery", icon: Camera,     done: gallerySize >= 3,                      titleEs: "Sube 3 fotos a tu galería",     titleEn: "Upload 3 gallery photos", descEs: "Muestra tu trabajo. Sumas confianza 4x.",   descEn: "Show your work. 4x more contacts.",     cta: "navigate", path: "/dashboard/provider?tab=galeria" },
      { id: "share",   icon: Share2,     done: hasShare,                              titleEs: "Comparte tu eCard",            titleEn: "Share your eCard",      descEs: "WhatsApp, Instagram, NFC — donde quieras.", descEn: "WhatsApp, Instagram, NFC — anywhere.",  cta: "navigate", path: "/dashboard/provider" },
      { id: "review",  icon: Star,       done: reviewCount > 0,                       titleEs: "Tu primera reseña",            titleEn: "Earn your first review", descEs: "Pídele a un cliente que te conoce. 1 reseña dispara conversión 3x.", descEn: "Ask a client who knows you. 1 review = 3x conversion.", cta: "navigate", path: "/dashboard/provider?tab=referidos" },
    ];
  }, [provider?.logo_url, provider?.banner_url, provider?.cover_url, provider?.description, gallerySize, hasShare, reviewCount]);

  const done = steps.filter(s => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  const allDone = done === steps.length;

  const handleStep = (s) => {
    if (s.cta === "logo")    { setChooserTarget("logo"); return; }
    if (s.cta === "banner")  { setChooserTarget("banner"); return; }
    if (s.cta === "navigate" && s.path) { onClose?.(); navigate(s.path); }
  };

  const handleSaved = async () => {
    setChooserTarget(null);
    // Refresh provider state
    try {
      const { data } = await api.get("/providers/me");
      onProfileUpdated?.(data);
    } catch { /* ignore */ }
  };

  const handleSkip = () => {
    const until = Date.now() + SKIP_DAYS * 24 * 3600 * 1000;
    try { localStorage.setItem(SKIP_KEY, String(until)); } catch { /* ignore */ }
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-slate-950/50 backdrop-blur-sm p-0 md:p-4 animate-in fade-in"
      onClick={onClose}
      data-testid="first-steps-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-3xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-4"
        role="dialog"
        aria-label={lang === "en" ? "First steps" : "Primeros pasos"}
        data-testid="first-steps-panel"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
            aria-label="Close"
            data-testid="first-steps-close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #F59E0B 0%, #F97316 100%)" }}
            >
              {allDone ? <Trophy className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
            </span>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-slate-900 text-base md:text-lg leading-tight">
                {allDone
                  ? (lang === "en" ? "All set! 🎉" : "¡Todo listo! 🎉")
                  : (lang === "en" ? "First steps" : "Primeros pasos")}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {done} / {steps.length} {lang === "en" ? "complete" : "completados"}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${pct}%`,
                background: allDone
                  ? "linear-gradient(90deg, #10B981 0%, #2F9D94 100%)"
                  : "linear-gradient(90deg, #F59E0B 0%, #F97316 100%)",
              }}
              data-testid="first-steps-progress"
            />
          </div>
        </div>

        {/* Steps list */}
        <ul className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.id} data-testid={`first-step-${s.id}`}>
                <button
                  type="button"
                  onClick={() => !s.done && handleStep(s)}
                  disabled={s.done}
                  className={`group w-full text-left rounded-2xl p-3.5 flex items-start gap-3 transition ${
                    s.done
                      ? "bg-emerald-50/60 ring-1 ring-emerald-200/60 cursor-default"
                      : "bg-slate-50 hover:bg-white hover:ring-2 hover:ring-teal-200 hover:shadow-md ring-1 ring-slate-200 cursor-pointer"
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      s.done ? "bg-emerald-500 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"
                    }`}
                  >
                    {s.done ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-bold leading-tight ${s.done ? "text-emerald-900 line-through opacity-80" : "text-slate-900"}`}>
                      {lang === "en" ? s.titleEn : s.titleEs}
                    </div>
                    <div className={`text-xs mt-0.5 leading-snug ${s.done ? "text-emerald-700/70" : "text-slate-500"}`}>
                      {lang === "en" ? s.descEn : s.descEs}
                    </div>
                  </div>
                  {!s.done && (
                    <ArrowRight className="w-4 h-4 text-teal-600 mt-1 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium"
            data-testid="first-steps-skip"
          >
            {lang === "en" ? "Skip for 30 days" : "Recordar en 30 días"}
          </button>
          {allDone && (
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-bold px-4 h-9 rounded-full text-white"
              style={{ background: "linear-gradient(135deg, #10B981 0%, #2F9D94 100%)" }}
              data-testid="first-steps-finish"
            >
              {lang === "en" ? "Awesome 🎉" : "¡Genial! 🎉"}
            </button>
          )}
        </div>
      </div>

      {/* Media chooser overlay (logo or banner) */}
      {chooserTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setChooserTarget(null)}
          data-testid="media-chooser-overlay"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
            <MediaChooser
              target={chooserTarget}
              onSaved={handleSaved}
              onCancel={() => setChooserTarget(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Returns true if the panel should auto-suggest itself based on dismissal TTL.
 * Stored as a UTC ms timestamp in localStorage. Caller decides UX.
 */
export function isFirstStepsSkipped() {
  try {
    const v = Number(localStorage.getItem(SKIP_KEY));
    return v && v > Date.now();
  } catch {
    return false;
  }
}
