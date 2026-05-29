import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LayoutDashboard, ShieldCheck, Users, MessageSquare, FolderTree, ClipboardList, BarChart3, LogOut, Home, Menu, X, Crown, DollarSign, Flag, TrendingUp, Inbox } from "lucide-react";
import { useState, useEffect } from "react";

const NAV = [
  { path: "/admin", label: "Resumen", Icon: LayoutDashboard, exact: true },
  { path: "/admin/ceo", label: "Panel CEO", Icon: Crown, highlight: true },
  { path: "/admin/leads", label: "Leads Inbox", Icon: Inbox, highlight: true },
  { path: "/admin/quiz-funnel", label: "Quiz funnel", Icon: TrendingUp },
  { path: "/admin/pricing", label: "Inteligencia de precios", Icon: DollarSign },
  { path: "/admin/queue", label: "Cola de verificación", Icon: ShieldCheck },
  { path: "/admin/providers", label: "Proveedores", Icon: Users },
  { path: "/admin/reviews", label: "Reseñas", Icon: MessageSquare },
  { path: "/admin/reportes", label: "Reportes", Icon: Flag },
  { path: "/admin/catalog", label: "Categorías y ciudades", Icon: FolderTree },
  { path: "/admin/audit", label: "Audit log", Icon: ClipboardList },
];

export default function AdminLayout({ children, title }) {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login");
    else if (user.role !== "admin") navigate("/dashboard");
  }, [user, loading, navigate]);

  if (!user || user.role !== "admin") return null;

  const isActive = (item) => item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);

  const handleLogout = async () => { await logout(); navigate("/"); };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex" data-testid="admin-layout">
      {/* Mobile toggle */}
      <button onClick={() => setOpen(!open)} className="md:hidden fixed top-4 left-4 z-50 p-2 bg-slate-800 rounded-lg" data-testid="admin-mobile-toggle">
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:sticky top-0 left-0 h-screen w-64 bg-slate-900 border-r border-slate-800 z-40 transition-transform flex flex-col`} data-testid="admin-sidebar">
        <div className="p-5 border-b border-slate-800">
          <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)} data-testid="admin-logo-link">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center p-1.5" style={{ backgroundColor: "#F8FCFD" }}>
              <img src="/getamano-logo-mark.png" alt="" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="font-display font-bold text-white">getamano</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Admin console</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" data-testid="admin-nav">
          {NAV.map(item => (
            <Link
              key={item.path} to={item.path} onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                isActive(item)
                  ? "bg-blue-600 text-white"
                  : item.highlight
                    ? "bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-amber-300 hover:from-amber-500/25 hover:to-orange-500/20 border border-amber-500/20"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
              data-testid={`admin-nav-${item.path.split("/").pop() || "home"}`}
            >
              <item.Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 space-y-1">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white">
            <Home className="w-4 h-4" /> Ver sitio público
          </Link>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-red-950 hover:text-red-300" data-testid="admin-logout">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
          <div className="text-xs text-slate-500 px-3 pt-2 truncate">{user.email}</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 md:ml-0 min-w-0">
        <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur border-b border-slate-800 px-6 md:px-8 py-4 flex items-center justify-between" data-testid="admin-header">
          <h1 className="font-display text-xl md:text-2xl font-bold text-white">{title}</h1>
        </header>
        <div className="p-6 md:p-8">{children}</div>
      </main>

      {open && <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setOpen(false)} />}
    </div>
  );
}
