"""
Auth module — Sections 17/24 extracted from server.py.

Holds every `/api/auth/*` endpoint:
  - POST /auth/register        (email/password + ref tracking)
  - POST /auth/login           (email/password)
  - POST /auth/google/session  (Emergent Google OAuth)
  - GET  /auth/me
  - POST /auth/logout
  - POST /auth/send-otp        (Section 24 email OTP)
  - POST /auth/verify-otp
  - GET  /auth/me/email-verified

`make_router(...)` is a thin wiring function: it captures shared deps once
in a SimpleNamespace and delegates the actual business logic to module-level
`_do_*` helpers below. Splitting the bodies out keeps `make_router` small
and each handler independently readable / testable.

`from __future__ import annotations` is INTENTIONALLY OMITTED — FastAPI
introspects type hints via get_type_hints() at endpoint registration, and
runtime closure variables like RegisterIn/LoginIn must be evaluated eagerly.
"""

import asyncio as _asyncio
import logging
import os
import secrets as _secrets
import uuid
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# OTP constants (Section 24)
OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_ATTEMPTS = 5

_COOKIE_DEFAULTS = {
    "httponly": True,
    "secure": True,
    "samesite": "none",
    "path": "/",
    "max_age": 7 * 24 * 3600,
}


class SendOtpIn(BaseModel):
    email: str
    locale: Optional[str] = "es"


class VerifyOtpIn(BaseModel):
    email: str
    code: str


# Password reset (Section 44)
PASSWORD_RESET_TTL_MINUTES = 60
PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60
PASSWORD_MIN_LENGTH = 8


class ForgotPasswordIn(BaseModel):
    email: str
    locale: Optional[str] = "es"


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


# ─────────────────────────────────────────────────────────────────────────
# Small helpers (kept module-level so each is independently testable)
# ─────────────────────────────────────────────────────────────────────────

def _otp_email_html(code: str, locale: str = "es") -> str:
    """Branded HTML email — uses inline CSS only for max client compatibility."""
    is_en = locale.startswith("en")
    title = "Confirm your email" if is_en else "Confirma tu correo"
    intro = (
        "Use this code to verify your getamano account. It expires in 10 minutes."
        if is_en
        else "Usa este código para verificar tu cuenta de getamano. Caduca en 10 minutos."
    )
    note = (
        "If you didn't request this, ignore this email."
        if is_en
        else "Si no solicitaste este código, ignora este correo."
    )
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:40px 20px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.06);">
      <tr><td style="background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);padding:32px 28px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">getamano</h1>
        <p style="margin:6px 0 0 0;color:rgba(255,255,255,0.85);font-size:13px;">{("Latino marketplace USA" if is_en else "Marketplace latino en USA")}</p>
      </td></tr>
      <tr><td style="padding:36px 32px 8px 32px;">
        <h2 style="margin:0 0 12px 0;color:#0F172A;font-size:20px;font-weight:700;">{title}</h2>
        <p style="margin:0 0 28px 0;color:#475569;font-size:15px;line-height:1.55;">{intro}</p>
        <div style="text-align:center;margin:0 0 28px 0;">
          <div style="display:inline-block;background:#F8FAFC;border:2px dashed #E2E8F0;border-radius:16px;padding:18px 28px;">
            <span style="display:block;font-size:11px;color:#94A3B8;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">{("Your code" if is_en else "Tu código")}</span>
            <span style="display:block;font-size:38px;letter-spacing:10px;font-weight:800;color:#025F67;font-family:'SF Mono',Menlo,Monaco,monospace;">{code}</span>
          </div>
        </div>
        <p style="margin:0 0 8px 0;color:#94A3B8;font-size:13px;line-height:1.5;">{note}</p>
      </td></tr>
      <tr><td style="background:#F8FAFC;padding:18px 32px;text-align:center;border-top:1px solid #E2E8F0;">
        <p style="margin:0;color:#94A3B8;font-size:12px;">© getamano 2026 — {("Verified Latino marketplace" if is_en else "Marketplace latino verificado")}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie("session_token", token, **_COOKIE_DEFAULTS)


