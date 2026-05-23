import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { Globe, LogOut, User as UserIcon, Menu, X, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import NotificationBell from "./NotificationBell";
import useSmartNav from "../hooks/useSmartNav";
import { trackLanguageSwitch } from "../lib/analytics";

export default function Header() {
  const { user, logout } = useAuth();
  const { t, lang, changeLang } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const navVisible = useSmartNav();

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    api.get("/conversations").then(r => {
      setUnread((r.data || []).filter(c => c.unread).length);
    }).catch(() => {});
  }, [user]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header
      className={`glass-header sticky top-0 z-50 transition-transform duration-300 ease-in-out ${navVisible || open ? "translate-y-0" : "-translate-y-full"}`}
      style={{ paddingTop: "var(--safe-top, 0px)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 md:h-20">
          <Link to="/" className="flex items-center gap-2 min-w-0" data-testid="header-logo-link" aria-label="getamano home">
            <img src="/getamano-logo-mark.png" alt="" className="w-9 h-9 md:w-10 md:h-10 object-contain flex-shrink-0" />
            <span className="font-display font-bold text-lg md:text-xl truncate" style={{ color: "#025F67" }}>get<span style={{ color: "#2F9D94" }}>amano</span></span>
          </Link>

          <nav className="hidden md:flex items-center gap-2">
            <Link to="/search" className="px-4 py-2 text-slate-700 hover:text-blue-600 font-medium" data-testid="nav-explore">{t("nav.explore")}</Link>
            <Link to="/comunidad" className="px-4 py-2 text-slate-700 hover:text-blue-600 font-medium inline-flex items-center gap-1" data-testid="nav-community">
              Comunidad <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="En vivo" />
            </Link>
            <Link to="/plans" className="px-4 py-2 text-slate-700 hover:text-blue-600 font-medium" data-testid="nav-plans">{t("nav.plans")}</Link>
            <button
              onClick={() => { const to = lang === "es" ? "en" : "es"; changeLang(to); trackLanguageSwitch(to); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 rounded-full hover:bg-slate-100"
              data-testid="lang-toggle"
              title={lang === "es" ? "Switch to English" : "Cambiar a Español"}
            >
              <span className="text-base leading-none">{lang === "es" ? "🇲🇽" : "🇺🇸"}</span>
              <span className="text-xs uppercase tracking-wide">{lang}</span>
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

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2.5 -mr-2 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition"
            data-testid="mobile-menu-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            style={{ minHeight: 44, minWidth: 44 }}
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer + backdrop (full-height slide from right) — portaled to <body>
          so the parent's `backdrop-filter` does NOT trap our `position:fixed`
          inside the header's containing block (real CSS gotcha). */}
      {open && createPortal(
        <>
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-[2147483646] md:hidden animate-in fade-in"
            onClick={() => setOpen(false)}
            data-testid="mobile-menu-backdrop"
            aria-hidden="true"
          />
          <div
            className="fixed top-0 right-0 bottom-0 w-[85%] max-w-sm bg-white shadow-2xl z-[2147483647] md:hidden animate-in slide-in-from-right flex flex-col"
            style={{ paddingTop: "calc(var(--safe-top, 0px) + 16px)", paddingBottom: "calc(var(--safe-bottom, 0px) + 16px)" }}
            data-testid="mobile-menu-drawer"
            role="dialog"
            aria-label="Menu"
          >
            <div className="flex items-center justify-between px-5 pb-4 border-b border-slate-100">
              <span className="font-display font-bold text-lg" style={{ color: "#025F67" }}>get<span style={{ color: "#2F9D94" }}>amano</span></span>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 active:bg-slate-200"
                aria-label="Close menu"
                style={{ minHeight: 44, minWidth: 44 }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1 scroll-touch">
              <Link to="/search" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-xl text-slate-800 font-medium hover:bg-slate-50 active:bg-slate-100" data-testid="mobile-nav-explore">{t("nav.explore")}</Link>
              <Link to="/comunidad" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-xl text-slate-800 font-medium hover:bg-slate-50 active:bg-slate-100 inline-flex items-center gap-2 w-full" data-testid="mobile-nav-community">
                Comunidad <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              </Link>
              <Link to="/plans" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-xl text-slate-800 font-medium hover:bg-slate-50 active:bg-slate-100">{t("nav.plans")}</Link>
              <button
                onClick={() => { const to = lang === "es" ? "en" : "es"; changeLang(to); trackLanguageSwitch(to); setOpen(false); }}
                className="w-full text-left px-4 py-3 rounded-xl text-slate-800 font-medium hover:bg-slate-50 active:bg-slate-100 inline-flex items-center gap-2"
                data-testid="mobile-lang-toggle"
              >
                <span className="text-lg leading-none">{lang === "es" ? "🇺🇸" : "🇲🇽"}</span>
                <span>{lang === "es" ? "English" : "Español"}</span>
              </button>
              {user ? (
                <>
                  <div className="my-2 h-px bg-slate-100" />
                  <Link to="/messages" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-xl text-slate-800 font-medium hover:bg-slate-50 active:bg-slate-100 inline-flex items-center gap-2 w-full">
                    <MessageCircle className="w-4 h-4" /> Mensajes
                    {unread > 0 && <span className="ml-auto bg-orange-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{unread}</span>}
                  </Link>
                  <Link to="/dashboard" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-xl text-blue-700 font-semibold hover:bg-blue-50 active:bg-blue-100">{t("nav.dashboard")}</Link>
                  <Link to="/profile" onClick={() => setOpen(false)} className="block px-4 py-3 rounded-xl text-slate-800 font-medium hover:bg-slate-50 active:bg-slate-100">Mi perfil</Link>
                </>
              ) : null}
            </nav>
            {!user && (
              <div className="px-3 pt-3 border-t border-slate-100 space-y-2">
                <Link to="/login" onClick={() => setOpen(false)} className="block w-full text-center px-4 py-3 rounded-xl border border-slate-300 text-slate-800 font-semibold hover:bg-slate-50 active:bg-slate-100">{t("nav.login")}</Link>
                <Link to="/register?intent=provider" onClick={() => setOpen(false)} className="block w-full text-center btn-primary" style={{ minHeight: 48 }}>{t("nav.providers")}</Link>
              </div>
            )}
            {user && (
              <div className="px-3 pt-3 border-t border-slate-100">
                <button onClick={() => { handleLogout(); setOpen(false); }} className="w-full text-left px-4 py-3 rounded-xl text-red-600 font-semibold hover:bg-red-50 active:bg-red-100 inline-flex items-center gap-2">
                  <LogOut className="w-4 h-4" /> {t("nav.logout")}
                </button>
              </div>
            )}

            {/* Section 41/1 — Legal footer (Facebook-style) */}
            <div className="px-5 pt-4 pb-1 border-t border-slate-100 mt-2">
              <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
                Esta aplicación opera bajo{" "}
                <span className="font-semibold text-slate-500">Latin Ventures LLC</span>. Todos los derechos reservados © {new Date().getFullYear()}.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1" data-testid="mobile-menu-legal-links">
                <Link to="/terminos" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-teal-600 hover:underline transition-colors">Términos</Link>
                <Link to="/privacidad" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-teal-600 hover:underline transition-colors">Privacidad</Link>
                <Link to="/cookies" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-teal-600 hover:underline transition-colors">Cookies</Link>
                <Link to="/politica-resenas" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-teal-600 hover:underline transition-colors">Reseñas</Link>
              </div>
              <p className="text-[10px] text-slate-300 mt-2">getamano v2.0 · Powered by Latin Ventures LLC</p>
            </div>
          </div>
        </>,
        document.body
      )}
    </header>
  );
}
