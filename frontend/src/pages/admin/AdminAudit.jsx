import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { ClipboardList } from "lucide-react";

const ACTION_COLOR = {
  "verify:approved": "bg-green-900 text-green-300",
  "verify:rejected": "bg-red-900 text-red-300",
  "verify:needs_info": "bg-yellow-900 text-yellow-300",
  "verify:suspended": "bg-slate-700 text-slate-200",
  "review:flag": "bg-orange-900 text-orange-300",
  "review:delete": "bg-red-900 text-red-300",
  "category:create": "bg-blue-900 text-blue-300",
  "category:update": "bg-blue-900 text-blue-300",
  "category:delete": "bg-red-900 text-red-300",
  "city:create": "bg-purple-900 text-purple-300",
  "city:delete": "bg-red-900 text-red-300",
  "provider:edit": "bg-indigo-900 text-indigo-300",
};

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/audit-log").then(r => setLogs(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout title="Audit log">
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-500">Cargando...</div>
        : logs.length === 0 ? <div className="p-8 text-center text-slate-500"><ClipboardList className="w-10 h-10 mx-auto text-slate-700 mb-2" />Sin actividad aún.</div>
        : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
              <tr>
                <th className="text-left p-4">Fecha</th>
                <th className="text-left p-4">Admin</th>
                <th className="text-left p-4">Acción</th>
                <th className="text-left p-4">Target</th>
                <th className="text-left p-4">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.map(log => (
                <tr key={log.log_id} data-testid={`audit-row-${log.log_id}`}>
                  <td className="p-4 text-slate-400 text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="p-4 text-white">{log.admin?.name || "—"}<div className="text-[10px] text-slate-500">{log.admin?.email}</div></td>
                  <td className="p-4"><span className={`text-[10px] px-2 py-1 rounded-full ${ACTION_COLOR[log.action] || "bg-slate-800 text-slate-300"}`}>{log.action}</span></td>
                  <td className="p-4 text-slate-300 font-mono text-xs">{log.target}</td>
                  <td className="p-4 text-slate-400 text-xs">{log.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
