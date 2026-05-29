import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { buildFileUrl } from "./ImageUpload";
import { Video, Upload, Lock, Loader2, Trash2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

const VIDEO_ALLOWED_PLANS = new Set(["pro", "premium"]);
const ACCEPT_VIDEO = "video/mp4,video/quicktime,video/x-msvideo,video/avi";
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * Provider presentation video uploader.
 * - Pro/Premium: full upload UI + preview + remove
 * - Free/Basic: locked card with "Actualizar mi plan" CTA
 */
export default function ProviderVideoUpload({ profile, setProfile }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const plan = (profile?.plan || "free").toLowerCase();
  const isAllowed = VIDEO_ALLOWED_PLANS.has(plan);
  const videoUrl = profile?.video_url || "";

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("video/")) { toast.error("Solo videos (MP4, MOV, AVI)"); return; }
    if (file.size > MAX_VIDEO_BYTES) { toast.error("El video supera 200 MB"); return; }
    setUploading(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/providers/me/video", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
          setProgress(pct);
        },
      });
      setProfile(p => ({ ...p, video_url: data.video_url, video_content_type: data.content_type }));
      toast.success("Video subido");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al subir el video");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeVideo = async () => {
    if (!window.confirm("¿Eliminar tu video de presentación?")) return;
    try {
      await api.delete("/providers/me/video");
      setProfile(p => ({ ...p, video_url: "", video_content_type: "" }));
      toast.success("Video eliminado");
    } catch { toast.error("Error al eliminar"); }
  };

  if (!isAllowed) {
    return (
      <div
        className="rounded-2xl p-5 border bg-white flex items-start gap-4"
        style={{ borderColor: "#BCC5CC" }}
        data-testid="video-upload-locked"
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#F1F5F9" }}>
          <Lock className="w-5 h-5 text-slate-500" />
        </div>
        <div className="flex-1">
          <h4 className="font-display font-semibold text-base" style={{ color: "#03045E" }}>
            🎬 Video de presentación — Plan Pro y Premium
          </h4>
          <p className="text-sm text-slate-600 mt-1">
            Agrega un video corto presentando tu negocio o mostrando tu trabajo. Los proveedores con video reciben hasta 5× más solicitudes de cotización.
          </p>
          <Link
            to="/plans"
            className="inline-block mt-3 px-4 py-2 rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: "#0077B6" }}
            data-testid="video-upgrade-cta"
          >
            Actualizar mi plan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5 border bg-white"
      style={{ borderColor: "#BCC5CC" }}
      data-testid="video-upload-allowed"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#EBF8F7" }}>
          <Video className="w-5 h-5" style={{ color: "#03045E" }} />
        </div>
        <div className="flex-1">
          <h4 className="font-display font-semibold text-base" style={{ color: "#03045E" }}>🎬 Video de presentación</h4>
          <p className="text-sm text-slate-500">Máx. 2 minutos · MP4 / MOV / AVI · hasta 200 MB. Solo 1 video por proveedor.</p>
        </div>
      </div>

      {videoUrl ? (
        <div className="space-y-3">
          <video
            src={buildFileUrl(videoUrl)}
            controls
            preload="metadata"
            className="w-full rounded-xl bg-black max-h-80"
            data-testid="video-preview"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-full text-sm font-medium border inline-flex items-center gap-2 disabled:opacity-60"
              style={{ borderColor: "#BCC5CC", color: "#03045E" }}
              data-testid="video-replace-btn"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? `Subiendo ${progress}%…` : "Reemplazar video"}
            </button>
            <button
              onClick={removeVideo}
              disabled={uploading}
              className="px-4 py-2 rounded-full text-sm font-medium border inline-flex items-center gap-2 text-red-600 hover:bg-red-50 disabled:opacity-60"
              style={{ borderColor: "#FCA5A5" }}
              data-testid="video-remove-btn"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 hover:border-teal-400 transition disabled:opacity-60"
          style={{ borderColor: "#BCC5CC", color: "#03045E" }}
          data-testid="video-upload-trigger"
        >
          {uploading ? (
            <>
              <Loader2 className="w-7 h-7 animate-spin" />
              <span className="text-sm font-medium">Subiendo… {progress}%</span>
              <div className="w-2/3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: "#0077B6" }} />
              </div>
            </>
          ) : (
            <>
              <PlayCircle className="w-8 h-8" />
              <span className="text-sm font-medium">Sube tu video de presentación</span>
              <span className="text-xs text-slate-400">Haz clic para seleccionar</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_VIDEO}
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
        data-testid="video-upload-input"
      />
    </div>
  );
}
