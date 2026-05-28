import { useI18n } from "../contexts/I18nContext";

/**
 * WhatsApp button. Strips non-numeric from phone and opens wa.me.
 *
 * Section 67 — Dual-audience pivot: the prefilled message is now generated
 * in the visitor's UI language (EN or ES). An American visitor on an
 * EN-rendered eCard will send an English message; a Spanish visitor will
 * send Spanish. The visitor's language signal is the source of truth for
 * the message language — not the provider's profile language.
 */
export default function WhatsAppButton({ phone, businessName, category, testid = "whatsapp-button", variant = "compact" }) {
  const { lang } = useI18n();
  if (!phone) return null;
  const clean = String(phone).replace(/\D/g, "");
  if (!clean) return null;
  const text = lang === "en"
    ? (businessName
        ? `Hi ${businessName}, I found your profile on getamano and I'd like to get a quote${category ? ` for ${category} services` : ""}.`
        : "")
    : (businessName
        ? `Hola ${businessName}, vi tu perfil en getamano y me gustaría cotizar${category ? ` un servicio de ${category}` : ""}.`
        : "");
  const msg = text ? encodeURIComponent(text) : "";
  const href = `https://wa.me/${clean}${msg ? `?text=${msg}` : ""}`;
  const isPrimary = variant === "primary";
  const className = isPrimary
    ? "w-full flex items-center justify-center gap-2.5 text-base rounded-2xl px-6 py-3.5 font-semibold text-white transition active:scale-[0.98] shadow-md hover:shadow-lg"
    : "justify-center flex items-center gap-1 text-sm rounded-full px-4 py-3 font-medium text-white transition";
  const label = isPrimary
    ? (businessName
        ? (lang === "en" ? "Message via WhatsApp" : "Enviar mensaje por WhatsApp")
        : "WhatsApp")
    : "WhatsApp";
  const iconSize = isPrimary ? "w-5 h-5" : "w-4 h-4";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={{ backgroundColor: "#25D366" }} data-testid={testid}>
      <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      {label}
    </a>
  );
}
