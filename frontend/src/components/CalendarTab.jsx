import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { Calendar, Clock, Plus, X, CheckCircle2, AlertCircle, Phone, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";

const DAYS = [
  { k: "mon", es: "Lunes", en: "Monday" },
  { k: "tue", es: "Martes", en: "Tuesday" },
  { k: "wed", es: "Miércoles", en: "Wednesday" },
  { k: "thu", es: "Jueves", en: "Thursday" },
  { k: "fri", es: "Viernes", en: "Friday" },
  { k: "sat", es: "Sábado", en: "Saturday" },
  { k: "sun", es: "Domingo", en: "Sunday" },
];

const STATUS_LABELS = {
  pending:    { es: "Pendiente",  en: "Pending",   bg: "#FEF3C7", fg: "#92400E" },
  confirmed:  { es: "Confirmada", en: "Confirmed", bg: "#D1FAE5", fg: "#065F46" },
  declined:   { es: "Rechazada",  en: "Declined",  bg: "#FEE2E2", fg: "#991B1B" },
  completed:  { es: "Completada", en: "Completed", bg: "#E0E7FF", fg: "#3730A3" },
  no_show:    { es: "No asistió", en: "No-show",   bg: "#FEE2E2", fg: "#7F1D1D" },
  cancelled:  { es: "Cancelada",  en: "Cancelled", bg: "#F3F4F6", fg: "#374151" },
};

/**
 * CalendarTab — Provider Dashboard "Citas" tab.
 * Two sections: (1) Availability editor — weekly slots + duration/buffer; (2) Appointments list with confirm/decline.
 */
export default function CalendarTab() {
  const { lang } = useI18n();
  const [avail, setAvail] = useState(null);
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.get("/providers/me/availability"),
        api.get("/providers/me/appointments", { params: { status: "all" } }),
      ]);
      setAvail(a.data);
      setAppts(b.data.items || []);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/providers/me/availability", avail);
      toast.success(lang === "en" ? "Availability saved" : "Disponibilidad guardada");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
    finally { setSaving(false); }
  };

  const addBlock = (dayKey) => {
    setAvail(a => ({
      ...a,
      weekly: { ...a.weekly, [dayKey]: [...(a.weekly?.[dayKey] || []), { start: "09:00", end: "17:00" }] }
    }));
  };
  const removeBlock = (dayKey, idx) => {
    setAvail(a => ({
      ...a,
      weekly: { ...a.weekly, [dayKey]: a.weekly[dayKey].filter((_, i) => i !== idx) }
    }));
  };
  const updateBlock = (dayKey, idx, field, val) => {
    setAvail(a => ({
      ...a,
      weekly: { ...a.weekly, [dayKey]: a.weekly[dayKey].map((b, i) => i === idx ? { ...b, [field]: val } : b) }
    }));
  };

  const action = async (apt, kind) => {
    try {
      await api.put(`/appointments/${apt.appointment_id}`, { action: kind });
      toast.success(lang === "en" ? "Updated" : "Actualizada");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  if (loading || !avail) return <div className="py-10 text-center text-slate-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>;

  const upcoming = appts.filter(a => ["pending", "confirmed"].includes(a.status));
  const past = appts.filter(a => !["pending", "confirmed"].includes(a.status));

  return (
    <div data-testid="dashboard-calendar">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-600" />
            {lang === "en" ? "Calendar & Appointments" : "Calendario y citas"}
          </h3>
          <p className="text-sm text-slate-500">
            {upcoming.length} {lang === "en" ? "upcoming" : "próximas"} · {past.length} {lang === "en" ? "past" : "pasadas"}
          </p>
        </div>
        <button
          onClick={() => setAvail({ ...avail, is_active: !avail.is_active })}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${avail.is_active ? "bg-green-50 text-green-700 border border-green-200" : "bg-slate-100 text-slate-500"}`}
          data-testid="calendar-toggle-active"
        >
          {avail.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {avail.is_active
            ? (lang === "en" ? "Bookings ON" : "Reservas activas")
            : (lang === "en" ? "Bookings OFF" : "Reservas desactivadas")}
        </button>
      </div>

      {/* Appointments list FIRST so providers see incoming bookings */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <h4 className="font-semibold text-slate-900 mb-3">
          {lang === "en" ? "Incoming requests" : "Solicitudes entrantes"}
        </h4>
        {upcoming.length === 0 ? (
          <div className="p-6 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 text-center text-slate-500 text-sm" data-testid="calendar-empty-appts">
            {lang === "en" ? "No bookings yet. Activate your calendar so clients can request appointments." : "Aún no recibes reservas. Activa tu calendario para que los clientes puedan agendar."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcoming.map(a => {
              const st = STATUS_LABELS[a.status] || STATUS_LABELS.pending;
              return (
                <div key={a.appointment_id} className="py-3 flex flex-col sm:flex-row gap-3 sm:items-center" data-testid={`appt-${a.appointment_id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm">{a.date} · {a.time}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: st.bg, color: st.fg }}>
                        {st[lang] || st.es}
                      </span>
                    </div>
                    <div className="text-sm text-slate-700 mt-1">{a.client_name} — <a href={`tel:${a.client_phone}`} className="text-teal-700 hover:underline inline-flex items-center gap-1"><Phone className="w-3 h-3" />{a.client_phone}</a></div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.service_description}</div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {a.status === "pending" && (
                      <>
                        <button onClick={() => action(a, "confirm")} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 inline-flex items-center gap-1" data-testid={`appt-confirm-${a.appointment_id}`}>
                          <CheckCircle2 className="w-3 h-3" />{lang === "en" ? "Confirm" : "Confirmar"}
                        </button>
                        <button onClick={() => action(a, "decline")} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 inline-flex items-center gap-1" data-testid={`appt-decline-${a.appointment_id}`}>
                          <X className="w-3 h-3" />{lang === "en" ? "Decline" : "Rechazar"}
                        </button>
                      </>
                    )}
                    {a.status === "confirmed" && (
                      <>
                        <button onClick={() => action(a, "complete")} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700" data-testid={`appt-complete-${a.appointment_id}`}>
                          {lang === "en" ? "Mark completed" : "Marcar completada"}
                        </button>
                        <button onClick={() => action(a, "no_show")} className="px-3 py-1.5 rounded-lg bg-white border border-orange-200 text-orange-700 text-xs font-medium hover:bg-orange-50">
                          {lang === "en" ? "No-show" : "No asistió"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Availability editor */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-2"><Clock className="w-4 h-4 text-teal-600" />
          {lang === "en" ? "Weekly availability" : "Disponibilidad semanal"}
        </h4>
        <p className="text-xs text-slate-500 mb-4">
          {lang === "en"
            ? "Define when clients can request appointments. Multiple time blocks per day are supported."
            : "Define cuándo los clientes pueden solicitar citas. Puedes agregar varios bloques por día."}
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{lang === "en" ? "Slot duration (min)" : "Duración del slot (min)"}</label>
            <select value={avail.slot_duration_min} onChange={e => setAvail({ ...avail, slot_duration_min: parseInt(e.target.value, 10) })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm" data-testid="calendar-slot-duration">
              {[15, 30, 45, 60, 90, 120, 180].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{lang === "en" ? "Buffer between (min)" : "Buffer entre citas (min)"}</label>
            <select value={avail.buffer_min} onChange={e => setAvail({ ...avail, buffer_min: parseInt(e.target.value, 10) })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm" data-testid="calendar-buffer">
              {[0, 5, 10, 15, 20, 30, 45, 60].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{lang === "en" ? "Advance days" : "Días de anticipación"}</label>
            <select value={avail.advance_days} onChange={e => setAvail({ ...avail, advance_days: parseInt(e.target.value, 10) })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm" data-testid="calendar-advance-days">
              {[7, 14, 21, 30, 45, 60, 90].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {DAYS.map(d => {
            const blocks = avail.weekly?.[d.k] || [];
            return (
              <div key={d.k} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <div className="w-24 flex-shrink-0 pt-2">
                  <div className="font-semibold text-sm text-slate-900">{d[lang] || d.es}</div>
                  <div className="text-[10px] text-slate-500">{blocks.length} {lang === "en" ? "blocks" : "bloques"}</div>
                </div>
                <div className="flex-1 space-y-2">
                  {blocks.length === 0 && <div className="text-xs text-slate-400 italic pt-2">{lang === "en" ? "Closed" : "Cerrado"}</div>}
                  {blocks.map((b, i) => (
                    <div key={`${d.k}-${i}`} className="flex items-center gap-2" data-testid={`block-${d.k}-${i}`}>
                      <input type="time" value={b.start} onChange={e => updateBlock(d.k, i, "start", e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-sm" />
                      <span className="text-slate-400 text-xs">–</span>
                      <input type="time" value={b.end} onChange={e => updateBlock(d.k, i, "end", e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-sm" />
                      <button onClick={() => removeBlock(d.k, i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" data-testid={`block-remove-${d.k}-${i}`}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addBlock(d.k)} className="text-xs text-teal-700 font-medium hover:text-teal-800 inline-flex items-center gap-1" data-testid={`block-add-${d.k}`}>
                    <Plus className="w-3 h-3" /> {lang === "en" ? "Add block" : "Agregar bloque"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 inline-flex items-center gap-2" data-testid="calendar-save">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {lang === "en" ? "Save availability" : "Guardar disponibilidad"}
          </button>
        </div>

        {!avail.is_active && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {lang === "en"
              ? "Bookings are OFF. Activate the toggle above to let clients request appointments."
              : "Las reservas están desactivadas. Activa el toggle de arriba para que los clientes puedan agendar."}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-6">
          <h4 className="font-semibold text-slate-900 mb-3">
            {lang === "en" ? "Past appointments" : "Citas anteriores"}
          </h4>
          <div className="divide-y divide-slate-100">
            {past.slice(0, 20).map(a => {
              const st = STATUS_LABELS[a.status] || STATUS_LABELS.cancelled;
              return (
                <div key={a.appointment_id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <span className="text-slate-700">{a.date} · {a.time}</span>
                    <span className="text-slate-500 ml-2">{a.client_name}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: st.bg, color: st.fg }}>{st[lang] || st.es}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
