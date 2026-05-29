import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

/**
 * /r/:code — Referral link landing.
 *
 * Persists the code to sessionStorage (so it survives even if the user
 * logs in via Google OAuth or other indirect flows) and then redirects to
 * /register with the code in the URL so the existing /auth/register?ref=
 * tracking still works without any backend changes.
 */
export default function ReferralLanding() {
  const { code } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (code) {
      try { sessionStorage.setItem("gtm_ref_code", code); } catch { /* ignore */ }
    }
    // Replace so user can't accidentally land back here on back-button
    navigate(`/register?ref=${encodeURIComponent(code || "")}`, { replace: true });
  }, [code, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FCFD]">
      <div className="text-sm text-slate-500">Redirigiendo…</div>
    </div>
  );
}
