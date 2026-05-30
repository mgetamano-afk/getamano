/**
 * OAuth buttons for Apple Sign In + Facebook Login.
 *
 * They gracefully degrade to "próximamente" pills when the backend has
 * no provider keys configured. The current configuration is fetched once
 * from `/api/auth/oauth-config` on first render and cached for the page.
 *
 *   <AppleSignInButton onAfterLogin={user => …} />
 *   <FacebookSignInButton onAfterLogin={user => …} />
 *
 * Both share the same disabled chrome (Próximamente) when keys are missing,
 * so we keep a single visual treatment everywhere.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

let _configPromise = null;
function fetchOauthConfig() {
  if (!_configPromise) {
    _configPromise = api.get("/auth/oauth-config")
      .then(r => r.data)
      .catch(() => ({ apple: false, facebook: false }));
  }
  return _configPromise;
}

function loadScriptOnce(src, id) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const s = document.createElement("script");
    s.id = id; s.src = src; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function BaseBtn({ testid, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full h-12 rounded-full border-2 flex items-center justify-center gap-2 font-medium transition ${
        disabled
          ? "border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50/50"
          : "border-slate-200 hover:border-slate-300 text-slate-700"
      }`}
      data-testid={testid}
    >
      {children}
    </button>
  );
}

function AppleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.41 2.21-1.215 3.018-.91.967-2.297 1.628-3.518 1.512-.157-1.078.41-2.213 1.214-3.02C13.846 1.94 15.214 1.29 16.365 1.43zM20.5 17.2c-.51 1.165-.7 1.685-1.34 2.715-.91 1.43-2.19 3.21-3.78 3.22-1.418.015-1.785-.92-3.71-.91-1.925.01-2.328.926-3.748.91-1.589-.014-2.802-1.618-3.712-3.048C1.652 16.06.83 11.59 2.61 8.62c1.26-2.107 3.252-3.341 5.123-3.341 1.905 0 3.103 1.043 4.677 1.043 1.527 0 2.457-1.045 4.66-1.045 1.667 0 3.435.91 4.694 2.476-4.126 2.262-3.456 8.16-.464 9.45z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function AppleSignInButton({ role = "client", onAfterLogin }) {
  const { lang } = useI18n();
  const { setUser } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    fetchOauthConfig().then(setCfg);
  }, []);

  useEffect(() => {
    if (!cfg?.apple || initialized.current) return;
    initialized.current = true;
    loadScriptOnce(
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
      "appleid-script",
    )
      .then(() => {
        if (window.AppleID?.auth) {
          window.AppleID.auth.init({
            clientId: cfg.apple_client_id,
            redirectURI: cfg.apple_redirect_uri || window.location.origin,
            scope: "name email",
            usePopup: true,
          });
        }
      })
      .catch(() => {
        // soft-fail: button just stays as Próximamente
        initialized.current = false;
      });
  }, [cfg]);

  const handleClick = async () => {
    if (!cfg?.apple || !window.AppleID?.auth) {
      toast.info(lang === "en" ? "Apple Sign In coming soon" : "Apple Sign In próximamente");
      return;
    }
    setBusy(true);
    try {
      const data = await window.AppleID.auth.signIn();
      const idToken = data?.authorization?.id_token;
      const firstName = data?.user?.name?.firstName;
      const lastName = data?.user?.name?.lastName;
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || undefined;
      const resp = await api.post("/auth/apple/session", { id_token: idToken, name: fullName, role });
      setUser?.(resp.data.user);
      onAfterLogin?.(resp.data.user);
      toast.success(lang === "en" ? "Welcome!" : "¡Bienvenido!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Apple login failed" : "No se pudo iniciar con Apple"));
    } finally {
      setBusy(false);
    }
  };

  const disabled = !cfg?.apple || busy;
  const label = !cfg
    ? (lang === "en" ? "Continue with Apple" : "Continuar con Apple")
    : cfg.apple
      ? (busy ? "…" : (lang === "en" ? "Continue with Apple" : "Continuar con Apple"))
      : (lang === "en" ? "Apple (coming soon)" : "Apple (próximamente)");

  return (
    <BaseBtn testid="apple-signin-button" onClick={handleClick} disabled={disabled}>
      <AppleIcon />
      {label}
    </BaseBtn>
  );
}

export function FacebookSignInButton({ role = "client", onAfterLogin }) {
  const { lang } = useI18n();
  const { setUser } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    fetchOauthConfig().then(setCfg);
  }, []);

  useEffect(() => {
    if (!cfg?.facebook || initialized.current) return;
    initialized.current = true;
    window.fbAsyncInit = function () {
      try {
        window.FB?.init({
          appId: cfg.facebook_app_id,
          cookie: true,
          xfbml: false,
          version: "v19.0",
        });
      } catch { /* swallow */ }
    };
    loadScriptOnce("https://connect.facebook.net/en_US/sdk.js", "facebook-jssdk").catch(() => {
      initialized.current = false;
    });
  }, [cfg]);

  const handleClick = () => {
    if (!cfg?.facebook || !window.FB?.login) {
      toast.info(lang === "en" ? "Facebook Login coming soon" : "Facebook Login próximamente");
      return;
    }
    setBusy(true);
    window.FB.login(
      async (response) => {
        try {
          if (!response?.authResponse) {
            toast.info(lang === "en" ? "Cancelled" : "Cancelado");
            return;
          }
          const accessToken = response.authResponse.accessToken;
          const resp = await api.post("/auth/facebook/session", { access_token: accessToken, role });
          setUser?.(resp.data.user);
          onAfterLogin?.(resp.data.user);
          toast.success(lang === "en" ? "Welcome!" : "¡Bienvenido!");
        } catch (e) {
          toast.error(e?.response?.data?.detail || (lang === "en" ? "Facebook login failed" : "No se pudo iniciar con Facebook"));
        } finally {
          setBusy(false);
        }
      },
      { scope: "public_profile,email" },
    );
  };

  const disabled = !cfg?.facebook || busy;
  const label = !cfg
    ? (lang === "en" ? "Continue with Facebook" : "Continuar con Facebook")
    : cfg.facebook
      ? (busy ? "…" : (lang === "en" ? "Continue with Facebook" : "Continuar con Facebook"))
      : (lang === "en" ? "Facebook (coming soon)" : "Facebook (próximamente)");

  return (
    <BaseBtn testid="facebook-signin-button" onClick={handleClick} disabled={disabled}>
      <FacebookIcon />
      {label}
    </BaseBtn>
  );
}
