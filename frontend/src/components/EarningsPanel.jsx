import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, Clock, Handshake, CheckCircle, XCircle, Plus, X, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * EarningsPanel — Section 68 (Referral commissions).
 *
 * Provider-only view inside MiRedPage. Shows:
 *  · Hero stat: earned dollars from referral commissions
 *  · 4-card breakdown (as referrer + as receiver)
 *  · Two tabs: Sent referrals · Received referrals
 *  · Inline Accept / Complete / Cancel actions for received items
 *  · "New referral" button → CreateReferralModal (picks an ally + form)
 */
export default function EarningsPanel({ network }) {
  const { lang } = useI18n();
  const [earnings, setEarnings] = useState(null);
  const [tab, setTab] = useState("sent");
  const [sent, setSent] = useState(null);
  const [received, setReceived] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = async () => {
    try {
      const [e, s, r] = await Promise.all([
        api.get("/referrals/earnings/me"),
        api.get("/referrals/jobs/me/sent"),
        api.get("/referrals/jobs/me/received"),
      ]);
      setEarnings(e.data);
      setSent(s.data || []);
      setReceived(r.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { refresh(); }, []);

  const list = tab === "sent" ? sent : received;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" data-testid="earnings-panel">
      {/* Hero stat */}
      <div className="px-5 py-5 border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-bold mb-0.5">
              {lang === "en" ? "Total referral earnings" : "Comisiones ganadas"}
            </div>
            <div className="text-3xl md:text-4xl font-extrabold text-slate-900 font-display leading-none" data-testid="earnings-hero-total">
              ${(earnings?.as_referrer?.earned || 0).toFixed(2)}
            </div>
            <div className="text-[12px] text-slate-500 mt-1">
              {lang === "en"
                ? `${earnings?.commission_pct ?? 5}% commission on every completed referral`
                : `${earnings?.commission_pct ?? 5}% de comisión por cada trabajo referido completado`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 h-10 rounded-full text-white font-bold text-sm shadow-md hover:brightness-110 transition"
            style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
            data-testid="earnings-new-referral-btn"
          >
            <Plus className="w-4 h-4" />
            {lang === "en" ? "New referral" : "Referir trabajo"}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <StatCard icon={CheckCircle} color="#10B981" label={lang === "en" ? "Completed" : "Completados"} value={earnings?.as_referrer?.completed_jobs || 0} testid="earnings-stat-completed" />
          <StatCard icon={Clock} color="#F59E0B" label={lang === "en" ? "Pending" : "Pendientes"} value={earnings?.as_referrer?.pending_jobs || 0} testid="earnings-stat-pending" />
          <StatCard icon={Handshake} color="#0EA5E9" label={lang === "en" ? "Jobs won" : "Trabajos ganados"} value={earnings?.as_receiver?.jobs_won || 0} testid="earnings-stat-jobs-won" />
          <StatCard icon={TrendingUp} color="#8B5CF6" label={lang === "en" ? "Gross revenue" : "Ingresos brutos"} value={`$${(earnings?.as_receiver?.gross_revenue || 0).toFixed(0)}`} testid="earnings-stat-gross" />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 border-b border-slate-100">
        <div className="flex gap-1">
          <TabBtn active={tab === "sent"} onClick={() => setTab("sent")} testid="earnings-tab-sent">
            {lang === "en" ? "Sent" : "Enviados"} <span className="opacity-60">{sent?.length || 0}</span>
          </TabBtn>
          <TabBtn active={tab === "received"} onClick={() => setTab("received")} testid="earnings-tab-received">
            {lang === "en" ? "Received" : "Recibidos"} <span className="opacity-60">{received?.length || 0}</span>
          </TabBtn>
        </div>
      </div>

      {/* List */}
      <ul className="p-3 space-y-2" data-testid={`earnings-list-${tab}`}>
        {list === null ? (
          Array.from({ length: 2 }).map((_, i) => (
            <li key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
          ))
        ) : list.length === 0 ? (
          <li className="py-8 text-center text-sm text-slate-500" data-testid="earnings-empty">
            {tab === "sent"
              ? (lang === "en" ? "You haven't referred anyone yet." : "Aún no has referido ningún trabajo.")
              : (lang === "en" ? "No referrals received yet." : "Aún no te han referido trabajos.")}
          </li>
        ) : (
          list.map(r => (
            <ReferralRow key={r.referral_id} r={r} side={tab} lang={lang} onChanged={refresh} />
          ))
        )}
      </ul>

      {showCreate && (
        <CreateReferralModal
          network={network}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 h-10 -mb-px border-b-2 text-sm font-bold transition ${
        active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
      data-testid={testid}
    >
      {children}
    </button>
  );
}

function StatCard({ icon: Icon, color, label, value, testid }) {
  return (
    <div className="bg-white rounded-xl p-2.5 ring-1 ring-slate-100" data-testid={testid}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] uppercase tracking-wide font-bold text-slate-500">{label}</span>
      </div>
      <div className="text-lg font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

function StatusBadge({ status, lang }) {
  const map = {
    pending:   { bg: "bg-amber-50",   text: "text-amber-700",   label: lang === "en" ? "Pending"   : "Pendiente" },
    accepted:  { bg: "bg-blue-50",    text: "text-blue-700",    label: lang === "en" ? "Accepted"  : "Aceptado" },
    completed: { bg: "bg-emerald-50", text: "text-emerald-700", label: lang === "en" ? "Completed" : "Completado" },
    cancelled: { bg: "bg-slate-100",  text: "text-slate-500",   label: lang === "en" ? "Cancelled" : "Cancelado" },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function ReferralRow({ r, side, lang, onChanged }) {
  const other = side === "sent" ? r.referred : r.referrer;
  const [busy, setBusy] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  const act = async (verb, payload) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/referrals/jobs/${r.referral_id}/${verb}`, payload || {});
      onChanged?.();
    } catch (e) {
      window.alert(e?.response?.data?.detail || "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="bg-slate-50 rounded-2xl p-3.5 ring-1 ring-slate-100" data-testid={`referral-row-${r.referral_id}`}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-slate-200 flex-shrink-0 overflow-hidden">
          {other?.logo_url ? (
            <img src={other.logo_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <span className="w-full h-full flex items-center justify-center font-bold text-slate-600">
              {(other?.business_name || other?.name || "?").trim().charAt(0)}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-slate-900 truncate">
              {side === "sent"
                ? (lang === "en" ? "To: " : "Para: ")
                : (lang === "en" ? "From: " : "De: ")}
              {other?.business_name || other?.name || "—"}
            </span>
            <StatusBadge status={r.status} lang={lang} />
          </div>
          <p className="text-[13px] text-slate-700 mt-0.5 leading-snug">
            <strong>{r.client_name}</strong>
            {r.client_phone && <span className="text-slate-400"> · {r.client_phone}</span>}
          </p>
          <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-2">{r.service_description}</p>

          {r.status === "completed" && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-bold">
              <DollarSign className="w-3.5 h-3.5" />
              {side === "sent"
                ? <>Ganaste <strong>${r.commission_amount?.toFixed(2)}</strong> · trabajo cerrado en ${r.final_amount?.toFixed(2)}</>
                : <>Cerraste en <strong>${r.final_amount?.toFixed(2)}</strong> · debes ${r.commission_amount?.toFixed(2)} a {r.referrer?.business_name}</>}
            </div>
          )}

          {/* Actions for received side */}
          {side === "received" && r.status === "pending" && (
            <div className="mt-2.5 flex gap-2">
              <button onClick={() => act("accept")} disabled={busy} className="px-3 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold disabled:opacity-50" data-testid={`referral-accept-${r.referral_id}`}>
                {lang === "en" ? "Accept" : "Aceptar"}
              </button>
              <button onClick={() => setShowComplete(true)} className="px-3 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-bold" data-testid={`referral-complete-${r.referral_id}`}>
                {lang === "en" ? "Mark completed" : "Marcar completado"}
              </button>
              <button onClick={() => act("cancel")} disabled={busy} className="px-3 h-8 rounded-full text-slate-500 hover:bg-slate-200 text-[12px] font-semibold disabled:opacity-50" data-testid={`referral-cancel-${r.referral_id}`}>
                {lang === "en" ? "Cancel" : "Cancelar"}
              </button>
            </div>
          )}
          {side === "received" && r.status === "accepted" && (
            <div className="mt-2.5 flex gap-2">
              <button onClick={() => setShowComplete(true)} className="px-3 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold" data-testid={`referral-complete-${r.referral_id}`}>
                {lang === "en" ? "Mark completed" : "Marcar completado"}
              </button>
            </div>
          )}
          {side === "sent" && r.status === "pending" && (
            <div className="mt-2.5">
              <button onClick={() => act("cancel")} disabled={busy} className="px-3 h-8 rounded-full text-slate-500 hover:bg-slate-200 text-[12px] font-semibold disabled:opacity-50">
                <XCircle className="w-3.5 h-3.5 inline mr-1" /> {lang === "en" ? "Cancel referral" : "Cancelar referencia"}
              </button>
            </div>
          )}
        </div>
      </div>

      {showComplete && (
        <CompleteModal
          referral={r}
          onClose={() => setShowComplete(false)}
          onDone={() => { setShowComplete(false); onChanged?.(); }}
        />
      )}
    </li>
  );
}

function CompleteModal({ referral, onClose, onDone }) {
  const { lang } = useI18n();
  const [amount, setAmount] = useState(referral.estimated_amount?.toString() || "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const n = Number(amount);
    if (Number.isNaN(n) || n < 0) { setErr(lang === "en" ? "Invalid amount" : "Monto inválido"); return; }
    setBusy(true);
    try {
      await api.post(`/referrals/jobs/${referral.referral_id}/complete`, { final_amount: n, notes: notes.trim() || null });
      onDone();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Error");
    } finally {
      setBusy(false);
    }
  };

  const commission = (Number(amount) || 0) * (referral.commission_pct / 100);

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-slate-950/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-sm bg-white rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden" data-testid="complete-modal">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-display font-bold text-slate-900">{lang === "en" ? "Mark as completed" : "Marcar como completado"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">{lang === "en" ? "Final amount" : "Monto final"} (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none text-base font-semibold"
              data-testid="complete-amount-input"
              autoFocus
            />
            <p className="text-[12px] text-emerald-700 font-bold mt-1.5">
              {lang === "en" ? `${referral.referrer?.business_name} earns: ` : `${referral.referrer?.business_name} gana: `}
              <span data-testid="complete-commission-preview">${commission.toFixed(2)}</span> ({referral.commission_pct}%)
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">{lang === "en" ? "Notes (optional)" : "Notas (opcional)"}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none text-sm" placeholder={lang === "en" ? "How did it go?" : "¿Cómo salió?"} />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button onClick={submit} disabled={busy || !amount} className="w-full h-11 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition" style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }} data-testid="complete-submit-btn">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin inline" /> : (lang === "en" ? "Confirm completion" : "Confirmar completado")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateReferralModal({ network, onClose, onCreated }) {
  const { lang } = useI18n();
  const [selected, setSelected] = useState(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [allies, setAllies] = useState([]);

  // Build pool of allies: suggestions (same category) + followers + following
  // + active providers as fallback. The endpoint covers cold referrals to
  // any approved provider — we surface as many as possible.
  useEffect(() => {
    const seen = new Set();
    const merged = [];
    const push = (arr, kind) => {
      (arr || []).forEach(a => {
        if (!a?.user_id || seen.has(a.user_id)) return;
        seen.add(a.user_id);
        merged.push({ ...a, _source: kind });
      });
    };
    push(network?.suggestions, "suggestion");
    // Also fetch follows/followers and active providers as fallback pool.
    (async () => {
      try {
        const [fol, fwr, pubs] = await Promise.all([
          api.get("/follows/me/following").catch(() => ({ data: [] })),
          api.get("/follows/me/followers").catch(() => ({ data: [] })),
          api.get("/providers", { params: { limit: 30, sort: "rating" } }).catch(() => ({ data: [] })),
        ]);
        push(fol.data, "following");
        push(fwr.data, "follower");
        // Active verified providers — wrap as ally schema
        const wrapped = (Array.isArray(pubs.data) ? pubs.data : pubs.data?.items || [])
          .filter(p => p.user_id && p.verification_status === "approved")
          .map(p => ({
            user_id: p.user_id,
            name: p.business_name,
            role: "provider",
            provider: p,
          }));
        push(wrapped, "directory");
      } catch { /* ignore */ }
      setAllies(merged.slice(0, 30));
    })();
  }, [network]);

  const submit = async () => {
    if (!selected) { setErr(lang === "en" ? "Pick an ally" : "Elige un aliado"); return; }
    if (clientName.trim().length < 2) { setErr(lang === "en" ? "Client name required" : "Nombre del cliente requerido"); return; }
    if (desc.trim().length < 8) { setErr(lang === "en" ? "Describe the service" : "Describe el servicio"); return; }
    setBusy(true);
    try {
      await api.post("/referrals/jobs", {
        referred_user_id: selected.user_id,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || null,
        service_description: desc.trim(),
        estimated_amount: amount ? Number(amount) : null,
      });
      onCreated?.();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-slate-950/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" data-testid="new-referral-modal">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-display font-bold text-slate-900">{lang === "en" ? "Refer a job to an ally" : "Referir trabajo a un aliado"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {!selected ? (
            <>
              <p className="text-sm text-slate-600">{lang === "en" ? "Pick a verified ally:" : "Elige un aliado verificado:"}</p>
              {allies.length === 0 ? (
                <p className="text-xs text-slate-400 italic">{lang === "en" ? "No allies in your category yet. Complete your category to unlock suggestions." : "Aún no hay aliados en tu categoría. Completa tu categoría para ver sugerencias."}</p>
              ) : (
                <ul className="space-y-1.5">
                  {allies.map(a => (
                    <li key={a.user_id}>
                      <button
                        type="button"
                        onClick={() => setSelected(a)}
                        className="w-full text-left flex items-center gap-3 p-2.5 rounded-2xl border border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 transition"
                        data-testid={`new-referral-ally-${a.user_id}`}
                      >
                        <span className="w-9 h-9 rounded-xl bg-slate-200 flex-shrink-0 overflow-hidden">
                          {a.provider?.logo_url ? <img src={a.provider.logo_url} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold text-slate-600">{(a.name || "?").charAt(0)}</span>}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">{a.name}</div>
                          <div className="text-[11px] text-slate-500">⭐ {a.provider?.rating_avg?.toFixed(1) || "—"} · {a.provider?.city || ""}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="bg-teal-50 rounded-2xl p-3 flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-white overflow-hidden">
                  {selected.provider?.logo_url ? <img src={selected.provider.logo_url} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center font-bold">{(selected.name || "?").charAt(0)}</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-teal-900">{selected.name}</div>
                  <button onClick={() => setSelected(null)} className="text-[11px] text-teal-700 underline">{lang === "en" ? "Change" : "Cambiar"}</button>
                </div>
              </div>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={lang === "en" ? "Client name" : "Nombre del cliente"} className="w-full h-11 px-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-teal-500 text-sm" data-testid="new-referral-client-name" />
              <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder={lang === "en" ? "Client phone (optional)" : "Teléfono del cliente (opcional)"} className="w-full h-11 px-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder={lang === "en" ? "Service the client needs..." : "Servicio que necesita el cliente..."} className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-teal-500 text-sm" data-testid="new-referral-desc" />
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={lang === "en" ? "Estimated amount (optional)" : "Monto estimado (opcional)"} className="w-full h-11 px-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
              {err && <p className="text-xs text-red-600">{err}</p>}
              <button onClick={submit} disabled={busy} className="w-full h-11 rounded-xl text-white font-bold text-sm disabled:opacity-50" style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }} data-testid="new-referral-submit">
                {busy ? <RefreshCw className="w-4 h-4 animate-spin inline" /> : (lang === "en" ? "Send referral" : "Enviar referencia")}
              </button>
              <p className="text-[11px] text-slate-500 text-center">{lang === "en" ? "You earn 5% commission when the ally completes the job." : "Ganas 5% de comisión cuando el aliado complete el trabajo."}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
