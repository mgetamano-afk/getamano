import { useEffect } from "react";
import {
  Home,
  Settings,
  DollarSign,
  Image as ImageIcon,
  Calendar,
  Inbox,
  MessageCircle,
  History,
  IdCard,
  Film,
  Star,
  TrendingUp,
  Bell,
  Award,
  Package,
  BookHeart,
  ShieldCheck,
  Megaphone,
  X,
} from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * ProviderSideNav — V13 redesign (single source of dashboard nav).
 *
 * Replaces both the old desktop-only vertical sidebar AND the horizontal
 * tab strip that used to live in `ProviderDashboard`. Now ONE vertical
 * nav drives the dashboard everywhere:
 *   · Desktop ≥ lg: rendered as a sticky 220-px left rail.
 *   · Mobile  < lg: rendered as a slide-out drawer triggered by the
 *                  hamburger button in the dashboard header (controlled
 *                  by the `mobileOpen` + `onMobileClose` props).
 *
 * Groups (V13 final layout):
 *   DASHBOARD: Inicio · Mi perfil · Mis eCards · Portafolio · Banner Pro · Mis Reels
 *   NEGOCIO  : Analytics · Mensajes · Solicitudes · Citas · Mis tarifas
 *   CRECER   : Destacarme · Referidos · Mi diario · Tarjetas físicas · Preferencias · Verificarme
 *   ADMIN    : Versiones
 *
 * Removed: the horizontal in-page "Suscripción" tab (V12 made it a
 * verification-tier story under "Verificarme").
 */
const GROUPS = [
  {
    id: "dashboard",
    labelEs: "Dashboard",
    labelEn: "Dashboard",
    items: [
      { id: "dashboard",  Icon: Home,        labelEs: "Inicio",      labelEn: "Home" },
      { id: "perfil",     Icon: Settings,    labelEs: "Mi perfil",   labelEn: "My profile" },
      { id: "ecard",      Icon: IdCard,      labelEs: "Mis eCards",  labelEn: "My eCards" },
      { id: "galeria",    Icon: ImageIcon,   labelEs: "Portafolio",  labelEn: "Portfolio" },
      { id: "banner",     Icon: Megaphone,   labelEs: "Banner Pro",  labelEn: "Banner Pro" },
      { id: "reels",      Icon: Film,        labelEs: "Mis Reels",   labelEn: "My Reels" },
    ],
  },
  {
    id: "negocio",
    labelEs: "Negocio",
    labelEn: "Business",
    items: [
      { id: "analytics",   Icon: TrendingUp,    labelEs: "Analytics",    labelEn: "Analytics" },
      { id: "mensajes",    Icon: MessageCircle, labelEs: "Mensajes",     labelEn: "Messages" },
      { id: "solicitudes", Icon: Inbox,         labelEs: "Solicitudes",  labelEn: "Requests" },
      { id: "citas",       Icon: Calendar,      labelEs: "Citas",        labelEn: "Appointments" },
      { id: "tarifas",     Icon: DollarSign,    labelEs: "Mis tarifas",  labelEn: "Pricing" },
    ],
  },
  {
    id: "crecer",
    labelEs: "Crecer",
    labelEn: "Grow",
    items: [
      { id: "destacar",     Icon: Star,        labelEs: "Destacarme",       labelEn: "Feature me" },
      { id: "red",          Icon: Award,       labelEs: "Referidos",        labelEn: "Referrals" },
      { id: "diario",       Icon: BookHeart,   labelEs: "Mi diario",        labelEn: "My diary" },
      { id: "tarjetas",     Icon: Package,     labelEs: "Tarjetas físicas", labelEn: "Physical cards" },
      { id: "preferencias", Icon: Bell,        labelEs: "Preferencias",     labelEn: "Preferences" },
      { id: "verificarme",  Icon: ShieldCheck, labelEs: "Verificarme",      labelEn: "Get verified" },
    ],
  },
  {
    id: "admin",
    labelEs: "Admin",
    labelEn: "Admin",
    items: [
      { id: "versiones", Icon: History, labelEs: "Versiones", labelEn: "Versions" },
    ],
  },
];

