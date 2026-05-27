import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Search,
  HeartHandshake,
  User,
  Briefcase,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import useSmartNav from "../hooks/useSmartNav";

/**
 * BottomNav — Section 63 (Universal footer navigation).
 *
 * The PRIMARY navigation of the app. Sits sticky at the bottom on all
 * screen sizes. Consolidates the most important destinations from the
 * old Header, ComunidadLayout, and ProviderLeftNav menus into ONE place.
 *
 * Layout:
 *   · Mobile (<768px) — 5 items, icon + tiny label, grid-cols-5
 *   · Tablet (≥768px) — 6-8 items, icon + label, evenly distributed
 *   · Desktop (≥1024px) — same as tablet, capped at ~7xl max width
 *
 * Items adapt to user role:
 *   · Guest               → Inicio · Buscar · Galería · Comunidad · Entrar
 *   · Client (logged in)  → Inicio · Buscar · Comunidad · Chambas · Mi cuenta
 *   · Provider (logged)   → Panel · Mensajes · Comunidad · Galería · Mi negocio
 *
 * Hidden on /admin/* (admin uses its own sidebar) and on auth screens.
 * Auto-hides on scroll-down via useSmartNav (mimic Instagram).
 */
export default function BottomNav() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [tappingPath, setTappingPath] = useState("");
  const smartVisible = useSmartNav();

  // Refresh unread badge on path change.
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    api.get("/conversations").then(r => {
      setUnread((r.data || []).filter(c => c.unread).length);
    }).catch(() => {});
  }, [user, location.pathname]);

  // Detect Android virtual keyboard.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const initialH = window.innerHeight;
    const handler = () => {
      const ratio = window.innerHeight / Math.max(window.screen.height, initialH);
      setKeyboardOpen(ratio < 0.75);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Toggle body class so global CSS can reserve bottom padding.
  const HIDDEN_PATHS = ["/login", "/register", "/registro", "/verificar-correo", "/verify-email", "/forgot-password", "/reset-password"];
  const isHidden = location.pathname.startsWith("/admin")
    || HIDDEN_PATHS.some(p => location.pathname.startsWith(p))
    || keyboardOpen;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("has-bottom-nav", !isHidden);
    return () => { document.body.classList.remove("has-bottom-nav"); };
  }, [isHidden]);

  if (isHidden) return null;

  const pathname = location.pathname;
  const isActive = (path) => {
    if (path === "/") return pathname === "/";
    if (path === "/dashboard") return pathname.startsWith("/dashboard");
    if (path === "/comunidad") return pathname.startsWith("/comunidad") || pathname.startsWith("/community");
    if (path === "/search") return pathname.startsWith("/search") || pathname.startsWith("/buscar");
    if (path === "/empleos") return pathname.startsWith("/empleos") || pathname.startsWith("/gigs");
    if (path === "/galeria-banners") return pathname.startsWith("/galeria-banners") || pathname.startsWith("/banner-gallery");
    if (path === "/mis-guardadas") return pathname.startsWith("/mis-guardadas") || pathname.startsWith("/my-saved");
    if (path === "/plans") return pathname.startsWith("/plans");
    if (path === "/messages") return pathname.startsWith("/messages");
    return pathname.startsWith(path);
  };

  // Build items per user role. Each item: {path, icon, label, testid, badge?, animate?}
  // Section 61 Bug B6: EXACTLY 5 items, identical on mobile and desktop.
  // Secondary destinations (Gallery, Plans, Saved, Inbox) live inside "Mi cuenta".
  let items;
  if (!user) {
    items = [
      { path: "/",          icon: Home,            label: lang === "en" ? "Home"      : "Inicio",    testid: "bottom-nav-home" },
      { path: "/search",    icon: Search,          label: lang === "en" ? "Search"    : "Buscar",    testid: "bottom-nav-search" },
      { path: "/comunidad", icon: HeartHandshake,  label: lang === "en" ? "Community" : "Comunidad", testid: "bottom-nav-community", animate: "heartbeat" },
      { path: "/empleos",   icon: Briefcase,       label: lang === "en" ? "Jobs"      : "Chambas",   testid: "bottom-nav-empleos" },
      { path: "/login",     icon: User,            label: lang === "en" ? "Account"   : "Mi cuenta", testid: "bottom-nav-account" },
    ];
  } else if (user.role === "provider") {
    items = [
      { path: "/",                   icon: Home,            label: lang === "en" ? "Home"      : "Inicio",    testid: "bottom-nav-home" },
      { path: "/search",             icon: Search,          label: lang === "en" ? "Search"    : "Buscar",    testid: "bottom-nav-search" },
      { path: "/comunidad",          icon: HeartHandshake,  label: lang === "en" ? "Community" : "Comunidad", testid: "bottom-nav-community", animate: "heartbeat" },
      { path: "/empleos",            icon: Briefcase,       label: lang === "en" ? "Jobs"      : "Chambas",   testid: "bottom-nav-empleos" },
      { path: "/dashboard/provider", icon: User,            label: lang === "en" ? "Account"   : "Mi cuenta", testid: "bottom-nav-account", badge: unread },
    ];
  } else {
    items = [
      { path: "/",                   icon: Home,            label: lang === "en" ? "Home"      : "Inicio",    testid: "bottom-nav-home" },
      { path: "/search",             icon: Search,          label: lang === "en" ? "Search"    : "Buscar",    testid: "bottom-nav-search" },
      { path: "/comunidad",          icon: HeartHandshake,  label: lang === "en" ? "Community" : "Comunidad", testid: "bottom-nav-community", animate: "heartbeat" },
      { path: "/empleos",            icon: Briefcase,       label: lang === "en" ? "Jobs"      : "Chambas",   testid: "bottom-nav-empleos" },
      { path: "/dashboard",          icon: User,            label: lang === "en" ? "Account"   : "Mi cuenta", testid: "bottom-nav-account", badge: unread },
    ];
  }

  // EXACTLY 5 items everywhere — no mobile/desktop split.
  const allItems = items.slice(0, 5);

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 transition-transform duration-300 ease-in-out ${smartVisible ? "translate-y-0" : "translate-y-full"}`}
      style={{ paddingBottom: "var(--safe-bottom, 0px)" }}
      data-testid="bottom-nav"
      aria-label="Primary navigation"
    >
      {/* Mobile (<md): 5-column grid */}
      <ul className="md:hidden grid grid-cols-5 h-14">
        {allItems.map((item) => renderItem(item, isActive, tappingPath, setTappingPath, /* compact */ true))}
      </ul>

      {/* Tablet & desktop (≥md): centered horizontal row with the SAME 5 items */}
      <ul className="hidden md:flex items-center justify-center gap-1 lg:gap-3 max-w-7xl mx-auto h-16 px-4">
        {allItems.map((item) => renderItem(item, isActive, tappingPath, setTappingPath, /* compact */ false))}
      </ul>
    </nav>
  );
}

function renderItem(item, isActive, tappingPath, setTappingPath, compact) {
  const Icon = item.icon;
  const active = isActive(item.path);
  const tapping = tappingPath === item.path;
  const handleTap = () => {
    if (item.animate === "heartbeat") {
      setTappingPath(item.path);
      setTimeout(() => setTappingPath(""), 600);
    }
  };

  // Compact (mobile) variant — grid cell with tiny label below icon.
  if (compact) {
    return (
      <li key={item.path} className="flex">
        <Link
          to={item.path}
          onClick={handleTap}
          className="relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-slate-100"
          style={{ minHeight: 44 }}
          data-testid={item.testid}
          aria-current={active ? "page" : undefined}
        >
          <span className="relative">
            <Icon
              className={`w-5 h-5 transition-colors gtm-nav-icon ${tapping ? "tapping" : ""}`}
              style={{ color: active ? "#025F67" : "#64748B" }}
              strokeWidth={active ? 2.5 : 2}
            />
            {item.badge > 0 && (
              <span
                className="absolute -top-1.5 -right-2 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-white text-[10px] font-bold leading-none ring-2 ring-white"
                style={{ background: "#FF6B2C" }}
                data-testid={`${item.testid}-badge`}
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </span>
          <span
            className={`text-[10px] font-medium leading-none tracking-tight gtm-nav-label ${tapping ? "tapping" : ""}`}
            style={{ color: active ? "#025F67" : "#64748B" }}
          >
            {item.label}
          </span>
          {active && (
            <span
              className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
              style={{ background: "#025F67" }}
            />
          )}
        </Link>
      </li>
    );
  }

  // Desktop variant — pill with icon + label side-by-side.
  return (
    <li key={item.path}>
      <Link
        to={item.path}
        onClick={handleTap}
        className={`relative inline-flex items-center gap-2 px-3 lg:px-4 h-11 rounded-full text-sm font-semibold transition-all ${
          active
            ? "bg-teal-50 text-teal-700 shadow-sm"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
        data-testid={`${item.testid}-desktop`}
        aria-current={active ? "page" : undefined}
      >
        <span className="relative">
          <Icon
            className={`w-5 h-5 transition-colors gtm-nav-icon ${tapping ? "tapping" : ""}`}
            strokeWidth={active ? 2.5 : 2}
          />
          {item.badge > 0 && (
            <span
              className="absolute -top-1.5 -right-2 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-white text-[10px] font-bold leading-none ring-2 ring-white"
              style={{ background: "#FF6B2C" }}
              data-testid={`${item.testid}-desktop-badge`}
            >
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </span>
        <span className="whitespace-nowrap">{item.label}</span>
      </Link>
    </li>
  );
}
