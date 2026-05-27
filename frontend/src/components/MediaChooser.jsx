import { useRef, useState } from "react";
import { Sparkles, UploadCloud, X, RefreshCw, Check } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * MediaChooser — Section 64 (FirstSteps).
 *
 * Reusable dual-input picker for a provider's brand asset (logo or banner).
 * The provider can ALWAYS choose between:
 *   · Generate with AI (gpt-image-1 via Emergent LLM Key)
 *   · Upload their own file (JPG/PNG/WEBP, ≤10MB)
 *
 * Props:
 *   target: "logo" | "banner"
 *   onSaved(url, file_id): called after a successful save (AI or upload)
 *   onCancel(): close the chooser
 *   initialColor?: string
 *
 * Behavior:
 *   1) Mode toggle (AI / Upload) — both modes are FIRST-CLASS, never gated.
 *   2) AI mode: pick style + color → POST /providers/me/generate-{target} →
 *      preview → "Use this" calls POST /providers/me/save-ai-image which
 *      writes the asset to storage AND sets logo_url/banner_url on the profile.
 *   3) Upload mode: drag/click file input → POST /upload → PUT /providers/me
 *      with the new URL field.
 */
const LOGO_STYLES = [
  { id: "icon",     labelEs: "Ícono",     labelEn: "Icon" },
  { id: "monogram", labelEs: "Monograma", labelEn: "Monogram" },
  { id: "emblem",   labelEs: "Emblema",   labelEn: "Emblem" },
  { id: "minimal",  labelEs: "Minimal",   labelEn: "Minimal" },
];
const BANNER_STYLES = [
  { id: "modern",       labelEs: "Moderno",     labelEn: "Modern" },
  { id: "festive",      labelEs: "Festivo",     labelEn: "Festive" },
  { id: "professional", labelEs: "Profesional", labelEn: "Professional" },
  { id: "minimal",      labelEs: "Minimal",     labelEn: "Minimal" },
  { id: "warm",         labelEs: "Cálido",      labelEn: "Warm" },
];
const COLORS = ["#2F9D94", "#025F67", "#F97316", "#EF4444", "#0EA5E9", "#8B5CF6", "#10B981", "#F59E0B"];

