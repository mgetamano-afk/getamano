"""
Messaging — Section 73.

Unified async wrapper around sent.dm for SMS + WhatsApp delivery.

🔑 Operating modes:

  1. **sandbox** (DEFAULT, no SENT_DM_API_KEY set):
       - No network calls.
       - Inserts message records into MongoDB collection `messages` with
         status='sandbox_queued' and a fake `provider_message_id`.
       - Logs to backend.log so the dev can verify content + recipient.
       - Used by ALL flows during development — works end-to-end with no key.

  2. **production** (SENT_DM_API_KEY set + APP_ENV=production):
       - Calls the real sent.dm API via the official SDK.
       - Persists message records with provider_message_id + initial status.
       - Webhook handler in routes/sentdm_webhook.py updates status async.

The wrapper exposes 3 top-level helpers (anyone in the codebase can call):

  await send_whatsapp(db, to, template_name, lang='es', variables={})
  await send_sms(db, to, template_name, lang='es', variables={})
  await send_otp(db, to, code, lang='es')   # always SMS

Plus a smart helper that respects the recipient's locale preference:

  await deliver_notification(db, user_id, template_name, variables={})
    → automatically picks WhatsApp (if provider, Spanish preferred) or
      SMS (if client, English preferred) based on user.preferred_language
      and role. Falls back to in-app notification only if both unavailable.

The sent.dm SDK call is centralized in `_send_via_sentdm()` so the day you
provide the production key it's the only function that needs to be enabled
(currently raises `NotImplementedError`).
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from integrations.messaging_templates import (
    render,
    get_template_id_wa,
    get_category,
    TemplateNotFoundError,
)

logger = logging.getLogger("messaging")

E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")


def _is_sandbox() -> bool:
    """Sandbox mode when API key absent OR explicitly set to dev."""
    api_key = (os.environ.get("SENT_DM_API_KEY") or "").strip()
    app_env = (os.environ.get("APP_ENV") or "development").lower()
    return not api_key or app_env != "production"


def _normalize_phone(phone: str) -> str:
    """Best-effort E.164 normalization. Returns input unchanged if already valid.

    Strips spaces, dashes, parens. Adds +1 prefix for 10-digit US-looking
    numbers (most Latino providers register without +1).
    """
    if not phone:
        return ""
    clean = re.sub(r"[\s\-\(\)]", "", phone.strip())
    if E164_RE.match(clean):
        return clean
    # 10 digits — assume US
    if re.match(r"^\d{10}$", clean):
        return f"+1{clean}"
    # 11 digits starting with 1 — US without +
    if re.match(r"^1\d{10}$", clean):
        return f"+{clean}"
    # Already has + but spaces around it (shouldn't happen post-cleanup, but defensive)
    if clean.startswith("+"):
        return clean
    return clean  # caller will see validation failure later if format is wrong


def _validate_recipient(phone: str) -> str:
    """Normalize + validate. Raises ValueError if not E.164-compatible."""
    normalized = _normalize_phone(phone)
    if not E164_RE.match(normalized):
        raise ValueError(f"Phone must be E.164 format (got: {phone!r})")
    return normalized


async def _persist_message(
    db,
    *,
    channel: str,
    recipient: str,
    template_name: str,
    body: str,
    language: str,
    variables: dict,
    user_id: Optional[str] = None,
    provider_message_id: Optional[str] = None,
    status: str = "queued",
    sandbox: bool = False,
) -> str:
    """Insert a message record into MongoDB. Returns the message_id."""
    now = datetime.now(timezone.utc).isoformat()
    message_id = f"msg_{uuid.uuid4().hex[:14]}"
    doc = {
        "message_id": message_id,
        "channel": channel,
        "recipient": recipient,
        "template_name": template_name,
        "category": get_category(template_name),
        "body": body,
        "language": language,
        "variables": variables,
        "user_id": user_id,
        "provider": "sent.dm",
        "provider_message_id": provider_message_id,
        "status": status,
        "status_history": [{"status": status, "at": now}],
        "sandbox": sandbox,
        "created_at": now,
        "updated_at": now,
    }
    await db.messages.insert_one(doc)
    return message_id


async def _send_via_sentdm(
    *,
    channel: str,        # 'whatsapp' | 'sms'
    recipient: str,      # E.164
    body: str,           # rendered (used for SMS; WA uses template_id)
    template_id_wa: Optional[str],
    language: str,       # 'es' | 'en'
    variables: dict,
) -> dict:
    """Real sent.dm SDK call. Disabled until production key arrives.

    When you provide SENT_DM_API_KEY, this is the only function to enable.
    Implementation will be:

        from sentdm import SentDMClient   # exact SDK name TBD on first install
        client = SentDMClient(api_key=os.environ["SENT_DM_API_KEY"])
        if channel == "whatsapp":
            result = await client.messages.create(
                channel="whatsapp",
                to=recipient,
                template={"id": template_id_wa, "language": language, "variables": variables},
            )
        else:
            result = await client.messages.create(
                channel="sms",
                to=recipient,
                body=body,
            )
        return {"provider_message_id": result["id"], "status": result.get("status", "queued")}

    For now: explicit NotImplementedError so a misconfigured prod env
    fails loudly instead of silently dropping messages.
    """
    raise NotImplementedError(
        "sent.dm production sending not yet enabled. Set SENT_DM_API_KEY + "
        "APP_ENV=production + install `sent-dm-python` SDK, then enable "
        "this function in /app/backend/integrations/messaging.py"
    )


# ──────────────────────────── PUBLIC API ─────────────────────────────────


async def send_whatsapp(
    db,
    *,
    to: str,
    template_name: str,
    lang: str = "es",
    variables: Optional[dict] = None,
    user_id: Optional[str] = None,
) -> dict:
    """Send a WhatsApp template message.

    In sandbox: persists + logs. In production: calls sent.dm.
    Returns {message_id, status, sandbox: bool}.
    """
    variables = variables or {}
    try:
        recipient = _validate_recipient(to)
    except ValueError as exc:
        logger.warning("messaging.send_whatsapp invalid recipient: %s", exc)
        return {"ok": False, "error": str(exc)}
    try:
        body = render(template_name, "wa", lang, variables)
    except TemplateNotFoundError as exc:
        logger.error("messaging.send_whatsapp template error: %s", exc)
        return {"ok": False, "error": str(exc)}

    template_id_wa = get_template_id_wa(template_name)
    sandbox = _is_sandbox()
    if sandbox:
        logger.info(
            "[SANDBOX][WA] to=%s tpl=%s lang=%s body=%r",
            recipient, template_name, lang, body[:120],
        )
        provider_id = f"sb_wa_{uuid.uuid4().hex[:10]}"
        message_id = await _persist_message(
            db,
            channel="whatsapp",
            recipient=recipient,
            template_name=template_name,
            body=body,
            language=lang,
            variables=variables,
            user_id=user_id,
            provider_message_id=provider_id,
            status="sandbox_queued",
            sandbox=True,
        )
        return {"ok": True, "message_id": message_id, "provider_message_id": provider_id,
                "status": "sandbox_queued", "sandbox": True}

    # Production path
    try:
        result = await _send_via_sentdm(
            channel="whatsapp",
            recipient=recipient,
            body=body,
            template_id_wa=template_id_wa,
            language=lang,
            variables=variables,
        )
        message_id = await _persist_message(
            db,
            channel="whatsapp",
            recipient=recipient,
            template_name=template_name,
            body=body,
            language=lang,
            variables=variables,
            user_id=user_id,
            provider_message_id=result["provider_message_id"],
            status=result.get("status", "queued"),
            sandbox=False,
        )
        return {"ok": True, "message_id": message_id, **result, "sandbox": False}
    except Exception as exc:  # noqa: BLE001
        logger.exception("send_whatsapp failed in production")
        return {"ok": False, "error": str(exc)}


async def send_sms(
    db,
    *,
    to: str,
    template_name: str,
    lang: str = "es",
    variables: Optional[dict] = None,
    user_id: Optional[str] = None,
) -> dict:
    """Send a SMS. Same pattern as send_whatsapp."""
    variables = variables or {}
    try:
        recipient = _validate_recipient(to)
    except ValueError as exc:
        logger.warning("messaging.send_sms invalid recipient: %s", exc)
        return {"ok": False, "error": str(exc)}
    try:
        body = render(template_name, "sms", lang, variables)
    except TemplateNotFoundError as exc:
        logger.error("messaging.send_sms template error: %s", exc)
        return {"ok": False, "error": str(exc)}

    sandbox = _is_sandbox()
    if sandbox:
        logger.info(
            "[SANDBOX][SMS] to=%s tpl=%s lang=%s body=%r",
            recipient, template_name, lang, body,
        )
        provider_id = f"sb_sms_{uuid.uuid4().hex[:10]}"
        message_id = await _persist_message(
            db,
            channel="sms",
            recipient=recipient,
            template_name=template_name,
            body=body,
            language=lang,
            variables=variables,
            user_id=user_id,
            provider_message_id=provider_id,
            status="sandbox_queued",
            sandbox=True,
        )
        return {"ok": True, "message_id": message_id, "provider_message_id": provider_id,
                "status": "sandbox_queued", "sandbox": True}

    try:
        result = await _send_via_sentdm(
            channel="sms",
            recipient=recipient,
            body=body,
            template_id_wa=None,
            language=lang,
            variables=variables,
        )
        message_id = await _persist_message(
            db,
            channel="sms",
            recipient=recipient,
            template_name=template_name,
            body=body,
            language=lang,
            variables=variables,
            user_id=user_id,
            provider_message_id=result["provider_message_id"],
            status=result.get("status", "queued"),
            sandbox=False,
        )
        return {"ok": True, "message_id": message_id, **result, "sandbox": False}
    except Exception as exc:  # noqa: BLE001
        logger.exception("send_sms failed in production")
        return {"ok": False, "error": str(exc)}


async def send_otp(db, *, to: str, code: str, lang: str = "es") -> dict:
    """Always SMS. Used by 2FA / phone verification."""
    return await send_sms(db, to=to, template_name="otp_code", lang=lang, variables={"code": code})


async def deliver_notification(
    db,
    *,
    user_id: str,
    template_name: str,
    variables: Optional[dict] = None,
) -> dict:
    """Smart router: pick the best channel based on the user's profile.

    Decision logic:
      1. Look up the user → preferred_language + role + phone.
      2. Latino providers (role=provider, lang=es) → WhatsApp first.
      3. American clients (role=client, lang=en) → SMS first.
      4. If phone missing or invalid → return ok=False (caller may still
         show the notification in-app via the existing /notifications path).
    """
    user = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "phone": 1, "preferred_language": 1, "role": 1, "name": 1},
    )
    if not user:
        return {"ok": False, "error": "user_not_found"}
    phone = user.get("phone") or ""
    if not phone:
        return {"ok": False, "error": "no_phone_on_file"}
    lang = (user.get("preferred_language") or "es").lower()
    role = (user.get("role") or "client").lower()

    # Pick channel — provider+ES → WhatsApp, client+EN → SMS.
    # For mixed cases (provider+EN or client+ES), default to WhatsApp for
    # providers and SMS for clients (community heuristic).
    channel = "whatsapp" if role == "provider" else "sms"

    if channel == "whatsapp":
        return await send_whatsapp(db, to=phone, template_name=template_name,
                                   lang=lang, variables=variables, user_id=user_id)
    return await send_sms(db, to=phone, template_name=template_name,
                          lang=lang, variables=variables, user_id=user_id)


__all__: Any = [
    "send_whatsapp",
    "send_sms",
    "send_otp",
    "deliver_notification",
]
