import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, ChevronRight, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";

/**
 * WaitingClientsBadge — Section 43C.
 *
 * Surfaces clients whose messages have been sitting unread on the provider
 * side >24h. Shown as an urgent banner above the inbox tab so the provider
 * never lets a lead die in silence.
 *
 * Hides itself entirely when count === 0, so it never adds noise to a
 * well-tended inbox.
 */
function formatHoursAgo(iso) {
  if (!iso) return "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours < 48) return `${hours}h sin responder`;
    const days = Math.floor(hours / 24);
    return `${days}d sin responder`;
  } catch {
    return "";
  }
}

export default function WaitingClientsBadge() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .get("/providers/me/clients-waiting")
        .then((r) => alive && setData(r.data))
        .catch(() => alive && setData(null));
    };
    load();
    // Refresh every 5 minutes so the badge stays current while the
    // dashboard sits open in a tab.
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden"
      style={{ borderColor: "#FCA5A5" }}
      data-testid="waiting-clients-badge"
    >
      <div className="flex items-start gap-3 p-4" style={{ background: "linear-gradient(135deg, #FEF2F2 0%, #FFF7ED 100%)" }}>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "#DC2626" }}
        >
          <AlertTriangle className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-sm text-slate-900">
            {data.count === 1 ? "1 cliente está esperando" : `${data.count} clientes están esperando`}
          </h3>
          <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
            Llevan más de 24 horas sin respuesta tuya. <strong>Cada hora cuenta</strong> — un cliente que espera ya está mirando otros proveedores.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-slate-100" data-testid="waiting-clients-list">
        {data.items.slice(0, 3).map((it) => (
          <li key={it.conversation_id}>
            <Link
              to={`/messages?conv=${it.conversation_id}`}
              className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors"
              data-testid={`waiting-client-${it.conversation_id}`}
            >
              <Clock className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{it.client_name || "Cliente"}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {formatHoursAgo(it.last_at)} · "{(it.last_message || "").slice(0, 50)}"
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      {data.count > 3 && (
        <div className="text-center px-4 py-2.5 border-t border-slate-100">
          <Link to="/messages" className="text-xs font-semibold text-red-600 hover:underline" data-testid="waiting-clients-see-all">
            Ver los {data.count} mensajes pendientes →
          </Link>
        </div>
      )}
    </div>
  );
}
