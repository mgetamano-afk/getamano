import BrandMark from "./BrandMark";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  MessageCircle,
  Calendar,
  Inbox,
  Users,
  BookOpen,
  CreditCard,
  Globe,
} from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * ProviderLeftNav — Section 37/38.
 *
 * Sticky 220px left rail with the brand mark on top, primary nav,
 * and a profile card pinned at the bottom showing avatar + plan badge +
 * profile-completion progress bar.
 *
 * Inline tab items (Mensajes, Citas, Solicitudes, Referidos, Mi Diario,
 * Suscripción) call onTabChange(tab) so the existing tab state in
 * ProviderDashboard.jsx is reused — zero logic refactor.
 *
 * "Comunidad" is a real route → uses <Link>.
 */
export default function ProviderLeftNav({
  profile,
  user,
  unreadCount = 0,
  currentTab,
  onTabChange,
  completionScore = null,
}) {
  const { t: _t } = useI18n();
  const logoSrc = profile?.logo_url || "/getamano-logo-mark.png";
  const businessName = profile?.business_name || user?.name || "Tu negocio";
  const planLabel = (profile?.plan || "free").toUpperCase();

  const tabItems = [
    { id: "perfil", Icon: LayoutDashboard, label: "Dashboard" },
    { id: "mensajes", Icon: MessageCircle, label: "Mensajes", badge: unreadCount },
    { id: "citas", Icon: Calendar, label: "Citas" },
    { id: "solicitudes", Icon: Inbox, label: "Solicitudes" },
    { id: "referidos", Icon: Users, label: "Referidos" },
    { id: "diario", Icon: BookOpen, label: "Mi Diario" },
    { id: "suscripcion", Icon: CreditCard, label: "Suscripción" },
  ];

  return (
    <aside
      className="hidden md:flex md:w-[220px] md:flex-col md:shrink-0 md:sticky md:top-20 md:self-start max-h-[calc(100vh-6rem)]"
      data-testid="provider-left-nav"
    >
      <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 border-b border-slate-100">
          <Link to="/dashboard/provider" className="flex items-center gap-2" data-testid="leftnav-brand">
            <BrandMark size="sm" />
            <span className="font-display font-bold text-slate-900 text-base tracking-tight">getamano</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {tabItems.map(({ id, Icon, label, badge }) => {
            const active = currentTab === id;
            return (
              <button
                key={id}
                onClick={() => onTabChange?.(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition relative ${
                  active ? "text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
                style={active ? { background: "#03045E" } : undefined}
                data-testid={`leftnav-${id}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{label}</span>
                {badge ? (
                  <span
                    className="ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center"
                    style={{ background: active ? "rgba(255,255,255,0.2)" : "#F97316", color: "white" }}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* External route */}
          <Link
            to="/comunidad"
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition mt-2"
            data-testid="leftnav-comunidad"
          >
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Comunidad</span>
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          </Link>
        </nav>

        {/* Profile card */}
        <div className="border-t border-slate-100 px-3 py-3 bg-slate-50">
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 ring-2 ring-white"
              style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
            >
              <img
                src={logoSrc}
                alt={businessName}
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.src = "/getamano-logo-mark.png"; }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 truncate" data-testid="leftnav-business-name">
                {businessName}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: "#E1F5EE", color: "#03045E" }}
                >
                  {planLabel}
                </span>
              </div>
            </div>
          </div>
          {completionScore !== null ? (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span>Perfil</span>
                <span className="font-semibold" data-testid="leftnav-completion-score">{completionScore}%</span>
              </div>
              <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    width: `${completionScore}%`,
                    background: completionScore >= 80 ? "#1D9E75" : completionScore >= 50 ? "#F59E0B" : "#EF4444",
                  }}
                  data-testid="leftnav-completion-bar"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
