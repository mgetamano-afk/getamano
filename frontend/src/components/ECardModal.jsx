import { useEffect } from "react";
import { X, Phone, Mail, MapPin, Globe, Star, ShieldCheck, Award, Copy, Download, MessageCircle } from "lucide-react";
import WhatsAppButton from "./WhatsAppButton";
import { buildFileUrl } from "./ImageUpload";
import { toast } from "sonner";

/**
 * Premium eCard modal - shareable business card view
 */
export default function ECardModal({ provider, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  if (!provider) return null;
  const url = `${window.location.origin}/proveedor/${provider.slug}`;
  const verified = provider.verification_status === "approved";

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("¡Enlace copiado!");
  };

  const shareWA = () => {
    const text = `Hola, te comparto mi perfil en getmano: ${url} — ${provider.business_name}${provider.category ? `, ${provider.category.name_es}` : ""}${provider.city ? ` en ${provider.city}` : ""}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const downloadImage = () => {
    // Simple QR code from external service (no API key)
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}`;
    const a = document.createElement("a");
    a.href = qr; a.download = `${provider.slug}-qr.png`; a.target = "_blank";
    document.body.appendChild(a); a.click(); a.remove();
    toast.success("Descargando QR de tu eCard");
  };

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}&color=0F172A&bgcolor=FFFFFF`;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-start md:items-center justify-center p-0 md:p-4 overflow-y-auto" onClick={onClose} data-testid="ecard-modal">
      <div className="bg-white w-full md:max-w-md md:rounded-3xl overflow-hidden shadow-2xl my-0 md:my-4" onClick={e => e.stopPropagation()}>
        {/* Cover */}
        <div className="relative h-32 bg-gradient-to-br from-blue-600 to-orange-500">
          {provider.cover_url && <img src={buildFileUrl(provider.cover_url)} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center" data-testid="ecard-modal-close">
            <X className="w-5 h-5 text-slate-700" />
          </button>
        </div>
        <div className="px-6 pb-6 -mt-12 relative">
          <div className="w-24 h-24 rounded-2xl bg-white border-4 border-white shadow-lg overflow-hidden mb-3">
            {provider.logo_url ? <img src={buildFileUrl(provider.logo_url)} alt="" className="w-full h-full object-cover" /> :
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-orange-500 flex items-center justify-center text-white font-display font-bold text-2xl">{provider.business_name.charAt(0)}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="font-display text-2xl font-bold text-slate-900">{provider.business_name}</h2>
            {verified && <span className="badge-verified"><ShieldCheck className="w-3 h-3" /> Verificado</span>}
            {provider.founding_member && <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700"><Award className="w-3 h-3" /> Founding</span>}
            {provider.latino_owned === "yes" && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">Latino-owned 🇲🇽</span>}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {provider.category && <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${provider.category.color}15`, color: provider.category.color }}>{provider.category.name_es}</span>}
            {provider.rating_count > 0 && <span className="flex items-center gap-0.5"><Star className="w-3.5 h-3.5 fill-orange-500 text-orange-500" /> {provider.rating_avg.toFixed(1)} ({provider.rating_count})</span>}
          </div>
          {(provider.likes_count > 0) && <p className="mt-2 text-sm text-slate-700">👍 <strong>{provider.likes_count}</strong> personas recomiendan este negocio</p>}

          <div className="my-4 h-px bg-slate-100" />

          <div className="space-y-2.5 text-sm">
            {provider.phone && <a href={`tel:${provider.phone}`} className="flex items-center gap-2 text-slate-700"><Phone className="w-4 h-4 text-slate-400" /> {provider.phone}</a>}
            {provider.email && <a href={`mailto:${provider.email}`} className="flex items-center gap-2 text-slate-700"><Mail className="w-4 h-4 text-slate-400" /> {provider.email}</a>}
            {provider.is_home_based ? (
              <div className="flex items-center gap-2 text-slate-700"><MapPin className="w-4 h-4 text-orange-500" /> Servicio móvil {provider.city ? `· ${provider.city}, ${provider.state}` : ""}</div>
            ) : provider.address && (
              <div className="flex items-start gap-2 text-slate-700"><MapPin className="w-4 h-4 text-slate-400 mt-0.5" /> {provider.address}, {provider.city}, {provider.state}</div>
            )}
            {provider.website && <a href={provider.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600"><Globe className="w-4 h-4" /> {provider.website}</a>}
          </div>

          {provider.services?.length > 0 && (
            <>
              <h3 className="text-xs uppercase tracking-widest text-slate-400 mt-5 mb-2">Servicios</h3>
              <div className="flex flex-wrap gap-1.5">
                {provider.services.map((s, i) => <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">{s}</span>)}
              </div>
            </>
          )}

          {/* QR code for premium */}
          {provider.plan === "premium" && (
            <div className="mt-5 flex items-center gap-4 p-4 rounded-2xl bg-slate-50">
              <img src={qrSrc} alt="QR" className="w-20 h-20 rounded-lg bg-white p-1" />
              <div className="text-xs text-slate-600">Comparte este QR en tus tarjetas físicas, flyers o redes sociales. Tus clientes lo escanean y llegan directo a tu eCard.</div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 grid grid-cols-3 gap-2">
            <button onClick={copyLink} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700" data-testid="ecard-modal-copy">
              <Copy className="w-4 h-4" /><span className="text-xs">Copiar link</span>
            </button>
            <button onClick={shareWA} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-green-50 hover:bg-green-100 text-green-700" data-testid="ecard-modal-wa">
              <MessageCircle className="w-4 h-4" /><span className="text-xs">WhatsApp</span>
            </button>
            <button onClick={downloadImage} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700" data-testid="ecard-modal-download">
              <Download className="w-4 h-4" /><span className="text-xs">Descargar QR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
