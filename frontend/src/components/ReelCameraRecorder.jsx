/**
 * ReelCameraRecorder — V15 in-browser video recorder for reels.
 *
 * Uses MediaRecorder + getUserMedia (rear camera by default, with a
 * front/back flip button). 30s hard cap. On stop we upload the WebM
 * blob to `/api/upload` and POST `/api/reels` exactly like the manual
 * uploader path.
 *
 * Mobile-first portrait UI: full-screen black surface, big record button
 * at the bottom, a tiny live timer, a flip-camera icon, and a close X.
 * The preview <video> is muted + plays the live `srcObject` stream.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { X, Camera, Circle, Square, RefreshCcw, Loader2, Send } from "lucide-react";

const MAX_DURATION_S = 30;

function pickSupportedMime() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export default function ReelCameraRecorder({ onClose, onUploaded }) {
  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [stream, setStream] = useState(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");

  // Acquire camera on mount + every facing-mode flip.
  useEffect(() => {
    let alive = true;
    setPreviewBlob(null); setPreviewUrl(""); setElapsed(0);
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: { ideal: facing }, width: { ideal: 1080 }, height: { ideal: 1920 } },
        });
        if (!alive) { s.getTracks().forEach(t => t.stop()); return; }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        toast.error("No se pudo abrir la cámara. Da permiso al navegador.");
        onClose?.();
      }
    })();
    return () => {
      alive = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // Stop everything on unmount.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = () => {
    if (!stream) return;
    const mime = pickSupportedMime();
    let rec;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      toast.error("Tu navegador no soporta grabación.");
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || "video/webm" });
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
    };
    rec.start(250);
    recorderRef.current = rec;
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= MAX_DURATION_S) {
          stopRecording();
        }
        return next;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const flipCamera = () => {
    if (recording) stopRecording();
    setFacing(f => f === "user" ? "environment" : "user");
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewBlob(null);
    setPreviewUrl("");
    setElapsed(0);
  };

  const publish = async () => {
    if (!previewBlob) return;
    setUploading(true);
    try {
      const fd = new FormData();
      const ext = (previewBlob.type.split("/")[1] || "webm").split(";")[0];
      fd.append("file", previewBlob, `reel-recorded.${ext}`);
      const upload = await api.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180_000,
      });
      const videoUrl = upload.data?.url;
      if (!videoUrl) throw new Error("upload returned no url");
      const created = await api.post("/reels", {
        video_url: videoUrl,
        caption: caption.trim() || null,
        duration_s: elapsed,
      });
      toast.success("¡Reel publicado!");
      onUploaded?.(created.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo publicar el reel");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" data-testid="reel-camera-recorder">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60"
          aria-label="Cerrar"
          data-testid="reel-recorder-close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 px-3 h-9 rounded-full bg-black/40 backdrop-blur text-white">
          <span className={`w-2 h-2 rounded-full ${recording ? "bg-red-500 animate-pulse" : "bg-slate-400"}`} />
          <span className="text-xs font-mono">
            {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")} / 00:{String(MAX_DURATION_S).padStart(2, "0")}
          </span>
        </div>
        <button
          type="button"
          onClick={flipCamera}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60"
          aria-label="Cambiar cámara"
          data-testid="reel-recorder-flip"
        >
          <RefreshCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Video preview */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {previewUrl ? (
          <video
            src={previewUrl}
            controls
            playsInline
            className="max-h-full max-w-full"
            data-testid="reel-recorder-playback"
          />
        ) : (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="h-full w-full object-cover"
            data-testid="reel-recorder-live"
          />
        )}
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pb-10 flex flex-col items-center gap-4" style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))" }}>
        {previewBlob ? (
          <>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Añade un caption (opcional)"
              maxLength={140}
              className="w-full max-w-md h-11 px-4 rounded-full bg-black/50 backdrop-blur text-white placeholder-white/50 outline-none border border-white/20 focus:border-white/60"
              data-testid="reel-recorder-caption"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={retake}
                disabled={uploading}
                className="h-12 px-5 rounded-full bg-white/15 backdrop-blur text-white border border-white/25 inline-flex items-center gap-2 hover:bg-white/25 disabled:opacity-50"
                data-testid="reel-recorder-retake"
              >
                <Camera className="w-4 h-4" /> Volver a grabar
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={uploading}
                className="h-12 px-6 rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 text-white font-bold inline-flex items-center gap-2 active:scale-95 disabled:opacity-60"
                data-testid="reel-recorder-publish"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {uploading ? "Subiendo..." : "Publicar Reel"}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all duration-200 active:scale-95 ${
              recording
                ? "bg-red-500 border-white scale-95"
                : "bg-white/15 backdrop-blur border-white hover:bg-white/25"
            }`}
            aria-label={recording ? "Detener" : "Grabar"}
            data-testid="reel-recorder-trigger"
          >
            {recording ? <Square className="w-8 h-8 text-white" fill="currentColor" /> : <Circle className="w-12 h-12 text-red-500" fill="currentColor" />}
          </button>
        )}
      </div>
    </div>
  );
}
