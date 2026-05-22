import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Award, Info } from "lucide-react";
import { toast } from "sonner";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri",
  "Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina",
  "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

/**
 * LicenseSection — Section 15. Optional, self-declared license info with disclaimer.
 * getamano NEVER verifies licenses. Only last 4 digits shown publicly.
 */
export default function LicenseSection({ profile, setProfile }) {
  const initial = profile?.license || {};
  const [types, setTypes] = useState([]);
  const [hasLicense, setHasLicense] = useState(initial.has_license || "prefer_not_to_say");
  const [type, setType] = useState(initial.license_type || "");
  const [number, setNumber] = useState(initial.license_number || "");
  const [stateName, setStateName] = useState(initial.license_state || "");
  const [expiresYear, setExpiresYear] = useState(initial.license_expires_year || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/license/types").then(r => setTypes(r.data)).catch(e => console.error(e)); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        has_license: hasLicense,
        license_type: hasLicense === "yes" ? (type || null) : null,
        license_number: hasLicense === "yes" ? (number || null) : null,
        license_state: hasLicense === "yes" ? (stateName || null) : null,
        license_expires_year: hasLicense === "yes" && expiresYear ? parseInt(expiresYear, 10) : null,
      };
      const { data } = await api.put("/providers/me/license", payload);
      setProfile?.(p => ({ ...p, license: data.license }));
      toast.success("Información de licencia guardada");
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Error al guardar");
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border bg-white p-5" style={{ borderColor: "#BCC5CC" }} data-testid="license-section">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#EBF8F7" }}>
          <Award className="w-5 h-5" style={{ color: "#025F67" }} />
        </div>
        <div>
          <h3 className="font-display font-semibold text-base" style={{ color: "#025F67" }}>🪪 Licencia de oficio (opcional)</h3>
          <p className="text-xs text-slate-500 mt-0.5">Información autodeclarada. getamano no verifica licencias.</p>
        </div>
      </div>

      <fieldset className="space-y-2 mb-4">
        <legend className="text-sm font-medium text-slate-700 mb-1">¿Tienes licencia para ejercer tu oficio?</legend>
        {[
          { v: "yes", lbl: "Sí, tengo licencia" },
          { v: "no", lbl: "No tengo licencia" },
          { v: "prefer_not_to_say", lbl: "Prefiero no indicarlo" },
        ].map(o => (
          <label key={o.v} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="hasLicense" value={o.v} checked={hasLicense === o.v} onChange={() => setHasLicense(o.v)} data-testid={`license-radio-${o.v}`} />
            <span className="text-sm text-slate-700">{o.lbl}</span>
          </label>
        ))}
      </fieldset>

      {hasLicense === "yes" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="license-fields">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo de licencia</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "#BCC5CC" }} data-testid="license-type-select">
              <option value="">Selecciona...</option>
              {types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Número de licencia</label>
            <input value={number} onChange={e => setNumber(e.target.value)} placeholder="Solo se mostrarán los últimos 4 dígitos" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "#BCC5CC" }} data-testid="license-number-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Estado que la emitió</label>
            <select value={stateName} onChange={e => setStateName(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "#BCC5CC" }} data-testid="license-state-select">
              <option value="">Selecciona...</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Año de vencimiento (opcional)</label>
            <input type="number" min="2025" max="2050" value={expiresYear} onChange={e => setExpiresYear(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: "#BCC5CC" }} data-testid="license-expires-input" />
          </div>
        </div>
      )}

      <button onClick={save} disabled={saving} className="btn-primary mt-4 inline-flex items-center gap-1 disabled:opacity-60" data-testid="license-save-btn">
        {saving ? "Guardando..." : "Guardar información de licencia"}
      </button>

      <div className="mt-4 p-3 rounded-lg flex items-start gap-2" style={{ backgroundColor: "#F7F6F2" }}>
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#475569" }} />
        <p className="text-xs text-slate-600 leading-relaxed">
          La información de licencia es <strong>autodeclarada</strong>. getamano no verifica licencias profesionales. Por favor verifica directamente con la agencia estatal correspondiente.
        </p>
      </div>
    </div>
  );
}

/**
 * LicenseBadge — Public badge to render on ProviderECard. Shows masked last-4
 * with a "no verified" disclaimer underneath. Returns null if no license data.
 */
export function LicenseBadge({ license }) {
  if (!license || license.has_license !== "yes" || !license.license_type) return null;
  const masked = (license.license_number || "").slice(-4) || "";
  return (
    <div className="rounded-xl p-3 border" style={{ borderColor: "#A6E1DA", backgroundColor: "#F0FAF9" }} data-testid="ecard-license">
      <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "#025F67" }}>
        <Award className="w-4 h-4" /> Licencia de oficio
      </div>
      <p className="text-sm text-slate-700 mt-1">
        {license.license_type}
        {license.license_state ? ` · ${license.license_state}` : ""}
        {masked ? ` · Lic. ****${masked}` : ""}
        {license.license_expires_year ? ` · Vence ${license.license_expires_year}` : ""}
      </p>
      <p className="text-[11px] text-slate-500 mt-1.5 italic">
        Información autodeclarada por el proveedor. getamano no verifica licencias. Verifica con la agencia estatal correspondiente.
      </p>
    </div>
  );
}
