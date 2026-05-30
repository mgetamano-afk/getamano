/**
 * AiCardDesigner — V14 AI background generator for the physical NFC card.
 *
 * Lives inside `PhysicalCardsPanel` above the live preview. The flow is:
 *
 *   1. Provider picks a 3-colour palette (curated presets, "Mi marca" if
 *      a logo is uploaded, or full custom).
 *   2. Tap "Generar con IA" → POST /physical-cards/ai-design returns the
 *      base64 image + design_id.
 *   3. Image is shown as the new front-of-card background.
 *   4. Provider can re-generate unlimited times until they tap
 *      "Imprimir con getamano" (which freezes the latest design into
 *      the print order).
 *
 * The component is stateful: it persists the active design via
 * `onDesignChange(design)` so the parent (`PhysicalCardsPanel`) can
 * forward `design_id` to the print-order POST.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { toast } from "sonner";
import { Sparkles, Loader2, Palette, Wand2, RefreshCw } from "lucide-react";

const PRESETS = [
  { id: "ocean",    label: "Océano",   labelEn: "Ocean",   palette: ["#0077B6", "#03045E", "#90E0EF"] },
  { id: "sunset",   label: "Atardecer", labelEn: "Sunset",  palette: ["#F77F00", "#D62828", "#FCBF49"] },
  { id: "forest",   label: "Bosque",   labelEn: "Forest",  palette: ["#2D6A4F", "#081C15", "#95D5B2"] },
  { id: "berry",    label: "Berry",    labelEn: "Berry",   palette: ["#7B2CBF", "#240046", "#E0AAFF"] },
  { id: "monochrome", label: "Mono",   labelEn: "Mono",    palette: ["#0F172A", "#1E293B", "#94A3B8"] },
  { id: "warm",     label: "Cálido",   labelEn: "Warm",    palette: ["#A0522D", "#3B0F0F", "#F4A261"] },
];

export default function AiCardDesigner({ profile, onDesignChange }) {
  const { lang } = useI18n();
  const [selectedPresetId, setSelectedPresetId] = useState(null);
  const [customPalette, setCustomPalette] = useState(["#0077B6", "#03045E", "#F77F00"]);
  const [busy, setBusy] = useState(false);
  const [activeDesign, setActiveDesign] = useState(null);

  // V14 — auto-extract dominant colours from the provider's logo (if any)
  // so "Mi marca" is one of the presets when applicable. We compute it
  // client-side because the logo URL is already public.
  const [brandPalette, setBrandPalette] = useState(null);
  useEffect(() => {
    if (!profile?.logo_url) { setBrandPalette(null); return; }
    extractDominantColors(profile.logo_url).then(setBrandPalette).catch(() => setBrandPalette(null));
  }, [profile?.logo_url]);

  // Load active design on mount so the live preview shows it.
  useEffect(() => {
    api.get("/physical-cards/ai-design/active").then(r => {
      if (r.data?.design_id) {
        setActiveDesign(r.data);
        onDesignChange?.(r.data);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectivePalette = useMemo(() => {
    if (selectedPresetId === "brand" && brandPalette) return brandPalette;
    if (selectedPresetId && selectedPresetId !== "custom") {
      const p = PRESETS.find(x => x.id === selectedPresetId);
      if (p) return p.palette;
    }
    return customPalette;
  }, [selectedPresetId, brandPalette, customPalette]);

  const generate = async () => {
    if (!profile?.provider_id) return;
    setBusy(true);
    try {
      const r = await api.post("/physical-cards/ai-design", {
        provider_id: profile.provider_id,
        palette: effectivePalette,
      });
      setActiveDesign(r.data);
      onDesignChange?.(r.data);
      toast.success(lang === "en" ? "AI background generated" : "Fondo generado con IA");
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "AI failed" : "La IA falló"));
    } finally {
      setBusy(false);
    }
  };

  const presetOptions = useMemo(() => {
    const out = [...PRESETS];
    if (brandPalette) out.unshift({ id: "brand", label: "Mi marca", labelEn: "My brand", palette: brandPalette });
    out.push({ id: "custom", label: "Personalizado", labelEn: "Custom", palette: customPalette });
    return out;
  }, [brandPalette, customPalette]);

  return (
    <section className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-rose-50 p-5 space-y-4 animate-fadeSlideUp" data-testid="ai-card-designer">
      <header className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500 flex items-center justify-center shadow-md">
          <Wand2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
            {lang === "en" ? "Design with AI" : "Diseña con IA"}
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-violet-600 text-white">
              Nuevo
            </span>
          </h4>
          <p className="text-sm text-slate-600 mt-0.5">
            {lang === "en"
              ? "Pick your palette. AI will create a background that matches your category."
              : "Elige tu paleta. La IA crea un fondo abstracto según tu categoría."}
          </p>
        </div>
      </header>

      {/* Preset chips */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1">
          <Palette className="w-3.5 h-3.5" /> {lang === "en" ? "Palette" : "Paleta"}
        </p>
        <div className="flex flex-wrap gap-2">
          {presetOptions.map((p) => {
            const active = selectedPresetId === p.id || (selectedPresetId === null && p.id === "ocean");
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPresetId(p.id)}
                className={`group inline-flex items-center gap-2 px-3 h-10 rounded-full border-2 transition-all duration-200 active:scale-95 ${
                  active ? "border-violet-500 bg-white shadow-md scale-[1.03]" : "border-slate-200 bg-white/70 hover:border-slate-300"
                }`}
                data-testid={`ai-preset-${p.id}`}
              >
                <span className="flex -space-x-1">
                  {p.palette.map((c, i) => (
                    <span
                      key={i}
                      className="w-4 h-4 rounded-full ring-2 ring-white"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </span>
                <span className="text-xs font-semibold text-slate-700">{lang === "en" ? p.labelEn : p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom picker */}
      {selectedPresetId === "custom" && (
        <div className="grid grid-cols-3 gap-3" data-testid="ai-custom-palette">
          {customPalette.map((c, i) => (
            <label key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <input
                type="color"
                value={c}
                onChange={(e) => {
                  const next = [...customPalette];
                  next[i] = e.target.value;
                  setCustomPalette(next);
                }}
                className="w-8 h-8 rounded cursor-pointer"
                data-testid={`ai-color-${i}`}
              />
              <span className="text-[10px] font-mono uppercase text-slate-500">{c}</span>
            </label>
          ))}
        </div>
      )}

      {/* Generate / Regenerate CTA */}
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className={`w-full h-12 rounded-full text-sm font-bold text-white inline-flex items-center justify-center gap-2 transition-all duration-200 ${
          busy
            ? "bg-slate-400 cursor-wait"
            : "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 hover:shadow-lg hover:scale-[1.01] active:scale-95"
        }`}
        data-testid="ai-generate-button"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> :
          activeDesign ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        {busy
          ? (lang === "en" ? "Generating..." : "Generando...")
          : activeDesign
            ? (lang === "en" ? "Regenerate background" : "Volver a generar")
            : (lang === "en" ? "Generate with AI" : "Generar con IA")}
      </button>

      {activeDesign?.preview_data_url && (
        <p className="text-[11px] text-center text-slate-500" data-testid="ai-design-status">
          ✓ {lang === "en" ? "Active design" : "Diseño activo"}: <span className="font-mono">{activeDesign.design_id.slice(-8)}</span>
          {" · "}
          {lang === "en"
            ? "Regenerate as many times as you want. The latest one is what gets printed."
            : "Regenera las veces que quieras. La última versión es la que se imprime."}
        </p>
      )}
    </section>
  );
}

// ─── Dominant-colour extractor (Mi marca preset) ───────────────────
async function extractDominantColors(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 32;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        // K-means-ish: bucket by 32-step quantisation and pick top 3.
        const counts = new Map();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          const r = Math.round(data[i] / 32) * 32;
          const g = Math.round(data[i + 1] / 32) * 32;
          const b = Math.round(data[i + 2] / 32) * 32;
          // Skip near-whites and near-blacks to avoid trivial bg colours.
          if (r + g + b > 700 || r + g + b < 60) continue;
          const k = `${r},${g},${b}`;
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
        if (top.length < 3) { reject(); return; }
        const hex = top.map(([k]) => {
          const [r, g, b] = k.split(",").map(Number);
          return "#" + [r, g, b].map(n => n.toString(16).padStart(2, "0")).join("");
        });
        resolve(hex);
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = url;
  });
}
