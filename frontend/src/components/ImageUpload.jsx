import { useRef, useState } from "react";
import { api } from "../lib/api";
import { Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function buildFileUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  if (pathOrUrl.startsWith("/api/")) return `${BACKEND_URL}${pathOrUrl}`;
  // raw storage path
  return `${BACKEND_URL}/api/files/${pathOrUrl}`;
}

export default function ImageUpload({ value, onChange, label, testid, aspect = "1/1" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo imágenes"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Máximo 8MB"); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(data.url); // /api/files/...
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
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} data-testid={`${testid}-input`} />
    </div>
  );
}

export function GalleryUpload({ onUploaded, testid = "gallery-upload" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo imágenes"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Máximo 8MB"); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const item = await api.post("/providers/me/gallery", { url: data.url, caption: "" });
      onUploaded(item.data);
      toast.success("Foto agregada a la galería");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-primary inline-flex items-center gap-2" data-testid={testid}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? "Subiendo..." : "Subir foto"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} data-testid={`${testid}-input`} />
    </>
  );
}
