import { useEffect, useState } from "react";
import { Camera, Images, X, Shield } from "lucide-react";

/**
 * MediaPermissionGate — V17.1 GDPR-style permission prompt.
 *
 * Browsers (especially iOS Safari) only show their native permission
 * prompt the FIRST time you call getUserMedia / open a file input. After
 * that the answer is cached silently. This component shows a clear
 * Spanish/English prompt BEFORE we trigger the native browser API so:
 *
 *   1. The user knows WHY we're asking (privacy compliance — anti-fingerprint).
 *   2. The user can deny without ever triggering the native prompt
 *      (no "1/3 of permissions used up" feeling).
 *   3. We remember the choice per-kind in localStorage so we don't ask
 *      twice in the same session.
 *
 * Usage:
 *   <MediaPermissionGate
 *     kind="camera" | "gallery"
 *     onGranted={() => triggerNativePrompt()}
 *     onDenied={() => closeModal()}
 *   />
 *
 * The parent controls visibility via conditional render. We never block
 * the parent from re-asking on a future interaction — only the implicit
 * localStorage cache may short-circuit (and the parent can pass
 * `force={true}` to bypass that).
 */
const STORAGE_KEY = "getamano.media_permission";

function readCache() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function writeCache(kind, value) {
  try {
    const cur = readCache();
    cur[kind] = { value, at: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
  } catch { /* incognito mode — fine */ }
}

export default function MediaPermissionGate({ kind, onGranted, onDenied, lang = "es", force = false }) {
  // Skip prompt if cached as granted within the last 30 days.
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (force) return;
    const cache = readCache()[kind];
    if (cache?.value === "granted" && Date.now() - cache.at < 30 * 24 * 3600 * 1000) {
      setSkipped(true);
      // Fire after the mount tick so the parent never sees both states.
      Promise.resolve().then(onGranted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (skipped) return null;

  const T = lang === "en" ? {
    cameraTitle: "getamano wants to access your camera",
    galleryTitle: "getamano wants to access your photos",
    body: "We only use this to upload the reel or photo you choose. We never read other files, we don't run in the background, and you can revoke this anytime from your browser settings.",
    allow: "Allow",
    deny: "Not now",
    privacyNote: "🛡️ Your privacy is protected. We comply with US privacy laws (CCPA / COPPA) and GDPR if you're in the EU.",
  } : {
    cameraTitle: "getamano quiere acceder a tu cámara",
    galleryTitle: "getamano quiere acceder a tus fotos",
    body: "Solo lo usamos para subir el reel o la foto que elijas. Nunca leemos otros archivos, no corremos en segundo plano, y puedes revocar el permiso cuando quieras desde tu navegador.",
    allow: "Permitir",
    deny: "Ahora no",
    privacyNote: "🛡️ Tu privacidad está protegida. Cumplimos con la ley CCPA / COPPA (EE.UU.) y GDPR si estás en la UE.",
  };

  const Icon = kind === "camera" ? Camera : Images;
  const title = kind === "camera" ? T.cameraTitle : T.galleryTitle;

  const handleAllow = () => {
    writeCache(kind, "granted");
    onGranted?.();
  };
  const handleDeny = () => {
    writeCache(kind, "denied");
    onDenied?.();
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4"
      data-testid="media-permission-gate"
      data-permission-kind={kind}
    >
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 md:pt-6 pb-4 flex items-start gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-400 to-fuchsia-500 flex items-center justify-center shadow-lg">
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 leading-tight" data-testid="media-permission-title">
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{lang === "en" ? "Privacy notice" : "Aviso de privacidad"}</p>
          </div>
          <button
            type="button"
            onClick={handleDeny}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0"
            aria-label={lang === "en" ? "Close" : "Cerrar"}
            data-testid="media-permission-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body copy */}
        <div className="px-5 pb-2 text-sm text-slate-700 leading-relaxed">
          {T.body}
        </div>

        {/* Privacy reassurance pill */}
        <div className="mx-5 my-3 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5 flex items-start gap-2">
          <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-snug text-slate-600">{T.privacyNote}</p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-2 flex gap-2">
          <button
            type="button"
            onClick={handleDeny}
            className="flex-1 h-12 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-medium transition"
            data-testid="media-permission-deny"
          >
            {T.deny}
          </button>
          <button
            type="button"
            onClick={handleAllow}
            className="flex-1 h-12 rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-600 hover:from-rose-600 hover:to-fuchsia-700 active:scale-95 text-white font-semibold shadow-md transition"
            data-testid="media-permission-allow"
          >
            {T.allow}
          </button>
        </div>
      </div>
    </div>
  );
}
