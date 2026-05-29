import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { api } from "../../lib/api";

/**
 * SelectRolePage — Section 73 (post-OAuth role decision).
 *
 * Visited automatically after a NEW user completes social auth (Google /
 * Apple / Facebook) when the backend hasn't yet set a role. Returning
 * users with a role already assigned are bounced back to "/".
 *
 * Design
 * ──────
 * Two large 50/50 cards — Cliente | Proveedor — with icons and a one-line
 * value prop each. Tap a card → POST /api/auth/set-role → if "provider",
 * route to /provider/onboarding to finish profile, else / (client lands
 * on the search-first home).
 */
export default function SelectRolePage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuth();
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    // Already has a role → forward to the right home
    if (user.role) {
      navigate(user.role === "provider" ? "/dashboard/provider" : "/", { replace: true });
    }
  }, [user, loading, navigate]);

  const pick = async (role) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.post("/auth/set-role", { role });
      await refresh?.();
      navigate(role === "provider" ? "/provider/onboarding" : "/", { replace: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo guardar el rol");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center font-poppins px-6"
      style={{
        backgroundColor: "var(--gtm-blue-surface, #CAF0F8)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 2rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2rem)",
      }}
      data-testid="select-role-page"
    >
      <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-center mb-2" style={{ color: "#03045E", letterSpacing: "-0.02em" }}>
          {t("role.title")}
        </h1>
        <p className="text-sm text-center text-[#03045E]/70 mb-8 max-w-sm">
          {t("role.subtitle")}
        </p>

        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RoleCard
            id="client"
            Icon={User}
            title={t("role.client_title")}
            desc={t("role.client_desc")}
            onPick={() => pick("client")}
            disabled={saving}
          />
          <RoleCard
            id="provider"
            Icon={Briefcase}
            title={t("role.provider_title")}
            desc={t("role.provider_desc")}
            onPick={() => pick("provider")}
            disabled={saving}
          />
        </div>

        {saving && (
          <div className="mt-6 flex items-center gap-2 text-sm text-[#03045E]/70">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("role.saving")}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleCard({ id, Icon, title, desc, onPick, disabled }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="group relative h-44 rounded-3xl bg-white shadow-lg hover:shadow-xl active:scale-[0.98] transition-all p-6 flex flex-col items-start text-left disabled:opacity-50 disabled:cursor-wait"
      style={{ borderTop: "4px solid var(--gtm-blue-primary, #0077B6)" }}
      data-testid={`select-role-${id}`}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: "var(--gtm-blue-surface, #CAF0F8)" }}
      >
        <Icon className="w-6 h-6" style={{ color: "var(--gtm-blue-primary, #0077B6)" }} strokeWidth={2.2} />
      </div>
      <p className="font-bold text-lg leading-tight mb-1" style={{ color: "#03045E" }}>{title}</p>
      <p className="text-xs leading-snug text-[#03045E]/65">{desc}</p>
    </button>
  );
}
