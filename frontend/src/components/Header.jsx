import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { Globe, LogOut, User as UserIcon, Menu, X, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import NotificationBell from "./NotificationBell";

export default function Header() {
  const { user, logout } = useAuth();
  const { t, lang, changeLang } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    api.get("/conversations").then(r => {
      setUnread((r.data || []).filter(c => c.unread).length);
    }).catch(() => {});
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="glass-header sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link to="/" className="flex items-center gap-2" data-testid="header-logo-link">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold font-display" style={{ background: "linear-gradient(135deg, #2F9D94, #025F67)" }}>g</div>
            <span className="font-display font-bold text-xl" style={{ color: "#025F67" }}>get<span style={{ color: "#2F9D94" }}>amano</span></span>
          </Link>

          <nav className="hidden md:flex items-center gap-2">
            <Link to="/search" className="px-4 py-2 text-slate-700 hover:text-blue-600 font-medium" data-testid="nav-explore">{t("nav.explore")}</Link>
            <Link to="/comunidad" className="px-4 py-2 text-slate-700 hover:text-blue-600 font-medium inline-flex items-center gap-1" data-testid="nav-community">
              Comunidad <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="En vivo" />
            </Link>
            <Link to="/plans" className="px-4 py-2 text-slate-700 hover:text-blue-600 font-medium" data-testid="nav-plans">{t("nav.plans")}</Link>
            <button
              onClick={() => changeLang(lang === "es" ? "en" : "es")}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 rounded-full hover:bg-slate-100"
              data-testid="lang-toggle"
            >
              <Globe className="w-4 h-4" /> {lang.toUpperCase()}
            </button>
            {user ? (
              <>
                <Link to="/messages" className="relative p-2 text-slate-600 hover:text-blue-600" data-testid="nav-messages" aria-label="messages">
                  <MessageCircle className="w-5 h-5" />
                  {unread > 0 && <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unread}</span>}
                </Link>
                <Link to="/dashboard" className="btn-outline" data-testid="nav-dashboard">
                  <UserIcon className="w-4 h-4 inline mr-1" /> {t("nav.dashboard")}
                </Link>
                <NotificationBell />
                <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-red-600" data-testid="nav-logout" aria-label="logout">
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-outline" data-testid="nav-login">{t("nav.login")}</Link>
                <Link to="/register?intent=provider" className="btn-primary" data-testid="nav-signup-provider">{t("nav.providers")}</Link>
              </>
            )}
          </nav>

          <button onClick={() => setOpen(!open)} className="md:hidden p-2" data-testid="mobile-menu-toggle">
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {open && (
          <div className="md:hidden border-t border-slate-200 py-4 space-y-2">
            <Link to="/search" onClick={() => setOpen(false)} className="block px-4 py-2 text-slate-700 font-medium" data-testid="mobile-nav-explore">{t("nav.explore")}</Link>
            <Link to="/comunidad" onClick={() => setOpen(false)} className="block px-4 py-2 text-slate-700 font-medium" data-testid="mobile-nav-community">Comunidad 🔴</Link>
            <Link to="/plans" onClick={() => setOpen(false)} className="block px-4 py-2 text-slate-700 font-medium">{t("nav.plans")}</Link>
            <button onClick={() => { changeLang(lang === "es" ? "en" : "es"); setOpen(false); }} className="w-full text-left px-4 py-2 text-slate-700 font-medium" data-testid="mobile-lang-toggle">
              <Globe className="w-4 h-4 inline mr-2" />{lang === "es" ? "English" : "Español"}
            </button>
            {user ? (
              <>
                <Link to="/messages" onClick={() => setOpen(false)} className="block px-4 py-2 text-slate-700 font-medium">Mensajes {unread > 0 && <span className="ml-1 bg-orange-500 text-white text-xs rounded-full px-2">{unread}</span>}</Link>
                <Link to="/dashboard" onClick={() => setOpen(false)} className="block px-4 py-2 text-blue-600 font-medium">{t("nav.dashboard")}</Link>
                <Link to="/profile" onClick={() => setOpen(false)} className="block px-4 py-2 text-slate-700 font-medium">Mi perfil</Link>
                <button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-red-600 font-medium">{t("nav.logout")}</button>
              </>
            ) : (
              <div className="px-4 flex gap-2 pt-2">
                <Link to="/login" onClick={() => setOpen(false)} className="btn-outline flex-1 text-center">{t("nav.login")}</Link>
                <Link to="/register?intent=provider" onClick={() => setOpen(false)} className="btn-primary flex-1 text-center">{t("nav.providers")}</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