def _password_reset_email_html(reset_url: str, locale: str = "es") -> str:
    """Branded HTML email — uses inline CSS only for max client compatibility."""
    is_en = locale.startswith("en")
    title = "Reset your password" if is_en else "Restablece tu contraseña"
    intro = (
        "Click the button below to set a new password. The link expires in 60 minutes."
        if is_en
        else "Haz clic en el botón para crear una nueva contraseña. El enlace caduca en 60 minutos."
    )
    cta = "Set new password" if is_en else "Crear nueva contraseña"
    note = (
        "If you didn't request this, ignore this email — your password stays the same."
        if is_en
        else "Si no solicitaste este cambio, ignora este correo — tu contraseña seguirá igual."
    )
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:40px 20px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.06);">
      <tr><td style="background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);padding:32px 28px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">getamano</h1>
        <p style="margin:6px 0 0 0;color:rgba(255,255,255,0.85);font-size:13px;">{("Latino marketplace USA" if is_en else "Marketplace latino en USA")}</p>
      </td></tr>
      <tr><td style="padding:36px 32px 8px 32px;">
        <h2 style="margin:0 0 12px 0;color:#0F172A;font-size:20px;font-weight:700;">{title}</h2>
        <p style="margin:0 0 28px 0;color:#475569;font-size:15px;line-height:1.55;">{intro}</p>
        <div style="text-align:center;margin:0 0 24px 0;">
          <a href="{reset_url}" style="display:inline-block;background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:bold;font-size:15px;">{cta} →</a>
        </div>
        <p style="margin:0 0 8px 0;color:#94A3B8;font-size:12px;text-align:center;">
          {("Or copy this link:" if is_en else "O copia este enlace:")}<br/>
          <span style="color:#64748B;font-size:11px;word-break:break-all;">{reset_url}</span>
        </p>
        <p style="margin:24px 0 0 0;color:#94A3B8;font-size:13px;line-height:1.5;">{note}</p>
      </td></tr>
      <tr><td style="background:#F8FAFC;padding:18px 32px;text-align:center;border-top:1px solid #E2E8F0;">
        <p style="margin:0;color:#94A3B8;font-size:12px;">© getamano 2026 — Latin Ventures LLC</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def _hydrate_user_doc(user_doc: dict) -> dict:
    """Strip Mongo internals and parse created_at."""
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    return user_doc


def _is_valid_email_shape(email: str) -> bool:
    return "@" in email and "." in email


# ─────────────────────────────────────────────────────────────────────────
# Handler bodies — each takes a `deps` SimpleNamespace so they're trivially
# testable and `make_router` stays a thin wiring layer.
# ─────────────────────────────────────────────────────────────────────────

async def _do_register(deps, payload, response: Response, ref: Optional[str]) -> dict:
    existing = await deps.db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": payload.email.lower(),
        "password_hash": deps.hash_password(payload.password),
        "name": payload.name,
        "phone": deps.normalize_phone(payload.phone),
        "role": payload.role if payload.role in ("client", "provider") else "client",
        "picture": None,
        "language": payload.preferred_language or "es",
        "preferred_language": payload.preferred_language or "es",
        "country": deps.DEFAULT_COUNTRY,
        "email_verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await deps.db.users.insert_one(user_doc)
    # SECTION 16C — Track referral signup (best-effort, never blocks registration)
    if ref:
        try:
            await deps.track_referral_signup(user_id, ref)
        except Exception:
            logger.exception("referral tracking failed")
    token = deps.create_jwt(user_id)
    _set_session_cookie(response, token)
    return {"user": deps.User(**_hydrate_user_doc(user_doc)).model_dump(mode="json"), "token": token}


