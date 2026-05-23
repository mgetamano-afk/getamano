import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

/**
 * Description field with an inline "✨ Sugerir con IA" CTA.
 *
 * Section 40 — Bonus. When the provider has just picked a main category
 * (and optionally some specializations) but the description is empty,
 * an AI button drafts a warm 2-3 sentence starter so they're not
 * staring at an empty textarea. The provider can edit before saving.
 *
 * The button is hidden when no mainCategory is selected. It stays visible
 * even after the field is populated so the provider can re-draft if they
 * trash what's there.
 */
export default function DescriptionFieldWithAI({
  value = "",
  onChange,
  mainCategory,
  subcategories = [],
  businessName,
  city,
  state,
  lang = "es",
}) {
  const [loading, setLoading] = useState(false);
  const label = lang === "en" ? "Description" : "Descripción";
  const ctaLabel = lang === "en" ? "Suggest with AI" : "Sugerir con IA";
  const ctaLabelShort = lang === "en" ? "Re-draft" : "Re-generar";
  const placeholder =
    lang === "en"
      ? "Tell potential customers what you offer, your style and what makes you different. The ✨ AI button can write a starter for you."
      : "Cuenta a tus clientes potenciales qué ofreces, tu estilo y qué te hace diferente. El botón ✨ IA puede escribirte un borrador inicial.";

  const canSuggest = Boolean(mainCategory);

  const handleSuggest = async () => {
    if (!canSuggest || loading) return;
    setLoading(true);
    try {
      const r = await api.post("/ai/draft-description", {
        main_category: mainCategory,
        subcategories,
        business_name: businessName,
        city,
        state,
        locale: lang,
      });
      const draft = (r.data || {}).draft || "";
      if (!draft) {
        toast.error(lang === "en" ? "Got an empty draft. Try again." : "No recibimos texto. Inténtalo de nuevo.");
        return;
      }
      onChange(draft);
      toast.success(
        lang === "en"
          ? "Draft generated — edit it to add your personal touch."
          : "Listo, edítalo a tu gusto para darle tu toque personal.",
      );
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(detail || (lang === "en" ? "AI is busy, try again in a moment." : "La IA está ocupada. Inténtalo en un momento."));
    } finally {
      setLoading(false);
    }
  };

  const hasContent = (value || "").trim().length > 10;

  return (
    <div className="md:col-span-2">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        {canSuggest && (
          <button
            type="button"
            onClick={handleSuggest}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-50"
            style={{
              background: hasContent ? "white" : "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)",
              color: hasContent ? "#025F67" : "white",
              border: hasContent ? "1.5px solid #025F67" : "1.5px solid transparent",
              boxShadow: hasContent ? "none" : "0 2px 8px -2px rgba(2,95,103,0.35)",
            }}
            data-testid="description-ai-suggest-btn"
            aria-label={ctaLabel}
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{lang === "en" ? "Writing..." : "Escribiendo..."}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>{hasContent ? ctaLabelShort : ctaLabel}</span>
              </>
            )}
          </button>
        )}
      </div>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y"
        data-testid="form-description"
      />
      {!canSuggest && (
        <p className="text-[11px] text-slate-400 mt-1">
          {lang === "en"
            ? "Pick a main category first to unlock the AI suggestion."
            : "Selecciona una categoría principal arriba para activar la sugerencia con IA."}
        </p>
      )}
    </div>
  );
}
