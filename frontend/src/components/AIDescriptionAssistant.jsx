import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, Check, X, Bot, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * AIDescriptionAssistant — DoorDash-style AI text-polishing assistant.
 *
 * Watches a textarea value via the `value` prop. After the user pauses
 * typing for ~2.5s with at least 30 characters, a chat bubble appears
 * offering to improve the text. The provider can:
 *   - Accept the offer → POST /api/ai/improve-description → see polished version
 *   - Use the polished version → calls onAccept(improvedText)
 *   - Keep their own → bubble closes, won't re-offer this session
 *
 * Designed to live BELOW the textarea (full width). Pass `category` and
 * `businessName` so Claude has context.
 */
export default function AIDescriptionAssistant({
  value,
  category,
  businessName,
  onAccept,
  testid = "ai-description-assistant",
  minChars = 30,
}) {
  const { lang } = useI18n();
  const [stage, setStage] = useState("idle"); // idle | offering | loading | showing | dismissed
  const [improved, setImproved] = useState("");
  const [error, setError] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const offeredOnceRef = useRef(false);

  const T = lang === "en" ? {
    title: "getamano Assistant",
    offer: "I can polish this so it sounds more professional and converts better. Want me to try?",
    yes: "Yes, polish it",
    no: "No, thanks",
    loading: "Polishing your description…",
    showing: "Here's your polished version",
    use: "Use this version",
    keep: "Keep mine",
    showOriginal: "See original",
    hideOriginal: "Hide original",
    error: "Couldn't improve the text. Try again.",
  } : {
    title: "Asistente getamano",
    offer: "Puedo pulir esto para que suene más profesional y convierta más. ¿Lo intento?",
    yes: "Sí, mejórala",
    no: "No, gracias",
    loading: "Mejorando tu descripción…",
    showing: "Aquí está tu versión mejorada",
    use: "Usar esta versión",
    keep: "Mantener la mía",
    showOriginal: "Ver original",
    hideOriginal: "Ocultar original",
    error: "No pudimos mejorar el texto. Intenta de nuevo.",
  };

  // Trigger offer 2.5s after user stops typing (debounce)
  useEffect(() => {
    if (offeredOnceRef.current) return;
    if (stage !== "idle") return;
    const trimmed = (value || "").trim();
    if (trimmed.length < minChars) return;
    const timer = setTimeout(() => setStage("offering"), 2500);
    return () => clearTimeout(timer);
  }, [value, stage, minChars]);

  // Reset when the textarea is fully cleared (provider starts over)
  useEffect(() => {
    if ((value || "").trim().length === 0) {
      offeredOnceRef.current = false;
      setStage("idle");
      setImproved("");
      setShowOriginal(false);
    }
  }, [value]);

  const handleOffer = async () => {
    setStage("loading");
    setError("");
    offeredOnceRef.current = true;
    try {
      const r = await api.post("/ai/improve-description", {
        text: value,
        category: category || undefined,
        business_name: businessName || undefined,
        locale: lang,
      });
      setImproved(r.data.improved || "");
      setStage("showing");
    } catch (err) {
      const msg = err?.response?.data?.detail || T.error;
      setError(msg);
      setStage("offering");
    }
  };

  const handleAccept = () => {
    onAccept?.(improved);
    setStage("idle");
    setImproved("");
    offeredOnceRef.current = true;
  };

  const handleReject = () => {
    setStage("dismissed");
    offeredOnceRef.current = true;
  };

  if (stage === "idle" || stage === "dismissed") return null;

  return (
    <div className="mt-3 animate-in slide-in-from-bottom-2 fade-in" data-testid={testid}>
      <div
        className="rounded-2xl p-4 sm:p-5 border shadow-sm"
        style={{
          background: "linear-gradient(135deg, rgba(2,95,103,0.04) 0%, rgba(255,107,44,0.04) 100%)",
          borderColor: "rgba(2,95,103,0.18)",
        }}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
          >
            {stage === "loading"
              ? <Loader2 className="w-4 h-4 text-white animate-spin" />
              : <Bot className="w-4 h-4 text-white" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#025F67" }}>{T.title}</span>
              <Sparkles className="w-3 h-3" style={{ color: "#FF6B2C" }} />
            </div>

            {stage === "offering" && (
              <>
                <p className="text-sm text-slate-700 leading-relaxed" data-testid={`${testid}-offer-text`}>{T.offer}</p>
                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleOffer}
                    className="px-4 py-2 rounded-full text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition"
                    style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
                    data-testid={`${testid}-yes`}
                  >
                    <Wand2 className="w-3.5 h-3.5" /> {T.yes}
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    className="px-4 py-2 rounded-full text-slate-700 text-sm font-medium hover:bg-slate-100 transition"
                    data-testid={`${testid}-no`}
                  >
                    {T.no}
                  </button>
                </div>
              </>
            )}

            {stage === "loading" && (
              <p className="text-sm text-slate-600 leading-relaxed inline-flex items-center gap-1.5" data-testid={`${testid}-loading`}>
                {T.loading} <span className="inline-flex">
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-pulse" />
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-pulse mx-0.5" style={{ animationDelay: "0.15s" }} />
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: "0.3s" }} />
                </span>
              </p>
            )}

            {stage === "showing" && (
              <>
                <p className="text-xs font-semibold text-slate-700 mb-2">{T.showing} ✨</p>
                <div
                  className="rounded-xl bg-white border border-slate-200 p-3.5 text-sm text-slate-800 leading-relaxed"
                  data-testid={`${testid}-improved-text`}
                >
                  {improved}
                </div>

                {showOriginal && (
                  <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 leading-relaxed">
                    <span className="font-semibold text-slate-500 block mb-1">Original:</span>
                    {value}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onClick={handleAccept}
                    className="px-4 py-2 rounded-full text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition"
                    style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
                    data-testid={`${testid}-accept`}
                  >
                    <Check className="w-3.5 h-3.5" /> {T.use}
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    className="px-4 py-2 rounded-full text-slate-700 text-sm font-medium hover:bg-slate-100 transition inline-flex items-center gap-1.5"
                    data-testid={`${testid}-reject`}
                  >
                    <X className="w-3.5 h-3.5" /> {T.keep}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOriginal((s) => !s)}
                    className="ml-auto text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
                    data-testid={`${testid}-toggle-original`}
                  >
                    {showOriginal ? T.hideOriginal : T.showOriginal}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
