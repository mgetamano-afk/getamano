import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  Bell, BellRing, X, CheckCheck, Image as ImageIcon, List as ListIcon, Edit3,
  MessageCircle, Inbox, Share2, Crown, Star, Heart, Map, Sparkles, Search, Trophy, ArrowRight
} from "lucide-react";

const ICON_MAP = {
  image: ImageIcon, list: ListIcon, edit: Edit3, message: MessageCircle, inbox: Inbox,
  share: Share2, crown: Crown, star: Star, heart: Heart, map: Map, sparkle: Sparkles,
  search: Search, trophy: Trophy,
};

const PRIO_DOT = { high: "bg-red-500", medium: "bg-amber-400", low: "bg-slate-400" };

export default function NotificationBell({ compact = false }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/notifications");
      setItems(r.data.items || []);
      setUnread(r.data.unread_count || 0);
    } catch (e) { console.error("notifications load failed", e); } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Section 68 / I11 — idempotent. If the user clicks an already-read
  // item the unread counter must NOT decrement again. Source of truth is
  // the item.is_read flag inside `items`.
  const markRead = async (id) => {
    const target = items.find(i => i.notification_id === id);
    if (!target || target.is_read) return; // no-op, already read
    setItems(prev => prev.map(i => i.notification_id === id ? { ...i, is_read: true } : i));
    setUnread(u => Math.max(0, u - 1));
    try { await api.post(`/notifications/${id}/read`); } catch (e) { console.error("mark read failed", e); }
  };
  const dismiss = async (id, e) => {
    e?.stopPropagation();
    setItems(items.filter(i => i.notification_id !== id));
    const item = items.find(i => i.notification_id === id);
    if (item && !item.is_read) setUnread(Math.max(0, unread - 1));
    try { await api.post(`/notifications/${id}/dismiss`); } catch (err) { console.error("dismiss failed", err); }
  };
  const markAllRead = async () => {
    setItems(items.map(i => ({ ...i, is_read: true })));
    setUnread(0);
    try { await api.post("/notifications/read-all"); } catch (e) { console.error("mark all read failed", e); }
  };

  const BellIcon = unread > 0 ? BellRing : Bell;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-slate-100 text-slate-700 transition"
        data-testid="notification-bell"
        aria-label="Notificaciones"
      >
        <BellIcon className={`w-5 h-5 ${unread > 0 ? "text-orange-600" : ""}`} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ring-2 ring-white" data-testid="notification-badge">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden ${compact ? "" : ""}`}
          data-testid="notification-dropdown"
          style={{ animation: "notif-pop .15s ease-out" }}
        >
          <style>{`@keyframes notif-pop { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }`}</style>

          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-slate-900 text-sm">Notificaciones</h3>
              <p className="text-[11px] text-slate-500">
                {unread > 0 ? `${unread} sin leer` : "Estás al día 🧡"}
              </p>
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 font-medium" data-testid="notification-mark-all-read">
                <CheckCheck className="w-3.5 h-3.5" /> Marcar todo
              </button>
            )}
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">Cargando...</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center">
                <Sparkles className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-500">Sin novedades por ahora</p>
              </div>
            ) : (
              items.map(n => {
                const Icon = ICON_MAP[n.icon] || Bell;
                return (
                  <div
                    key={n.notification_id}
                    className={`group relative px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition ${!n.is_read ? "bg-blue-50/40" : ""}`}
                    data-testid={`notification-item-${n.notification_key?.split("::").pop() || n.notification_id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${!n.is_read ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"} flex items-center justify-center`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1.5">
                          <h4 className="font-semibold text-sm text-slate-900 leading-snug flex-1">{n.title}</h4>
                          {!n.is_read && <span className={`flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${PRIO_DOT[n.priority] || "bg-amber-400"}`} />}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.body}</p>
                        {/* Section 78 — stacked reactor avatars for milestone reaction batches */}
                        {Array.isArray(n.reactors) && n.reactors.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <div className="flex -space-x-1.5">
                              {n.reactors.slice(0, 4).map((r) => (
                                <div
                                  key={r.user_id}
                                  className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-300 to-pink-400 ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-white"
                                  title={r.name}
                                >
                                  {r.avatar ? (
                                    <img src={r.avatar} alt={r.name} className="w-full h-full rounded-full object-cover" />
                                  ) : (
                                    (r.name || "?")[0].toUpperCase()
                                  )}
                                </div>
                              ))}
                            </div>
                            {n.reactions_count > 4 && (
                              <span className="text-[10px] text-slate-500 font-medium">+{n.reactions_count - 4}</span>
                            )}
                          </div>
                        )}
                        {n.cta_label && n.cta_url && (
                          <Link
                            to={n.cta_url}
                            onClick={() => { markRead(n.notification_id); setOpen(false); }}
                            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-orange-600 hover:text-orange-700"
                            data-testid={`notification-cta-${n.notification_key?.split("::").pop() || n.notification_id}`}
                          >
                            {n.cta_label} <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                      <button onClick={(e) => dismiss(n.notification_id, e)} className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 transition" data-testid={`notification-dismiss-${n.notification_key?.split("::").pop() || n.notification_id}`} aria-label="Descartar">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-center">
            <span className="text-[10px] text-slate-400">getamano · tu compañero diario 🧡</span>
          </div>
        </div>
      )}
    </div>
  );
}
