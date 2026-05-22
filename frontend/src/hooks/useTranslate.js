import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * useTranslate — calls POST /api/translate (server-side cache + Google fallback).
 *
 * Usage:
 *   const { translate, translated, loading } = useTranslate();
 *   <button onClick={() => translate({ text, source_id: 'prov:'+id, source_field: 'desc' })}>
 *     Translate
 *   </button>
 *
 * If no Google API key is configured server-side, returns the original text
 * along with `note` so the UI can show a soft hint ("not available yet").
 */
export default function useTranslate() {
  const { lang } = useI18n();
  const [translated, setTranslated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState(null);

  const translate = useCallback(async ({ text, source_id, source_field, source_lang = "es", target_lang }) => {
    if (!text || !text.trim()) return null;
    const target = target_lang || lang;
    setLoading(true); setNote(null);
    try {
      const { data } = await api.post("/translate", {
        text, source_id, source_field, source_lang, target_lang: target,
      });
      setTranslated(data.translated_text);
      if (data.note) setNote(data.note);
      return data;
    } catch (e) {
      setTranslated(text);
      return null;
    } finally {
      setLoading(false);
    }
  }, [lang]);

  const reset = () => { setTranslated(null); setNote(null); };

  return { translate, translated, loading, note, reset };
}
