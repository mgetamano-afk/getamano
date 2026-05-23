import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import AdminLayout from "../../components/AdminLayout";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, MessageCircle, Phone, Copy, Check, MapPin,
  Inbox, CheckCircle2, XCircle, Clock, TrendingUp, ChevronDown,
} from "lucide-react";

const STATUS_COLORS = {
  pending:   { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  label: "Pendiente" },
  contacted: { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   label: "Contactado" },
  converted: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Convertido" },
  lost:      { bg: "bg-slate-100",  text: "text-slate-500",  border: "border-slate-200",  label: "Perdido" },
};

const STATUS_NEXT = {
  pending:   ["contacted", "lost"],
  contacted: ["converted", "lost", "pending"],
  converted: ["pending"],
  lost:      ["pending"],
};

const STATUS_ACTION_LABEL = {
  contacted: "Marcar contactado",
  converted: "Convertido",
  lost: "Perdido",
  pending: "Reabrir",
};

/**
 * Admin Leads Inbox — captures from /api/leads/capture.
 *
 * Each row has two CTAs:
 *  - "SMS" → opens `sms:+1...?body=...` native iOS/Android Messages app
 *  - "WhatsApp" → opens https://wa.me/+1...?text=... in a new tab
 *
 * Clicking either CTA also auto-PATCHes the lead to status='contacted' so the
 * CEO doesn't have to do it manually. Status can be advanced from there.
 */