async def _do_login(deps, payload, response: Response) -> dict:
    user_doc = await deps.db.users.find_one({"email": payload.email.lower()})
    if not user_doc or not user_doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not deps.verify_password(payload.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = deps.create_jwt(user_doc["user_id"])
    _set_session_cookie(response, token)
    return {"user": deps.User(**_hydrate_user_doc(user_doc)).model_dump(mode="json"), "token": token}


async def _do_google_session(deps, request: Request, response: Response) -> dict:
    body = await request.json()
    session_id = body.get("session_id")
    role = body.get("role", "client")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    async with httpx.AsyncClient(timeout=15) as client_http:
        r = await client_http.get(deps.EMERGENT_AUTH_URL, headers={"X-Session-ID": session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data.get("email", "").lower()
    user_id = await _get_or_create_google_user(deps, email, data, role)
    session_token = data.get("session_token")
    await deps.db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie("session_token", session_token, **_COOKIE_DEFAULTS)
    user_doc = await deps.db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": deps.User(**_hydrate_user_doc(user_doc)).model_dump(mode="json")}


async def _get_or_create_google_user(deps, email: str, data: dict, role: str) -> str:
    existing = await deps.db.users.find_one({"email": email})
    if existing:
        return existing["user_id"]
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await deps.db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": data.get("name", ""),
        "picture": data.get("picture"),
        "role": role if role in ("client", "provider") else "client",
        "language": "es",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return user_id


async def _do_logout(deps, request: Request, response: Response) -> dict:
    token = request.cookies.get("session_token")
    if token:
        await deps.db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ─── OTP helpers ───────────────────────────────────────────────────────

async def _resend_cooldown_remaining(db, email: str) -> Optional[int]:
    last = await db.email_otps.find_one({"email": email}, {"_id": 0, "created_at": 1})
    if not last:
        return None
    try:
        prev = datetime.fromisoformat(last["created_at"])
    except Exception:
        return None
    elapsed = (datetime.now(timezone.utc) - prev).total_seconds()
    if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
        return int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
    return None


async def _do_send_otp(deps, payload: SendOtpIn) -> dict:
    email = (payload.email or "").strip().lower()
    if not _is_valid_email_shape(email):
        raise HTTPException(status_code=400, detail="Email no válido.")
    user_doc = await deps.db.users.find_one({"email": email}, {"_id": 0, "user_id": 1, "email_verified": 1})
    if not user_doc:
        # Don't leak which emails exist; small delay to mimic real work.
        await _asyncio.sleep(0.4)
        return {"ok": True, "delivery": "queued"}
    if user_doc.get("email_verified"):
        return {"ok": True, "already_verified": True}
    cooldown = await _resend_cooldown_remaining(deps.db, email)
    if cooldown:
        raise HTTPException(status_code=429, detail=f"Espera {cooldown} segundos antes de pedir otro código.")
    delivery = await _persist_otp(deps, email, payload.locale)
    return {"ok": True, "delivery": "sent" if delivery.get("sent") else "logged"}


async def _persist_otp(deps, email: str, locale: Optional[str]) -> dict:
    code = f"{_secrets.randbelow(1_000_000):06d}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
    await deps.db.email_otps.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "code_hash": deps.hash_password(code),
            "attempts": 0,
            "expires_at": expires_at.isoformat(),
            "expires_at_native": expires_at,
            "created_at": now.isoformat(),
        }},
        upsert=True,
    )
    loc = (locale or "es").lower()
    subject = "Tu código de verificación · getamano" if loc.startswith("es") else "Your verification code · getamano"
    html = _otp_email_html(code, loc)
    return await deps.send_email_via_resend(email, subject, html)


async def _validate_otp_record(db, email: str, code: str) -> dict:
    """Return the OTP record after validating shape, presence, expiry, attempts."""
    if not email or not code or len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Código inválido.")
    rec = await db.email_otps.find_one({"email": email}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="No hay código activo para este correo. Solicita uno nuevo.")
    try:
        expired = datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc)
    except (KeyError, ValueError):
        await db.email_otps.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="Código inválido. Solicita uno nuevo.")
    if expired:
        await db.email_otps.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="El código expiró. Solicita uno nuevo.")
    if rec.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        await db.email_otps.delete_one({"email": email})
        raise HTTPException(status_code=429, detail="Demasiados intentos. Solicita un código nuevo.")
    return rec


