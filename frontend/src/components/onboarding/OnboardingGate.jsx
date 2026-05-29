import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const SEEN_KEY = "gtm_onboarding_seen";

/**
 * OnboardingGate — Section 70.
 *
 * Mounted globally inside BrowserRouter. Watches every navigation and, on
 * the very first visit to the landing page by an anonymous user, redirects
 * to `/welcome` so they see the native onboarding flow.
 *
 * Rules
 * ─────
 * Trigger:    pathname === "/" AND no user AND !localStorage[SEEN_KEY]
 * Don't run:  on any other path (about, search, provider profiles, …),
 *             on logged-in users (auth is the implicit completion),
 *             or after the user has already seen the flow once.
 *
 * Why a component instead of inline logic in App?
 * Keeps the rule isolated & testable. Easy to remove if we ever decide
 * to make onboarding opt-in.
 */
export default function OnboardingGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (loading) return;
    if (user) return;
    if (pathname !== "/") return;
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "true"; } catch { /* private mode */ }
    if (seen) return;
    navigate("/welcome", { replace: true, state: { fromGate: true } });
  }, [user, loading, pathname, navigate]);

  return null;
}
