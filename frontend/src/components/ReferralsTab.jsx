/**
 * ReferralsTab — V13 "Mi Cartera / Mi Wallet" widget.
 *
 * Replaces the legacy "1 mes gratis por referido" copy with the new
 * reward ladder: 2 = 1mo · 4 = 2mo · 6 = 3mo · 8 = 4mo · 10 = 6mo · 12 = 12mo.
 *
 * Shows live earnings (months earned + months remaining to next reward),
 * the share link, and the referral history table. Visually consistent
 * with the new VerificationCenter so users see the same reward language
 * everywhere it appears.
 */
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Copy, Share2, Gift, Wallet, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../contexts/I18nContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const REWARD_LADDER = [
  { refs: 2,  months: 1 },
  { refs: 4,  months: 2 },
  { refs: 6,  months: 3 },
  { refs: 8,  months: 4 },
  { refs: 10, months: 6 },
  { refs: 12, months: 12 },
];

export default function ReferralsTab() {
  const { lang } = useI18n();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/providers/me/referrals").then(r => setData(r.data)).catch(e => console.error(e));
  }, []);

  if (!data) return <div className="text-slate-400 text-sm" data-testid="referrals-loading">Cargando...</div>;

  const fullUrl = `${BACKEND_URL}${data.share_url}`;
  const paid = data.total_paid || 0;
  const earnedMonths = REWARD_LADDER.reduce((acc, r) => paid >= r.refs ? r.months : acc, 0);
  const nextReward = REWARD_LADDER.find(r => paid < r.refs);
  const monthsPotential = REWARD_LADDER[REWARD_LADDER.length - 1].months;

  const copy = async () => {
    try { await navigator.clipboard.writeText(fullUrl); toast.success(lang === "en" ? "Link copied" : "Enlace copiado"); }
    catch (e) { console.error("clipboard", e); toast.error(lang === "en" ? "Could not copy" : "No se pudo copiar"); }
  };
  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      lang === "en"
        ? `Join getamano! It's the most complete Latino directory in the US. Use my link: ${fullUrl}`
        : `¡Únete a getamano! Es el directorio latino más completo de USA. Usa mi enlace: ${fullUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div className="space-y-5 animate-fadeSlideUp" data-testid="referrals-tab">
      {/* Mi Cartera / Mi Wallet — hero showing live earnings */}
      <section
        className="rounded-2xl p-6 text-white shadow-xl"
        style={{ background: "linear-gradient(135deg, #0077B6 0%, #03045E 70%, #1a0838 100%)" }}
        data-testid="mi-wallet-widget"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-white/70 font-bold">
              {lang === "en" ? "My wallet" : "Mi cartera"}
            </p>
            <h3 className="font-display font-bold text-2xl text-white mt-0.5">
              {lang === "en" ? "Refer & earn months free" : "Recomienda y gana meses gratis"}
            </h3>
            <p className="text-white/85 text-sm mt-1">
              {lang === "en"
                ? `Up to ${monthsPotential} months of verification free. Each paid referral unlocks more.`
                : `Hasta ${monthsPotential} meses gratis de verificación. Cada referido pagado desbloquea más.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <WalletStat label={lang === "en" ? "Invited" : "Invitados"} value={data.total_referred} testid="ref-stat-invited" />
          <WalletStat label={lang === "en" ? "Paid refs" : "Pagaron"} value={paid} testid="ref-stat-paid" accent />
          <WalletStat label={lang === "en" ? "Months earned" : "Meses ganados"} value={earnedMonths} testid="ref-stat-earned" />
          <WalletStat label={lang === "en" ? "Already credited" : "Acreditados"} value={data.credited_months} testid="ref-stat-credited" />
        </div>

        {/* Progress bar to next reward */}
        {nextReward && (
          <div className="mt-4 bg-white/10 rounded-xl p-3" data-testid="ref-next-progress">
            <div className="flex items-center justify-between text-xs text-white/85 mb-2">
              <span>
                {lang === "en"
                  ? `Next: ${nextReward.refs - paid} more paid referrals to unlock ${nextReward.months} ${nextReward.months === 1 ? "month" : "months"} free`
                  : `Próximo: ${nextReward.refs - paid} referidos pagados más para ${nextReward.months} ${nextReward.months === 1 ? "mes" : "meses"} gratis`}
              </span>
              <span className="font-bold">{paid}/{nextReward.refs}</span>
            </div>
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-300 to-orange-400 transition-all duration-700"
                style={{ width: `${Math.min(100, (paid / nextReward.refs) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Reward ladder */}
      <section
        className="rounded-2xl bg-white border border-slate-200 p-5"
        data-testid="ref-reward-ladder"
      >
        <h4 className="font-semibold text-sm text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Gift className="w-4 h-4 text-orange-500" />
          {lang === "en" ? "Reward ladder" : "Escalera de premios"}
        </h4>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {REWARD_LADDER.map((r) => {
            const unlocked = paid >= r.refs;
            return (
              <div
                key={r.refs}
                className={`rounded-xl p-3 text-center transition-all duration-200 hover:-translate-y-0.5 ${
                  unlocked
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow"
                    : "bg-slate-50 border border-slate-100 text-slate-500"
                }`}
                data-testid={`ref-ladder-${r.refs}`}
              >
                <p className="text-[10px] uppercase font-bold tracking-wider opacity-80">{r.refs} refs</p>
                <p className="font-display font-bold text-lg">
                  {r.months}{lang === "en" ? "mo" : "mes"}
                </p>
                {unlocked && <Check className="w-3.5 h-3.5 mx-auto mt-0.5" />}
              </div>
            );
          })}
        </div>
      </section>

      {/* Share link card */}
      <section
        className="rounded-2xl border bg-white p-5"
        style={{ borderColor: "#BCC5CC" }}
        data-testid="ref-share-card"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-orange-500" />
          {lang === "en" ? "Your invite link" : "Tu enlace de invitación"}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={fullUrl}
            readOnly
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm font-mono"
            style={{ borderColor: "#BCC5CC" }}
            data-testid="ref-share-url"
            onClick={(e) => e.target.select()}
          />
          <button onClick={copy} className="btn-outline inline-flex items-center gap-1 px-4 py-2 text-sm active:scale-95 transition" data-testid="ref-copy">
            <Copy className="w-4 h-4" /> {lang === "en" ? "Copy" : "Copiar"}
          </button>
          <button onClick={shareWhatsApp} className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-semibold text-white active:scale-95 transition" style={{ backgroundColor: "#25D366" }} data-testid="ref-whatsapp">
            <Share2 className="w-4 h-4" /> WhatsApp
          </button>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-3">
          {lang === "en" ? "Your code:" : "Tu código:"} <strong style={{ color: "#03045E" }}>{data.ref_code}</strong>
        </p>
      </section>

      {/* History table */}
      {data.items.length > 0 ? (
        <div className="rounded-2xl border bg-white" style={{ borderColor: "#BCC5CC" }} data-testid="ref-history-card">
          <table className="w-full text-sm" data-testid="ref-table">
            <thead className="text-xs uppercase tracking-wider text-slate-500 border-b" style={{ borderColor: "#BCC5CC" }}>
              <tr>
                <th className="text-left p-3">{lang === "en" ? "Date" : "Fecha"}</th>
                <th className="text-left p-3">{lang === "en" ? "Status" : "Estado"}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r, i) => (
                <tr key={r.referral_id || i} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                  <td className="p-3 text-slate-700">{new Date(r.created_at).toLocaleDateString(lang === "en" ? "en-US" : "es")}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      backgroundColor: r.status === "credited" ? "#DCFCE7" : r.status === "paid" ? "#FEF3C7" : "#F1F5F9",
                      color: r.status === "credited" ? "#15803D" : r.status === "paid" ? "#92400E" : "#475569",
                    }}>
                      {r.status === "credited"
                        ? (lang === "en" ? "Credited" : "Acreditado")
                        : r.status === "paid"
                          ? (lang === "en" ? "Activated plan" : "Activó plan")
                          : (lang === "en" ? "Registered" : "Registrado")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-6" data-testid="ref-empty">
          {lang === "en"
            ? "You haven't invited anyone yet. Share your link and start earning!"
            : "Aún no has invitado a nadie. ¡Comparte tu enlace y empieza a ganar!"}
        </p>
      )}
    </div>
  );
}

function WalletStat({ label, value, testid, accent }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? "bg-white/15 ring-1 ring-white/20" : "bg-white/5"}`} data-testid={testid}>
      <div className="font-display text-3xl font-bold text-white">{value}</div>
      <div className="text-[11px] text-white/70 mt-0.5">{label}</div>
    </div>
  );
}
