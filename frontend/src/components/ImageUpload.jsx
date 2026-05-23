import { useRef, useState } from "react";
import { api } from "../lib/api";
import { Upload, Loader2, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const ACCEPTED_IMAGE_MIME = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif";
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB (post-compression cap)
export const MAX_BATCH_FILES = 20;

// Auto-compression settings — used by GalleryUpload to keep gallery uploads
// snappy even on weak 3G/LTE links. ~1 MB target + 1920px longest edge gives
// images that still look great on retina displays. WebWorker keeps the UI thread free.
const COMPRESSION_OPTS = {
  maxSizeMB: 1.0,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.82,
};

// HEIC / HEIF and tiny images already under target → skip compression altogether.
const COMPRESSION_SKIP_BYTES = 250 * 1024; // 250 KB

async function compressIfNeeded(file) {
  if (file.size <= COMPRESSION_SKIP_BYTES) return file;
  if (file.type === "image/heic" || file.type === "image/heif") return file;
  if (file.type === "image/gif") return file; // never compress GIFs — preserves animation
  try {
    const compressed = await imageCompression(file, COMPRESSION_OPTS);
    // Only swap if compression actually helped — otherwise return the original.
    return compressed.size < file.size ? compressed : file;
  } catch {
    return file; // compression failed → fall back to original
  }
}

export function buildFileUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  if (pathOrUrl.startsWith("/api/")) return `${BACKEND_URL}${pathOrUrl}`;
  return `${BACKEND_URL}/api/files/${pathOrUrl}`;
}

export default function ImageUpload({ value, onChange, label, testid, aspect = "1/1" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo imágenes"); return; }
    if (file.size > MAX_PHOTO_BYTES) { toast.error("Máximo 10MB"); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(data.url);
      toast.success("Subido");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al subir");
    } finally {
      setUploading(false);
    }
  };

  const remove = () => onChange("");

  return (
    <div>
      {label && <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>}
      <div className="relative rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden" style={{ aspectRatio: aspect }} data-testid={testid}>
        {value ? (
          <>
            <img src={buildFileUrl(value)} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <button type="button" onClick={remove} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow" data-testid={`${testid}-remove`}>
              <X className="w-4 h-4 text-slate-700" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition"
            data-testid={`${testid}-trigger`}
          >
            {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            <span className="text-sm">{uploading ? "Subiendo..." : "Haz clic para subir"}</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept={ACCEPTED_IMAGE_MIME} hidden onChange={e => upload(e.target.files?.[0])} data-testid={`${testid}-input`} />
    </div>
  );
}

/**
 * GalleryUpload — multi-file uploader with per-file progress bars and detailed error messages.
 * Props:
 *  - onUploaded(item)  -> called once per successfully created gallery item
 *  - disabled (bool)   -> disable the trigger when plan limit reached
 *  - remaining (int|null) -> when set, caps the batch to this many files
 *  - testid
 */
export function GalleryUpload({ onUploaded, disabled = false, remaining = null, testid = "gallery-upload" }) {
  const inputRef = useRef(null);
  const [items, setItems] = useState([]); // [{name, size, progress, status, error}]
  const [isBusy, setIsBusy] = useState(false);

  const handleFiles = async (fileList) => {
    if (!fileList?.length) return;
    let files = Array.from(fileList);
    if (files.length > MAX_BATCH_FILES) {
      toast.warning(`Máximo ${MAX_BATCH_FILES} fotos por lote. Se subirán las primeras ${MAX_BATCH_FILES}.`);
      files = files.slice(0, MAX_BATCH_FILES);
    }
    if (remaining !== null && remaining !== undefined) {
      if (files.length > remaining) {
        toast.warning(`Solo te quedan ${remaining} fotos en tu plan. Se subirán las primeras ${remaining}.`);
        files = files.slice(0, remaining);
      }
    }
    if (!files.length) return;

    setIsBusy(true);
    const initial = files.map(f => ({ name: f.name, size: f.size, progress: 0, status: "pending", error: "" }));
    setItems(initial);

    let okCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Client-side guards (same as backend)
      if (!file.type.startsWith("image/")) {
        setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: "error", error: "Formato no soportado" } : it));
        failCount++;
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: "error", error: "Supera 10 MB" } : it));
        failCount++;
        continue;
      }
      setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: "compressing" } : it));
      let uploadFile = file;
      try {
        uploadFile = await compressIfNeeded(file);
      } catch {
        uploadFile = file;
      }
      // If compression got rid of >30% we surface the saving in the UI
      const compressedSize = uploadFile.size;
      const savedPct = file.size > 0 ? Math.max(0, Math.round((1 - compressedSize / file.size) * 100)) : 0;
      setItems(prev => prev.map((it, idx) => idx === i ? {
        ...it,
        status: "uploading",
        compressedSize,
        savedPct: savedPct > 5 ? savedPct : 0,
      } : it));
      try {
        const fd = new FormData();
        fd.append("file", uploadFile, file.name);
        const { data } = await api.post("/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            setItems(prev => prev.map((it, idx) => idx === i ? { ...it, progress: pct } : it));
          },
        });
        const itemRes = await api.post("/providers/me/gallery", { url: data.url, caption: "" });
        onUploaded(itemRes.data);
        setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: "done", progress: 100 } : it));
        okCount++;
      } catch (e) {
        const msg = e?.response?.data?.detail || "Error al subir";
        setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: "error", error: msg } : it));
        failCount++;
        // If the server says we reached the plan limit, abort the remaining queue
        if (e?.response?.status === 403) {
          toast.error(msg);
          break;
        }
      }
    }

    if (okCount > 0 && failCount === 0) toast.success(`${okCount} foto${okCount > 1 ? "s" : ""} subida${okCount > 1 ? "s" : ""}`);
    else if (okCount > 0 && failCount > 0) toast.message(`${okCount} subidas · ${failCount} con error`);
    else if (failCount > 0) toast.error(`${failCount} foto${failCount > 1 ? "s" : ""} no se pudieron subir`);

    setIsBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    // Auto-hide the progress list after a short delay if no errors remained
    setTimeout(() => {
      setItems(prev => prev.some(it => it.status === "error") ? prev : []);
    }, 2500);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isBusy}
        className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid={testid}
      >
        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {isBusy ? "Subiendo..." : "Subir fotos"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_MIME}
        multiple
        hidden
        onChange={e => handleFiles(e.target.files)}
        data-testid={`${testid}-input`}
      />

      {items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2" data-testid="gallery-upload-progress">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-3" data-testid={`gallery-upload-progress-${idx}`}>
              <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{
                backgroundColor: it.status === "done" ? "#DCFCE7" : it.status === "error" ? "#FEE2E2" : "#F1F5F9",
              }}>
                {it.status === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                {it.status === "error" && <AlertCircle className="w-4 h-4 text-red-600" />}
                {(it.status === "uploading" || it.status === "compressing") && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
                {it.status === "pending" && <span className="text-xs text-slate-400">{idx + 1}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-slate-700 truncate">{it.name}</span>
                  <span className="text-xs text-slate-400 ml-2 flex-shrink-0">
                    {it.status === "error"
                      ? it.error
                      : it.status === "done"
                        ? (it.savedPct > 0 ? `Listo · -${it.savedPct}% peso` : "Listo")
                        : it.status === "compressing"
                          ? "Optimizando..."
                          : `${it.progress}%`}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${it.progress}%`,
                      backgroundColor: it.status === "error" ? "#DC2626" : it.status === "done" ? "#10B981" : "#2F9D94",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
