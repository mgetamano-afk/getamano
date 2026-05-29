import { Link } from "react-router-dom";
import { Smartphone, QrCode, Apple, Sparkles } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useI18n } from "../contexts/I18nContext";
import { openInstallModal } from "./InstallAppModal";

/**
 * DownloadBadgesSection — Section 28 download CTA strip for the landing.
 *
 * We're a PWA — there's no real App Store / Play Store listing yet. Instead
 * of fake badges that 404 we render:
 *   • "Add to Home Screen" button that opens the existing InstallAppModal
 *   • A real QR with the install URL so desktop visitors scan and install
 *   • Honest copy: "Sin App Store. Sin Play Store. Una sola URL."
 *
 * Sits above the footer, full-width, dark teal background to break visual
 * monotony from the rest of the landing.
 */
export default function DownloadBadgesSection() {
  const { lang } = useI18n();
  const url = typeof window !== "undefined" ? window.location.origin : "https://getamano.us";

  const T = lang === "en" ? {
    eyebrow: "Take getamano with you",
    title: "One tap from your home screen",
    subtitle: "No App Store. No Google Play. Just open in your browser and install — works on iPhone and Android, on or offline.",
    install: "Add to home screen",
    learnMore: "How it works →",
    qrCaption: "Scan with your phone",
    benefit1: "Install in 5 seconds",
    benefit2: "Works offline",
    benefit3: "No 30% Apple tax",
  } : {
    eyebrow: "Lleva getamano contigo",
    title: "Un solo tap desde tu pantalla de inicio",
    subtitle: "Sin App Store. Sin Google Play. Abre en tu navegador y agrégala — funciona en iPhone y Android, online y offline.",
    install: "Añadir a pantalla de inicio",
    learnMore: "Cómo funciona →",
    qrCaption: "Escanea con tu celular",
    benefit1: "Se instala en 5 segundos",
    benefit2: "Funciona sin internet",
    benefit3: "Sin comisión del 30% de Apple",
  };

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{ background: "linear-gradient(160deg, #03045E 0%, #03045E 60%, #0077B6 100%)" }}
      data-testid="download-badges-section"
    >
      {/* Subtle texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle at 1.5px 1.5px, white 1.2px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-14 items-center">
          {/* LEFT: copy */}
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest" style={{ background: "rgba(255,107,44,0.16)", color: "#FDBA74", border: "1px solid rgba(255,107,44,0.28)" }}>
              <Sparkles className="w-3 h-3" /> {T.eyebrow}
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.1] mt-4 text-white" style={{ color: "#FFFFFF", textShadow: "0 2px 12px rgba(0,0,0,0.15)" }} data-testid="download-section-title">
              {T.title}
            </h2>
            <p className="text-base sm:text-lg text-white/80 mt-4 leading-relaxed max-w-2xl">
              {T.subtitle}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openInstallModal}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold transition hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                style={{ background: "white", color: "#03045E", minHeight: 48 }}
                data-testid="download-section-install"
              >
                <Smartphone className="w-4 h-4" /> {T.install}
              </button>
              <Link
                to="/instalar"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full text-sm font-semibold border border-white/30 hover:bg-white/10 transition"
                style={{ color: "white", minHeight: 48 }}
                data-testid="download-section-learn-more"
              >
                {T.learnMore}
              </Link>
            </div>

            {/* 3 micro-benefits */}
            <ul className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
              {[T.benefit1, T.benefit2, T.benefit3].map((b, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-white/85">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#FF6B2C" }} />
                  {b}
                </li>
              ))}
            </ul>

            {/* iOS + Android hint badges (visual, not store-store buttons) */}
            <div className="mt-7 flex flex-wrap gap-2.5 items-center" data-testid="download-platform-hints">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Apple className="w-3.5 h-3.5" /> iPhone — Safari
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Smartphone className="w-3.5 h-3.5" /> Android — Chrome / Edge
              </span>
            </div>
          </div>

          {/* RIGHT: real QR + phone mockup */}
          <div className="flex flex-col items-center justify-center" data-testid="download-qr-block">
            <div
              className="relative rounded-3xl p-6 shadow-2xl"
              style={{ background: "white" }}
            >
              {/* corner accent */}
              <div className="absolute -top-2 -right-2 w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg" style={{ background: "linear-gradient(135deg, #FF6B2C 0%, #F97316 100%)" }}>
                <QrCode className="w-5 h-5" />
              </div>
              <QRCodeSVG
                value={url}
                size={196}
                level="M"
                includeMargin={false}
                fgColor="#03045E"
                bgColor="#FFFFFF"
              />
            </div>
            <p className="text-xs mt-4 text-white/70 inline-flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5" /> {T.qrCaption}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
