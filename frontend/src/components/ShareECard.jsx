import { useState } from "react";
import { Share2, Facebook, MessageCircle, MessageSquare, Link as LinkIcon, X, Mail } from "lucide-react";
import { toast } from "sonner";

export default function ShareECard({ businessName, slug, description }) {
  const [open, setOpen] = useState(false);
  const url = `${window.location.origin}/services/${slug}`;
  const text = `${businessName} — ${description ? description.slice(0, 120) : "Mira este negocio en getamano"} ${url}`;

  const opts = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      Icon: MessageCircle,
      color: "bg-green-50 text-green-600 hover:bg-green-100",
      href: `https://wa.me/?text=${encodeURIComponent(text)}`,
    },
    {
      id: "facebook",
      label: "Facebook",
      Icon: Facebook,
      color: "bg-blue-50 text-blue-700 hover:bg-blue-100",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(businessName)}`,
    },
    {
      id: "sms",
      label: "SMS",
      Icon: MessageSquare,
      color: "bg-orange-50 text-orange-600 hover:bg-orange-100",
      href: `sms:?&body=${encodeURIComponent(text)}`,
    },
    {
      id: "email",
      label: "Email",
      Icon: Mail,
      color: "bg-slate-100 text-slate-700 hover:bg-slate-200",
      href: `mailto:?subject=${encodeURIComponent(businessName)}&body=${encodeURIComponent(text)}`,
    },
  ];

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Enlace copiado");
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: businessName, text: description, url }); return true; }
      catch (e) { if (e?.name !== "AbortError") console.error("native share failed", e); }
    }
    return false;
  };

  const openSharer = async () => {
    const ok = await nativeShare();
    if (!ok) setOpen(true);
  };

  return (
    <>
      <button onClick={openSharer} className="btn-outline justify-center flex items-center gap-1 text-sm w-full" data-testid="ecard-share-button">
        <Share2 className="w-4 h-4" /> Compartir
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4" onClick={() => setOpen(false)} data-testid="share-modal">
          <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-semibold text-lg text-slate-900">Compartir esta eCard</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="cerrar" data-testid="share-close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {opts.map(o => (
                <a key={o.id} href={o.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition ${o.color}`} data-testid={`share-option-${o.id}`}>
                  <o.Icon className="w-6 h-6" />
                  <span className="text-xs font-medium">{o.label}</span>
                </a>
              ))}
            </div>
            <button onClick={copy} className="mt-4 w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-slate-200 hover:border-blue-600 hover:text-blue-600 text-sm font-medium text-slate-700" data-testid="share-copy-link">
              <LinkIcon className="w-4 h-4" /> Copiar enlace
            </button>
            <p className="mt-3 text-xs text-slate-400 text-center break-all">{url}</p>
          </div>
        </div>
      )}
    </>
  );
}
