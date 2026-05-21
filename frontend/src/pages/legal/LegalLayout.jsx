import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { AlertTriangle } from "lucide-react";

/**
 * Shared layout for getamano legal pages.
 * Banner can be hidden by setting SHOW_LEGAL_DRAFT_BANNER to false when content is reviewed.
 */
const SHOW_LEGAL_DRAFT_BANNER = true;

export default function LegalLayout({ title, lastUpdated, children, testId }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}>
      <Header />
      {SHOW_LEGAL_DRAFT_BANNER && (
        <div
          className="px-4 py-3 text-sm"
          style={{ backgroundColor: "#FFF8E1", borderLeft: "4px solid #F59E0B", color: "#7A5A00" }}
          data-testid="legal-draft-banner"
        >
          <div className="max-w-[760px] mx-auto flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Borrador</strong> — Este contenido está pendiente de revisión y aprobación por el equipo legal de getamano. No representa asesoría legal. Contacto: <a className="underline font-medium" href="mailto:hola@getamano.us">hola@getamano.us</a>
            </span>
          </div>
        </div>
      )}
      <main className="px-4 py-10 md:py-16" data-testid={testId}>
        <div className="max-w-[760px] mx-auto">
          <header className="mb-10">
            <h1 className="font-display text-3xl md:text-4xl font-bold" style={{ color: "#025F67" }} data-testid="legal-title">{title}</h1>
            <p className="text-sm text-slate-500 mt-2"><span className="uppercase tracking-widest text-[10px] mr-2">Última actualización</span>{lastUpdated}</p>
          </header>
          <article className="legal-prose" style={{ color: "#333", fontSize: "16px", lineHeight: 1.7 }}>
            {children}
          </article>
          <p className="text-xs text-slate-400 mt-12 text-center">© 2026 getamano — Marketplace latino en USA</p>
        </div>
      </main>
      <Footer />
      <style>{`
        .legal-prose h2 { color: #2F9D94; font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 1.25rem; margin-top: 2.25rem; margin-bottom: 0.75rem; letter-spacing: -0.01em; }
        .legal-prose h3 { color: #025F67; font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 1.05rem; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .legal-prose p { margin-bottom: 1rem; }
        .legal-prose ul { list-style: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        .legal-prose ul li { margin-bottom: 0.4rem; }
        .legal-prose a { color: #2F9D94; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
        .legal-prose a:hover { color: #025F67; }
        .legal-prose strong { color: #025F67; }
      `}</style>
    </div>
  );
}
