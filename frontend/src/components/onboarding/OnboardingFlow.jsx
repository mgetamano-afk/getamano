import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import OnboardingSplash from "./OnboardingSplash";
import OnboardingSlides from "./OnboardingSlides";
import OnboardingLogin from "./OnboardingLogin";

const STEP_KEY = "gtm_onboarding_step";   // splash | slides | login
const SEEN_KEY = "gtm_onboarding_seen";

/**
 * OnboardingFlow — Section 70 (orchestrator).
 *
 * Mounted at `/welcome`. Walks through the 3 native onboarding screens in
 * sequence: splash → slides → login. The current step is persisted to
 * `localStorage.gtm_onboarding_step` so a refresh resumes where the user
 * left off.
 *
 * Completion contract
 * ───────────────────
 * When the user finishes (taps Google, signs in, or links to /register),
 * we set `gtm_onboarding_seen=true`. The OnboardingGate then stops
 * redirecting them here.
 *
 * Already-logged-in users
 * ───────────────────────
 * If a logged-in user lands on /welcome (e.g. an old bookmark) they are
 * silently bounced to "/" so they don't have to re-onboard.
 */
export default function OnboardingFlow() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(() => {
    try { return localStorage.getItem(STEP_KEY) || "splash"; } catch { return "splash"; }
  });

  useEffect(() => {
    if (loading || !user) return;
    try { localStorage.setItem(SEEN_KEY, "true"); } catch { /* private mode */ }
    navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const goto = (next) => {
    setStep(next);
    try { localStorage.setItem(STEP_KEY, next); } catch { /* private mode */ }
  };

  const finish = () => {
    try {
      localStorage.setItem(SEEN_KEY, "true");
      localStorage.removeItem(STEP_KEY);
    } catch { /* private mode */ }
  };

  if (step === "splash") return <OnboardingSplash onContinue={() => goto("slides")} />;
  if (step === "slides") return <OnboardingSlides onDone={() => goto("login")} />;
  return (
    <OnboardingLogin
      onFinish={() => {
        finish();
        navigate("/", { replace: true });
      }}
    />
  );
}
