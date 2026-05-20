import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function DashboardRouter() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login"); return; }
    if (user.role === "admin") navigate("/dashboard/admin", { replace: true });
    else if (user.role === "provider") navigate("/dashboard/provider", { replace: true });
    else navigate("/dashboard/client", { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
