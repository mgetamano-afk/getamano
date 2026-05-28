import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { Newspaper, Compass, Trophy, Award, IdCard } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import Header from "./Header";

/**
 * ComunidadLayout — Section 62 + 63 (Navigation consolidation).
 *
 * Persistent wrapper around all /comunidad sub-routes. Renders the global
 * Header once at the top, a SECONDARY pill bar with the comunidad-specific
 * sub-sections (Feed · Explorar · Ranking · eCards · HoF), and the active
 * sub-route via <Outlet />.
 *
 * Section 63 — STICKY tab bar (no auto-hide). Always visible during scroll.
 */
const buildTabs = (lang) => [
  { id: "feed",         label: lang === "en" ? "Feed"        : "Feed",        shortLabel: "Feed",    Icon: Newspaper, path: "/comunidad" },
  { id: "explorar",     label: lang === "en" ? "Explore"     : "Explorar",    shortLabel: lang === "en" ? "Explore" : "Explorar", Icon: Compass,   path: "/comunidad/explorar" },
  { id: "ranking",      label: lang === "en" ? "Ranking"     : "Ranking",     shortLabel: "Ranking", Icon: Trophy,    path: "/comunidad/ranking" },
  { id: "ecards",       label: lang === "en" ? "eCards"      : "eCards",      shortLabel: "eCards",  Icon: IdCard,    path: "/comunidad/ecards" },
  { id: "wall-of-fame", label: lang === "en" ? "Hall of Fame": "Hall of Fame", shortLabel: "HoF",    Icon: Award,     path: "/comunidad/wall-of-fame" },
];

export default function ComunidadLayout() {
  const { lang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollPositions = useRef({});
  const prevPath = useRef(location.pathname);
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

      {/* Section 69 — Sticky tab bar.
          Uses `sticky` (not `fixed`) so the bar stays in the document flow
          and scrolls naturally with the page until it hits the top, then
          locks in place. `top-14 md:top-16` aligns it right under the
          global Header (which is `sticky top-0 z-50`). z-40 keeps it
          below the Header (z-50) but above all page content. */}
      <div
        className="sticky top-14 md:top-16 z-40 bg-white border-b border-slate-200 shadow-sm lg:hidden"
        data-testid="comunidad-tabbar"
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

      {/* Active sub-route content. With the new `sticky` tabbar, the bar
          is part of the flow so we no longer need the 44px top spacer
          that the old `fixed` implementation required. */}
      <div data-testid="comunidad-outlet">
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