export default function MediaChooser({ target = "logo", onSaved, onCancel, initialColor = "#2F9D94" }) {
  const { lang } = useI18n();
  const [mode, setMode] = useState("ai"); // "ai" | "upload"
  const [color, setColor] = useState(initialColor);
  const [style, setStyle] = useState(target === "logo" ? "icon" : "modern");
  const [keywords, setKeywords] = useState("");
  const [preview, setPreview] = useState(null); // {dataUrl, image_base64, mime} for AI; {url, file_id} for upload
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const styles = target === "logo" ? LOGO_STYLES : BANNER_STYLES;
  const titleEs = target === "logo" ? "Tu logo" : "Tu banner";
  const titleEn = target === "logo" ? "Your logo" : "Your banner";
  const aspectClass = target === "logo" ? "aspect-square" : "aspect-[1200/630]";

  const handleGenerate = async () => {
    setLoading(true); setError("");
    try {
      const endpoint = target === "logo" ? "/providers/me/generate-logo" : "/providers/me/generate-banner";
      const { data } = await api.post(endpoint, { color, style, keywords: keywords.trim() || null });
      setPreview({
        dataUrl: `data:${data.mime || "image/png"};base64,${data.image_base64}`,
        image_base64: data.image_base64,
        mime: data.mime || "image/png",
      });
    } catch (e) {
      setError(e?.response?.data?.detail || (lang === "en" ? "AI generation failed." : "Falló la generación."));
    } finally {
      setLoading(false);
    }
  };

  const handleUseAi = async () => {
    if (!preview?.image_base64) return;
    setSaving(true); setError("");
    try {
      const { data } = await api.post("/providers/me/save-ai-image", {
        image_base64: preview.image_base64,
        mime: preview.mime,
        target,
      });
      onSaved?.(data.url, data.file_id);
    } catch (e) {
      setError(e?.response?.data?.detail || (lang === "en" ? "Save failed." : "No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError(lang === "en" ? "Image files only." : "Solo imágenes."); return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError(lang === "en" ? "Max 10 MB." : "Máximo 10 MB."); return;
    }
    setSaving(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data: uploaded } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const field = target === "logo" ? "logo_url" : "banner_url";
      await api.put("/providers/me", { [field]: uploaded.url });
      onSaved?.(uploaded.url, uploaded.file_id);
    } catch (e2) {
      setError(e2?.response?.data?.detail || (lang === "en" ? "Upload failed." : "Falló la subida."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full" data-testid={`media-chooser-${target}`}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="font-display font-bold text-slate-900">{lang === "en" ? titleEn : titleEs}</h3>
        <button onClick={onCancel} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close" data-testid={`media-chooser-close`}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="px-5 pt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setMode("ai"); setPreview(null); setError(""); }}
          className={`h-10 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition ${mode === "ai" ? "bg-teal-50 text-teal-700 ring-1 ring-teal-200" : "text-slate-600 hover:bg-slate-50"}`}
          data-testid={`media-chooser-tab-ai`}
        >
          <Sparkles className="w-4 h-4" /> {lang === "en" ? "Generate with AI" : "Generar con IA"}
        </button>
        <button
          type="button"
          onClick={() => { setMode("upload"); setPreview(null); setError(""); }}
          className={`h-10 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition ${mode === "upload" ? "bg-teal-50 text-teal-700 ring-1 ring-teal-200" : "text-slate-600 hover:bg-slate-50"}`}
          data-testid={`media-chooser-tab-upload`}
        >
          <UploadCloud className="w-4 h-4" /> {lang === "en" ? "Upload mine" : "Subir mío"}
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        {mode === "ai" ? (
          <>
            {/* Style picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">{lang === "en" ? "Style" : "Estilo"}</label>
              <div className="flex flex-wrap gap-1.5">
                {styles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id)}
                    className={`px-3 h-8 text-xs font-semibold rounded-full transition ${style === s.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                    data-testid={`media-chooser-style-${s.id}`}
                  >
                    {lang === "en" ? s.labelEn : s.labelEs}
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">{lang === "en" ? "Brand color" : "Color de marca"}</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full transition transform ${color === c ? "ring-2 ring-offset-2 ring-slate-900 scale-110" : "ring-1 ring-slate-200 hover:scale-105"}`}
                    style={{ background: c }}
                    aria-label={c}
                    data-testid={`media-chooser-color-${c.replace('#','')}`}
                  />
                ))}
              </div>
            </div>

            {/* Optional keywords */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                {lang === "en" ? "Keywords (optional)" : "Palabras clave (opcional)"}
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder={lang === "en" ? "sparkle, fresh, eco…" : "brillo, fresco, eco…"}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                maxLength={200}
                data-testid="media-chooser-keywords"
              />
            </div>

            {/* Preview area */}
            <div className={`${aspectClass} rounded-2xl overflow-hidden bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center`}>
              {preview?.dataUrl ? (
                <img src={preview.dataUrl} alt="" className="w-full h-full object-cover" data-testid="media-chooser-preview" />
              ) : loading ? (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span className="text-xs">{lang === "en" ? "Generating…" : "Generando…"}</span>
                </div>
              ) : (
                <div className="text-slate-400 text-sm text-center px-6">
                  {lang === "en" ? "Pick a style and color, then generate." : "Elige estilo y color, después genera."}
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading || saving}
                className="flex-1 h-11 rounded-xl bg-slate-900 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:bg-slate-800 disabled:opacity-50 transition"
                data-testid="media-chooser-generate-btn"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {preview ? (lang === "en" ? "Regenerate" : "Regenerar") : (lang === "en" ? "Generate" : "Generar")}
              </button>
              {preview && (
                <button
                  type="button"
                  onClick={handleUseAi}
                  disabled={saving}
                  className="flex-1 h-11 rounded-xl text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
                  style={{ background: "linear-gradient(135deg, #2F9D94 0%, #025F67 100%)" }}
                  data-testid="media-chooser-use-ai-btn"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {lang === "en" ? "Use this" : "Usar esta"}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* UPLOAD mode */}
            <div
              onClick={() => !saving && fileRef.current?.click()}
              className={`${aspectClass} rounded-2xl bg-slate-50 ring-2 ring-dashed ring-slate-300 flex flex-col items-center justify-center gap-3 cursor-pointer hover:ring-teal-400 hover:bg-teal-50/40 transition`}
              data-testid="media-chooser-dropzone"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-7 h-7 text-teal-600 animate-spin" />
                  <span className="text-xs text-slate-500">{lang === "en" ? "Uploading…" : "Subiendo…"}</span>
                </>
              ) : (
                <>
                  <span className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <UploadCloud className="w-6 h-6 text-teal-600" />
                  </span>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-slate-900">
                      {lang === "en" ? "Click to upload your image" : "Click para subir tu imagen"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      JPG · PNG · WEBP · {lang === "en" ? "max 10MB" : "máx 10MB"}
                    </div>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFile}
              data-testid="media-chooser-file-input"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {lang === "en"
                ? "Already have your logo or photo? Upload it here — we'll compress it to keep your eCard fast."
                : "¿Ya tienes tu logo o foto? Súbela aquí — la comprimimos para que tu eCard cargue rápido."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
