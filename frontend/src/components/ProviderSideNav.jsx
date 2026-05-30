import {
  Home,
  Settings,
  DollarSign,
  Image as ImageIcon,
  Sparkles,
  Calendar,
  Inbox,
  MessageCircle,
  Users,
  History,
  IdCard,
  Film,
  Briefcase,
  Star,
  TrendingUp,
  Bell,
  Award,
  Package,
} from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * ProviderSideNav — Section 64 (V7 rebuild).
 *
 * Grouped vertical sidebar for the provider dashboard. The four groups
 * (`Dashboard`, `Negocio`, `Crecer`, `Admin`) align with the V7 prompt
 * brief so the provider mental model maps 1:1 to the chrome.
 *
 * Props:
 *   tab: current selected tab id
 *   onChange(tab): callback when user clicks an item
 *   unreadMessages: badge for the "mensajes" item
 *   pendingRequests: badge for the "solicitudes" item
 *
 * NOTE: badges render ONLY when their value > 0. Tests that look for
 * `provider-sidenav-{id}-badge` must guard for absence at 0.
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
      { id: "destacar",    Icon: Star,    labelEs: "Destacarme",      labelEn: "Feature me" },
      { id: "red",         Icon: Award,   labelEs: "Referidos",       labelEn: "Referrals" },
      { id: "tarjetas",    Icon: Package, labelEs: "Tarjetas físicas", labelEn: "Physical cards" },
      { id: "preferencias", Icon: Bell,    labelEs: "Preferencias",    labelEn: "Preferences" },
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

export default function ProviderSideNav({ tab, onChange, unreadMessages = 0, pendingRequests = 0 }) {
  const { lang } = useI18n();
  return (
    <aside
      className="bg-white rounded-2xl border border-slate-200 shadow-sm sticky top-20 h-[fit-content] py-3"
      data-testid="provider-sidenav"
      aria-label="Provider navigation"
    >
      <nav>
        {GROUPS.map((group, gIdx) => (
          <div key={group.id} className={gIdx === 0 ? "" : "border-t border-slate-100 mt-2 pt-2"}>
            <p className="px-4 pt-1 pb-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-400" data-testid={`provider-sidenav-group-${group.id}`}>
              {lang === "en" ? group.labelEn : group.labelEs}
            </p>
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const Icon = item.Icon;
                const active = tab === item.id;
                const badge =
                  item.id === "mensajes" ? unreadMessages :
                  item.id === "solicitudes" ? pendingRequests : 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onChange(item.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-semibold transition group ${
                        active
                          ? "bg-teal-50 text-teal-700 ring-1 ring-teal-100"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                      data-testid={`provider-sidenav-${item.id}`}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon
                        className={`w-[18px] h-[18px] flex-shrink-0 transition ${active ? "" : "text-slate-400 group-hover:text-slate-700"}`}
                        strokeWidth={active ? 2.5 : 2}
                      />
                      <span className="flex-1 truncate">{lang === "en" ? item.labelEn : item.labelEs}</span>
                      {badge > 0 && (
                        <span
                          className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold"
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
    </aside>
  );
}