async def _do_verify_otp(deps, payload: VerifyOtpIn) -> dict:
    email = (payload.email or "").strip().lower()
    code = (payload.code or "").strip()
    rec = await _validate_otp_record(deps.db, email, code)
    if not deps.verify_password(code, rec["code_hash"]):
        await deps.db.email_otps.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Código incorrecto.")
    now_iso = datetime.now(timezone.utc).isoformat()
    await deps.db.users.update_one(
        {"email": email},
        {"$set": {"email_verified": True, "email_verified_at": now_iso}},
    )
    await deps.db.email_otps.delete_one({"email": email})
    return {"ok": True, "verified_at": now_iso}


async def _do_email_verified(deps, user) -> dict:
    u = await deps.db.users.find_one({"user_id": user.user_id}, {"_id": 0, "email": 1, "email_verified": 1})
    return {"email": u.get("email") if u else None, "email_verified": bool(u and u.get("email_verified"))}


# ─── Password reset (Section 44) ───────────────────────────────────────

async def _resolve_public_url(request: Request) -> str:
    """Best-effort detection of the public URL the frontend was loaded from,
    falling back to env when called from a background job."""
    forwarded = request.headers.get("origin") or request.headers.get("referer") or ""
    if forwarded.startswith("http"):
        return forwarded.split("/api", 1)[0].rstrip("/")
    return (os.environ.get("PUBLIC_URL") or "https://getamano.us").rstrip("/")


async def _do_forgot_password(deps, payload: ForgotPasswordIn, request: Request) -> dict:
    email = (payload.email or "").strip().lower()
    if not _is_valid_email_shape(email):
        raise HTTPException(status_code=400, detail="Email no válido.")
    user_doc = await deps.db.users.find_one({"email": email}, {"_id": 0, "user_id": 1, "name": 1})
    # Don't leak which emails exist — always respond OK.
    if not user_doc:
        await _asyncio.sleep(0.4)
        return {"ok": True}
    # Throttle re-requests
    last = await deps.db.password_resets.find_one({"email": email}, {"_id": 0, "created_at": 1})
    if last:
        try:
            prev = datetime.fromisoformat(last["created_at"])
            elapsed = (datetime.now(timezone.utc) - prev).total_seconds()
            if elapsed < PASSWORD_RESET_RESEND_COOLDOWN_SECONDS:
                wait = int(PASSWORD_RESET_RESEND_COOLDOWN_SECONDS - elapsed)
                raise HTTPException(status_code=429, detail=f"Espera {wait} segundos antes de pedir otro enlace.")
        except (KeyError, ValueError):
            pass

    raw_token = _secrets.token_urlsafe(32)
    token_hash = deps.hash_password(raw_token)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES)
    await deps.db.password_resets.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "user_id": user_doc["user_id"],
            "token_hash": token_hash,
            "expires_at": expires_at.isoformat(),
            "expires_at_native": expires_at,  # for TTL index, if present
            "created_at": now.isoformat(),
            "used_at": None,
        }},
        upsert=True,
    )

    public_url = await _resolve_public_url(request)
    reset_url = f"{public_url}/reset-password?token={raw_token}"
    locale = (payload.locale or "es").lower()
    subject = "Restablece tu contraseña · getamano" if locale.startswith("es") else "Reset your password · getamano"
    html = _password_reset_email_html(reset_url, locale)
    delivery = await deps.send_email_via_resend(email, subject, html)
    # In dev fallback mode, surface the raw link so the founder can test without Resend.
    if not delivery.get("sent"):
        logger.warning("[PASSWORD-RESET DEV-FALLBACK] %s -> %s", email, reset_url)
    return {"ok": True}


