import { useMemo } from "react";
import { Sun, Moon, Coffee, Sparkles, Heart, Eye, Inbox, MessageCircle, TrendingUp } from "lucide-react";

/**
 * ProviderGreeting — Warm, contextual companion greeting for the provider dashboard.
 * Adapts to time of day, surfaces today's activity with empathy,
 * and rotates a daily warm phrase.
 */
const WARM_PHRASES = [
  "Estamos contigo en cada paso 🧡",
  "Hoy es un buen día para hacer crecer tu negocio",
  "Tu trabajo le cambia la vida a alguien hoy",
  "Pequeños detalles, grandes clientes felices",
  "Gracias por ser parte de la familia getmano",
  "La comunidad latina te respalda",
  "Sigue brillando, ya empezaste",
  "Un cliente contento, mil recomendaciones",
];

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 6) return { text: "Trabajando temprano", Icon: Moon, color: "text-indigo-500" };
  if (h < 12) return { text: "Buenos días", Icon: Sun, color: "text-amber-500" };
  if (h < 14) return { text: "Hora del almuerzo", Icon: Coffee, color: "text-orange-500" };
  if (h < 19) return { text: "Buenas tardes", Icon: Sun, color: "text-orange-400" };
  if (h < 22) return { text: "Buenas noches", Icon: Moon, color: "text-blue-500" };
  return { text: "Sigues despierto", Icon: Moon, color: "text-indigo-500" };
}

export default function ProviderGreeting({ user, profile, unreadMessages = 0, newRequests = 0 }) {
  const greeting = getTimeGreeting();
  const firstName = (user?.name || "").split(" ")[0] || "compañer@";

  // Daily phrase based on day-of-year (stable for a day, rotates daily)
  const phrase = useMemo(() => {
    const d = new Date();
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    return WARM_PHRASES[dayOfYear % WARM_PHRASES.length];
  }, []);

  const views = profile?.views || 0;
  const contactClicks = profile?.contact_clicks || 0;
  const ratingAvg = profile?.rating_avg || 0;

  // Activity nudges — empathetic, never cold
  const nudges = [];
  if (newRequests > 0) {
    nudges.push({ Icon: Inbox, text: `${newRequests} ${newRequests === 1 ? "solicitud nueva" : "solicitudes nuevas"} esperando`, color: "text-orange-600", bg: "bg-orange-50", testid: "nudge-requests" });
  }
  if (unreadMessages > 0) {
    nudges.push({ Icon: MessageCircle, text: `${unreadMessages} ${unreadMessages === 1 ? "mensaje sin leer" : "mensajes sin leer"}`, color: "text-blue-600", bg: "bg-blue-50", testid: "nudge-messages" });
  }
  if (views > 0 && nudges.length < 2) {
    nudges.push({ Icon: Eye, text: `${views} ${views === 1 ? "persona vio" : "personas vieron"} tu eCard`, color: "text-emerald-600", bg: "bg-emerald-50", testid: "nudge-views" });
  }
  if (ratingAvg >= 4.5 && profile?.rating_count > 0 && nudges.length < 3) {
    nudges.push({ Icon: TrendingUp, text: `Calificación ${ratingAvg.toFixed(1)} — tus clientes te aman`, color: "text-yellow-600", bg: "bg-yellow-50", testid: "nudge-rating" });
  }
  if (nudges.length === 0) {
    nudges.push({ Icon: Sparkles, text: "Hoy es un buen día para compartir tu eCard con alguien", color: "text-purple-600", bg: "bg-purple-50", testid: "nudge-share" });
  }

  return (
    <div className="relative overflow-hidden rounded-3xl p-6 md:p-7 mb-6"
      style={{
        background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 50%, #fee2e2 100%)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.02), 0 8px 24px -12px rgba(255,107,44,0.15)",
      }}
      data-testid="provider-greeting"
    >
      {/* Decorative dots */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #b45309 1px, transparent 0)", backgroundSize: "20px 20px" }} />

      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <greeting.Icon className={`w-5 h-5 ${greeting.color}`} />
            <span className="text-xs uppercase tracking-widest font-semibold text-slate-500">{greeting.text}</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
            Hola, {firstName} <span className="inline-block animate-wave">👋</span>
          </h1>
          <p className="mt-1.5 text-sm text-slate-700 flex items-center gap-1.5" data-testid="greeting-phrase">
            <Heart className="w-3.5 h-3.5 text-orange-500 fill-orange-500 flex-shrink-0" />
            {phrase}
          </p>
        </div>

        {/* Activity nudges */}
        <div className="flex flex-wrap gap-2 md:justify-end md:max-w-md">
          {nudges.slice(0, 3).map((n, i) => (
            <div key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${n.bg} ${n.color} text-xs font-medium`} data-testid={n.testid}>
              <n.Icon className="w-3.5 h-3.5" />
              {n.text}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes wave { 0%,60%,100%{transform:rotate(0)} 10%,30%{transform:rotate(14deg)} 20%{transform:rotate(-8deg)} 40%{transform:rotate(-4deg)} 50%{transform:rotate(10deg)} }
        .animate-wave { animation: wave 2.4s ease-in-out 0.6s 1; transform-origin: 70% 70%; display: inline-block; }
      `}</style>
    </div>
  );
}
