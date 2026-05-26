import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { Newspaper, Compass, Trophy, Award } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import Header from "./Header";
import useSmartNav from "../hooks/useSmartNav";

/**
 * ComunidadLayout — Section 62 (Navigation consolidation).
 *
 * Persistent wrapper around all /comunidad sub-routes. Renders the global
 * Header once at the top, a SECONDARY pill bar with the comunidad-specific
 * sub-sections (Feed · Explorar · Ranking · HoF), and the active sub-route
 * via <Outlet />.
 *
 * Section 62 — UX consolidation:
 *  · Removed "Chambas" tab (was duplicating "Gigs" already present in BottomNav).
 *  · Renamed "Comunidad" → "Feed" (the dedicated comunidad-section namespace).
 *  · Visual: lighter (white + bottom border) instead of solid teal block.
 *  · Behavior: hides on scroll-down via useSmartNav (no longer permanently
 *    static); reappears on scroll-up.
 */
const buildTabs = (lang) => [
  { id: "feed",         label: lang === "en" ? "Feed"        : "Feed",        shortLabel: "Feed",    Icon: Newspaper, path: "/comunidad" },
  { id: "explorar",     label: lang === "en" ? "Explore"     : "Explorar",    shortLabel: lang === "en" ? "Explore" : "Explorar", Icon: Compass,   path: "/comunidad/explorar" },
  { id: "ranking",      label: lang === "en" ? "Ranking"     : "Ranking",     shortLabel: "Ranking", Icon: Trophy,    path: "/comunidad/ranking" },
  { id: "wall-of-fame", label: lang === "en" ? "Hall of Fame": "Hall of Fame", shortLabel: "HoF",    Icon: Award,     path: "/comunidad/wall-of-fame" },
];

export default function ComunidadLayout() {
  const { lang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollPositions = useRef({});
  const prevPath = useRef(location.pathname);
  const isVisible = useSmartNav();
  const COMUNIDAD_TABS = buildTabs(lang);

  // Restore / save window scroll per pathname (unchanged from before).
  useEffect(() => {
    scrollPositions.current[prevPath.current] = window.scrollY;
    const saved = scrollPositions.current[location.pathname] ?? 0;
    let cancelled = false;
    const attempts = [50, 200, 500, 900, 1400];
    const timers = [];
    const tryScroll = () => {
      if (cancelled || saved <= 0) return;
      window.scrollTo({ top: saved, left: 0, behavior: "auto" });
    };
    const raf = requestAnimationFrame(tryScroll);
    attempts.forEach((ms) => {
      timers.push(setTimeout(() => {
        if (cancelled) return;
        if (Math.abs(window.scrollY - saved) > 4) tryScroll();
      }, ms));
    });
    prevPath.current = location.pathname;
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      timers.forEach((t) => clearTimeout(t));
    };
  }, [location.pathname]);

  const activeTab =
    COMUNIDAD_TABS.find((tab) => tab.path === location.pathname) ?? COMUNIDAD_TABS[0];

  return (
    <div className="min-h-screen bg-slate-50" data-testid="comunidad-layout">
      <Header />

      {/* Section 62 — Slim pill bar on mobile/tablet only; hidden on desktop (LeftNav takes over). Auto-hides on scroll down. */}
      <div
        className={`fixed top-14 md:top-20 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 transition-transform duration-300 lg:hidden ${
          isVisible ? "translate-y-0" : "-translate-y-full"
        }`}
        data-testid="comunidad-tabbar"
        aria-hidden={!isVisible}
      >
        <nav
          className="max-w-7xl mx-auto px-2 sm:px-4 flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none"
          aria-label="Comunidad navigation"
        >
          {COMUNIDAD_TABS.map((tab) => {
            const isActive = activeTab.id === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.path)}
                className={`relative flex items-center gap-1.5 px-3 sm:px-4 h-11 text-xs sm:text-sm font-semibold transition-colors duration-200 whitespace-nowrap flex-shrink-0 ${
                  isActive ? "text-teal-700" : "text-slate-500 hover:text-slate-800"
                }`}
                data-testid={`comunidad-tab-${tab.id}`}
                aria-current={isActive ? "page" : undefined}
              >
                <tab.Icon className={`w-4 h-4 ${isActive ? "text-teal-600" : "text-slate-400"}`} strokeWidth={isActive ? 2.5 : 2} />
                <span>{tab.shortLabel}</span>
                {isActive && (
                  <span
                    className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full"
                    style={{ background: "linear-gradient(90deg, #2F9D94, #14B8A6)" }}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active sub-route content — padded only on mobile/tablet to clear the slim 44px tabbar */}
      <div className="pt-[44px] lg:pt-0" data-testid="comunidad-outlet">
        <div className="container mx-auto px-0 lg:px-4">
          <div className="lg:flex lg:gap-6 lg:max-w-7xl lg:mx-auto">
            {/* Desktop LeftNav (Section 62) — replaces the old in-page LeftNav */}
            <aside className="hidden lg:block lg:w-56 lg:flex-shrink-0 lg:pt-6" data-testid="comunidad-leftnav">
              <nav className="sticky top-24 space-y-1">
                {COMUNIDAD_TABS.map((tab) => {
                  const isActive = activeTab.id === tab.id;
                  return (
                    <Link
                      key={tab.id}
                      to={tab.path}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? "bg-teal-50 text-teal-700 shadow-sm"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                      data-testid={`comunidad-nav-${tab.id === "feed" ? "feed" : tab.id === "wall-of-fame" ? "wall" : tab.id}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <tab.Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-teal-600" : "text-slate-400"}`} strokeWidth={isActive ? 2.5 : 2} />
                      <span>{tab.label}</span>
                      {isActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-500" aria-hidden="true" />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </aside>

            {/* Main column */}
            <div className="flex-1 min-w-0">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