function NavContent({ tab, onChange, unreadMessages, pendingRequests, lang, onItemClick }) {
  return (
    <nav data-testid="provider-sidenav-content">
      {GROUPS.map((group, gIdx) => (
        <div
          key={group.id}
          className={`provider-sidenav-group ${gIdx === 0 ? "" : "border-t border-slate-100 mt-2 pt-2"}`}
          style={{ animationDelay: `${gIdx * 60}ms` }}
        >
          <p
            className="px-4 pt-1 pb-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-400"
            data-testid={`provider-sidenav-group-${group.id}`}
          >
            {lang === "en" ? group.labelEn : group.labelEs}
          </p>
          <ul className="space-y-0.5 px-2">
            {group.items.map((item, iIdx) => {
              const Icon = item.Icon;
              const active = tab === item.id;
              const badge =
                item.id === "mensajes" ? unreadMessages :
                item.id === "solicitudes" ? pendingRequests : 0;
              return (
                <li key={item.id} className="provider-sidenav-item" style={{ animationDelay: `${gIdx * 60 + iIdx * 30}ms` }}>
                  <button
                    type="button"
                    onClick={() => { onChange(item.id); onItemClick?.(); }}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all duration-200 group relative overflow-hidden ${
                      active
                        ? "bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 ring-1 ring-teal-100 shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:translate-x-0.5"
                    }`}
                    data-testid={`provider-sidenav-${item.id}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-teal-500" aria-hidden="true" />
                    )}
                    <Icon
                      className={`w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200 ${active ? "scale-110" : "text-slate-400 group-hover:text-slate-700 group-hover:scale-105"}`}
                      strokeWidth={active ? 2.5 : 2}
                    />
                    <span className="flex-1 truncate">{lang === "en" ? item.labelEn : item.labelEs}</span>
                    {badge > 0 && (
                      <span
                        className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse"
                        data-testid={`provider-sidenav-${item.id}-badge`}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function ProviderSideNav({
  tab,
  onChange,
  unreadMessages = 0,
  pendingRequests = 0,
  mobileOpen = false,
  onMobileClose,
}) {
  const { lang } = useI18n();

  // Lock body scroll while the mobile drawer is open so the underlying
  // dashboard doesn't scroll behind the drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop rail (≥ lg). */}
      <aside
        className="bg-white rounded-2xl border border-slate-200 shadow-sm sticky top-20 h-[fit-content] py-3 hidden lg:block"
        data-testid="provider-sidenav"
        aria-label="Provider navigation"
      >
        <NavContent
          tab={tab}
          onChange={onChange}
          unreadMessages={unreadMessages}
          pendingRequests={pendingRequests}
          lang={lang}
        />
      </aside>

      {/* Mobile drawer (< lg). Triggered by the dashboard header's
          hamburger; backdrop closes on tap. */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-300 ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
        data-testid="provider-sidenav-mobile-overlay"
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onMobileClose}
        />
        <aside
          className={`absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-white shadow-2xl py-3 overflow-y-auto transition-transform duration-300 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          data-testid="provider-sidenav-mobile"
          aria-label="Provider navigation (mobile)"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 mb-2">
            <span className="font-display font-bold text-base text-slate-900">Dashboard</span>
            <button
              type="button"
              onClick={onMobileClose}
              className="p-2 rounded-full hover:bg-slate-100 transition"
              aria-label="Close menu"
              data-testid="provider-sidenav-mobile-close"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <NavContent
            tab={tab}
            onChange={onChange}
            unreadMessages={unreadMessages}
            pendingRequests={pendingRequests}
            lang={lang}
            onItemClick={onMobileClose}
          />
        </aside>
      </div>

      {/* Stagger-fade keyframes (scoped via class name to keep CSS small). */}
      <style>{`
        .provider-sidenav-group { animation: provSidenavFade 320ms ease-out both; }
        .provider-sidenav-item { animation: provSidenavSlide 280ms ease-out both; }
        @keyframes provSidenavFade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes provSidenavSlide {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
