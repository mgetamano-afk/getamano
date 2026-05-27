import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, X, Briefcase, Share2, Star, MessageCircle, Search } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

/**
 * QuickActionsFAB — Section 39 bonus.
 *
 * Floating circular action button anchored bottom-right of the viewport.
 * Tapping it expands a small action menu with role-aware shortcuts:
 *
 *   Provider (logged in)
 *     · Publicar chamba          → /empleos (open Post-Gig modal flow)
 *     · Compartir mi eCard       → copies the public eCard URL
 *     · Pedir reseña             → copies a pre-filled review-request link
 *     · Mensajes                 → /messages
 *
 *   Client (logged in)
 *     · Buscar proveedor         → /buscar
 *     · Publicar chamba          → /empleos
 *     · Mensajes                 → /messages
 *
 * Hidden on:
 *   · Admin routes (/admin/* and /dashboard/admin/*)
 *   · Logged-out users
 *   · Provider onboarding flow (/provider/onboarding)
 *   · Auth pages (/login, /register, /verificar-correo)
 *
 * Respects iOS safe-area-inset-bottom; sits above the BottomNav on mobile
 * (bottom offset ≈ 76px so it doesn't collide with the 56px bottom nav).
 */
const HIDE_ON_PATHS = [
  /^\/admin(\/|$)/,
  /^\/dashboard\/admin(\/|$)/,
  /^\/provider\/onboarding/,
  /^\/login/,
  /^\/register/,
  /^\/registro/,
  /^\/verificar-correo/,
  /^\/verify-email/,
  /^\/install/,
  /^\/instalar/,
];

export default function QuickActionsFAB() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close menu on route change so user starts fresh on each new page
  useEffect(() => { setOpen(false); }, [location.pathname]);

  if (!user) return null;
  if (HIDE_ON_PATHS.some((re) => re.test(location.pathname))) return null;

  const isProvider = user.role === "provider";

  const handleShareECard = async () => {
    setOpen(false);
    const slug = user?.slug || null;
    const url = `${window.location.origin}/p/${slug || ""}`;
    if (!slug) {
      // Provider hasn't completed onboarding yet — point them at dashboard share card
      navigate("/dashboard/provider");
      toast("Comparte tu eCard desde el panel principal.", { icon: "ℹ️" });
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mi eCard en getamano", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado al portapapeles");
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        try { await navigator.clipboard.writeText(url); toast.success("Link copiado"); }
        catch { toast.error("No se pudo copiar"); }
      }
    }
  };

  const handleAskReview = async () => {
    setOpen(false);
    const slug = user?.slug || null;
    if (!slug) {
      navigate("/dashboard/provider");
      toast("Configura tu eCard primero.", { icon: "ℹ️" });
      return;
    }
    const url = `${window.location.origin}/p/${slug}#reseñas`;
    const msg = `¡Hola! ¿Te quedaste contento con mi servicio? Me ayudarías muchísimo con una reseña corta en mi eCard 👇\n${url}`;
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Mensaje copiado — pégalo en WhatsApp");
    } catch {
      toast.error("No se pudo copiar el mensaje");
    }
  };

  // Build action list per role
  const actions = isProvider
    ? [
        { id: "publicar-chamba", label: "Publicar chamba", Icon: Briefcase, color: "#025F67", onClick: () => { setOpen(false); navigate("/empleos"); } },
        { id: "compartir-ecard", label: "Compartir mi eCard", Icon: Share2, color: "#2F9D94", onClick: handleShareECard },
        { id: "pedir-resena", label: "Pedir reseña", Icon: Star, color: "#F59E0B", onClick: handleAskReview },
        { id: "mensajes", label: "Mensajes", Icon: MessageCircle, color: "#1D9E75", onClick: () => { setOpen(false); navigate("/messages"); } },
      ]
    : [
        { id: "buscar", label: "Buscar proveedor", Icon: Search, color: "#025F67", onClick: () => { setOpen(false); navigate("/buscar"); } },
        { id: "publicar-chamba", label: "Publicar chamba", Icon: Briefcase, color: "#2F9D94", onClick: () => { setOpen(false); navigate("/empleos"); } },
        { id: "mensajes", label: "Mensajes", Icon: MessageCircle, color: "#1D9E75", onClick: () => { setOpen(false); navigate("/messages"); } },
      ];

  return (
    <div
      ref={wrapperRef}
      className="fixed right-4 sm:right-6 z-50 flex flex-col items-end gap-2"
      style={{ bottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}
      data-testid="quick-actions-fab"
    >
      {/* Action menu */}
      {open && (
        <div className="flex flex-col items-end gap-2 mb-1" data-testid="quick-actions-menu">
          {actions.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={a.onClick}
              className="flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full bg-white shadow-lg border border-slate-200 text-sm font-semibold text-slate-800 hover:scale-[1.02] active:scale-[0.98] transition-all"
              style={{
                animation: `fadeSlideUp 0.18s ease-out both`,
                animationDelay: `${i * 35}ms`,
              }}
              data-testid={`quick-action-${a.id}`}
            >
              <span className="whitespace-nowrap">{a.label}</span>
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
                style={{ background: a.color }}
              >
                <a.Icon className="w-4 h-4" />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* FAB button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-14 h-14 rounded-full text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
        style={{
          background: open
            ? "#0F172A"
            : "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)",
          boxShadow: "0 8px 24px -6px rgba(2,95,103,0.5)",
        }}
        aria-label={open ? "Cerrar acciones rápidas" : "Abrir acciones rápidas"}
        aria-expanded={open}
        data-testid="quick-actions-fab-button"
      >
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>
    </div>
  );
}
