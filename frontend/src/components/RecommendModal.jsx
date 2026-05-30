import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { Heart, X, MessageCircle, Copy, Check, Sparkles, Loader2, ExternalLink, Instagram, ShieldCheck, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

/**
 * RecommendModal — 2-step flow with V16.2 publish-to-Story enhancement.
 *
 * Step 1: form (name + city + optional message + email).
 *   - V16.2 part D: if the logged-in user has any prior interaction with
 *     this provider (review / message / quote request) we surface a
 *     "Cliente real ✓" hint so they know their recommendation will carry
 *     extra weight when published.
 *
 * Step 2: success.
 *   - Live preview of the 1080×1920 Story PNG with their message overlaid
 *     on top of the provider's hero photo (gallery → AI bg → gradient).
 *   - Primary CTA "Publicar en Story" → Web Share API with the file
 *     payload (opens IG/FB/WhatsApp Story composer with the image
 *     preloaded). Falls back to plain download on desktop.
 *   - Secondary: WhatsApp text share + copy link + X.
 *
 * The recommendation itself is persisted by the existing
 * POST /providers/{provider_id}/recommend endpoint — it doubles as a
 * testimonial that can later be surfaced on the provider's eCard.
 */
export default function RecommendModal({ open, onClose, provider, onSubmitted }) {
  const { lang } = useI18n();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [canVerifyClient, setCanVerifyClient] = useState(false);
  const [form, setForm] = useState({
    client_name: user?.name || "",
    client_email: user?.email || "",
    client_city: user?.city || "",
    message: "",
  });

  // V16.2 part D — check whether the logged-in user has a prior
  // interaction with this provider so we can surface the "Cliente real"
  // hint. Fire only when modal opens with a logged-in user + provider.
  useEffect(() => {
    if (!open || !user || !provider?.provider_id) {
      setCanVerifyClient(false);
      return;
    }
    let alive = true;
    api.get(`/providers/${provider.provider_id}/can-verify-client`)
      .then(({ data }) => { if (alive) setCanVerifyClient(!!data?.can_verify_client); })
      .catch(() => { /* signed out / network — silently no badge */ });
    return () => { alive = false; };
  }, [open, user, provider?.provider_id]);

  const T = lang === "en" ? {
    title: "Recommend this professional",
    subtitle: "Share with the Latino community why you trust them.",
    name: "Your name *",
    email: "Email (helps us prevent spam — never published)",
    city: "Your city",
    message: "Why do you recommend them? (optional)",
    messagePlaceholder: "e.g. María cleaned my 3-bedroom house in 2 hours and was super friendly. Highly recommended.",
    submitWithMsg: "Publish my recommendation",
    submitWithoutMsg: "Share without writing",
    successTitle: "Thanks for vouching for them! 💚",
    successSub: "Publish to your Story or share with friends:",
    waMsg: (name, url) => `💚 I recommend ${name} on getamano. They're great and Latino-owned. Take a look: ${url}`,
    twMsg: (name, url) => `💚 I recommend ${name} on @getamano — verified Latino professional. ${url}`,
    publishStory: "Publish to Story",
    waBtn: "Share on WhatsApp",
    copy: "Copy link",
    copied: "Copied!",
    twBtn: "Share on X",
    skip: "Done",
    nameTooShort: "Please enter your name",
    verifiedHint: "Looks like you've worked with this pro before — your recommendation will carry a \"Real client ✓\" badge.",
    previewLabel: "Preview of your Story",
    previewLoading: "Generating preview…",
    storyToast: "Ready! Pick Instagram, Facebook or WhatsApp Story.",
    storyDownloadFallback: "Image downloaded — upload from your phone for best results.",
    storyError: "Couldn't prepare the image",
  } : {
    title: "Recomendar a este profesional",
    subtitle: "Cuéntale a la comunidad latina por qué confías en él/ella.",
    name: "Tu nombre *",
    email: "Email (nos ayuda a evitar spam — no se publica)",
    city: "Tu ciudad",
    message: "¿Por qué lo/la recomiendas? (opcional)",
    messagePlaceholder: "ej. María limpió mi casa de 3 cuartos en 2 horas y fue super amable. La recomiendo a ojos cerrados.",
    submitWithMsg: "Publicar mi recomendación",
    submitWithoutMsg: "Compartir tal cual",
    successTitle: "¡Gracias por dar la cara por él/ella! 💚",
    successSub: "Publícala en tu historia o compártela con tus amigos:",
    waMsg: (name, url) => `💚 Recomiendo a ${name} en getamano. Es de confianza y latino. Mira su perfil: ${url}`,
    twMsg: (name, url) => `💚 Recomiendo a ${name} en @getamano — profesional latino verificado. ${url}`,
    publishStory: "Publicar en Story",
    waBtn: "Compartir por WhatsApp",
    copy: "Copiar enlace",
    copied: "¡Copiado!",
    twBtn: "Compartir en X",
    skip: "Listo",
    nameTooShort: "Por favor ingresa tu nombre",
    verifiedHint: "Ya trabajaste con este pro — tu recomendación llevará insignia \"Cliente real ✓\".",
    previewLabel: "Vista previa de tu historia",
    previewLoading: "Generando preview…",
    storyToast: "¡Listo! Elige Instagram, Facebook o WhatsApp Story.",
    storyDownloadFallback: "Imagen descargada — súbela desde tu celular para mejor calidad.",
    storyError: "No se pudo preparar la imagen",
  };

  if (!open) return null;

  // The submit copy adapts to the user's actual input (V16.2 hybrid).
  const hasMessage = (form.message || "").trim().length >= 20;
  const submitLabel = hasMessage ? T.submitWithMsg : T.submitWithoutMsg;

  const submit = async (e) => {
    e?.preventDefault();
    if (form.client_name.trim().length < 2) {
      toast.error(T.nameTooShort);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/providers/${provider.provider_id}/recommend`, {
        client_name: form.client_name.trim(),
        client_email: form.client_email.trim() || null,
        client_city: form.client_city.trim() || null,
        message: form.message.trim() || null,
        source: "ecard_button",
      });
      const baseUrl = window.location.origin;
      setShareUrl(`${baseUrl}${data.share_url}`);
      setShareToken(data.share_token);
      setStep(2);
      onSubmitted && onSubmitted({ deduped: data.deduped });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success(T.copied);
    setTimeout(() => setCopied(false), 1800);
  };

  const shareWhatsApp = () => {
    const txt = T.waMsg(provider?.business_name || "este profesional", shareUrl);
    const url = `https://wa.me/?text=${encodeURIComponent(txt)}`;
    window.open(url, "_blank", "noopener");
  };

  const shareTwitter = () => {
    const txt = T.twMsg(provider?.business_name || "este profesional", shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
  };

  // V16.2 — publish-to-Story via Web Share API with file. The backend
  // renders the recommendation PNG with the client's message overlaid.
  const publishStory = async () => {
    const backend = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    const storyUrl = `${backend}/api/og-image/recommendation/${shareToken}.png`;
    const id = toast.loading(T.previewLoading);
    try {
      const r = await fetch(storyUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const file = new File([blob], `recommendation-${shareToken}.png`, { type: "image/png" });

      const canShareFile =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({
            files: [file],
            title: provider?.business_name || "Recomendación",
            text: T.waMsg(provider?.business_name || "este profesional", shareUrl),
          });
          toast.success(T.storyToast, { id });
          return;
        } catch (e) {
          if (e?.name === "AbortError") {
            toast.dismiss(id);
            return;
          }
          console.error("native story share failed", e);
        }
      }

      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `recommendation-${shareToken}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
      toast.success(T.storyDownloadFallback, { id, duration: 6000 });
    } catch (e) {
      console.error("publish recommendation story failed", e);
      toast.error(T.storyError, { id });
    }
  };

  // Preview URL — only valid in step 2 once we have a share_token
  const backend = process.env.REACT_APP_BACKEND_URL || window.location.origin;
  const previewSrc = shareToken ? `${backend}/api/og-image/recommendation/${shareToken}.png` : null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" data-testid="recommend-modal">
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #FCA5A5 0%, #F87171 100%)" }}>
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-slate-900 text-sm sm:text-base truncate">{step === 1 ? T.title : T.successTitle}</h3>
              <p className="text-xs text-slate-500 truncate">{provider?.business_name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full flex-shrink-0" data-testid="recommend-close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {step === 1 && (
          <form onSubmit={submit} className="p-5 space-y-3" data-testid="recommend-form">
            <p className="text-sm text-slate-600 mb-2">{T.subtitle}</p>

            {/* V16.2 part D — Cliente real hint when applicable */}
            {canVerifyClient && (
              <div
                className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5"
                data-testid="recommend-verified-client-hint"
              >
                <ShieldCheck className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-sky-900 leading-snug">{T.verifiedHint}</p>
              </div>
            )}

            <input
              value={form.client_name}
              onChange={e => setForm({ ...form, client_name: e.target.value })}
              placeholder={T.name}
              required minLength={2} maxLength={80}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-sm"
              data-testid="recommend-name"
            />
            <input
              value={form.client_city}
              onChange={e => setForm({ ...form, client_city: e.target.value })}
              placeholder={T.city}
              maxLength={80}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-sm"
              data-testid="recommend-city"
            />
            <input
              type="email"
              value={form.client_email}
              onChange={e => setForm({ ...form, client_email: e.target.value })}
              placeholder={T.email}
              maxLength={200}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-sm"
              data-testid="recommend-email"
            />
            <textarea
              value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value.slice(0, 240) })}
              placeholder={T.messagePlaceholder}
              rows={3}
              className="w-full p-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-sm"
              data-testid="recommend-message"
            />
            <div className="text-[10px] text-slate-400 text-right">{form.message.length}/240</div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-full text-white font-semibold shadow-sm hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2 transition"
              style={{ background: "linear-gradient(135deg, #F87171 0%, #DC2626 100%)" }}
              data-testid="recommend-submit"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4 fill-white" />}
              {submitLabel}
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="p-5" data-testid="recommend-success">
            <div className="rounded-2xl p-4 text-center mb-4" style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #FED7AA 100%)" }}>
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm mx-auto flex items-center justify-center mb-2">
                <Sparkles className="w-6 h-6 text-orange-500" />
              </div>
              <p className="text-sm text-slate-700">{T.successSub}</p>
            </div>

            {/* V16.2 — Live preview of the Story PNG */}
            {previewSrc && (
              <div
                className="relative mb-4 rounded-2xl overflow-hidden bg-slate-900 border border-slate-200"
                data-testid="recommend-story-preview"
              >
                <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-[11px] font-semibold tracking-wide">
                  <ImageIcon className="w-3.5 h-3.5 text-orange-300" />
                  {T.previewLabel}
                </div>
                <img
                  src={previewSrc}
                  alt="Vista previa de tu recomendación"
                  className="block w-full h-auto max-h-[420px] object-contain mx-auto"
                  loading="lazy"
                  data-testid="recommend-story-preview-img"
                />
              </div>
            )}

            <div className="space-y-2.5">
              {/* Primary V16.2 CTA — Publish to Story */}
              <button
                onClick={publishStory}
                className="w-full py-3.5 rounded-full text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-lg transition bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 hover:from-pink-600 hover:via-fuchsia-600 hover:to-purple-600"
                data-testid="recommend-share-story"
              >
                <Instagram className="w-4 h-4" /> {T.publishStory}
              </button>

              <button onClick={shareWhatsApp} className="w-full py-3 rounded-full bg-green-600 hover:bg-green-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm" data-testid="recommend-share-whatsapp">
                <MessageCircle className="w-4 h-4" /> {T.waBtn}
              </button>
              <button onClick={copyLink} className="w-full py-3 rounded-full bg-white border border-slate-200 text-slate-900 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-slate-50" data-testid="recommend-share-copy">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? T.copied : T.copy}
              </button>
              <button onClick={shareTwitter} className="w-full py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm inline-flex items-center justify-center gap-2" data-testid="recommend-share-twitter">
                <ExternalLink className="w-4 h-4" /> {T.twBtn}
              </button>
              <div className="text-[10px] text-slate-400 text-center pt-2 truncate">{shareUrl}</div>
              <button onClick={onClose} className="w-full py-2.5 text-slate-500 text-sm hover:text-slate-700">
                {T.skip}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
