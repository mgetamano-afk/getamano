import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Video, X, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * ReelCreator — Section 89 v4 Phase E.
 *
 * Modal that lets the logged-in provider upload a vertical video file
 * (<60s) and post it as a reel. The implementation reuses the existing
 * `/api/upload` endpoint for the binary upload, then calls
 * `POST /api/reels` with the resulting URL.
 */
export default function ReelCreator({ onClose, onCreated }) {
  const { lang } = useI18n();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [duration, setDuration] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFile = async (f) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast.error(lang === "en" ? "Pick a video file" : "Selecciona un archivo de video");
      return;
    }
    if (f.size > 80 * 1024 * 1024) {
      toast.error(lang === "en" ? "Video too large (80MB max)" : "Video muy grande (máx 80MB)");
      return;
    }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/reels/upload-video", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180_000,
      });
      setVideoUrl(data?.url || "");
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Upload failed" : "Falla en la subida"));
      setPreviewUrl("");
      setFile(null);
    } finally { setUploading(false); }
  };

  const submit = async () => {
    if (!videoUrl) return;
    setCreating(true);
    try {
      await api.post("/reels", {
        video_url: videoUrl,
        caption: caption.trim() || null,
        duration_s: duration || null,
      });
      toast.success(lang === "en" ? "Reel posted!" : "¡Reel publicado!");
      onCreated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Couldn't post" : "No se pudo publicar"));
    } finally { setCreating(false); }
  };

  return createPortal((
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !uploading && !creating) onClose(); }}
      data-testid="reel-creator-modal"
    >
      <div
        className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px))" }}
      >
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 md:pt-5 pb-3">
          <h3 className="font-display font-bold text-lg text-slate-900 inline-flex items-center gap-2">
            <Video className="w-5 h-5 text-pink-500" />
            {lang === "en" ? "New Reel" : "Nuevo Reel"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading || creating}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 disabled:opacity-50"
            data-testid="reel-creator-close"
            aria-label={lang === "en" ? "Close" : "Cerrar"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
          {!previewUrl ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full aspect-[9/16] rounded-2xl border-2 border-dashed border-slate-300 hover:border-pink-500 active:scale-[0.99] flex flex-col items-center justify-center text-slate-400 hover:text-pink-600 transition"
              data-testid="reel-creator-pick"
            >
              <Video className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">{lang === "en" ? "Tap to choose a video" : "Toca para elegir un video"}</p>
              <p className="text-xs mt-1">{lang === "en" ? "Vertical 9:16 · ≤60s · ≤80MB" : "Vertical 9:16 · ≤60s · ≤80MB"}</p>
            </button>
          ) : (
            <div className="relative aspect-[9/16] rounded-2xl bg-black overflow-hidden" data-testid="reel-creator-preview-wrap">
              <video
                src={previewUrl}
                className="w-full h-full object-cover"
                controls
                playsInline
                muted
                onLoadedMetadata={(e) => setDuration(Math.round(e.currentTarget.duration || 0))}
                data-testid="reel-creator-preview-video"
              />
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-xs mt-2">{lang === "en" ? "Uploading..." : "Subiendo..."}</p>
                </div>
              )}
              {!uploading && (
                <button
                  type="button"
                  onClick={() => { setPreviewUrl(""); setVideoUrl(""); setFile(null); setDuration(0); }}
                  className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                  data-testid="reel-creator-clear"
                  aria-label={lang === "en" ? "Remove" : "Quitar"}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
            data-testid="reel-creator-file"
          />
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={lang === "en" ? "Caption (optional, 300 chars)" : "Texto (opcional, 300 chars)"}
            maxLength={300}
            rows={3}
            className="w-full p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 resize-none"
            data-testid="reel-creator-caption"
          />
        </div>

        <div className="px-5 pt-3 pb-3 border-t border-slate-100 bg-white">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading || creating}
              className="flex-1 h-12 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-medium disabled:opacity-60 transition"
              data-testid="reel-creator-cancel"
            >
              {lang === "en" ? "Cancel" : "Cancelar"}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!videoUrl || uploading || creating}
              className="flex-1 h-12 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 active:scale-95 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition"
              data-testid="reel-creator-submit"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {creating ? (lang === "en" ? "Posting..." : "Publicando...") : (lang === "en" ? "Post" : "Publicar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
