import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// Section 74 BUG-6 — when a user lands on /referrals, /wallet, /account
// etc., DashboardRouter is also responsible for adding the right tab
// query to the provider dashboard so the experience feels seamless
// instead of dumping them on the default tab.
const PATH_TO_PROVIDER_TAB = {
  "/referrals": "referidos",
  "/referidos": "referidos",
  "/wallet": "referidos",
  "/cartera": "referidos",
};

export default function DashboardRouter() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Preserve the original intent so the login screen can route back
      // to /referrals or /wallet after a successful sign-in.
      const next = location.pathname + (location.search || "");
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    const tab = PATH_TO_PROVIDER_TAB[location.pathname];
    if (user.role === "admin") {
      navigate("/dashboard/admin", { replace: true });
    } else if (user.role === "provider") {
      const suffix = tab ? `?tab=${tab}` : "";
      navigate(`/dashboard/provider${suffix}`, { replace: true });
    } else {
      navigate("/dashboard/client", { replace: true });
    }
  }, [user, loading, navigate, location.pathname, location.search]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
