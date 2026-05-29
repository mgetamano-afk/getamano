import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../lib/api";
import { Send, Phone, MessageCircle, Mail, Search as SearchIcon, ArrowLeft, MessageSquare, Calendar } from "lucide-react";
import { toast } from "sonner";
import BookingModal from "./BookingModal";

const TYPE_LABELS = {
  direct: { lbl: "Directo", color: "#94A3B8" },
  quote: { lbl: "Cotización", color: "#0EA5E9" },
  job: { lbl: "Empleo", color: "#A855F7" },
  appointment: { lbl: "Cita", color: "#10B981" },
};

const FILTERS = [
  { v: "all", lbl: "Todos" },
  { v: "unread", lbl: "No leídos" },
  { v: "quote", lbl: "Cotizaciones" },
  { v: "job", lbl: "Empleos" },
  { v: "appointment", lbl: "Citas" },
];

/**
 * InboxView — Provider unified inbox. Two-panel desktop, full-screen mobile drill-down.
 * Polls every 10s for new messages in the active conversation; updates list every 15s.
 */
export default function InboxView({ currentUser }) {
  const [convs, setConvs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const messagesEndRef = useRef(null);

  const loadConvs = useCallback(async () => {
    try {
      const { data } = await api.get("/messaging/conversations", { params: { filter, search } });
      setConvs(data.items || []);
    } catch (e) { console.error("inbox load failed", e); }
  }, [filter, search]);

  const loadActive = useCallback(async (id) => {
    if (!id) return;
    try {
      const { data } = await api.get(`/messaging/conversations/${id}/messages`);
      setMessages(data.items || []);
      setActive(data.conversation);
      // Update the unread counter on this card locally
      setConvs(c => c.map(x => x.conversation_id === id ? { ...x, unread_count_provider: 0, unread_count_participant: 0 } : x));
    } catch (e) { console.error(e); }
  }, []);

  // Initial + poll inbox every 15s
  useEffect(() => { loadConvs(); const t = setInterval(loadConvs, 15000); return () => clearInterval(t); }, [loadConvs]);

  // Poll active conversation every 10s
  useEffect(() => {
    if (!activeId) return;
    loadActive(activeId);
    const t = setInterval(() => loadActive(activeId), 10000);
    return () => clearInterval(t);
  }, [activeId, loadActive]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (e) => {
    e?.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending || !activeId) return;
    setSending(true);
    try {
      const { data } = await api.post(`/messaging/conversations/${activeId}/messages`, { body: trimmed });
      setMessages(prev => [...prev, data]);
      setBody("");
      loadConvs();
    } catch (err) {
      console.error("send failed", err);
      toast.error("No se pudo enviar el mensaje");
    } finally { setSending(false); }
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(e);
  };

  const myUserId = currentUser?.user_id;
  const isFromMe = (m) => m.sender_user_id === myUserId;

  return (
    <div className="flex h-[600px] rounded-2xl overflow-hidden border bg-white" style={{ borderColor: "#BCC5CC" }} data-testid="inbox-view">
      {/* LEFT PANEL — list */}
      <aside className={`w-full md:w-80 md:border-r flex flex-col ${activeId ? "hidden md:flex" : "flex"}`} style={{ borderColor: "#BCC5CC" }}>
        <div className="p-3 border-b" style={{ borderColor: "#BCC5CC" }}>
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversación..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "#BCC5CC" }}
              data-testid="inbox-search"
            />
          </div>
          <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
            {FILTERS.map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)} className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition ${filter === f.v ? "text-white" : "text-slate-600 hover:bg-slate-100"}`} style={{ backgroundColor: filter === f.v ? "#03045E" : "transparent" }} data-testid={`inbox-filter-${f.v}`}>
                {f.lbl}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400" data-testid="inbox-empty">
              <MessageSquare className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              No tienes mensajes todavía. Cuando alguien te contacte, aparecerá aquí.
            </div>
          ) : convs.map(c => {
            const isProvider = c.provider_user_id === myUserId;
            const unread = isProvider ? c.unread_count_provider : c.unread_count_participant;
            const t = TYPE_LABELS[c.conversation_type] || TYPE_LABELS.direct;
            return (
              <button
                key={c.conversation_id}
                onClick={() => setActiveId(c.conversation_id)}
                className={`w-full text-left p-3 border-b transition ${activeId === c.conversation_id ? "bg-teal-50" : "hover:bg-slate-50"}`}
                style={{ borderColor: "#F1F5F9" }}
                data-testid={`inbox-conv-${c.conversation_id}`}
              >
                <div className="flex items-start gap-2">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0 text-sm" style={{ backgroundColor: "#0077B6" }}>
                    {(c.participant_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate" style={{ color: "#03045E" }}>{c.participant_name}</p>
                      {unread > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white flex-shrink-0" style={{ backgroundColor: "#EF4444" }} data-testid={`inbox-unread-${c.conversation_id}`}>{unread}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{c.last_message_preview || "—"}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${t.color}20`, color: t.color }}>{t.lbl}</span>
                      <span className="text-[10px] text-slate-400">{new Date(c.last_message_at).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* RIGHT PANEL — thread */}
      <main className={`flex-1 flex-col ${activeId ? "flex" : "hidden md:flex"}`}>
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 p-6 text-center">
            <div>
              <MessageSquare className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-sm">Selecciona una conversación para empezar</p>
            </div>
          </div>
        ) : (
          <>
            <header className="p-3 border-b flex items-center gap-2" style={{ borderColor: "#BCC5CC" }}>
              <button onClick={() => setActiveId(null)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100" data-testid="inbox-back-btn" aria-label="Volver">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" style={{ color: "#03045E" }} data-testid="inbox-active-name">{active.participant_name}</p>
                <p className="text-[11px] text-slate-500 truncate">{(TYPE_LABELS[active.conversation_type] || TYPE_LABELS.direct).lbl}</p>
              </div>
              <div className="flex gap-1">
                {active.participant_phone && (
                  <a href={`tel:${active.participant_phone}`} className="p-2 rounded-lg hover:bg-slate-100" title="Llamar" data-testid="inbox-call">
                    <Phone className="w-4 h-4" style={{ color: "#03045E" }} />
                  </a>
                )}
                {active.participant_phone && (
                  <a href={`https://wa.me/${active.participant_phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent("Hola, te contacto desde getamano.")}`} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-slate-100" title="WhatsApp" data-testid="inbox-whatsapp">
                    <MessageCircle className="w-4 h-4" style={{ color: "#25D366" }} />
                  </a>
                )}
                {active.participant_email && (
                  <a href={`mailto:${active.participant_email}?subject=Contacto+desde+getamano`} className="p-2 rounded-lg hover:bg-slate-100" title="Email" data-testid="inbox-email">
                    <Mail className="w-4 h-4 text-slate-600" />
                  </a>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50" data-testid="inbox-thread">
              {messages.map(m => (
                <div key={m.message_id} className={`flex ${isFromMe(m) ? "justify-end" : "justify-start"}`} data-testid={`inbox-msg-${m.message_id}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isFromMe(m) ? "text-white rounded-br-sm" : "bg-white border rounded-bl-sm"}`} style={{ backgroundColor: isFromMe(m) ? "#0077B6" : undefined, borderColor: isFromMe(m) ? undefined : "#BCC5CC" }}>
                    <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-0.5 ${isFromMe(m) ? "text-white/70" : "text-slate-400"}`}>
                      {new Date(m.created_at).toLocaleString("es", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={send} className="p-3 border-t flex items-end gap-2" style={{ borderColor: "#BCC5CC" }} data-testid="inbox-composer">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 1000))}
                onKeyDown={onKeyDown}
                placeholder="Escribe tu mensaje... (Cmd/Ctrl + Enter para enviar)"
                rows={1}
                className="flex-1 px-3 py-2 rounded-xl border text-sm resize-none"
                style={{ borderColor: "#BCC5CC", maxHeight: 120 }}
                data-testid="inbox-input"
              />
              <button type="submit" disabled={sending || !body.trim()} className="p-2.5 rounded-full text-white disabled:opacity-50" style={{ backgroundColor: "#0077B6" }} data-testid="inbox-send-btn" aria-label="Enviar">
                <Send className="w-4 h-4" />
              </button>
            </form>
            {body.length > 800 && <p className="text-[10px] text-slate-400 text-right px-3 pb-2">{body.length}/1000</p>}
          </>
        )}
      </main>
      {active?.provider_id && (
        <BookingModal
          open={showBooking}
          provider={{ provider_id: active.provider_id, business_name: active.participant_user_id === myUserId ? "Proveedor" : active.participant_name }}
          onClose={() => setShowBooking(false)}
        />
      )}
    </div>
  );
}
