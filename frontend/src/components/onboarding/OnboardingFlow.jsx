import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import OnboardingSplash from "./OnboardingSplash";
import OnboardingSlides from "./OnboardingSlides";
import OnboardingLogin from "./OnboardingLogin";

const STEP_KEY = "gtm_onboarding_step";   // splash | slides | login
const SEEN_KEY = "gtm_onboarding_seen";

/**
 * OnboardingFlow — Section 70 (orchestrator).
 *
 * Mounted at `/welcome`. Walks through the 3 native onboarding screens in
 * sequence: splash → slides → login. Each step is checkpoint-able via
 * localStorage so a refresh resumes on the same screen.
 *
 * Completion contract
 * ───────────────────
 * When the user finishes (taps "Crea una aquí" on /register, taps Google,
 * or signs in), we set `gtm_onboarding_seen=true`. After that, the gate
 * in App.js stops redirecting them here.
 */
export default function OnboardingFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(() => {
    try { return localStorage.getItem(STEP_KEY) || "splash"; } catch { return "splash"; }
  });

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

  // If a logged-in user accidentally lands on /welcome, push them to the app.
  useEffect(() => {
    if (location.state?.fromGate) return; // came from the splash gate
  }, [location.state]);

  if (step === "splash") {
    return <OnboardingSplash onContinue={() => goto("slides")} />;
  }
  if (step === "slides") {
    return <OnboardingSlides onDone={() => goto("login")} />;
  }
  return (
    <OnboardingLogin
      onFinish={() => {
        finish();
        navigate("/", { replace: true });
      }}
    />
  );
}
