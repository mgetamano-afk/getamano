import { useEffect, useState, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Download, ArrowLeft, Info, Layers, CreditCard } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { toast } from "sonner";

/**
 * PrintCard — Section 69.
 *
 * Imprimible "Avery 5371"-style sheet: 10 business cards per A4 page,
 * standard US business card 3.5"×2" (89×51mm). Each card embeds a QR code
 * that points to the OG-rich URL `/api/og/p/{slug}` so when scanned + later
 * shared in WhatsApp the bot still fetches the rich preview.
 *
 * UX:
 *   1. Provider sees a preview (1 card centered) + sheet preview (10 cards).
 *   2. Toggle "Sheet" vs "Single" layout.
 *   3. Click "Imprimir" → browser print dialog (Save as PDF works perfectly).
 *
 * No PDF lib needed — CSS @media print + page-break rules do the heavy
 * lifting and "Save as PDF" is universal across Chrome/Safari/Firefox.
 */
export default function PrintCard() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(true);
  const [layout, setLayout] = useState("sheet"); // 'sheet' (10/A4) | 'single'

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login?next=/dashboard/print-card"); return; }
    if (user.role !== "provider") { navigate("/dashboard"); return; }
    (async () => {
      try {
        const { data } = await api.get("/providers/me");
        setProfile(data);
      } catch (e) {
        console.error("[print-card] fetch profile failed", e);
        toast.error(lang === "es" ? "No se pudo cargar tu perfil." : "Couldn't load your profile.");
      } finally {
        setBusy(false);
      }
    })();
  }, [user, loading, navigate, lang]);

  const backend = process.env.REACT_APP_BACKEND_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const { qrUrl, displayUrl } = useMemo(() => {
    if (!profile?.slug) return { qrUrl: "", displayUrl: "" };
    return {
      // QR encodes the OG-rich endpoint so bot crawlers still get rich previews
      // when the URL is later re-shared. Humans get auto-redirected to /p/{slug}.
      qrUrl: `${backend}/api/og/p/${profile.slug}`,
      // Pretty URL shown beside the QR (what people will type/remember)
      displayUrl: `getamano.us/p/${profile.slug}`.replace(/^getamano\.us\/p\//, "getamano.us/p/"),
    };
  }, [profile, backend, origin]);

  const handlePrint = () => {
    window.print();
  };

  if (loading || busy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F6F2]">
        <div className="text-slate-500 text-sm">{lang === "es" ? "Cargando…" : "Loading…"}</div>
      </div>
    );
  }

  if (!profile) return null;

  const T = lang === "es" ? {
    title: "Imprime tus tarjetas físicas",
    subtitle: "Llévate tu eCard al mundo real. Cada tarjeta lleva tu QR — el cliente lo escanea y abre tu eCard directo en su celular.",
    back: "Volver al panel",
    print: "Imprimir tarjetas",
    saveTip: "En el diálogo de impresión elige 'Guardar como PDF' si no tienes impresora.",
    layoutLabel: "Cantidad por hoja",
    layoutSheet: "10 por hoja A4",
    layoutSingle: "1 grande (preview)",
    paperHint: "Imprime en papel rígido (250-300 g/m²) o lleva el PDF a una imprenta.",
    formatHint: "Tamaño estándar US: 3.5\" × 2\" (89 × 51 mm).",
    cutGuide: "Las líneas grises son guías de corte.",
    free: "💡 Tip: reparte tus tarjetas en mercados, eventos comunitarios, ferias y entre vecinos.",
    sheetTitle: "Hoja A4 — 10 tarjetas",
    singleTitle: "Vista de una tarjeta",
    actions: "Acciones",
    role: "Verificado en",
    seeAtCta: "Mírame aquí:",
    needsSlug: "Necesitas tener tu slug configurado primero.",
  } : {
    title: "Print your physical business cards",
    subtitle: "Take your eCard to the real world. Each card has your QR — clients scan it and your eCard opens on their phone.",
    back: "Back to dashboard",
    print: "Print cards",
    saveTip: "In the print dialog choose 'Save as PDF' if you don't have a printer handy.",
    layoutLabel: "Cards per sheet",
    layoutSheet: "10 per A4 sheet",
    layoutSingle: "1 large (preview)",
    paperHint: "Print on cardstock (250-300 g/m²) or take the PDF to a print shop.",
    formatHint: "Standard US size: 3.5\" × 2\" (89 × 51 mm).",
    cutGuide: "Gray lines are cut guides.",
    free: "💡 Tip: hand them out at markets, community events, fairs, and to neighbors.",
    sheetTitle: "A4 sheet — 10 cards",
    singleTitle: "Single card preview",
    actions: "Actions",
    role: "Verified on",
    seeAtCta: "Find me here:",
    needsSlug: "You need to have your slug set up first.",
  };

  if (!profile.slug) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F6F2] px-6">
        <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-lg border border-slate-200">
          <Info className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-slate-700">{T.needsSlug}</p>
          <Link to="/dashboard/provider" className="mt-4 inline-block text-sm font-semibold text-teal-700">
            {T.back} →
          </Link>
        </div>
      </div>
    );
  }

  // Mock array for the sheet view (10 identical cards in 2×5 grid)
  const sheetCards = Array.from({ length: 10 }, (_, i) => i);

  return (
    <div className="print-card-wrap">
      {/* Print-only stylesheet */}
      <style>{`
        /* CARD VARIABLES — change once, propagate everywhere */
        :root {
          --card-w: 89mm;
          --card-h: 51mm;
          --card-radius: 3mm;
          --brand-teal: #025F67;
          --brand-teal-dark: #063154;
          --brand-accent: #2F9D94;
          --brand-cream: #F7F6F2;
        }

        /* Card body (shared) */
        .pc-card {
          width: var(--card-w);
          height: var(--card-h);
          border-radius: var(--card-radius);
          background: linear-gradient(135deg, #063154 0%, #0A4D5E 60%, #025F67 100%);
          color: white;
          padding: 3.5mm 4mm;
          box-sizing: border-box;
          display: flex;
          gap: 3.5mm;
          position: relative;
          overflow: hidden;
          font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
          /* keep colors when print preview tries to "save ink" */
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .pc-card::before {
          /* left accent stripe */
          content: "";
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 2mm;
          background: var(--brand-accent);
        }
        .pc-left {
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding-left: 2mm;
        }
        .pc-brand {
          font-size: 7pt;
          font-weight: 700;
          letter-spacing: 1.4pt;
          color: var(--brand-accent);
          text-transform: uppercase;
        }
        .pc-name {
          font-size: 12pt;
          font-weight: 800;
          line-height: 1.15;
          margin-top: 1mm;
          letter-spacing: -0.2pt;
          /* clamp at 2 lines */
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .pc-meta {
          font-size: 8pt;
          opacity: 0.92;
          line-height: 1.25;
          margin-top: 0.8mm;
        }
        .pc-cta {
          font-size: 7.5pt;
          font-weight: 700;
          color: var(--brand-accent);
        }
        .pc-url {
          font-size: 7pt;
          opacity: 0.88;
          font-weight: 600;
          word-break: break-all;
        }
        .pc-qr-wrap {
          flex: 0 0 auto;
          align-self: center;
          background: white;
          border-radius: 1.5mm;
          padding: 1.2mm;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* Verified badge */
        .pc-verified {
          position: absolute;
          top: 2.4mm;
          right: 2.4mm;
          background: #10B981;
          color: white;
          font-size: 6.5pt;
          font-weight: 700;
          padding: 0.6mm 2mm;
          border-radius: 6pt;
        }

        /* SHEET layout (10 cards, 2×5 grid on A4 portrait) */
        .pc-sheet {
          width: 210mm;
          min-height: 297mm;
          padding: 13.5mm 11mm;
          background: white;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(2, var(--card-w));
          grid-auto-rows: var(--card-h);
          gap: 0;
          justify-content: center;
          align-content: start;
          box-sizing: border-box;
        }
        /* Cut guides: dotted hairline cross at each card corner */
        .pc-sheet .pc-card {
          outline: 0.1mm dashed #CBD5E1;
        }

        /* SINGLE layout — center one card with shadow for screen preview */
        .pc-single {
          padding: 60px 20px;
          text-align: center;
        }
        .pc-single .pc-card {
          margin: 0 auto;
          box-shadow: 0 24px 60px rgba(2, 95, 103, 0.25);
          transform: scale(2.2);
          transform-origin: top center;
        }
        @media (max-width: 640px) {
          .pc-single .pc-card { transform: scale(1.7); }
        }

        /* Print rules */
        @media print {
          body, html, #root, .App, .print-card-wrap { background: white !important; }
          .pc-no-print { display: none !important; }
          .pc-sheet {
            padding: 13.5mm 11mm;
            page-break-after: always;
            margin: 0;
          }
          .pc-single .pc-card {
            transform: scale(2.2);
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>

      {/* Top toolbar (hidden when printing) */}
      <div className="pc-no-print bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <Link
            to="/dashboard/provider"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            data-testid="print-card-back"
          >
            <ArrowLeft className="w-4 h-4" /> {T.back}
          </Link>
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-slate-100 rounded-full p-1" data-testid="print-card-layout-toggle">
              <button
                type="button"
                onClick={() => setLayout("sheet")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition flex items-center gap-1 ${layout === "sheet" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                data-testid="print-card-layout-sheet"
              >
                <Layers className="w-3.5 h-3.5" /> {T.layoutSheet}
              </button>
              <button
                type="button"
                onClick={() => setLayout("single")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition flex items-center gap-1 ${layout === "single" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                data-testid="print-card-layout-single"
              >
                <CreditCard className="w-3.5 h-3.5" /> {T.layoutSingle}
              </button>
            </div>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm text-white"
              style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
              data-testid="print-card-print-btn"
            >
              <Printer className="w-4 h-4" /> {T.print}
            </button>
          </div>
        </div>
      </div>

      {/* Header (hidden when printing) */}
      <div className="pc-no-print bg-[#F7F6F2]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 leading-tight" data-testid="print-card-title">
            {T.title}
          </h1>
          <p className="text-slate-600 mt-3 max-w-2xl text-sm sm:text-base">{T.subtitle}</p>
          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            <div className="bg-white rounded-xl p-3.5 border border-slate-200 text-xs text-slate-600">
              <strong className="block text-slate-900 mb-1">📏 {T.formatHint.split(":")[0]}</strong>
              <span>{T.formatHint.split(":")[1]?.trim() || T.formatHint}</span>
            </div>
            <div className="bg-white rounded-xl p-3.5 border border-slate-200 text-xs text-slate-600">
              <strong className="block text-slate-900 mb-1">🖨️ {lang === "es" ? "Papel" : "Paper"}</strong>
              <span>{T.paperHint}</span>
            </div>
            <div className="bg-white rounded-xl p-3.5 border border-slate-200 text-xs text-slate-600">
              <strong className="block text-slate-900 mb-1">✂️ {lang === "es" ? "Guías" : "Guides"}</strong>
              <span>{T.cutGuide}</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-4 italic">{T.saveTip}</p>
        </div>
      </div>

      {/* The card content (printable) */}
      <div className="bg-slate-100 min-h-[600px]" data-testid="print-card-preview">
        {layout === "sheet" ? (
          <div className="py-8 px-2 sm:px-4 overflow-x-auto">
            <div className="pc-sheet" data-testid="print-card-sheet">
              {sheetCards.map((i) => (
                <CardFace
                  key={i}
                  profile={profile}
                  qrUrl={qrUrl}
                  displayUrl={displayUrl}
                  lang={lang}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="pc-single" data-testid="print-card-single">
            <CardFace
              profile={profile}
              qrUrl={qrUrl}
              displayUrl={displayUrl}
              lang={lang}
            />
          </div>
        )}
      </div>

      {/* Footer tip (hidden when printing) */}
      <div className="pc-no-print bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center">
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">{T.free}</p>
          <button
            type="button"
            onClick={handlePrint}
            className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm text-white"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
            data-testid="print-card-print-btn-bottom"
          >
            <Download className="w-4 h-4" /> {T.print}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardFace({ profile, qrUrl, displayUrl, lang }) {
  const isVerified = profile?.verification_status === "approved";
  // Category label — server provides `category` (object with name_es/name_en) or `category_id`
  const catLabel = (profile.category && (lang === "en" ? profile.category.name_en : profile.category.name_es))
    || profile.category_label
    || "";
  const cityLine = [profile.city, profile.state].filter(Boolean).join(", ");
  const businessName = profile.business_name || "—";
  const cta = lang === "es" ? "Mírame en getamano" : "Find me on getamano";

  return (
    <div className="pc-card" data-testid="print-card-face">
      {isVerified && (
        <div className="pc-verified">✓ {lang === "es" ? "Verificado" : "Verified"}</div>
      )}
      <div className="pc-left">
        <div>
          <div className="pc-brand">getamano</div>
          <div className="pc-name">{businessName}</div>
          {(catLabel || cityLine) && (
            <div className="pc-meta">
              {catLabel}{catLabel && cityLine ? " · " : ""}{cityLine}
            </div>
          )}
        </div>
        <div>
          <div className="pc-cta">{cta} →</div>
          <div className="pc-url">{displayUrl}</div>
        </div>
      </div>
      <div className="pc-qr-wrap">
        <QRCodeSVG
          value={qrUrl}
          size={130}
          level="M"
          fgColor="#025F67"
          bgColor="#FFFFFF"
          includeMargin={false}
          style={{ width: "32mm", height: "32mm" }}
        />
      </div>
    </div>
  );
}
