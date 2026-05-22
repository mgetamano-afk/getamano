import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Header";
import { MessageCircle, Send, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

export default function Messages() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    refresh();
    // eslint-disable-next-line
  }, [user, authLoading]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const refresh = async () => {
    const { data } = await api.get("/conversations");
    setConversations(data);
    // Auto-open if state.conversation_id provided
    const cid = location.state?.conversation_id || (data[0]?.conversation_id);
    if (cid) openConv(cid);
  };

  const openConv = async (conversation_id) => {
    const { data } = await api.get(`/conversations/${conversation_id}/messages`);
    setActive(data.conversation);
    setMessages(data.messages);
    setConversations(cs => cs.map(c => c.conversation_id === conversation_id ? { ...c, unread: false } : c));
  };

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim() || !active) return;
    setSending(true);
    try {
      const { data } = await api.post(`/messages/${active.conversation_id}/reply`, { body });
      setMessages(m => [...m, data]);
      setBody("");
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6" data-testid="messages-page">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 mb-4">Mensajes</h1>

        <div className="grid md:grid-cols-[320px_1fr] gap-4 bg-white rounded-2xl border border-slate-200 overflow-hidden min-h-[60vh]">
          {/* Conversations list */}
          <aside className={`${active ? "hidden md:block" : "block"} border-r border-slate-100 overflow-y-auto`}>
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-slate-500" data-testid="messages-empty">
                <MessageCircle className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p>No tienes conversaciones aún.</p>
              </div>
            ) : conversations.map(c => (
              <button
                key={c.conversation_id}
                onClick={() => openConv(c.conversation_id)}
                className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition flex items-start gap-3 ${active?.conversation_id === c.conversation_id ? "bg-blue-50/50" : ""}`}
                data-testid={`conversation-${c.conversation_id}`}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600 font-bold flex-shrink-0">
                  {((c.my_role === "provider" ? c.client_name : c.business_name) || "?").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-slate-900 text-sm truncate">{(c.my_role === "provider" ? c.client_name : c.business_name) || "—"}</span>
                    {c.unread && <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{c.last_message}</p>
                </div>
              </button>
            ))}
          </aside>

          {/* Thread */}
          <section className={`${active ? "block" : "hidden md:flex"} flex-col`} data-testid="message-thread">
            {!active ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 p-8">Selecciona una conversación</div>
            ) : (
              <>
                <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                  <button onClick={() => setActive(null)} className="md:hidden text-slate-500" data-testid="message-back">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                    {(active.business_name || active.client_name || "?").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{user?.user_id === active.provider_user_id ? active.client_name : active.business_name}</div>
                    <div className="text-xs text-slate-500 truncate">{active.subject}</div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                  {messages.map(m => (
                    <div key={m.message_id} className={`flex ${m.sender_id === user?.user_id ? "justify-end" : "justify-start"}`} data-testid={`message-${m.message_id}`}>
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${m.sender_id === user?.user_id ? "bg-blue-600 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"}`}>
                        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                <form onSubmit={send} className="p-3 border-t border-slate-100 flex gap-2" data-testid="message-compose-form">
                  <input value={body} onChange={e => setBody(e.target.value)} placeholder="Escribe un mensaje..." className="flex-1 h-11 px-4 rounded-full border border-slate-200 outline-none focus:border-blue-600" data-testid="message-compose-input" />
                  <button type="submit" disabled={sending || !body.trim()} className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-40" data-testid="message-send-button">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
