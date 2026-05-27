import {
  Home,
  Settings,
  DollarSign,
  Image as ImageIcon,
  Sparkles,
  Calendar,
  Inbox,
  MessageCircle,
} from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * ProviderSideNav — Section 64.
 *
 * Vertical left sidebar for the provider dashboard. Renders 8 navigation
 * items: Inicio (overview) + 7 functional tabs. Always visible on lg+;
 * collapses to icon-only on smaller widths (controlled by parent class).
 *
 * Props:
 *   tab: current selected tab id ("dashboard" | "perfil" | "tarifas" | "galeria" |
 *        "banner" | "citas" | "solicitudes" | "mensajes")
 *   onChange(tab): callback when user clicks an item
 *   unreadMessages: badge for the "mensajes" item
 *   pendingRequests: badge for the "solicitudes" item
 *   onSignOut(): optional, sign out CTA at the bottom
 */
const ITEMS = [
  { id: "dashboard",   Icon: Home,           labelEs: "Inicio",       labelEn: "Home" },
  { id: "perfil",      Icon: Settings,       labelEs: "Perfil",       labelEn: "Profile" },
  { id: "tarifas",     Icon: DollarSign,     labelEs: "Mis tarifas",  labelEn: "Pricing" },
  { id: "galeria",     Icon: ImageIcon,      labelEs: "Galería",      labelEn: "Gallery" },
  { id: "banner",      Icon: Sparkles,       labelEs: "Banner Pro",   labelEn: "Banner Pro" },
  { id: "citas",       Icon: Calendar,       labelEs: "Citas",        labelEn: "Appointments" },
  { id: "solicitudes", Icon: Inbox,          labelEs: "Solicitudes",  labelEn: "Requests" },
  { id: "mensajes",    Icon: MessageCircle,  labelEs: "Mensajes",     labelEn: "Messages" },
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
        <ul className="space-y-0.5 px-2">
          {ITEMS.map(item => {
            const Icon = item.Icon;
            const active = tab === item.id;
            const badge = item.id === "mensajes" ? unreadMessages
                         : item.id === "solicitudes" ? pendingRequests
                         : 0;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onChange(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition group ${
                    active
                      ? "bg-teal-50 text-teal-700 ring-1 ring-teal-100"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  data-testid={`provider-sidenav-${item.id}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={`w-5 h-5 flex-shrink-0 transition ${active ? "" : "text-slate-400 group-hover:text-slate-700"}`}
                    strokeWidth={active ? 2.5 : 2}
                  />
                  <span className="flex-1 truncate">{lang === "en" ? item.labelEn : item.labelEs}</span>
                  {badge > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-orange-500 text-white text-[10px] font-extrabold leading-none"
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
      </nav>
    </aside>
  );
}
