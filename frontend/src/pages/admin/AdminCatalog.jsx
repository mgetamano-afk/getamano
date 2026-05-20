import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../lib/api";
import { Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

export default function AdminCatalog() {
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);
  const [newCat, setNewCat] = useState({ slug: "", name_es: "", name_en: "", icon: "Sparkles", color: "#3B82F6" });
  const [newCity, setNewCity] = useState({ name: "", state: "", featured: false });

  const refresh = async () => {
    const [c1, c2] = await Promise.all([api.get("/categories"), api.get("/admin/cities").catch(() => ({ data: [] }))]);
    setCategories(c1.data); setCities(c2.data);
  };
  useEffect(() => { refresh(); }, []);

  const addCat = async (e) => {
    e.preventDefault();
    try { await api.post("/admin/categories", newCat); toast.success("Creada"); setNewCat({ slug: "", name_es: "", name_en: "", icon: "Sparkles", color: "#3B82F6" }); refresh(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };
  const delCat = async (id) => {
    if (!confirm("¿Eliminar esta categoría?")) return;
    try { await api.delete(`/admin/categories/${id}`); toast.success("Eliminada"); refresh(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };
  const addCity = async (e) => {
    e.preventDefault();
    try { await api.post("/admin/cities", newCity); toast.success("Creada"); setNewCity({ name: "", state: "", featured: false }); refresh(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };
  const delCity = async (id) => {
    if (!confirm("¿Eliminar ciudad?")) return;
    try { await api.delete(`/admin/cities/${id}`); toast.success("Eliminada"); refresh(); } catch { toast.error("Error"); }
  };

  return (
    <AdminLayout title="Categorías y ciudades">
      <div className="grid md:grid-cols-2 gap-6">
        {/* CATEGORIES */}
        <section className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden" data-testid="catalog-categories">
          <div className="p-5 border-b border-slate-800">
            <h2 className="font-display font-semibold text-white">Categorías ({categories.length})</h2>
          </div>
          <form onSubmit={addCat} className="p-5 border-b border-slate-800 space-y-2 grid grid-cols-2 gap-2" data-testid="catalog-new-cat-form">
            <input required value={newCat.slug} onChange={e => setNewCat({ ...newCat, slug: e.target.value })} placeholder="slug (kebab-case)" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" data-testid="new-cat-slug" />
            <input value={newCat.color} onChange={e => setNewCat({ ...newCat, color: e.target.value })} placeholder="#3B82F6" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" data-testid="new-cat-color" />
            <input required value={newCat.name_es} onChange={e => setNewCat({ ...newCat, name_es: e.target.value })} placeholder="Nombre ES" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" data-testid="new-cat-es" />
            <input required value={newCat.name_en} onChange={e => setNewCat({ ...newCat, name_en: e.target.value })} placeholder="Name EN" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" data-testid="new-cat-en" />
            <button type="submit" className="col-span-2 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium" data-testid="new-cat-submit">
              <Plus className="w-4 h-4" /> Crear categoría
            </button>
          </form>
          <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
            {categories.map(c => (
              <div key={c.category_id} className="p-3 flex items-center gap-3" data-testid={`catalog-cat-${c.slug}`}>
                <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: c.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{c.name_es} <span className="text-slate-500">/ {c.name_en}</span></div>
                  <div className="text-[10px] text-slate-500">{c.slug}</div>
                </div>
                <button onClick={() => delCat(c.category_id)} className="p-2 hover:bg-red-900 rounded-lg text-red-400" data-testid={`catalog-cat-delete-${c.slug}`}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>

        {/* CITIES */}
        <section className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden" data-testid="catalog-cities">
          <div className="p-5 border-b border-slate-800">
            <h2 className="font-display font-semibold text-white">Ciudades destacadas ({cities.length})</h2>
          </div>
          <form onSubmit={addCity} className="p-5 border-b border-slate-800 grid grid-cols-2 gap-2" data-testid="catalog-new-city-form">
            <input required value={newCity.name} onChange={e => setNewCity({ ...newCity, name: e.target.value })} placeholder="Ciudad" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" data-testid="new-city-name" />
            <input required value={newCity.state} onChange={e => setNewCity({ ...newCity, state: e.target.value })} placeholder="Estado (ej. OK)" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" data-testid="new-city-state" />
            <label className="col-span-2 flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={newCity.featured} onChange={e => setNewCity({ ...newCity, featured: e.target.checked })} data-testid="new-city-featured" />
              Destacar en homepage
            </label>
            <button type="submit" className="col-span-2 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium" data-testid="new-city-submit">
              <Plus className="w-4 h-4" /> Agregar ciudad
            </button>
          </form>
          <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
            {cities.length === 0 ? <div className="p-6 text-center text-slate-500 text-sm">Sin ciudades.</div> :
              cities.map(c => (
                <div key={c.city_id} className="p-3 flex items-center gap-3" data-testid={`catalog-city-${c.city_id}`}>
                  {c.featured && <Star className="w-4 h-4 text-orange-400 fill-orange-400" />}
                  <div className="flex-1 text-sm text-white">{c.name}, {c.state}</div>
                  <button onClick={() => delCity(c.city_id)} className="p-2 hover:bg-red-900 rounded-lg text-red-400" data-testid={`catalog-city-delete-${c.city_id}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))
            }
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
