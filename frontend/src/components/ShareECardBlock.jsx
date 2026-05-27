import { useState } from "react";
import { Copy, Check, QrCode, Smartphone, Share2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

/**
 * ShareECardBlock — Section 32.
 * Bottom card on the public eCard that lets the *viewer* (or the eCard
 * owner showing off their card) share the link 3 ways:
 *   1) Copy link
 *   2) QR code (inline modal)
 *   3) NFC tag write (Web NFC API, Android Chrome only — graceful fallback)
 *
 * Light theme; matches Alabaster + teal palette.
 */
export default function ShareECardBlock({ provider, lang = "es" }) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [nfcState, setNfcState] = useState("idle"); // idle | writing | success | unsupported

  // Section 65 — humans see the canonical /p/{slug} (e.g. in the QR code,
  // and in the URL displayed under the buttons). Native-share and clipboard
  // payloads use the OG-rich backend URL so WhatsApp / iMessage / Facebook
  // crawlers fetch the dynamic preview before the SPA loads.
  const backend = process.env.REACT_APP_BACKEND_URL || window.location.origin;
  const humanUrl = `${window.location.origin}/p/${provider?.slug}`;
  const shareUrl = `${backend}/api/og/p/${provider?.slug}`;
  // Keep the visible URL pretty (human-readable) — the OG redirect happens
  // transparently on click.
  const url = humanUrl;
  const title = lang === "en"
    ? `${provider?.business_name} on getamano`
    : `${provider?.business_name} en getamano`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success(lang === "en" ? "Link copied!" : "¡Enlace copiado!");
    } catch (_e) {
      toast.error(lang === "en" ? "Could not copy" : "No se pudo copiar");
    }
  };

  const nativeShare = async () => {
    if (!navigator.share) {
      copy();
      return;
    }
    try {
      await navigator.share({ title, text: title, url: shareUrl });
    } catch (e) {
      if (e?.name !== "AbortError") copy();
    }
  };

  const writeNFC = async () => {
    if (!("NDEFReader" in window)) {
      setNfcState("unsupported");
      toast.info(lang === "en"
        ? "NFC not available on this device. Copying link instead."
        : "NFC no disponible en este dispositivo. Copiando el enlace.");
      copy();
      return;
    }
    setNfcState("writing");
    try {
      // eslint-disable-next-line no-undef
      const ndef = new window.NDEFReader();
      await ndef.write({
        records: [{ recordType: "url", data: shareUrl }],
      });
      setNfcState("success");
      toast.success(lang === "en"
        ? "Tap a writable NFC tag to save!"
        : "¡Acerca el celular a una etiqueta NFC para guardar!");
      setTimeout(() => setNfcState("idle"), 4000);
    } catch (err) {
      setNfcState("idle");
      const name = err?.name || "";
      if (name === "NotAllowedError") {
        toast.error(lang === "en" ? "NFC permission denied" : "Permiso NFC denegado");
      } else if (name === "NotSupportedError") {
        toast.error(lang === "en" ? "NFC not supported here" : "NFC no soportado aquí");
      } else {
        toast.error(lang === "en" ? "NFC error" : "Error de NFC");
      }
    }
  };

  const T = lang === "en" ? {
    title: "Share this eCard",
    subtitle: "Send your profile to a potential client",
    copy: "Copy link",
    copied: "Copied",
    qr: "QR code",
    nfc: "NFC / Tap",
    share: "Share",
    qrTitle: "Scan to open",
    nfcHint: "NFC: tap a writable NFC tag, sticker or another phone to save this link instantly. Works on most modern Android phones.",
  } : {
    title: "Comparte esta eCard",
    subtitle: "Envía tu perfil profesional a un cliente potencial",
    copy: "Copiar enlace",
    copied: "Copiado",
    qr: "Código QR",
    nfc: "NFC / Cerca",
    share: "Compartir",
    qrTitle: "Escanea para abrir",
    nfcHint: "📱 NFC: acerca el celular a una etiqueta o sticker NFC para guardar el enlace al instante. Compatible con la mayoría de Android modernos.",
  };

  return (
    <>
      <div
        className="rounded-2xl p-5 sm:p-6"
        style={{
          background: "linear-gradient(135deg, rgba(2,95,103,0.06) 0%, rgba(47,157,148,0.10) 100%)",
          border: "1px solid rgba(2,95,103,0.18)",
        }}
        data-testid="ecard-share-block"
      >
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="w-5 h-5" style={{ color: "#025F67" }} />
          <h3 className="font-display font-bold text-slate-900 text-base sm:text-lg leading-tight">{T.title}</h3>
        </div>
        <p className="text-xs sm:text-sm text-slate-600">{T.subtitle}</p>

        {/* URL preview row */}
        <div className="mt-4 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <span className="text-xs text-slate-500 flex-1 truncate" title={url} data-testid="ecard-share-url">{url}</span>
          <button
            type="button"
            onClick={copy}
            className={`text-xs font-bold px-2.5 py-1 rounded-lg transition ${copied ? "bg-emerald-100 text-emerald-700" : "bg-teal-600 text-white hover:bg-teal-700"}`}
            data-testid="ecard-share-copy"
          >
            {copied ? (<><Check className="w-3 h-3 inline -mt-0.5 mr-0.5" /> {T.copied}</>) : (<><Copy className="w-3 h-3 inline -mt-0.5 mr-0.5" /> {T.copy}</>)}
          </button>
        </div>

        {/* 3-button row */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={nativeShare}
            className="flex flex-col items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl py-3 transition active:scale-[0.98]"
            data-testid="ecard-share-native"
          >
            <Share2 className="w-5 h-5" style={{ color: "#025F67" }} />
            <span className="text-[11px] font-semibold text-slate-700">{T.share}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowQR(true)}
            className="flex flex-col items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl py-3 transition active:scale-[0.98]"
            data-testid="ecard-share-qr"
          >
            <QrCode className="w-5 h-5" style={{ color: "#025F67" }} />
            <span className="text-[11px] font-semibold text-slate-700">{T.qr}</span>
          </button>
          <button
            type="button"
            onClick={writeNFC}
            disabled={nfcState === "writing"}
            className={`flex flex-col items-center gap-1 bg-white border rounded-xl py-3 transition active:scale-[0.98] ${nfcState === "writing" ? "border-amber-300 animate-pulse" : "border-slate-200 hover:bg-slate-50"}`}
            data-testid="ecard-share-nfc"
          >
            <Smartphone className="w-5 h-5" style={{ color: "#C2410C" }} />
            <span className="text-[11px] font-semibold text-slate-700">
              {nfcState === "writing" ? (lang === "en" ? "Hold near…" : "Acerca…") : T.nfc}
            </span>
          </button>
        </div>

        <p className="text-[11px] text-slate-500 mt-3 text-center leading-relaxed">{T.nfcHint}</p>
      </div>

      {/* QR modal */}
      {showQR && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
          onClick={() => setShowQR(false)}
          data-testid="ecard-share-qr-modal"
        >
          <div
            className="bg-white rounded-2xl p-6 sm:p-7 w-full max-w-xs text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowQR(false)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100"
              aria-label="Close"
              data-testid="ecard-share-qr-close"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{T.qrTitle}</p>
            <h4 className="font-display font-bold text-slate-900 mt-1 text-base leading-tight">{provider?.business_name}</h4>
            <div className="mt-4 mx-auto inline-block p-3 rounded-xl bg-white border border-slate-200">
              <QRCodeSVG
                value={url}
                size={192}
                fgColor="#025F67"
                bgColor="#FFFFFF"
                level="M"
                includeMargin={false}
                data-testid="ecard-share-qr-svg"
              />
            </div>
            <p className="mt-4 text-[10px] text-slate-400 break-all">{url}</p>
          </div>
        </div>
      )}
    </>
  );
}
