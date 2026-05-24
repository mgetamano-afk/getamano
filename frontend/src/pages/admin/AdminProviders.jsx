import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { Search as SearchIcon, ExternalLink, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";

export default function AdminProviders() {
  const [providers, setProviders] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const { data } = await api.get("/admin/providers");
    setProviders(data);
  };
  useEffect(() => { refresh(); }, []);

  const filtered = providers.filter(p =>
    !q || p.business_name?.toLowerCase().includes(q.toLowerCase()) ||
    p.city?.toLowerCase().includes(q.toLowerCase()) ||
    p.email?.toLowerCase().includes(q.toLowerCase())
  );

  const toggleActive = async (p) => {
    try {
      await api.patch(`/admin/providers/${p.provider_id}`, { is_active: !p.is_active });
      toast.success("Actualizado"); refresh();
    } catch { toast.error("Error"); }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/admin/providers/${editing.provider_id}`, {
        business_name: editing.business_name,
        description: editing.description,
        phone: editing.phone,
        email: editing.email,
        plan: editing.plan,
        verification_status: editing.verification_status,
      });
      toast.success("Guardado"); setEditing(null); refresh();
    } catch { toast.error("Error"); }
    finally { setSaving(false); }
  };

  return (
    <AdminLayout title="Proveedores">
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 mb-5 p-3 flex items-center gap-2" data-testid="providers-search-bar">
        <SearchIcon className="w-4 h-4 text-slate-500 ml-2" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, ciudad, email..." className="bg-transparent outline-none flex-1 text-white placeholder:text-slate-500" data-testid="providers-search-input" />
        <span className="text-sm text-slate-500">{filtered.length}/{providers.length}</span>
      </div>

      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left p-4">Negocio</th>
              <th className="text-left p-4 hidden md:table-cell">Ciudad</th>
              <th className="text-left p-4">Estado</th>
              <th className="text-left p-4">Plan</th>
              <th className="text-right p-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map(p => (
              <tr key={p.provider_id} className={p.is_active ? "" : "opacity-50"} data-testid={`provider-row-${p.slug}`}>
                <td className="p-4">
                  <div className="font-medium text-white">{p.business_name}</div>
                  <div className="text-xs text-slate-400 truncate max-w-xs">{p.email}</div>
                </td>
                <td className="p-4 hidden md:table-cell text-slate-300">{p.city}, {p.state}</td>
                <td className="p-4"><span className={`text-xs px-2 py-1 rounded-full ${p.verification_status === "approved" ? "bg-green-900 text-green-300" : p.verification_status === "rejected" ? "bg-red-900 text-red-300" : "bg-yellow-900 text-yellow-300"}`}>{p.verification_status}</span></td>
                <td className="p-4 text-slate-300 capitalize">{p.plan}</td>
                <td className="p-4 text-right">
                  <div className="inline-flex gap-1">
                    <a href={`/provider/${p.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-slate-800 rounded-lg" title="Ver"><ExternalLink className="w-4 h-4 text-blue-400" /></a>
                    <button onClick={() => setEditing(p)} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs" data-testid={`provider-edit-${p.slug}`}>Editar</button>
                    <button onClick={() => toggleActive(p)} className="p-2 hover:bg-slate-800 rounded-lg" title={p.is_active ? "Pausar" : "Activar"} data-testid={`provider-toggle-${p.slug}`}>
                      {p.is_active ? <Pause className="w-4 h-4 text-yellow-400" /> : <Play className="w-4 h-4 text-green-400" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)} data-testid="admin-edit-modal">
          <form onSubmit={saveEdit} onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Editar proveedor</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <EditField label="Nombre del negocio" value={editing.business_name} onChange={v => setEditing({ ...editing, business_name: v })} testid="admin-edit-name" />
            <EditField label="Teléfono" value={editing.phone || ""} onChange={v => setEditing({ ...editing, phone: v })} testid="admin-edit-phone" />
            <EditField label="Email" value={editing.email || ""} onChange={v => setEditing({ ...editing, email: v })} testid="admin-edit-email" />
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Descripción</label>
              <textarea value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white" data-testid="admin-edit-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase text-slate-400 mb-1">Plan</label>
                <select value={editing.plan} onChange={e => setEditing({ ...editing, plan: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white" data-testid="admin-edit-plan">
                  <option value="free">Free</option><option value="pro">Pro</option><option value="premium">Premium</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase text-slate-400 mb-1">Estado</label>
                <select value={editing.verification_status} onChange={e => setEditing({ ...editing, verification_status: e.target.value })} className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white" data-testid="admin-edit-status">
                  {["pending","in_review","needs_info","approved","rejected","suspended"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium" data-testid="admin-edit-save">{saving ? "Guardando..." : "Guardar cambios"}</button>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}

function EditField({ label, value, onChange, testid }) {
  return (
    <div>
      <label className="block text-xs uppercase text-slate-400 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white outline-none focus:border-blue-500" data-testid={testid} />
    </div>
  );
}
