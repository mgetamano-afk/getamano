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

Wired in server.py via:

    from routes.auth import make_router as make_auth_router
    api_router.include_router(make_auth_router(...))

Uses a factory function so FastAPI captures the real dependencies at
endpoint-definition time and we sidestep the cyclic-import / late-binding
pitfalls of module-level globals.
"""
"""
from __future__ import annotations — INTENTIONALLY OMITTED.

FastAPI introspects type hints via get_type_hints() at endpoint registration.
RegisterIn/LoginIn/User are runtime closure variables passed into
make_router(), not module-level globals, so they must be evaluated eagerly.
Adding `from __future__ import annotations` here would convert hints to
strings and break body-parameter detection (FastAPI would treat `payload`
as a query param).
"""

import os
import re
import asyncio as _asyncio
import secrets as _secrets
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# OTP constants (Section 24)
OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_ATTEMPTS = 5


class SendOtpIn(BaseModel):
    email: str
    locale: Optional[str] = "es"


class VerifyOtpIn(BaseModel):
    email: str
    code: str


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
    """Build and return the auth router, closing over the shared deps."""
    router = APIRouter(tags=["auth"])

    # ─── Email / password ──────────────────────────────────────────────
    @router.post("/auth/register")
    async def register(payload: RegisterIn, response: Response, ref: Optional[str] = None):
        existing = await db.users.find_one({"email": payload.email.lower()})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": payload.email.lower(),
            "password_hash": hash_password(payload.password),
            "name": payload.name,
            "phone": normalize_phone(payload.phone),
            "role": payload.role if payload.role in ("client", "provider") else "client",
            "picture": None,
            "language": payload.preferred_language or "es",
            "preferred_language": payload.preferred_language or "es",
            "country": DEFAULT_COUNTRY,
            "email_verified": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user_doc)
        # SECTION 16C — Track referral signup (best-effort, never blocks registration)
        if ref:
            try:
                await track_referral_signup(user_id, ref)
            except Exception:
                logger.exception("referral tracking failed")
        token = create_jwt(user_id)
        response.set_cookie("session_token", token, httponly=True, secure=True, samesite="none", path="/", max_age=7 * 24 * 3600)
        user_doc.pop("password_hash", None)
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
        return {"user": User(**user_doc).model_dump(mode="json"), "token": token}

    @router.post("/auth/login")
    async def login(payload: LoginIn, response: Response):
        user_doc = await db.users.find_one({"email": payload.email.lower()})
        if not user_doc or not user_doc.get("password_hash"):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not verify_password(payload.password, user_doc["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_jwt(user_doc["user_id"])
        response.set_cookie("session_token", token, httponly=True, secure=True, samesite="none", path="/", max_age=7 * 24 * 3600)
        user_doc.pop("password_hash", None)
        user_doc.pop("_id", None)
        if isinstance(user_doc.get("created_at"), str):
            user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
        return {"user": User(**user_doc).model_dump(mode="json"), "token": token}

    @router.post("/auth/google/session")
    async def google_session(request: Request, response: Response):
        body = await request.json()
        session_id = body.get("session_id")
        role = body.get("role", "client")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id required")
        async with httpx.AsyncClient(timeout=15) as client_http:
            r = await client_http.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": session_id})
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        data = r.json()
        email = data.get("email", "").lower()
        existing = await db.users.find_one({"email": email})
        if existing:
            user_id = existing["user_id"]
        else:
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            await db.users.insert_one({
                "user_id": user_id,
                "email": email,
                "name": data.get("name", ""),
                "picture": data.get("picture"),
                "role": role if role in ("client", "provider") else "client",
                "language": "es",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        session_token = data.get("session_token")
        await db.user_sessions.insert_one({
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none", path="/", max_age=7 * 24 * 3600)
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        if isinstance(user_doc.get("created_at"), str):
            user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
        return {"user": User(**user_doc).model_dump(mode="json")}

    @router.get("/auth/me")
    async def me(user=Depends(get_current_user)):
        return user.model_dump(mode="json")

    @router.post("/auth/logout")
    async def logout(request: Request, response: Response):
        token = request.cookies.get("session_token")
        if token:
            await db.user_sessions.delete_many({"session_token": token})
        response.delete_cookie("session_token", path="/")
        return {"ok": True}

    # ─── Email OTP (Section 24) ────────────────────────────────────────
    async def _consume_resend_cooldown(email: str) -> Optional[int]:
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

    @router.post("/auth/send-otp")
    async def send_otp(payload: SendOtpIn):
        """Generate a fresh 6-digit code, store it hashed, and email it."""
        email = (payload.email or "").strip().lower()
        if "@" not in email or "." not in email:
            raise HTTPException(status_code=400, detail="Email no válido.")

        user_doc = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1, "email_verified": 1})
        if not user_doc:
            await _asyncio.sleep(0.4)
            return {"ok": True, "delivery": "queued"}
        if user_doc.get("email_verified"):
            return {"ok": True, "already_verified": True}

        cooldown = await _consume_resend_cooldown(email)
        if cooldown:
            raise HTTPException(status_code=429, detail=f"Espera {cooldown} segundos antes de pedir otro código.")

        code = f"{_secrets.randbelow(1_000_000):06d}"
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
        await db.email_otps.update_one(
            {"email": email},
            {"$set": {
                "email": email,
                "code_hash": hash_password(code),
                "attempts": 0,
                "expires_at": expires_at.isoformat(),
                "expires_at_native": expires_at,
                "created_at": now.isoformat(),
            }},
            upsert=True,
        )
        locale = (payload.locale or "es").lower()
        subject = "Tu código de verificación · getamano" if locale.startswith("es") else "Your verification code · getamano"
        html = _otp_email_html(code, locale)
        delivery = await send_email_via_resend(email, subject, html)
        return {"ok": True, "delivery": "sent" if delivery.get("sent") else "logged"}

    @router.post("/auth/verify-otp")
    async def verify_otp(payload: VerifyOtpIn):
        email = (payload.email or "").strip().lower()
        code = (payload.code or "").strip()
        if not email or not code or len(code) != 6 or not code.isdigit():
            raise HTTPException(status_code=400, detail="Código inválido.")

        rec = await db.email_otps.find_one({"email": email}, {"_id": 0})
        if not rec:
            raise HTTPException(status_code=400, detail="No hay código activo para este correo. Solicita uno nuevo.")
        try:
            if datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc):
                await db.email_otps.delete_one({"email": email})
                raise HTTPException(status_code=400, detail="El código expiró. Solicita uno nuevo.")
        except (KeyError, ValueError):
            await db.email_otps.delete_one({"email": email})
            raise HTTPException(status_code=400, detail="Código inválido. Solicita uno nuevo.")

        if rec.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
            await db.email_otps.delete_one({"email": email})
            raise HTTPException(status_code=429, detail="Demasiados intentos. Solicita un código nuevo.")

        if not verify_password(code, rec["code_hash"]):
            await db.email_otps.update_one({"email": email}, {"$inc": {"attempts": 1}})
            raise HTTPException(status_code=400, detail="Código incorrecto.")

        now_iso = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"email": email},
            {"$set": {"email_verified": True, "email_verified_at": now_iso}},
        )
        await db.email_otps.delete_one({"email": email})
        return {"ok": True, "verified_at": now_iso}

    @router.get("/auth/me/email-verified")
    async def is_email_verified(user=Depends(get_current_user)):
        u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "email": 1, "email_verified": 1})
        return {"email": u.get("email") if u else None, "email_verified": bool(u and u.get("email_verified"))}

    return router
