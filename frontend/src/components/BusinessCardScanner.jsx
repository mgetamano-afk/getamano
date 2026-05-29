import { useRef, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { X, Camera, Upload, ScanLine, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { trackCardScan } from "../lib/analytics";

/**
 * BusinessCardScanner — modal that lets a new provider upload/photograph
 * their physical card. Calls POST /api/card-scan (Vision API) and returns
 * extracted { business_name, owner_name, phone, email, website, city, state, zip_code }.
 *
 * Works in 3 states:
 *   - 'idle'      → empty state with two CTAs (file picker, take photo)
 *   - 'scanning'  → uploaded; spinner while OCR runs
 *   - 'review'    → shows extracted fields for confirmation/edit before commit
 *
 * Graceful fallback: if backend returns source='no_api_key' or 'api_error',
 * the modal shows a soft "scan unavailable" note and a "Continue manually" button.
 */
export default function BusinessCardScanner({ open, onClose, onExtracted }) {
  const { lang } = useI18n();
  const [state, setState] = useState("idle");
  const [imagePreview, setImagePreview] = useState(null);
  const [fields, setFields] = useState(null);
  const [unavailableNote, setUnavailableNote] = useState(null);
  const fileRef = useRef(null);
  const camRef = useRef(null);

  const T = lang === "en" ? {
    title: "Scan your business card",
    subtitle: "Snap or upload your card and we'll fill the form for you.",
    pickFile: "Upload image",
    takePhoto: "Take photo",
    scanning: "Reading your card…",
    fileTooBig: "Image too big. Use a photo under 5MB.",
    invalidType: "Use JPG, PNG or WebP.",
    review: "Review what we found",
    reviewSub: "Edit anything before we drop it into the form.",
    apply: "Use these details",
    skip: "Continue manually",
    fields: {
      business_name: "Business name", owner_name: "Owner",
      phone: "Phone", email: "Email", website: "Website",
      city: "City", state: "State", zip_code: "ZIP",
    },
    unavailableTitle: "OCR is warming up",
    tryAgain: "Try another image",
  } : {
    title: "Escanea tu tarjeta",
    subtitle: "Toma foto o sube la imagen y rellenamos el formulario por ti.",
    pickFile: "Subir imagen",
    takePhoto: "Tomar foto",
    scanning: "Leyendo tu tarjeta…",
    fileTooBig: "Imagen muy grande. Usa una foto menor a 5MB.",
    invalidType: "Usa JPG, PNG o WebP.",
    review: "Revisa lo que encontramos",
    reviewSub: "Edita lo que necesites antes de pasarlo al formulario.",
    apply: "Usar estos datos",
    skip: "Continuar manualmente",
    fields: {
      business_name: "Negocio", owner_name: "Propietario",
      phone: "Teléfono", email: "Email", website: "Sitio web",
      city: "Ciudad", state: "Estado", zip_code: "Código postal",
    },
    unavailableTitle: "El OCR está calentando motores",
    tryAgain: "Probar con otra imagen",
  };

  if (!open) return null;

  const reset = () => {
    setState("idle");
    setImagePreview(null);
    setFields(null);
    setUnavailableNote(null);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) {
      toast.error(T.invalidType);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(T.fileTooBig);
      return;
    }
    setState("scanning");
    setUnavailableNote(null);
    // Preview + base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setImagePreview(dataUrl);
      try {
        const { data } = await api.post("/card-scan", { image_b64: dataUrl });
        if (data.source === "no_api_key" || data.source === "api_error") {
          setUnavailableNote(data.note || T.unavailableTitle);
          setState("review");
          setFields(null);
          trackCardScan(data.source);
          return;
        }
        setFields(data.fields || {});
        setState("review");
        trackCardScan("ok");
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Error");
        setState("idle");
        setImagePreview(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const apply = () => {
    if (onExtracted && fields) onExtracted(fields);
    onClose();
    setTimeout(reset, 300);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" data-testid="card-scanner-modal">
      <div className="bg-white w-full md:max-w-xl rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#03045E15" }}>
              <ScanLine className="w-5 h-5" style={{ color: "#03045E" }} />
            </div>
            <div>
              <h3 className="font-display font-semibold text-slate-900 text-sm sm:text-base">{T.title}</h3>
              <p className="text-xs text-slate-500 truncate">{T.subtitle}</p>
            </div>
          </div>
          <button onClick={() => { onClose(); setTimeout(reset, 300); }} className="p-2 hover:bg-slate-100 rounded-full" data-testid="card-scanner-close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* IDLE — show two CTAs */}
        {state === "idle" && (
          <div className="p-6 space-y-3" data-testid="card-scanner-idle">
            <div className="rounded-2xl p-6 sm:p-8 text-center" style={{ background: "linear-gradient(135deg, #F0FDFA 0%, #ECFEFF 100%)", border: "2px dashed #0077B666" }}>
              <ScanLine className="w-12 h-12 mx-auto mb-3" style={{ color: "#03045E" }} />
              <p className="text-sm text-slate-600 mb-4 max-w-xs mx-auto">
                {lang === "en" ? "Position your card in frame. JPG/PNG/WebP under 5MB." : "Coloca la tarjeta enfocada. JPG/PNG/WebP máximo 5MB."}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-slate-900 font-semibold text-sm border border-slate-200 hover:border-slate-300 shadow-sm"
                  data-testid="card-scanner-upload-btn"
                >
                  <Upload className="w-4 h-4" /> {T.pickFile}
                </button>
                <button
                  onClick={() => camRef.current?.click()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-semibold text-sm shadow-sm hover:opacity-90"
                  style={{ backgroundColor: "#03045E" }}
                  data-testid="card-scanner-camera-btn"
                >
                  <Camera className="w-4 h-4" /> {T.takePhoto}
                </button>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
              data-testid="card-scanner-file-input" />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        )}

        {/* SCANNING */}
        {state === "scanning" && (
          <div className="p-8 text-center" data-testid="card-scanner-scanning">
            {imagePreview && (
              <div className="relative inline-block rounded-2xl overflow-hidden shadow-xl mb-5">
                <img src={imagePreview} alt="card" className="max-w-full max-h-60 object-contain" />
                <div className="absolute inset-0 flex items-end p-3 bg-gradient-to-t from-black/70 to-transparent">
                  <div className="text-white text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-300 animate-pulse" />
                    {T.scanning}
                  </div>
                </div>
                {/* Scanning line animation */}
                <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-teal-400 to-transparent" style={{ animation: "scanline 1.6s linear infinite" }} />
                <style>{`@keyframes scanline { 0% { top: 0%; } 50% { top: 100%; } 100% { top: 0%; } }`}</style>
              </div>
            )}
            <Loader2 className="w-6 h-6 mx-auto animate-spin" style={{ color: "#03045E" }} />
            <p className="text-sm text-slate-500 mt-2">{T.scanning}</p>
          </div>
        )}

        {/* REVIEW */}
        {state === "review" && (
          <div className="p-5 sm:p-6 space-y-3" data-testid="card-scanner-review">
            {unavailableNote ? (
              <div className="rounded-2xl p-5 bg-amber-50 border border-amber-200 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
                <div className="text-sm text-amber-900">
                  <p className="font-semibold">{T.unavailableTitle}</p>
                  <p className="mt-0.5">{unavailableNote}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: "#0077B6" }} />
                  <h4 className="font-semibold text-slate-900 text-sm">{T.review}</h4>
                </div>
                <p className="text-xs text-slate-500 -mt-2">{T.reviewSub}</p>
                <div className="grid sm:grid-cols-2 gap-2.5 mt-2">
                  {Object.entries(T.fields).map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-0.5">{label}</span>
                      <input
                        value={fields?.[k] || ""}
                        onChange={(e) => setFields(f => ({ ...f, [k]: e.target.value }))}
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 focus:border-teal-500 outline-none text-sm bg-white"
                        data-testid={`card-scanner-field-${k}`}
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
            {imagePreview && (
              <div className="flex items-center gap-2 text-xs text-slate-500 pt-2">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{lang === "en" ? "Card preview" : "Vista previa"}</span>
                <img src={imagePreview} alt="" className="h-10 w-auto rounded ml-auto" />
              </div>
            )}
            <div className="flex gap-2 pt-3">
              {!unavailableNote && (
                <button onClick={apply}
                  className="flex-1 py-2.5 rounded-full text-white font-semibold text-sm shadow-sm hover:opacity-90"
                  style={{ backgroundColor: "#03045E" }}
                  data-testid="card-scanner-apply"
                >
                  {T.apply}
                </button>
              )}
              <button onClick={() => { reset(); }} className="px-4 py-2.5 rounded-full bg-white text-slate-700 font-semibold text-sm border border-slate-200 hover:bg-slate-50" data-testid="card-scanner-try-again">
                {T.tryAgain}
              </button>
              <button onClick={() => { onClose(); setTimeout(reset, 300); }} className="px-4 py-2.5 text-slate-500 hover:text-slate-700 text-sm" data-testid="card-scanner-skip">
                {T.skip}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
