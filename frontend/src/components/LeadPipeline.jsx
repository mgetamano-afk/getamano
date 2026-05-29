import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Inbox, Phone, FileText, CheckCircle2, XCircle, Loader2, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * LeadPipeline — Section 89 v4 Phase G.
 *
 * Kanban-style provider lead view. Reads `/api/leads/pipeline` and lets
 * the provider drag (or pick from a dropdown) a lead between the five
 * pipeline statuses: new → contacted → quoted → won/lost.
 *
 * MVP: dropdown-based status change (drag-and-drop deferred). The
 * counts at the top double as a quick performance read-out
 * (e.g. "12 nuevos, 4 ganados esta semana").
 */

const STATUS_ORDER = ["new", "contacted", "quoted", "won", "lost"];

const STATUS_META = {
  new:       { icon: Inbox,        color: "from-amber-400 to-orange-500",  label_es: "Nuevos",     label_en: "New" },
  contacted: { icon: Phone,        color: "from-sky-400 to-blue-500",      label_es: "Contactados", label_en: "Contacted" },
  quoted:    { icon: FileText,     color: "from-indigo-400 to-violet-500", label_es: "Cotizados",  label_en: "Quoted" },
  won:       { icon: CheckCircle2, color: "from-emerald-400 to-teal-500",  label_es: "Ganados",    label_en: "Won" },
  lost:      { icon: XCircle,      color: "from-slate-400 to-slate-500",   label_es: "Perdidos",   label_en: "Lost" },
};

function relTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "ahora";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  try { return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }); }
  catch { return ""; }
}

export default function LeadPipeline() {
  const { lang } = useI18n();
  const [data, setData] = useState({ counts: {}, buckets: {}, total: 0 });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState({}); // { request_id: true }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/leads/pipeline");
      setData(r.data || { counts: {}, buckets: {}, total: 0 });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (requestId, status) => {
    setPending(p => ({ ...p, [requestId]: true }));
    try {
      await api.put(`/service-requests/${requestId}/status`, { status });
      toast.success(lang === "en" ? "Status updated" : "Estado actualizado");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setPending(p => { const n = { ...p }; delete n[requestId]; return n; });
    }
  };

  const counts = data.counts || {};
  const conversion = useMemo(() => {
    const won = counts.won || 0;
    const total = (counts.new || 0) + (counts.contacted || 0) + (counts.quoted || 0) + won + (counts.lost || 0);
    return total > 0 ? Math.round((won / total) * 100) : 0;
  }, [counts]);

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center text-slate-500" data-testid="leads-loading">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div data-testid="lead-pipeline" className="space-y-5">
      {/* Header + summary */}
      <header>
        <h3 className="font-display font-semibold text-lg text-slate-900">
          {lang === "en" ? "Lead pipeline" : "Pipeline de leads"}
        </h3>
        <p className="text-sm text-slate-500">
          {data.total} {lang === "en" ? "leads · conversion" : "leads · conversión"} {conversion}%
        </p>
      </header>

      {/* Counts strip */}
      <div className="grid grid-cols-5 gap-2" data-testid="leads-counts">
        {STATUS_ORDER.map(s => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <div
              key={s}
              className={`rounded-2xl p-3 text-white bg-gradient-to-br ${meta.color} shadow-sm`}
              data-testid={`leads-count-${s}`}
            >
              <Icon className="w-4 h-4 mb-1 opacity-80" />
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">
                {lang === "en" ? meta.label_en : meta.label_es}
              </p>
              <p className="text-2xl font-display font-bold mt-0.5">{counts[s] || 0}</p>
            </div>
          );
        })}
      </div>

      {/* Kanban columns (horizontal scroll on mobile) */}
      {data.total === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500" data-testid="leads-empty">
          <Inbox className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p>{lang === "en" ? "No leads yet." : "Aún no recibes leads."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3" data-testid="leads-board">
          {STATUS_ORDER.map(s => (
            <Column
              key={s}
              status={s}
              items={data.buckets?.[s] || []}
              onChangeStatus={changeStatus}
              pending={pending}
              lang={lang}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        <Link to="/requests" className="hover:underline">
          {lang === "en" ? "Open full inbox →" : "Ver bandeja completa →"}
        </Link>
      </p>
    </div>
  );
}

function Column({ status, items, onChangeStatus, pending, lang }) {
  const meta = STATUS_META[status];
  return (
    <section className="rounded-2xl bg-slate-50 border border-slate-200 p-2.5" data-testid={`leads-column-${status}`}>
      <header className="flex items-center justify-between mb-2 px-1.5">
        <p className="text-[11px] uppercase tracking-widest font-bold text-slate-600">
          {lang === "en" ? meta.label_en : meta.label_es}
        </p>
        <span className="text-[11px] font-bold text-slate-400">{items.length}</span>
      </header>
      <div className="space-y-2 max-h-[480px] overflow-y-auto pr-0.5">
        {items.length === 0 && (
          <p className="text-xs text-slate-400 italic px-1 py-2">
            {lang === "en" ? "Empty" : "Vacío"}
          </p>
        )}
        {items.map((it) => (
          <LeadCard
            key={it.request_id}
            it={it}
            currentStatus={status}
            onChangeStatus={onChangeStatus}
            disabled={!!pending[it.request_id]}
            lang={lang}
          />
        ))}
      </div>
    </section>
  );
}

function LeadCard({ it, currentStatus, onChangeStatus, disabled, lang }) {
  return (
    <article
      className="rounded-xl bg-white border border-slate-200 hover:border-[#0077B6] hover:shadow-sm transition p-2.5"
      data-testid={`lead-card-${it.request_id}`}
    >
      <header className="flex items-start justify-between gap-1.5 mb-1">
        <p className="font-semibold text-[13px] text-[#03045E] truncate">{it.client_name || "—"}</p>
        <span className="text-[10px] text-slate-400 whitespace-nowrap">{relTime(it.created_at)}</span>
      </header>
      <p className="text-[12px] text-slate-600 line-clamp-2 leading-snug" data-testid={`lead-message-${it.request_id}`}>
        {it.message}
      </p>
      {it.service_type && (
        <p className="text-[10px] text-slate-400 mt-1.5 uppercase tracking-wider">{it.service_type}</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-1.5">
        <select
          value={currentStatus}
          onChange={(e) => onChangeStatus(it.request_id, e.target.value)}
          disabled={disabled}
          className="text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 outline-none focus:border-[#0077B6] disabled:opacity-50"
          data-testid={`lead-status-${it.request_id}`}
        >
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>
              {lang === "en" ? STATUS_META[s].label_en : STATUS_META[s].label_es}
            </option>
          ))}
        </select>
        {it.client_phone && (
          <a
            href={`tel:${it.client_phone}`}
            className="text-[11px] font-semibold text-[#0077B6] inline-flex items-center gap-0.5 hover:underline"
            data-testid={`lead-call-${it.request_id}`}
          >
            <Phone className="w-2.5 h-2.5" /> {lang === "en" ? "Call" : "Llamar"} <ChevronRight className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </article>
  );
}
