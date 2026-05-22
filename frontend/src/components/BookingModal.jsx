import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { Calendar, Clock, X, ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * BookingModal — Calendly-style weekly booking flow.
 * Step 1: pick a day (7-day strip, paginated by week within advance_days horizon).
 * Step 2: pick an available time slot (fetched from /providers/:id/slots).
 * Step 3: fill name / phone / description and submit POST /appointments.
 *
 * Works for both logged-in and anonymous clients (server accepts both).
 */
export default function BookingModal({ provider, open, onClose, onBooked }) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const [step, setStep] = useState(1);
  const [weekOffset, setWeekOffset] = useState(0);
  const [pickedDate, setPickedDate] = useState(null);
  const [pickedTime, setPickedTime] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    client_name: "", client_phone: "", client_email: "", service_description: "",
  });

  useEffect(() => {
    if (!open) return;
    setStep(1); setWeekOffset(0); setPickedDate(null); setPickedTime(null); setSlots([]);
    setForm({
      client_name: user?.name || "",
      client_phone: user?.phone || "",
      client_email: user?.email || "",
      service_description: "",
    });
  }, [open, user]);

  const T = useMemo(() => lang === "en" ? {
    title: "Book an appointment with",
    step1: "Pick a date",
    step2: "Pick a time",
    step3: "Your information",
    today: "Today", tomorrow: "Tomorrow",
    noSlots: "No availability for this day. Pick another one.",
    name: "Full name *", phone: "Phone *", email: "Email (optional)",
    desc: "Service description (what you need)",
    confirm: "Confirm appointment",
    back: "Back",
    success: "Booking sent. The provider will confirm shortly.",
    closed: "This provider has not activated their calendar yet.",
    weekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    summary: "Booking summary",
  } : {
    title: "Reservar cita con",
    step1: "Elige una fecha",
    step2: "Elige un horario",
    step3: "Tus datos",
    today: "Hoy", tomorrow: "Mañana",
    noSlots: "No hay disponibilidad ese día. Elige otro.",
    name: "Nombre completo *", phone: "Teléfono *", email: "Email (opcional)",
    desc: "Descripción del servicio (qué necesitas)",
    confirm: "Confirmar cita",
    back: "Volver",
    success: "¡Solicitud enviada! El proveedor confirmará pronto.",
    closed: "Este proveedor todavía no activó su calendario.",
    weekdays: ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"],
    summary: "Resumen de la cita",
  }, [lang]);

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const weekDays = useMemo(() => {
    const start = new Date(today);
    start.setDate(today.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
  }, [today, weekOffset]);

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dayLabel = (d) => {
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return T.today;
    if (diff === 1) return T.tomorrow;
    return T.weekdays[(d.getDay() + 6) % 7];
  };

  const pickDate = async (d) => {
    setPickedDate(d);
    setLoadingSlots(true);
    setSlots([]);
    try {
      const { data } = await api.get(`/providers/${provider.provider_id}/slots`, { params: { date: iso(d) } });
      if (!data.calendar_active) {
        toast.error(T.closed);
        setLoadingSlots(false);
        return;
      }
      setSlots(data.slots || []);
      setStep(2);
    } catch (e) {
      toast.error("Error");
    } finally {
      setLoadingSlots(false);
    }
  };

  const submit = async () => {
    if (!form.client_name.trim() || form.client_name.trim().length < 2) { toast.error("Nombre requerido"); return; }
    if (!form.client_phone.trim() || form.client_phone.trim().length < 7) { toast.error("Teléfono requerido"); return; }
    if (!form.service_description.trim() || form.service_description.trim().length < 4) { toast.error("Describe brevemente el servicio"); return; }
    setSubmitting(true);
    try {
      await api.post("/appointments", {
        provider_id: provider.provider_id,
        date: iso(pickedDate),
        time: pickedTime,
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim(),
        client_email: form.client_email.trim() || null,
        service_description: form.service_description.trim(),
      });
      toast.success(T.success);
      onBooked && onBooked();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" data-testid="booking-modal">
      <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">{T.title}</div>
            <div className="font-display font-semibold text-slate-900 truncate">{provider?.business_name}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full" data-testid="booking-close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 py-3">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${s === step ? "w-8 bg-teal-600" : s < step ? "w-4 bg-teal-300" : "w-4 bg-slate-200"}`} />
          ))}
        </div>

        {/* Step 1: date strip */}
        {step === 1 && (
          <div className="p-5">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-teal-700" />{T.step1}</h3>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0} className="p-2 disabled:opacity-30" data-testid="booking-prev-week">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-500">
                {weekDays[0].toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" })} –{" "}
                {weekDays[6].toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" })}
              </span>
              <button onClick={() => setWeekOffset(weekOffset + 1)} className="p-2" data-testid="booking-next-week">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map(d => {
                const past = d < today;
                return (
                  <button
                    key={iso(d)}
                    disabled={past}
                    onClick={() => pickDate(d)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition ${past ? "opacity-30 cursor-not-allowed border-slate-100" : "border-slate-200 hover:border-teal-500 hover:bg-teal-50"}`}
                    data-testid={`booking-day-${iso(d)}`}
                  >
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">{dayLabel(d)}</span>
                    <span className="font-display font-bold text-slate-900">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            {loadingSlots && <div className="text-center mt-4 text-slate-500 text-sm"><Loader2 className="w-4 h-4 inline animate-spin mr-1" />Cargando...</div>}
          </div>
        )}

        {/* Step 2: time slots */}
        {step === 2 && pickedDate && (
          <div className="p-5">
            <button onClick={() => setStep(1)} className="text-xs text-slate-500 mb-2 inline-flex items-center gap-1" data-testid="booking-back-to-date">
              <ChevronLeft className="w-3 h-3" /> {T.back}
            </button>
            <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2"><Clock className="w-4 h-4 text-teal-700" />{T.step2}</h3>
            <p className="text-xs text-slate-500 mb-3">
              {pickedDate.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            {slots.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 text-center text-slate-500 text-sm">{T.noSlots}</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map(s => (
                  <button
                    key={s}
                    onClick={() => { setPickedTime(s); setStep(3); }}
                    className="py-2.5 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50 text-sm font-medium text-slate-900"
                    data-testid={`booking-slot-${s}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: form */}
        {step === 3 && pickedDate && pickedTime && (
          <div className="p-5">
            <button onClick={() => setStep(2)} className="text-xs text-slate-500 mb-2 inline-flex items-center gap-1" data-testid="booking-back-to-slot">
              <ChevronLeft className="w-3 h-3" /> {T.back}
            </button>
            <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 mb-4">
              <div className="text-[10px] uppercase tracking-wide text-teal-700 font-semibold">{T.summary}</div>
              <div className="font-display font-semibold text-slate-900 text-sm mt-1">
                {pickedDate.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric" })} · {pickedTime}
              </div>
            </div>
            <h3 className="font-semibold text-slate-900 mb-3">{T.step3}</h3>
            <div className="space-y-3">
              <input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} placeholder={T.name}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-sm"
                data-testid="booking-form-name" />
              <input value={form.client_phone} onChange={e => setForm({ ...form, client_phone: e.target.value })} placeholder={T.phone}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-sm"
                data-testid="booking-form-phone" />
              <input value={form.client_email} onChange={e => setForm({ ...form, client_email: e.target.value })} placeholder={T.email}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-sm"
                data-testid="booking-form-email" />
              <textarea value={form.service_description} onChange={e => setForm({ ...form, service_description: e.target.value })} placeholder={T.desc} rows={3}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-sm"
                data-testid="booking-form-desc" />
              <button onClick={submit} disabled={submitting}
                className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
                data-testid="booking-submit">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {T.confirm}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
