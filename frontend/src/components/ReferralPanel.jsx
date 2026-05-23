import { useEffect, useState } from "react";
import { Gift, Copy, Check, Share2, Mail, Loader2, Award, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../lib/api";

/**
 * ReferralPanel — Section 33.
 * Provider dashboard widget that:
 *   • Displays the provider's unique referral code + shareable link.
 *   • Shows stats (invited / registered / credited months earned).
 *   • Lets the provider send a personalised email invite (dev-fallback when
 *     RESEND_API_KEY is unset — backend logs the email body).
 *   • Surfaces an active Pro bonus banner when /api/me/referral-credit is on.
 */
export default function ReferralPanel() {
  const [data, setData] = useState(null);
  const [credit, setCredit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [sending, setSending] = useState(false);

  const load = () => {
    Promise.all([
      api.get("/providers/me/referrals").then(r => r.data).catch(() => null),
      api.get("/me/referral-credit").then(r => r.data).catch(() => null),
    ]).then(([refs, cr]) => {
      setData(refs);
      setCredit(cr);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-6 text-slate-400 text-sm flex items-center gap-2" data-testid="referral-panel-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando programa de referidos…
      </div>
    );
  }
  if (!data) return null;

  const shareUrl = `${window.location.origin}${data.share_url}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("¡Enlace copiado!");
    } catch (_e) {
      toast.error("No se pudo copiar");
    }
  };

  const nativeShare = async () => {
    const text = `Te invito a getamano — paga $0 el primer mes Pro cuando te verifiques.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "getamano", text, url: shareUrl });
      } catch (e) {
        if (e?.name !== "AbortError") copyLink();
      }
    } else {
      copyLink();
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const r = await api.post("/providers/me/referral/invite", {
        email: inviteEmail.trim(),
        note: inviteNote.trim() || null,
      });
      if (r.data?.sent) {
        toast.success("✉️ Invitación enviada por correo");
      } else {
        toast.success("✅ Invitación registrada (correo se enviará cuando Resend esté activo)");
      }
      setInviteEmail("");
      setInviteNote("");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No se pudo enviar la invitación");
    } finally {
      setSending(false);
    }
  };

  const totals = {
    invited: data.total_referred || 0,
    paid: data.total_paid || 0,
    credited: data.credited_months || 0,
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 mb-6" data-testid="referral-panel" id="referrals">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
               style={{ background: "rgba(194,65,12,0.10)", color: "#C2410C" }}>
            <Sparkles className="w-3 h-3" /> Nuevo · Programa de referidos
          </div>
          <h3 className="font-display font-bold text-slate-900 text-lg mt-2 leading-tight" data-testid="referral-panel-title">
            Trae a un amigo proveedor → ambos ganan 1 mes Pro gratis
          </h3>
          <p className="text-xs text-slate-500 mt-1">Comparte tu link, ellos crean su cuenta, se verifican, y los dos reciben 30 días gratis automáticamente.</p>
        </div>
      </div>

      {/* Bonus active banner */}
      {credit?.active && credit.days_remaining > 0 && (
        <div className="rounded-xl mb-4 p-3 flex items-start gap-2.5"
             style={{ background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)", border: "1px solid #6EE7B7" }}
             data-testid="referral-active-bonus">
          <Award className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#047857" }} />
          <div className="min-w-0">
            <p className="font-bold text-emerald-900 text-sm leading-tight">¡Tienes Pro gratis activo!</p>
            <p className="text-xs text-emerald-800 mt-0.5">{credit.days_remaining} día{credit.days_remaining !== 1 ? "s" : ""} restantes de tu bono por referidos.</p>
          </div>
        </div>
      )}

      {/* Share URL */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center gap-2" data-testid="referral-share-row">
        <span className="text-[11px] font-mono text-slate-600 flex-1 truncate" title={shareUrl} data-testid="referral-share-url">{shareUrl}</span>
        <button
          type="button"
          onClick={copyLink}
          className={`text-xs font-bold px-2.5 py-1 rounded-lg transition whitespace-nowrap ${copied ? "bg-emerald-100 text-emerald-700" : "bg-teal-600 text-white hover:bg-teal-700"}`}
          data-testid="referral-copy-button"
        >
          {copied ? (<><Check className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Copiado</>) : (<><Copy className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Copiar</>)}
        </button>
        <button
          type="button"
          onClick={nativeShare}
          className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-teal-300 text-slate-700 transition whitespace-nowrap"
          data-testid="referral-share-button"
        >
          <Share2 className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Compartir
        </button>
        <button
          type="button"
          onClick={() => setShowQR(true)}
          className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-teal-300 text-slate-700 transition whitespace-nowrap"
          data-testid="referral-qr-button"
        >
          QR
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mt-4" data-testid="referral-stats">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
          <Users className="w-4 h-4 mx-auto" style={{ color: "#025F67" }} />
          <p className="text-xl font-display font-bold text-slate-900 mt-1" data-testid="referral-stat-invited">{totals.invited}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Referidos</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
          <Award className="w-4 h-4 mx-auto" style={{ color: "#C2410C" }} />
          <p className="text-xl font-display font-bold text-slate-900 mt-1" data-testid="referral-stat-credited">{totals.credited}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Verificados</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
          <Gift className="w-4 h-4 mx-auto" style={{ color: "#047857" }} />
          <p className="text-xl font-display font-bold text-slate-900 mt-1" data-testid="referral-stat-months">{totals.credited}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Meses ganados</p>
        </div>
      </div>

      {/* Invite form */}
      <form onSubmit={sendInvite} className="mt-5 rounded-xl border border-slate-200 p-4" data-testid="referral-invite-form">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-4 h-4" style={{ color: "#025F67" }} />
          <h4 className="font-semibold text-slate-900 text-sm">Envía una invitación personal</h4>
        </div>
        <input
          type="email"
          required
          placeholder="amigo@correo.com"
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          className="w-full h-10 px-3 rounded-lg border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none text-sm"
          data-testid="referral-invite-email"
        />
        <textarea
          placeholder="Nota opcional… (Ej: Te va a gustar, mira mi perfil!)"
          value={inviteNote}
          onChange={e => setInviteNote(e.target.value.slice(0, 300))}
          rows={2}
          className="w-full mt-2 px-3 py-2 rounded-lg border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none text-sm resize-none"
          data-testid="referral-invite-note"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-slate-400">{inviteNote.length}/300</p>
          <button
            type="submit"
            disabled={sending || !inviteEmail.trim()}
            className="px-4 py-2 rounded-full text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
            data-testid="referral-invite-submit"
          >
            {sending ? "Enviando…" : "Enviar invitación →"}
          </button>
        </div>
      </form>

      {/* QR modal */}
      {showQR && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm" onClick={() => setShowQR(false)} data-testid="referral-qr-modal">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Escanea para registrarse</p>
            <h4 className="font-display font-bold text-slate-900 mt-1 text-base">Código: {data.ref_code}</h4>
            <div className="mt-4 mx-auto inline-block p-3 rounded-xl bg-white border border-slate-200">
              <QRCodeSVG value={shareUrl} size={192} fgColor="#025F67" bgColor="#FFFFFF" level="M" data-testid="referral-qr-svg" />
            </div>
            <p className="mt-3 text-[10px] text-slate-400 break-all">{shareUrl}</p>
            <button onClick={() => setShowQR(false)} className="mt-4 px-4 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
