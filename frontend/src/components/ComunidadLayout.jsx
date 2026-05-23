import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Globe, Compass, Briefcase, Trophy, Award } from "lucide-react";
import Header from "./Header";

/**
 * ComunidadLayout — Section 39.
 *
 * Persistent wrapper around all /comunidad sub-routes. Renders the global
 * Header once at the top, a sticky teal tab bar with 5 tabs immediately
 * below, and the active sub-route via <Outlet />. The tab bar never
 * unmounts while the user is anywhere inside /comunidad/*.
 *
 * Scroll position is remembered per pathname so switching back and forth
 * between Comunidad and Ranking restores the user's previous position.
 */
const COMUNIDAD_TABS = [
  { id: "feed", label: "Comunidad", Icon: Globe, path: "/comunidad" },
  { id: "explorar", label: "Explorar", Icon: Compass, path: "/comunidad/explorar" },
  { id: "chambas", label: "Chambas", Icon: Briefcase, path: "/comunidad/chambas" },
  { id: "ranking", label: "Ranking", Icon: Trophy, path: "/comunidad/ranking" },
  { id: "wall-of-fame", label: "Hall of Fame", Icon: Award, path: "/comunidad/wall-of-fame" },
];

export default function ComunidadLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollPositions = useRef({});
  const prevPath = useRef(location.pathname);

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

      {/* Fixed tab bar — Section 39.
          Sticky positioning breaks under our root `.App { overflow-x: hidden }`
          rule on some Chrome/iOS Safari builds, so we use `position: fixed`
          anchored directly below the Header (h-14 mobile / h-20 desktop) and
          push the outlet content down with a matching padding-top. */}
      <div
        className="fixed top-14 md:top-20 left-0 right-0 z-30 shadow-sm"
        style={{ background: "#025F67" }}
        data-testid="comunidad-tabbar"
      >
        <nav
          className="max-w-7xl mx-auto px-2 sm:px-4 flex items-center gap-1 overflow-x-auto scrollbar-none"
          aria-label="Comunidad navigation"
        >
          {COMUNIDAD_TABS.map((tab) => {
            const isActive = activeTab.id === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.path)}
                className={`flex items-center gap-1.5 flex-shrink-0 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold transition-all duration-200 border-b-2 whitespace-nowrap ${
                  isActive
                    ? "text-white"
                    : "text-white/60 hover:text-white/90"
                }`}
                style={{ borderColor: isActive ? "#5DCAA5" : "transparent" }}
                data-testid={`comunidad-tab-${tab.id}`}
                aria-current={isActive ? "page" : undefined}
              >
                <tab.Icon className="w-4 h-4 flex-shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active sub-route content — padded to clear the fixed tabbar (~49px) */}
      <div className="pt-[49px] min-h-0" data-testid="comunidad-outlet">
        <Outlet />
      </div>
    </div>
  );
}
