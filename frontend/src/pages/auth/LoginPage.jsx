import { useNavigate } from "react-router-dom";
import OnboardingLogin from "../../components/onboarding/OnboardingLogin";

/**
 * LoginPage — Section 73 (unified entry point).
 *
 * Per the prompt's "one and only one auth screen" rule, this page is a
 * thin wrapper around `OnboardingLogin` (the same dual-role login that
 * lives at the end of /welcome). Every legacy auth route (/login,
 * /signin, /auth/login, /register, /signup) renders this component.
 *
 * Why a wrapper instead of using OnboardingLogin directly in routes?
 * It lets us add small page-level concerns (e.g. setting the SEEN flag,
 * tracking page views, mounting <SeoHead>) without polluting the shared
 * onboarding component.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  return (
    <OnboardingLogin
      onFinish={() => {
        try { localStorage.setItem("gtm_onboarding_seen", "true"); } catch { /* private mode */ }
        navigate("/", { replace: true });
      }}
    />
  );
}