export default function AdminLeadsInbox() {
  const [leads, setLeads] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, contacted: 0, converted: 0, lost: 0, total: 0 });
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const params = filterStatus === "all" ? {} : { status: filterStatus };
      const r = await api.get("/admin/leads", { params });
      setLeads(r.data.items || []);
      setCounts(r.data.counts || {});
    } catch (e) {
      console.error(e);
      toast.error("Error cargando leads");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterStatus]);

  const updateLead = async (leadId, payload, optimisticUpdate) => {
    setLeads((prev) => prev.map((l) => (l.lead_id === leadId ? { ...l, ...optimisticUpdate } : l)));
    try {
      const r = await api.patch(`/admin/leads/${leadId}`, payload);
      setLeads((prev) => prev.map((l) => (l.lead_id === leadId ? r.data : l)));
      // Refresh counts
      load();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar el lead");
      load();
    }
  };

  const onContactClick = (lead, channel) => {
    const link = channel === "sms" ? lead.sms_link : lead.wa_link;
    // Mark as contacted (idempotent — backend sets contacted_at first time)
    if (lead.status === "pending") {
      updateLead(lead.lead_id, { status: "contacted" }, { status: "contacted" });
    }
    if (channel === "sms") {
      // sms: deep links open in the same tab on mobile so the SMS app launches reliably
      window.location.href = link;
    } else {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <AdminLayout active="leads">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Inbox className="w-6 h-6 text-teal-600" />
              Leads Inbox
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Captura del exit-intent — contacta por SMS o WhatsApp con 1 clic.
            </p>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            data-testid="leads-refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refrescar
          </button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="leads-counts">
          <KpiCard label="Total" value={counts.total} icon={<Inbox className="w-4 h-4" />} />
          <KpiCard label="Pendientes" value={counts.pending} icon={<Clock className="w-4 h-4 text-amber-600" />} highlight />
          <KpiCard label="Contactados" value={counts.contacted} icon={<MessageCircle className="w-4 h-4 text-blue-600" />} />
          <KpiCard label="Convertidos" value={counts.converted} icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} accent="emerald" />
          <KpiCard label="Perdidos" value={counts.lost} icon={<XCircle className="w-4 h-4 text-slate-400" />} />
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2" data-testid="leads-status-filter">
          {["all", "pending", "contacted", "converted", "lost"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              data-testid={`leads-filter-${s}`}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                filterStatus === s
                  ? "bg-teal-600 border-teal-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {s === "all" ? `Todos (${counts.total})` : `${STATUS_COLORS[s]?.label || s} (${counts[s] || 0})`}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <Loader2 className="w-6 h-6 mx-auto animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <EmptyState filter={filterStatus} />
        ) : (
          <div className="space-y-3" data-testid="leads-list">
            {leads.map((lead) => (
              <LeadRow
                key={lead.lead_id}
                lead={lead}
                onContactClick={onContactClick}
                onStatusChange={(newStatus) => updateLead(lead.lead_id, { status: newStatus }, { status: newStatus })}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function KpiCard({ label, value, icon, highlight, accent }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent === "emerald"
          ? "bg-emerald-50 border-emerald-200"
          : highlight
          ? "bg-amber-50 border-amber-200"
          : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value || 0}</div>
    </div>
  );
}

function LeadRow({ lead, onContactClick, onStatusChange }) {
  const [copied, setCopied] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const statusInfo = STATUS_COLORS[lead.status] || STATUS_COLORS.pending;
  const ageHours = lead.created_at
    ? Math.max(0, Math.round((Date.now() - new Date(lead.created_at).getTime()) / 3_600_000))
    : 0;
  const ageLabel = ageHours < 1 ? "ahora" : ageHours < 24 ? `hace ${ageHours}h` : `hace ${Math.round(ageHours / 24)}d`;

  const copyMessage = () => {
    navigator.clipboard.writeText(lead.message_body || "");
    setCopied(true);
    toast.success("Mensaje copiado");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-teal-300 transition"
      data-testid={`lead-row-${lead.lead_id}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Identity */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900">{lead.name}</span>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
              data-testid={`lead-status-${lead.lead_id}`}
            >
              {statusInfo.label}
            </span>
            <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
              {lead.lang}
            </span>
            <span className="text-[11px] text-slate-400">· {ageLabel}</span>
          </div>
          <div className="text-sm text-slate-600 mt-1 flex items-center gap-3 flex-wrap">
            <span className="font-mono text-slate-700">{lead.phone_display || lead.phone}</span>
            {lead.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {lead.city}{lead.state ? `, ${lead.state}` : ""}
              </span>
            )}
            {lead.service && <span className="text-teal-700 font-medium break-all">· {lead.service}</span>}
          </div>
        </div>
      </div>

      {/* Pre-filled message preview */}
      <div className="mt-3 bg-slate-50 rounded-xl p-3 text-sm text-slate-700 leading-snug border border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <p className="flex-1">{lead.message_body}</p>
          <button
            type="button"
            onClick={copyMessage}
            aria-label="Copiar mensaje"
            className="flex-shrink-0 text-slate-400 hover:text-teal-700"
            data-testid={`lead-copy-${lead.lead_id}`}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => onContactClick(lead, "whatsapp")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
          data-testid={`lead-wa-btn-${lead.lead_id}`}
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
          {lead.preferred_channel === "whatsapp" && (
            <span className="text-[10px] bg-white/20 rounded-full px-1.5 py-0.5">preferido</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onContactClick(lead, "sms")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition"
          data-testid={`lead-sms-btn-${lead.lead_id}`}
        >
          <Phone className="w-4 h-4" />
          SMS
          {lead.preferred_channel === "sms" && (
            <span className="text-[10px] bg-white/20 rounded-full px-1.5 py-0.5">preferido</span>
          )}
        </button>

        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setShowStatus((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50"
            data-testid={`lead-status-toggle-${lead.lead_id}`}
          >
            <TrendingUp className="w-4 h-4" />
            Estado
            <ChevronDown className="w-3 h-3" />
          </button>
          {showStatus && (
            <div className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-10 min-w-[180px]">
              {(STATUS_NEXT[lead.status] || []).map((next) => (
                <button
                  key={next}
                  onClick={() => { onStatusChange(next); setShowStatus(false); }}
                  className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50"
                  data-testid={`lead-status-set-${next}-${lead.lead_id}`}
                >
                  {STATUS_ACTION_LABEL[next] || next}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {lead.notes && (
        <div className="mt-3 text-xs text-slate-500 italic">📝 {lead.notes}</div>
      )}
    </div>
  );
}

function EmptyState({ filter }) {
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-16 text-center">
      <Inbox className="w-10 h-10 mx-auto text-slate-300" />
      <p className="text-sm text-slate-500 mt-3">
        {filter === "all"
          ? "Aún no hay leads capturados. El exit-intent del landing los traerá aquí."
          : "No hay leads con este estado."}
      </p>
    </div>
  );
}
