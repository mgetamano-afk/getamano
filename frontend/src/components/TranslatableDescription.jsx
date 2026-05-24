import { useEffect, useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { api } from "../lib/api";

/**
 * TranslatableDescription — renders a provider's description with a tiny ES↔EN
 * toggle. Uses the existing /api/translate endpoint (server-side cache).
 *
 * Performance: NO call on mount. We only translate when the user clicks the
 * toggle. Result is cached client-side (state) AND server-side (translation_cache
 * collection with 90-day TTL) so the same toggle is instant the next time.
 *
 * Graceful: if the API key isn't configured or the API is disabled, the toggle
 * is still rendered but shows a soft hint instead of pretending to translate.
 */
export default function TranslatableDescription({
  text,
  sourceId,
  sourceField = "description",
  sourceLang = "es",
  displayLang,
}) {
  const isSourceLang = displayLang === sourceLang;
  const targetLang = isSourceLang ? (sourceLang === "es" ? "en" : "es") : displayLang;
  const [view, setView] = useState("source"); // 'source' | 'translated'
  const [translated, setTranslated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState(null);

  // Reset cached translation if the source text or display language changes
  useEffect(() => {
    setTranslated(null);
    setView("source");
    setNote(null);
  }, [text, sourceId, displayLang]);

  if (!text) return null;

  const onToggle = async () => {
    if (view === "translated") {
      setView("source");
      return;
    }
    if (translated) {
      setView("translated");
      return;
    }
    setLoading(true);
    setNote(null);
    try {
      const { data } = await api.post("/translate", {
        text,
        source_id: sourceId,
        source_field: sourceField,
        source_lang: sourceLang,
        target_lang: targetLang,
      });
      // If the backend signals it couldn't actually translate (no key / API
      // disabled), surface the note as a tooltip and DO NOT switch the view —
      // showing the same text in "translated" mode would be misleading.
      if (data?.source === "no_api_key" || data?.source === "api_error") {
        setNote(data.note || "Traducción no disponible.");
        return;
      }
      setTranslated(data.translated_text);
      setView("translated");
    } catch (_e) {
      setNote("No pudimos traducir. Reintenta más tarde.");
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel = view === "translated"
    ? (sourceLang === "es" ? "Ver en español" : "View in English")
    : (targetLang === "en" ? "Translate to English" : "Traducir al español");

  return (
    <div className="mt-4" data-testid="translatable-description">
      <p
        className="text-slate-700 leading-relaxed"
        data-testid={`translatable-description-text-${view}`}
      >
        {view === "translated" && translated ? translated : text}
      </p>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onToggle}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline disabled:opacity-60"
          data-testid="translatable-description-toggle"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
          {loading ? "Traduciendo…" : buttonLabel}
        </button>
        {view === "translated" && translated && (
          <span className="text-[11px] text-slate-400 italic" data-testid="translatable-description-credit">
            Traducción automática
          </span>
        )}
        {note && (
          <span className="text-[11px] text-amber-700" data-testid="translatable-description-note">
            ⚠️ {note}
          </span>
        )}
      </div>
    </div>
  );
}
