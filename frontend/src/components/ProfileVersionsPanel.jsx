import { useEffect, useState } from "react";
import {
  History,
  Save,
  RotateCcw,
  Tag,
  Trash2,
  Lock,
  Shield,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * ProfileVersionsPanel — Google-Docs-style history for the provider
 * profile. Section 70 / "donde quedó" feature.
 *
 * Reads:
 *   GET  /api/providers/me/versions/quota
 *   GET  /api/providers/me/versions
 * Writes:
 *   POST   /api/providers/me/versions/snapshot      { label? }
 *   POST   /api/providers/me/versions/{id}/restore
 *   DELETE /api/providers/me/versions/{id}
 *
 * UX shape:
 *   - Big "Tu trabajo está guardado ✓" banner with last-version timestamp
 *   - "Guardar versión" button (manual snapshot) — disabled on Free plan
 *     for labels (still works, just unlabeled)
 *   - Sortable list of versions: time-ago + source pill + label + actions
 *   - Restore opens a small confirm modal (data loss risk warning)
 *   - Quota footer: "5 de 30 versiones · Pro"
 */
export default function ProfileVersionsPanel() {
  const { lang } = useI18n();
  const [quota, setQuota] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingNew, setSavingNew] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState(null);
  const [newLabel, setNewLabel] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const [q, v] = await Promise.all([
        api.get("/providers/me/versions/quota"),
        api.get("/providers/me/versions"),
      ]);
      setQuota(q.data);
      setVersions(v.data || []);
    } catch (e) {
      console.error("versions panel load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const T = lang === "en" ? {
    title: "Version history",
    subtitle: "Every save is backed up. Never lose your work again.",
    safeBanner: "Your work is saved",
    noVersions: "Save a version to start your history.",
    saveNow: "Save version now",
    saving: "Saving…",
    labelPh: "Label (optional)",
    labelLockedPh: "Labels available in Pro & Premium",
    confirmRestoreTitle: "Restore this version?",
    confirmRestoreBody: "Your current profile will be overwritten with this snapshot. We'll take a safety snapshot first so you can undo if needed.",
    confirmRestoreYes: "Yes, restore",
    confirmRestoreNo: "Cancel",
    restored: "Restored! Your profile is now this version.",
    deleted: "Version deleted",
    snapshotSaved: "Version saved",
    snapshotSkipped: "No changes since the last version",
    restoreUpgrade: "Restore is a paid feature — upgrade to Basic or higher.",
    sourceAuto: "Auto",
    sourceManual: "Manual",
    sourceRestored: "Restored",
    quotaUsage: (cur, max, plan) => `${cur} of ${max ?? "∞"} versions · ${plan.toUpperCase()} plan`,
    upgradeNote: "Upgrade to Pro for 30 versions, manual labels and full restore.",
  } : {
    title: "Historial de versiones",
    subtitle: "Cada cambio se respalda. Nunca pierdas tu trabajo de nuevo.",
    safeBanner: "Tu trabajo está guardado",
    noVersions: "Guarda una versión para empezar tu historial.",
    saveNow: "Guardar versión ahora",
    saving: "Guardando…",
    labelPh: "Etiqueta (opcional)",
    labelLockedPh: "Etiquetas disponibles en Pro y Premium",
    confirmRestoreTitle: "¿Restaurar esta versión?",
    confirmRestoreBody: "Tu perfil actual será reemplazado por este respaldo. Tomaremos un snapshot de seguridad primero para que puedas deshacer.",
    confirmRestoreYes: "Sí, restaurar",
    confirmRestoreNo: "Cancelar",
    restored: "¡Restaurado! Tu perfil ahora es esta versión.",
    deleted: "Versión eliminada",
    snapshotSaved: "Versión guardada",
    snapshotSkipped: "No hay cambios desde la última versión",
    restoreUpgrade: "Restaurar es una función de pago — actualiza a Básico o superior.",
    sourceAuto: "Auto",
    sourceManual: "Manual",
    sourceRestored: "Restaurada",
    quotaUsage: (cur, max, plan) => `${cur} de ${max ?? "∞"} versiones · Plan ${plan.toUpperCase()}`,
    upgradeNote: "Sube a Pro para 30 versiones, etiquetas manuales y restauración completa.",
  };

  const _formatRelative = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return lang === "en" ? "just now" : "ahora mismo";
    if (mins < 60) return lang === "en" ? `${mins} min ago` : `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return lang === "en" ? `${hrs}h ago` : `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return lang === "en" ? `${days}d ago` : `hace ${days}d`;
    return d.toLocaleDateString(lang === "en" ? "en-US" : "es-ES", { day: "numeric", month: "short" });
  };

  const sourcePill = (src) => {
    const map = {
      auto: { bg: "#EFF6FF", color: "#1D4ED8", label: T.sourceAuto, Icon: Save },
      manual: { bg: "#FEF3C7", color: "#B45309", label: T.sourceManual, Icon: Tag },
      restored: { bg: "#F0FDF4", color: "#15803D", label: T.sourceRestored, Icon: RotateCcw },
    };
    const m = map[src] || map.auto;
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
            style={{ background: m.bg, color: m.color }}>
        <m.Icon className="w-2.5 h-2.5" /> {m.label}
      </span>
    );
  };

  const doSaveNow = async () => {
    setSavingNew(true);
    try {
      const r = await api.post("/providers/me/versions/snapshot", { label: newLabel || null });
      if (r.data?.skipped) toast.info(T.snapshotSkipped);
      else toast.success(T.snapshotSaved);
      setNewLabel("");
      refresh();
    } catch (e) {
      toast.error(lang === "en" ? "Failed to save version" : "No se pudo guardar la versión");
      console.error(e);
    } finally {
      setSavingNew(false);
    }
  };

  const doRestore = async (vid) => {
    try {
      await api.post(`/providers/me/versions/${vid}/restore`);
      toast.success(T.restored);
      setConfirmRestoreId(null);
      refresh();
    } catch (e) {
      if (e.response?.status === 402) {
        toast.error(T.restoreUpgrade);
      } else {
        toast.error(lang === "en" ? "Restore failed" : "No se pudo restaurar");
      }
      setConfirmRestoreId(null);
    }
  };

  const doDelete = async (vid) => {
    if (!window.confirm(lang === "en" ? "Delete this version permanently?" : "¿Eliminar esta versión permanentemente?")) return;
    try {
      await api.delete(`/providers/me/versions/${vid}`);
      toast.success(T.deleted);
      refresh();
    } catch {
      toast.error(lang === "en" ? "Delete failed" : "No se pudo eliminar");
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-slate-500" data-testid="versions-panel-loading">
        {lang === "en" ? "Loading…" : "Cargando…"}
      </div>
    );
  }

  const lastVersion = versions[0];
  const canLabel = !!quota?.can_label;
  const canRestore = !!quota?.can_restore;

  return (
    <div className="space-y-5" data-testid="profile-versions-panel">
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <History className="w-5 h-5" style={{ color: "#025F67" }} />
          {T.title}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">{T.subtitle}</p>
      </div>

      {/* Safe banner */}
      <div
        className="rounded-2xl p-4 flex items-center gap-3"
        style={{ background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)", border: "1.5px solid #5DCAA5" }}
        data-testid="versions-safe-banner"
      >
        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-emerald-900 text-sm">{T.safeBanner}</p>
          <p className="text-xs text-emerald-700">
            {lastVersion
              ? `${lang === "en" ? "Last save" : "Último guardado"}: ${_formatRelative(lastVersion.created_at)}`
              : T.noVersions}
          </p>
        </div>
      </div>

      {/* Manual save form */}
      <div className="rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row gap-2" data-testid="versions-save-form">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value.slice(0, 60))}
          placeholder={canLabel ? T.labelPh : T.labelLockedPh}
          disabled={!canLabel}
          className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-teal-500 disabled:bg-slate-50 disabled:text-slate-400"
          data-testid="versions-label-input"
        />
        <button
          type="button"
          onClick={doSaveNow}
          disabled={savingNew}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg text-white text-sm font-bold transition active:scale-95 hover:brightness-110 disabled:opacity-60"
          style={{ background: "#025F67" }}
          data-testid="versions-save-now"
        >
          <Save className="w-4 h-4" />
          {savingNew ? T.saving : T.saveNow}
        </button>
      </div>

      {/* Versions list */}
      <div className="space-y-2" data-testid="versions-list">
        {versions.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-6">{T.noVersions}</div>
        )}
        {versions.map((v) => (
          <div
            key={v.version_id}
            className="rounded-xl border border-slate-200 p-3 flex items-center gap-3 hover:border-teal-300 hover:bg-teal-50/30 transition-colors"
            data-testid={`version-row-${v.version_id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-slate-900">
                  {v.label || (lang === "en" ? "Profile snapshot" : "Snapshot de perfil")}
                </span>
                {sourcePill(v.source)}
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" /> {_formatRelative(v.created_at)}
                <span className="text-slate-300">·</span>
                <span className="font-mono text-[10px]">{v.version_id.slice(3, 11)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canRestore ? (
                <button
                  type="button"
                  onClick={() => setConfirmRestoreId(v.version_id)}
                  className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-xs font-bold text-white transition active:scale-95 hover:brightness-110"
                  style={{ background: "#F97316" }}
                  data-testid={`version-restore-${v.version_id}`}
                  title={lang === "en" ? "Restore this version" : "Restaurar esta versión"}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> {lang === "en" ? "Restore" : "Restaurar"}
                </button>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-xs font-bold bg-slate-100 text-slate-400 cursor-not-allowed"
                  title={T.restoreUpgrade}
                  data-testid={`version-restore-locked-${v.version_id}`}
                >
                  <Lock className="w-3.5 h-3.5" /> Pro
                </span>
              )}
              <button
                type="button"
                onClick={() => doDelete(v.version_id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                title={lang === "en" ? "Delete version" : "Eliminar versión"}
                data-testid={`version-delete-${v.version_id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Quota footer */}
      {quota && (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100" data-testid="versions-quota">
          <span className="inline-flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            {T.quotaUsage(quota.current_count, quota.max_versions, quota.plan)}
          </span>
          {quota.plan === "free" && (
            <a href="/plans" className="inline-flex items-center gap-1 text-teal-700 font-semibold hover:underline">
              <Sparkles className="w-3 h-3" /> {T.upgradeNote}
            </a>
          )}
        </div>
      )}

      {/* Restore confirm modal */}
      {confirmRestoreId && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmRestoreId(null)}
          data-testid="versions-restore-modal"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setConfirmRestoreId(null)}
              className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
              data-testid="versions-restore-modal-close"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-3">
              <RotateCcw className="w-6 h-6" style={{ color: "#F97316" }} />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">{T.confirmRestoreTitle}</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">{T.confirmRestoreBody}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => doRestore(confirmRestoreId)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl text-white text-sm font-bold active:scale-95 hover:brightness-110"
                style={{ background: "#F97316" }}
                data-testid="versions-restore-confirm"
              >
                <RotateCcw className="w-4 h-4" />
                {T.confirmRestoreYes}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRestoreId(null)}
                className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
                data-testid="versions-restore-cancel"
              >
                {T.confirmRestoreNo}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
