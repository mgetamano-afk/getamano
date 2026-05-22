import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Search, MessageCircle, User, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";

/**
 * BottomNav — mobile-only sticky bottom navigation.
 *
 * Shown when:
 *   - User is logged in
 *   - Viewport < 768px
 *   - Not on /admin/* (admins use their own sidebar)
 *   - Not when virtual keyboard is detected open
 *
 * Respects iOS safe-area-inset-bottom (home indicator on Face ID iPhones).
 */
const STORAGE_KEY = "getamano_bottom_nav_hidden_paths";

export default function BottomNav() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Refresh unread badge whenever path changes (lightweight)
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    api.get("/conversations").then(r => {
      setUnread((r.data || []).filter(c => c.unread).length);
    }).catch(() => {});
  }, [user, location.pathname]);

  // Detect virtual keyboard on Android (Android resizes the visual viewport
  // when the keyboard opens). iOS doesn't resize so this is a no-op there.
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

  // Toggle a body class so global CSS can leave room for the nav (avoids
  // bottom content being hidden behind it on long pages).
  const navVisible = !!user && !location.pathname.startsWith("/admin") && !keyboardOpen;
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("has-bottom-nav", navVisible);
    return () => { document.body.classList.remove("has-bottom-nav"); };
  }, [navVisible]);

  if (!user) return null;
  if (location.pathname.startsWith("/admin")) return null;
  if (keyboardOpen) return null;

  const pathname = location.pathname;
  const isActive = (path) => {
    if (path === "/") return pathname === "/";
    if (path === "/dashboard") return pathname.startsWith("/dashboard");
    if (path === "/messages") return pathname.startsWith("/messages");
    if (path === "/search") return pathname.startsWith("/search") || pathname.startsWith("/buscar");
    if (path === "/profile") return pathname.startsWith("/profile");
    return pathname.startsWith(path);
  };

  const items = [
    { path: "/", icon: Home, label: lang === "en" ? "Home" : "Inicio", testid: "bottom-nav-home" },
    { path: "/search", icon: Search, label: lang === "en" ? "Search" : "Buscar", testid: "bottom-nav-search" },
    { path: "/dashboard", icon: Sparkles, label: lang === "en" ? "Dashboard" : "Panel", testid: "bottom-nav-dashboard" },
    { path: "/messages", icon: MessageCircle, label: lang === "en" ? "Inbox" : "Mensajes", badge: unread, testid: "bottom-nav-messages" },
    { path: "/profile", icon: User, label: lang === "en" ? "Profile" : "Perfil", testid: "bottom-nav-profile" },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200"
      style={{ paddingBottom: "var(--safe-bottom, 0px)" }}
      data-testid="bottom-nav"
      aria-label="Mobile navigation"
    >
      <ul className="grid grid-cols-5 h-14">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <li key={item.path} className="flex">
              <Link
                to={item.path}
                className="relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-slate-100"
                style={{ minHeight: 44 }}
                data-testid={item.testid}
                aria-current={active ? "page" : undefined}
              >
                <span className="relative">
                  <Icon
                    className={`w-5 h-5 transition-colors ${active ? "" : ""}`}
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
                  className="text-[10px] font-medium leading-none tracking-tight"
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
        })}
      </ul>
    </nav>
  );
}
