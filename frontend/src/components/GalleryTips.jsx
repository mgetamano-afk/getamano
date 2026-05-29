import { Sparkles, Camera, Users, ArrowLeftRight } from "lucide-react";

/**
 * GalleryTips — Onboarding visual contextual para la galería.
 *
 * Aparece encima del grid cuando el proveedor tiene < `minPhotos` fotos.
 * Se desvanece silenciosamente una vez que llega al mínimo. Sin estado,
 * sin localStorage — es puramente reactivo al count actual del backend.
 *
 * Las 3 cards son los tipos de foto con mayor tasa de conversión cliente→
 * llamada según los datos internos: antes/después > tú trabajando > equipo.
 */
export default function GalleryTips({ currentCount = 0, minPhotos = 3 }) {
  if (currentCount >= minPhotos) return null;

  const remaining = Math.max(0, minPhotos - currentCount);

  const tips = [
    {
      Icon: ArrowLeftRight,
      title: "Antes y después",
      hint: "El cambio convence. La gente recuerda transformaciones.",
      tint: "#FFE3D3",
      tintIcon: "#C2410C",
    },
    {
      Icon: Camera,
      title: "Tú en acción",
      hint: "Una foto trabajando es 3× más confiable que un logo solo.",
      tint: "#E1F5EE",
      tintIcon: "#03045E",
    },
    {
      Icon: Users,
      title: "Tu equipo o lugar",
      hint: "Muestra dónde, con quién o con qué herramientas trabajas.",
      tint: "#F0E8FF",
      tintIcon: "#6D28D9",
    },
  ];

  return (
    <div
      className="mb-5 rounded-2xl border bg-gradient-to-br from-white to-slate-50 p-4 sm:p-5"
      style={{ borderColor: "rgba(2,95,103,0.15)" }}
      data-testid="gallery-tips"
    >
      <div className="flex items-start gap-2 mb-3">
        <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#03045E" }} />
        <div className="flex-1 min-w-0">
          <h4 className="font-display font-bold text-sm text-slate-900">
            Sube {remaining === 1 ? "1 foto más" : `${remaining} fotos`} que vendan tu trabajo
          </h4>
          <p className="text-xs text-slate-500">
            Los proveedores con 3+ fotos reciben hasta <strong className="text-teal-700">2× más solicitudes</strong>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" data-testid="gallery-tips-cards">
        {tips.map(({ Icon, title, hint, tint, tintIcon }) => (
          <div
            key={title}
            className="rounded-xl border border-slate-100 bg-white p-3 hover:shadow-sm transition-shadow"
            data-testid={`gallery-tip-${title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
              style={{ background: tint }}
            >
              <Icon className="w-4 h-4" style={{ color: tintIcon }} />
            </div>
            <p className="text-xs font-semibold text-slate-900 leading-tight">{title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
