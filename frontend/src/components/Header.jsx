import BrandMark from "./BrandMark";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { LogOut, Menu, X, User as UserIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import NotificationBell from "./NotificationBell";
import useSmartNav from "../hooks/useSmartNav";
import { trackLanguageSwitch } from "../lib/analytics";

/**
 * Header — Section 63 (minimal identity bar).
 *
 * After consolidating navigation into BottomNav, the Header only carries:
 *  · Logo + brand
 *  · Language toggle (ES/EN)
 *  · Notification bell (logged-in users)
 *  · Avatar with name → links to dashboard (logged-in)
 *  · Sign-in CTA (guests)
 *
 * All destination links (Explorar, Comunidad, Chambas, Galería, Planes,
 * Guardadas, Mensajes, Mi cuenta) live in BottomNav. The mobile drawer is
 * preserved for SECONDARY actions only: language switch, profile, logout
 * and legal links. Primary destinations are NOT duplicated here.
 */
export default function Header() {
  const { user, logout } = useAuth();
  const { t, lang, changeLang } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const navVisible = useSmartNav();

  const firstName = (user?.name || "").trim().split(/\s+/)[0]
    || (user?.email || "").split("@")[0]
    || t("nav.dashboard");
  const dashboardPath = user?.role === "provider"
    ? "/dashboard/provider"
    : user?.role === "admin"
    ? "/admin"
    : "/dashboard/client";
  const initials = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

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

  const toggleLang = () => {
    const to = lang === "es" ? "en" : "es";
    changeLang(to);
    trackLanguageSwitch(to);
  };

  return (
    <header
      className={`glass-header sticky top-0 z-50 transition-transform duration-300 ease-in-out ${navVisible || open ? "translate-y-0" : "-translate-y-full"}`}
      style={{ paddingTop: "var(--safe-top, 0px)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 md:h-16">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2 min-w-0" data-testid="header-logo-link" aria-label="getamano home">
            <BrandMark size="md" className="w-9 h-9 md:w-10 md:h-10" alt="" />
            <span className="font-display font-bold text-lg md:text-xl truncate" style={{ color: "#03045E" }}>
              get<span style={{ color: "#0077B6" }}>amano</span>
            </span>
          </Link>

          {/* Right cluster — identity only */}
          <div className="flex items-center gap-1 md:gap-2">
            <button
              type="button"
              onClick={toggleLang}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 rounded-full hover:bg-slate-100"
              data-testid="lang-toggle"
              title={lang === "es" ? "Switch to English" : "Cambiar a Español"}
            >
              {/* Section 68 / I2 — show DESTINATION language, not current.
                  A user reading Spanish should see the EN target so they
                  understand what clicking will switch them to. */}
              <span className="text-base leading-none">{lang === "es" ? "🇺🇸" : "🇲🇽"}</span>
              <span className="text-xs uppercase tracking-wide">{lang === "es" ? "EN" : "ES"}</span>
            </button>

            {user ? (
              <>
                <NotificationBell />
                <Link
                  to={dashboardPath}
                  className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition"
                  data-testid="nav-dashboard"
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: user.role === "provider" ? "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" : "linear-gradient(135deg, #F97316 0%, #FB923C 100%)" }}
                    aria-hidden="true"
                  >
                    {user.role === "provider" ? "⚙" : initials}
                  </span>
                  <span className="text-sm font-semibold text-slate-700 max-w-[140px] truncate">{firstName}</span>
                </Link>
              </>
            ) : (
              <Link to="/login" className="hidden sm:inline-flex btn-outline" data-testid="nav-login">
                {t("nav.login")}
              </Link>
            )}

            {/* Mobile drawer toggle — secondary actions only */}
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="sm:hidden p-2.5 -mr-2 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition"
              data-testid="mobile-menu-toggle"
              aria-label={open ? "Close menu" : "Open menu"}
              style={{ minHeight: 44, minWidth: 44 }}
            >
              {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer — SECONDARY actions only (lang, profile, logout, legal). */}
      {open && createPortal(
        <>
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-[2147483646] sm:hidden animate-in fade-in"
            onClick={() => setOpen(false)}
            data-testid="mobile-menu-backdrop"
            aria-hidden="true"
          />
          <div
            className="fixed top-0 right-0 bottom-0 w-[85%] max-w-sm bg-white shadow-2xl z-[2147483647] sm:hidden animate-in slide-in-from-right flex flex-col"
            style={{ paddingTop: "calc(var(--safe-top, 0px) + 16px)", paddingBottom: "calc(var(--safe-bottom, 0px) + 16px)" }}
            data-testid="mobile-menu-drawer"
            role="dialog"
            aria-label="Menu"
          >
            <div className="flex items-center justify-between px-5 pb-4 border-b border-slate-100">
              <span className="font-display font-bold text-lg" style={{ color: "#03045E" }}>
                get<span style={{ color: "#0077B6" }}>amano</span>
              </span>
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
              <button
                onClick={() => { toggleLang(); setOpen(false); }}
                className="w-full text-left px-4 py-3 rounded-xl text-slate-800 font-medium hover:bg-slate-50 active:bg-slate-100 inline-flex items-center gap-2"
                data-testid="mobile-lang-toggle"
              >
                <span className="text-lg leading-none">{lang === "es" ? "🇺🇸" : "🇲🇽"}</span>
                <span>{lang === "es" ? "English" : "Español"}</span>
              </button>

              {user ? (
                <>
                  <div className="my-2 h-px bg-slate-100" />
                  <Link
                    to={dashboardPath}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-blue-700 font-semibold hover:bg-blue-50 active:bg-blue-100"
                    data-testid="mobile-nav-dashboard"
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: user.role === "provider" ? "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" : "linear-gradient(135deg, #F97316 0%, #FB923C 100%)" }}
                      aria-hidden="true"
                    >
                      {user.role === "provider" ? "⚙" : initials}
                    </span>
                    <span className="truncate">{firstName}</span>
                  </Link>
                  <Link
                    to="/profile"
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 rounded-xl text-slate-800 font-medium hover:bg-slate-50 active:bg-slate-100 inline-flex items-center gap-2 w-full"
                    data-testid="mobile-nav-profile"
                  >
                    <UserIcon className="w-4 h-4" /> {lang === "en" ? "My profile" : "Mi perfil"}
                  </Link>
                </>
              ) : (
                <>
                  <div className="my-2 h-px bg-slate-100" />
                  <Link to="/login" onClick={() => setOpen(false)} className="block w-full text-center px-4 py-3 rounded-xl border border-slate-300 text-slate-800 font-semibold hover:bg-slate-50 active:bg-slate-100" data-testid="mobile-nav-login">
                    {t("nav.login")}
                  </Link>
                  <Link to="/register?role=provider" onClick={() => setOpen(false)} className="block w-full text-center btn-primary" style={{ minHeight: 48 }} data-testid="mobile-nav-register">
                    {t("nav.providers")}
                  </Link>
                </>
              )}
            </nav>

            {user && (
              <div className="px-3 pt-3 border-t border-slate-100">
                <button onClick={() => { handleLogout(); setOpen(false); }} className="w-full text-left px-4 py-3 rounded-xl text-red-600 font-semibold hover:bg-red-50 active:bg-red-100 inline-flex items-center gap-2" data-testid="mobile-nav-logout">
                  <LogOut className="w-4 h-4" /> {t("nav.logout")}
                </button>
              </div>
            )}

            {/* Legal footer */}
            <div className="px-5 pt-4 pb-1 border-t border-slate-100 mt-2">
              <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
                Esta aplicación opera bajo{" "}
                <span className="font-semibold text-slate-500">Latin Ventures LLC</span>. Todos los derechos reservados © {new Date().getFullYear()}.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1" data-testid="mobile-menu-legal-links">
                <Link to="/terminos" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-[#0077B6] hover:underline transition-colors">Términos</Link>
                <Link to="/privacidad" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-[#0077B6] hover:underline transition-colors">Privacidad</Link>
                <Link to="/cookies" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-[#0077B6] hover:underline transition-colors">Cookies</Link>
                <Link to="/politica-resenas" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-[#0077B6] hover:underline transition-colors">Reseñas</Link>
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
