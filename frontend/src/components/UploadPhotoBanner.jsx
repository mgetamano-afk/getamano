import { useEffect, useRef, useState } from "react";
import { Upload, Camera, X, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { getDefaultAvatar } from "../lib/avatar";
import { toast } from "sonner";

/**
 * UploadPhotoBanner — Section 84.
 *
 * Soft banner shown in the provider dashboard when the provider is still
 * using a default illustrated avatar. Includes a one-tap upload button so
 * the friction from "default avatar" to "real photo" is minimal.
 *
 * Why this matters:
 *   - Clients trust profiles with real photos over illustrations
 *   - Our default library guarantees a friendly-looking profile, BUT a real
 *     photo doubles conversion ("this is a real person I can hire")
 *   - The banner is dismissible with a soft 7-day cooldown — not a hard
 *     "remember forever" dismiss, so providers who postpone get reminded
 *
 * Visibility rules:
 *   - Hidden if user.role !== "provider"
 *   - Hidden if the profile has logo_url, photo_url or picture (already
 *     uploaded a real image)
 *   - Hidden if dismissed within last 7 days (localStorage)
 *
 * Upload flow:
 *   1. User clicks the banner CTA → file picker opens
 *   2. POST to /providers/me/upload-asset?target=logo (multipart)
 *   3. Optimistic UI: spinner → check → toast → refetch profile via
 *      onUploaded callback
 *   4. Banner disappears automatically because logo_url is now set
 */

const DISMISS_KEY = "gtm_upload_photo_dismissed_at";
const COOLDOWN_DAYS = 7;

function isCooldownActive() {
  try {
    const at = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    if (!at) return false;
    const ageDays = (Date.now() - at) / (1000 * 60 * 60 * 24);
    return ageDays < COOLDOWN_DAYS;
  } catch { return false; }
}

function markDismissed() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
}

export default function UploadPhotoBanner({ profile, onUploaded }) {
  const { lang } = useI18n();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hidden, setHidden] = useState(false);
  const fileInputRef = useRef(null);

  // Determine if a real photo is already on file (any of these counts)
  const hasRealPhoto = !!(profile?.logo_url || profile?.photo_url || user?.picture);

  useEffect(() => {
    if (hasRealPhoto || user?.role !== "provider" || isCooldownActive()) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  }, [hasRealPhoto, user?.role]);

  if (hidden || !user || user.role !== "provider") return null;

  const T = lang === "es" ? {
    title: "Sube tu foto real para confiar más",
    body: "Estás usando un avatar de cortesía. Una foto tuya real duplica las cotizaciones — los clientes ven a la persona detrás del servicio.",
    cta: "Subir mi foto",
    uploading: "Subiendo…",
    success: "¡Foto actualizada!",
    later: "Más tarde",
    dismissAria: "Cerrar este banner",
    pickError: "Selecciona una imagen válida (JPG, PNG, WEBP).",
    tooLarge: "La imagen no debe pasar de 10 MB.",
    uploadFail: "No se pudo subir. Intenta de nuevo.",
  } : {
    title: "Upload your real photo to build trust",
    body: "You're using a courtesy avatar. Your real photo doubles quote requests — clients see the person behind the service.",
    cta: "Upload my photo",
    uploading: "Uploading…",
    success: "Photo updated!",
    later: "Later",
    dismissAria: "Dismiss this banner",
    pickError: "Pick a valid image (JPG, PNG, WEBP).",
    tooLarge: "Image must be under 10 MB.",
    uploadFail: "Upload failed. Try again.",
  };

  const defaultAvatar = getDefaultAvatar({
    user_id: user.user_id,
    name: profile?.business_name || user.name,
    gender: profile?.gender || user.gender,
  });

  const openFilePicker = () => fileInputRef.current?.click();

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-picking same file
    if (!file.type.startsWith("image/")) {
      toast.error(T.pickError);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(T.tooLarge);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("target", "logo");
      await api.post("/providers/me/upload-asset", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSuccess(true);
      toast.success(T.success);
      // Notify parent so it re-fetches the profile and hides the banner
      onUploaded?.();
      // Hide locally too after a brief moment so the success state is visible
      setTimeout(() => setHidden(true), 1500);
    } catch (err) {
      console.error("[upload-photo-banner] failed", err);
      toast.error(err?.response?.data?.detail || T.uploadFail);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    markDismissed();
    setHidden(true);
  };

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-amber-200"
      style={{
        background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 50%, #FFEDD5 100%)",
        boxShadow: "0 4px 16px -8px rgba(245, 158, 11, 0.18)",
        animation: success ? "upb-bounce-out 480ms ease-in 1.2s forwards" : "upb-fade-in 360ms ease-out both",
      }}
      data-testid="upload-photo-banner"
    >
      <style>{`
        @keyframes upb-fade-in   { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes upb-bounce-out{ to   { opacity: 0; transform: scale(0.95); height: 0; padding: 0; margin: 0; } }
        @keyframes upb-spin      { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes upb-spark     { 0%,100% { opacity: 0.5; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.15); } }
      `}</style>

      {/* Dismiss */}
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full hover:bg-amber-200/60 flex items-center justify-center transition z-10"
        aria-label={T.dismissAria}
        data-testid="upload-photo-banner-dismiss"
      >
        <X className="w-3.5 h-3.5 text-amber-700" />
      </button>

      <div className="p-4 sm:p-5 flex items-center gap-4">
        {/* Avatar preview with overlay icon */}
        <div className="relative shrink-0">
          <img
            src={defaultAvatar}
            alt=""
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover ring-2 ring-amber-300"
            loading="lazy"
          />
          <div
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md ring-2 ring-white"
            aria-hidden="true"
          >
            {success ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            ) : busy ? (
              <Loader2 className="w-3.5 h-3.5 text-white" style={{ animation: "upb-spin 1s linear infinite" }} />
            ) : (
              <Camera className="w-3 h-3 text-white" />
            )}
          </div>
          <Sparkles
            className="absolute -top-1 -right-2 w-3 h-3 text-amber-500"
            style={{ animation: "upb-spark 2.4s ease-in-out infinite" }}
            aria-hidden="true"
          />
        </div>

        {/* Copy */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm sm:text-[15px] font-extrabold text-slate-900 leading-tight tracking-tight">
            {T.title}
          </h3>
          <p className="text-[12px] sm:text-[13px] text-slate-600 mt-1 leading-snug">
            {T.body}
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            type="button"
            onClick={openFilePicker}
            disabled={busy || success}
            className={`inline-flex items-center justify-center gap-1.5 font-semibold text-[12px] px-3.5 py-2 rounded-full transition active:scale-95 ${
              success
                ? "bg-emerald-500 text-white"
                : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
            } disabled:opacity-70`}
            data-testid="upload-photo-banner-cta"
          >
            {success ? (
              <><CheckCircle2 className="w-3.5 h-3.5" /> {T.success}</>
            ) : busy ? (
              <><Loader2 className="w-3.5 h-3.5" style={{ animation: "upb-spin 1s linear infinite" }} /> {T.uploading}</>
            ) : (
              <><Upload className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{T.cta}</span><span className="sm:hidden">📷</span></>
            )}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 transition"
            data-testid="upload-photo-banner-later"
          >
            {T.later}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onPick}
        data-testid="upload-photo-banner-input"
      />
    </div>
  );
}
