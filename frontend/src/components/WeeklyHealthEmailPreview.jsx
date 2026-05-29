import { useState, useEffect } from "react";
import { Mail, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../lib/api";

/**
 * WeeklyHealthEmailPreview — Section 43B.
 *
 * Collapsed widget that hints "Esto te llegará el lunes en tu correo" with
 * a preview of the next-best-action + this week's vitals. Mostly serves
 * three purposes:
 *  1. Builds anticipation — providers know to look for the email.
 *  2. Makes the email content predictable (no surprises in the inbox).
 *  3. If `available=false` (email not verified), we surface that early.
 */
export default function WeeklyHealthEmailPreview() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .get("/providers/me/health-email/preview")
      .then((r) => alive && setData(r.data))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading || !data) return null;
  if (!data.available) return null;
  if (data.score >= 100) return null; // perfect eCard → no nudge needed

  const next = (data.items || []).find((it) => it.status === "missing");

  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden"
      style={{ borderColor: "rgba(2,95,103,0.12)" }}
      data-testid="weekly-health-email-preview"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 text-left transition-colors"
        data-testid="weekly-health-email-toggle"
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "#E1F5EE" }}
        >
          <Mail className="w-4 h-4" style={{ color: "#03045E" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">Lunes te llega tu resumen</p>
          <p className="text-[11px] text-slate-500">
            "Tu eCard esta semana" · Cada lunes 10am a {data.email}
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-3" data-testid="weekly-health-email-body">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white rounded-lg py-2.5">
              <div className="text-lg font-display font-bold text-slate-900">{data.week_views}</div>
              <div className="text-[10px] text-slate-500">vistas</div>
            </div>
            <div className="bg-white rounded-lg py-2.5">
              <div className="text-lg font-display font-bold text-slate-900">{data.week_contacts}</div>
              <div className="text-[10px] text-slate-500">contactos</div>
            </div>
            <div className="bg-white rounded-lg py-2.5">
              <div className="text-lg font-display font-bold text-slate-900">{data.week_reviews}</div>
              <div className="text-[10px] text-slate-500">reseñas</div>
            </div>
          </div>

          {next && (
            <div className="bg-white rounded-lg p-3 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#03045E" }}>
                Tu próximo paso
              </p>
              <p className="text-sm font-bold text-slate-900">{next.label}</p>
              {next.impact && (
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{next.impact}</p>
              )}
            </div>
          )}

          <p className="text-[10px] text-slate-400 italic">
            Solo te enviamos el resumen mientras haya algo que sumar.
          </p>
        </div>
      )}
    </div>
  );
}
