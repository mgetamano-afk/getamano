import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Header";
import { toast } from "sonner";

export default function UserProfile() {
  const { user, loading: authLoading, refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", phone: "", language: "es" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    setForm({ name: user.name || "", phone: user.phone || "", language: user.language || "es" });
  }, [user, authLoading, navigate]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/users/me", form);
      await refresh();
      toast.success("Perfil actualizado");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8" data-testid="user-profile-page">
        <h1 className="font-display text-3xl font-bold text-slate-900">Mi perfil</h1>
        <p className="text-slate-500 mt-1">Actualiza tus datos personales</p>

        <form onSubmit={save} className="mt-6 bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-4" data-testid="user-profile-form">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid="user-profile-name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Correo electrónico</label>
            <input value={user.email} disabled className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500" data-testid="user-profile-email" />
            <p className="text-xs text-slate-400 mt-1">El correo no se puede cambiar.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none" data-testid="user-profile-phone" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Idioma preferido</label>
            <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} className="w-full h-12 px-4 rounded-xl border border-slate-200" data-testid="user-profile-language">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="pt-4 border-t border-slate-100">
            <div className="text-sm text-slate-500">Cuenta: <span className="font-medium text-slate-700 capitalize">{user.role}</span></div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary" data-testid="user-profile-save">
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </main>
    </div>
  );
}
