import { useState, useEffect, useRef } from "react";
import { Sparkles, Loader2, History, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

const HISTORY_KEY = "getamano_description_drafts";
const HISTORY_LIMIT = 3;

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function pushHistory(text) {
  if (!text || text.trim().length < 20) return;
  const list = loadHistory();
  // Avoid storing duplicates of the most recent entry
  if (list[0]?.text === text) return;
  const next = [{ text, at: Date.now() }, ...list].slice(0, HISTORY_LIMIT);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // localStorage might be unavailable in private mode — ignore
  }
}

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
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(() => loadHistory());
  // Whenever value changes from outside (e.g. after AI fill or user typing),
  // we don't push to history on every keystroke — only on AI generations
  // or when a user explicitly opens the picker. Track the previous AI draft
  // so we can re-fetch a stale state.
  const prevValueRef = useRef(value);
  useEffect(() => { prevValueRef.current = value; }, [value]);

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
      // Snapshot the existing text BEFORE we overwrite it — this is the
      // anchor the user can revert to.
      if (value && value.trim().length >= 20) pushHistory(value);
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
      pushHistory(draft);
      setHistory(loadHistory());
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

  const handleRevert = (entry) => {
    // Save the current value to history before reverting so the user can roll forward.
    if (value && value.trim().length >= 20 && value !== entry.text) {
      pushHistory(value);
      setHistory(loadHistory());
    }
    onChange(entry.text);
    setShowHistory(false);
    toast.success(lang === "en" ? "Reverted to previous draft." : "Volviste a una versión anterior.");
  };

  const hasContent = (value || "").trim().length > 10;

  return (
    <div className="md:col-span-2">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold text-slate-500 hover:text-teal-700 hover:bg-slate-100 transition-colors"
              data-testid="description-history-toggle"
              aria-label={lang === "en" ? "Show history" : "Ver historial"}
            >
              <History className="w-3.5 h-3.5" />
              <span>{lang === "en" ? "History" : "Historial"} ({history.length})</span>
            </button>
          )}
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
      </div>

      {showHistory && history.length > 0 && (
        <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2" data-testid="description-history-panel">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            {lang === "en" ? "Recent drafts" : "Borradores recientes"}
          </p>
          {history.map((entry, i) => (
            <div key={`${entry.at}-${i}`} className="bg-white rounded-lg p-2.5 border border-slate-100">
              <p className="text-xs text-slate-700 leading-relaxed line-clamp-3">{entry.text}</p>
              <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-[10px] text-slate-400">
                  {new Date(entry.at).toLocaleString(lang === "en" ? "en-US" : "es-MX", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                </span>
                <button
                  type="button"
                  onClick={() => handleRevert(entry)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold text-teal-700 hover:bg-teal-50 transition-colors"
                  data-testid={`description-history-revert-${i}`}
                >
                  <Undo2 className="w-3 h-3" />
                  {lang === "en" ? "Use this" : "Usar esta"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