async def _do_reset_password(deps, payload: ResetPasswordIn) -> dict:
    raw_token = (payload.token or "").strip()
    new_password = payload.new_password or ""
    if not raw_token or len(raw_token) < 16:
        raise HTTPException(status_code=400, detail="Token inválido.")
    if len(new_password) < PASSWORD_MIN_LENGTH:
        raise HTTPException(status_code=400, detail=f"La contraseña debe tener al menos {PASSWORD_MIN_LENGTH} caracteres.")

    # Search across all unexpired records — we hash-compare against each since
    # the token itself is never stored in plaintext.
    now = datetime.now(timezone.utc)
    candidates = await deps.db.password_resets.find(
        {"used_at": None}, {"_id": 0},
    ).limit(50).to_list(50)
    record = None
    for rec in candidates:
        try:
            if datetime.fromisoformat(rec["expires_at"]) < now:
                continue
        except (KeyError, ValueError):
            continue
        if deps.verify_password(raw_token, rec["token_hash"]):
            record = rec
            break
    if not record:
        raise HTTPException(status_code=400, detail="El enlace expiró o ya fue usado. Solicita uno nuevo.")

    new_hash = deps.hash_password(new_password)
    await deps.db.users.update_one(
        {"user_id": record["user_id"]},
        {"$set": {"password_hash": new_hash, "password_changed_at": now.isoformat()}},
    )
    await deps.db.password_resets.update_one(
        {"email": record["email"]},
        {"$set": {"used_at": now.isoformat()}},
    )
    # Invalidate every active session so the old password truly stops working.
    await deps.db.user_sessions.delete_many({"user_id": record["user_id"]})
    return {"ok": True, "email": record["email"]}


# ─────────────────────────────────────────────────────────────────────────
# Router factory — just wires the deps and registers each endpoint.
# Cyclomatic complexity ≈ 9 (one closure per route, no branching).
# ─────────────────────────────────────────────────────────────────────────

def make_router(
    *,
    db,
    User,
    RegisterIn,
    LoginIn,
    get_current_user,
    hash_password,
    verify_password,
    create_jwt,
    normalize_phone,
    track_referral_signup,
    send_email_via_resend,
    EMERGENT_AUTH_URL: str,
    DEFAULT_COUNTRY: str = "US",
) -> APIRouter:
    """Build and return the auth router, capturing deps in a closure."""
    deps = SimpleNamespace(
        db=db,
        User=User,
        hash_password=hash_password,
        verify_password=verify_password,
        create_jwt=create_jwt,
        normalize_phone=normalize_phone,
        track_referral_signup=track_referral_signup,
        send_email_via_resend=send_email_via_resend,
        EMERGENT_AUTH_URL=EMERGENT_AUTH_URL,
        DEFAULT_COUNTRY=DEFAULT_COUNTRY,
    )
    router = APIRouter(tags=["auth"])

    @router.post("/auth/register")
    async def register(payload: RegisterIn, response: Response, ref: Optional[str] = None):
        return await _do_register(deps, payload, response, ref)

    @router.post("/auth/login")
    async def login(payload: LoginIn, response: Response):
        return await _do_login(deps, payload, response)

    @router.post("/auth/google/session")
    async def google_session(request: Request, response: Response):
        return await _do_google_session(deps, request, response)

    @router.get("/auth/me")
    async def me(user=Depends(get_current_user)):
        return user.model_dump(mode="json")

    @router.post("/auth/logout")
    async def logout(request: Request, response: Response):
        return await _do_logout(deps, request, response)

    @router.post("/auth/send-otp")
    async def send_otp(payload: SendOtpIn):
        return await _do_send_otp(deps, payload)

    @router.post("/auth/verify-otp")
    async def verify_otp(payload: VerifyOtpIn):
        return await _do_verify_otp(deps, payload)

    @router.get("/auth/me/email-verified")
    async def is_email_verified(user=Depends(get_current_user)):
        return await _do_email_verified(deps, user)

    @router.post("/auth/forgot-password")
    async def forgot_password(payload: ForgotPasswordIn, request: Request):
        return await _do_forgot_password(deps, payload, request)

    @router.post("/auth/reset-password")
    async def reset_password(payload: ResetPasswordIn):
        return await _do_reset_password(deps, payload)

    return router
