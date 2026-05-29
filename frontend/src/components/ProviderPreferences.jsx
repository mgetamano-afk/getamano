import { useEffect, useState } from "react";
import { Loader2, MessageSquare, FileText, Phone, Search, UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { toast } from "sonner";

/**
 * ProviderPreferences — Section 88 (v3 social-first).
 *
 * 5 boolean toggles that let a provider control who can reach them and
 * how their eCard surfaces around the platform. Optimistic UI — flips
 * locally on click, only rolls back if the API errors.
 *
 *   messages_on   → bool — receive in-app direct messages
 *   quotes_on     → bool — receive quote requests
 *   show_phone    → bool — public phone visible on the eCard
 *   in_search     → bool — listed in /buscar results
 *   referrals_on  → bool — enrolled in the referral program
 *
 * Used inside ProviderDashboard.jsx via the new "Preferencias" tab.
 */
export default function ProviderPreferences() {
  const { lang } = useI18n();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get("/users/me/provider-status")
      .then(r => { if (alive) { setPrefs(r.data.preferences); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const toggle = async (key) => {
    if (!prefs || savingKey) return;
    const newValue = !prefs[key];
    const prev = prefs[key];
    setPrefs(p => ({ ...p, [key]: newValue }));
    setSavingKey(key);
    try {
      const { data } = await api.post("/users/me/preferences", { [key]: newValue });
      setPrefs(data.preferences);
    } catch (err) {
      // rollback on failure
      setPrefs(p => ({ ...p, [key]: prev }));
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-[#0077B6]" />
      </div>
    );
  }
  if (!prefs) return null;

  // Localised label dictionary — keeps the JSX terse and avoids 5 IF blocks.
  const rows = [
    { key: "messages_on", icon: MessageSquare, label_es: "Recibir mensajes",          label_en: "Receive messages",      hint_es: "Clientes te pueden escribir desde tu eCard.",       hint_en: "Clients can DM you from your eCard." },
    { key: "quotes_on",   icon: FileText,      label_es: "Recibir cotizaciones",      label_en: "Receive quote requests", hint_es: "Aparece el formulario 'pedir cotización' en tu eCard.", hint_en: "Show the 'request a quote' form on your eCard." },
    { key: "show_phone",  icon: Phone,         label_es: "Mostrar mi teléfono",       label_en: "Show my phone",          hint_es: "Tu número será visible públicamente en tu eCard.",   hint_en: "Your phone number will be public on your eCard." },
    { key: "in_search",   icon: Search,        label_es: "Aparecer en búsquedas",     label_en: "Show in search",         hint_es: "Apareces en /buscar y los mapas de servicios.",      hint_en: "Listed in /search and on service maps." },
    { key: "referrals_on", icon: UserPlus,     label_es: "Programa de referidos",     label_en: "Referral program",       hint_es: "Genera tu link y gana créditos por cada amigo que verificas.", hint_en: "Get your link & earn credits when friends join + verify." },
  ];

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6" data-testid="provider-preferences-panel">
      <h2 className="font-display font-bold text-[#03045E] text-xl sm:text-2xl mb-1">
        {lang === "en" ? "Preferences" : "Preferencias"}
      </h2>
      <p className="text-slate-500 text-sm mb-5">
        {lang === "en"
          ? "Control who can reach you and how your eCard appears around the platform."
          : "Controla quién puede contactarte y cómo aparece tu eCard en la plataforma."}
      </p>
      <ul className="space-y-2">
        {rows.map(row => (
          <PreferenceRow
            key={row.key}
            row={row}
            value={prefs[row.key]}
            saving={savingKey === row.key}
            lang={lang}
            onToggle={() => toggle(row.key)}
          />
        ))}
      </ul>
    </div>
  );
}

function PreferenceRow({ row, value, saving, lang, onToggle }) {
  const { icon: Icon, key } = row;
  return (
    <li
      className="flex items-start gap-3 p-3 rounded-2xl hover:bg-[#F0F9FF] transition"
      data-testid={`preference-row-${key}`}
    >
      <div className="w-10 h-10 rounded-xl bg-[#CAF0F8] flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[#0077B6]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#03045E] font-semibold text-sm">{lang === "en" ? row.label_en : row.label_es}</p>
        <p className="text-slate-500 text-xs mt-0.5 leading-snug">{lang === "en" ? row.hint_en : row.hint_es}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={value}
        disabled={saving}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
          value ? "bg-[#0077B6]" : "bg-slate-300"
        } ${saving ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
        data-testid={`preference-toggle-${key}`}
        data-checked={value ? "true" : "false"}
      >
        <span
          className={`inline-block w-5 h-5 mt-1 rounded-full bg-white shadow transform transition-transform ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </li>
  );
}
