import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Globe, Compass, Briefcase, Trophy, Award } from "lucide-react";
import Header from "./Header";
import useSmartNav from "../hooks/useSmartNav";

/**
 * ComunidadLayout — Section 39 + 41/Correction #2 + 41/Correction #6.
 *
 * Persistent wrapper around all /comunidad sub-routes. Renders the global
 * Header once at the top, a fixed teal tab bar immediately below with the
 * 5 tabs (Comunidad · Explorar · Chambas · Ranking · Hall of Fame), and
 * the active sub-route via <Outlet />.
 *
 * Section 41 changes:
 *  · Tab bar hides on scroll-down + reappears on scroll-up (useSmartNav).
 *  · Labels compacted on mobile so all 5 tabs fit on an iPhone 13/14 (390px)
 *    without horizontal scroll — keeps "Comunidad" always visible.
 */
const COMUNIDAD_TABS = [
  { id: "feed", label: "Comunidad", shortLabel: "Comunidad", Icon: Globe, path: "/comunidad" },
  { id: "explorar", label: "Explorar", shortLabel: "Explorar", Icon: Compass, path: "/comunidad/explorar" },
  { id: "chambas", label: "Chambas", shortLabel: "Chambas", Icon: Briefcase, path: "/comunidad/chambas" },
  { id: "ranking", label: "Ranking", shortLabel: "Ranking", Icon: Trophy, path: "/comunidad/ranking" },
  { id: "wall-of-fame", label: "Hall of Fame", shortLabel: "HoF", Icon: Award, path: "/comunidad/wall-of-fame" },
];

export default function ComunidadLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollPositions = useRef({});
  const prevPath = useRef(location.pathname);
  const navVisible = useSmartNav();

  // Restore / save window scroll per pathname.
  // Tricky: each Outlet swap unmounts the previous sub-route, so when we
  // re-enter a path the document height starts small (skeleton state) and the
  // browser clamps any scrollTo to the current max. We poll a handful of
  // animation frames so the scroll lands once the async content has rendered.
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
    // First attempt at next paint
    const raf = requestAnimationFrame(tryScroll);
    // Then retry on a schedule that covers async data fetches
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

      {/* Fixed tab bar — Section 39 + 41/2 + 41/6.
          Hide-on-scroll-down via useSmartNav. Compact spacing + short
          mobile labels (HoF) so all 5 tabs fit on a 390px iPhone. */}
      <div
        className={`fixed top-14 md:top-20 left-0 right-0 z-30 shadow-sm transition-transform duration-300 ease-in-out ${
          navVisible ? "translate-y-0" : "-translate-y-full"
        }`}
        style={{ background: "#025F67" }}
        data-testid="comunidad-tabbar"
      >
        <nav
          className="max-w-7xl mx-auto px-1 sm:px-4 flex items-center sm:gap-1 justify-between sm:justify-start whitespace-nowrap"
          aria-label="Comunidad navigation"
        >
          {COMUNIDAD_TABS.map((tab) => {
            const isActive = activeTab.id === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.path)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 flex-1 sm:flex-initial px-1.5 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-sm font-semibold transition-all duration-200 border-b-2 ${
                  isActive ? "text-white" : "text-white/65 hover:text-white/90"
                }`}
                style={{ borderColor: isActive ? "#5DCAA5" : "transparent" }}
                data-testid={`comunidad-tab-${tab.id}`}
                aria-current={isActive ? "page" : undefined}
              >
                <tab.Icon className="w-4 h-4 flex-shrink-0" />
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active sub-route content — padded to clear the fixed tabbar.
          Mobile tabbar is 2-line (icon+label stacked) ≈ 56px, desktop is single line ≈ 49px. */}
      <div className="pt-[56px] sm:pt-[49px] min-h-0" data-testid="comunidad-outlet">
        <Outlet />
      </div>
    </div>
  );
}
