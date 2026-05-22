import { useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { Heart, X, MessageCircle, Copy, Check, Sparkles, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/**
 * RecommendModal — 2-step flow.
 * Step 1: form (name + city + optional message + email)
 * Step 2: success + share buttons (WhatsApp, Copy link, Twitter/X)
 *
 * The share copy is auto-built in the user's language so it feels native when
 * they paste it into a WhatsApp chat or social post.
 */
export default function RecommendModal({ open, onClose, provider, onSubmitted }) {
  const { lang } = useI18n();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    client_name: user?.name || "",
    client_email: user?.email || "",
    client_city: user?.city || "",
    message: "",
  });

  const T = lang === "en" ? {
    title: "Recommend this professional",
    subtitle: "Share with the Latino community why you trust them.",
    name: "Your name *",
    email: "Email (helps us prevent spam — never published)",
    city: "Your city",
    message: "Why do you recommend them? (optional)",
    messagePlaceholder: "e.g. María cleaned my 3-bedroom house in 2 hours and was super friendly. Highly recommended.",
    submit: "Send my recommendation",
    successTitle: "Thanks for vouching for them! 💚",
    successSub: "Now share with friends so others find this trusted pro:",
    waMsg: (name, url) => `💚 I recommend ${name} on getamano. They're great and Latino-owned. Take a look: ${url}`,
    twMsg: (name, url) => `💚 I recommend ${name} on @getamano — verified Latino professional. ${url}`,
    waBtn: "Share on WhatsApp",
    copy: "Copy link",
    copied: "Copied!",
    twBtn: "Share on X",
    skip: "Done",
    nameTooShort: "Please enter your name",
  } : {
    title: "Recomendar a este profesional",
    subtitle: "Cuéntale a la comunidad latina por qué confías en él/ella.",
    name: "Tu nombre *",
    email: "Email (nos ayuda a evitar spam — no se publica)",
    city: "Tu ciudad",
    message: "¿Por qué lo/la recomiendas? (opcional)",
    messagePlaceholder: "ej. María limpió mi casa de 3 cuartos en 2 horas y fue super amable. La recomiendo a ojos cerrados.",
    submit: "Enviar mi recomendación",
    successTitle: "¡Gracias por dar la cara por él/ella! 💚",
    successSub: "Ahora comparte con tus amigos para que otros encuentren a este profesional confiable:",
    waMsg: (name, url) => `💚 Recomiendo a ${name} en getamano. Es de confianza y latino. Mira su perfil: ${url}`,
    twMsg: (name, url) => `💚 Recomiendo a ${name} en @getamano — profesional latino verificado. ${url}`,
    waBtn: "Compartir por WhatsApp",
    copy: "Copiar enlace",
    copied: "¡Copiado!",
    twBtn: "Compartir en X",
    skip: "Listo",
    nameTooShort: "Por favor ingresa tu nombre",
  };

  if (!open) return null;

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
      // Build absolute share URL so WhatsApp/X work everywhere
      const baseUrl = window.location.origin;
      setShareUrl(`${baseUrl}${data.share_url}`);
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
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full flex-shrink-0" data-testid="recommend-close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {step === 1 && (
          <form onSubmit={submit} className="p-5 space-y-3" data-testid="recommend-form">
            <p className="text-sm text-slate-600 mb-2">{T.subtitle}</p>
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
              className="w-full py-3 rounded-full text-white font-semibold shadow-sm hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #F87171 0%, #DC2626 100%)" }}
              data-testid="recommend-submit"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4 fill-white" />}
              {T.submit}
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="p-5" data-testid="recommend-success">
            <div className="rounded-2xl p-5 text-center mb-4" style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #FED7AA 100%)" }}>
              <div className="w-14 h-14 rounded-2xl bg-white shadow-sm mx-auto flex items-center justify-center mb-3">
                <Sparkles className="w-7 h-7 text-orange-500" />
              </div>
              <p className="text-sm text-slate-700 mb-1">{T.successSub}</p>
            </div>
            <div className="space-y-2.5">
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
