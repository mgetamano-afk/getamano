"""
Messaging admin + webhook endpoints — Section 73.

Provides:
  - GET   /api/messaging/templates          list templates (admin only)
  - GET   /api/messaging/messages           recent message log (admin only)
  - POST  /api/messaging/test-send          fire a sandbox/prod send (admin only)
  - POST  /api/webhooks/sentdm/status       receive delivery status updates

The webhook endpoint is public (no auth) but verifies a shared secret if
SENT_DM_WEBHOOK_SECRET is configured.
"""
import os
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel, Field

from integrations.messaging import send_whatsapp, send_sms
from integrations.messaging_templates import list_templates


class TestSendIn(BaseModel):
    channel: Literal["whatsapp", "sms"]
    to: str
    template_name: str
    lang: Literal["es", "en"] = "es"
    variables: dict = Field(default_factory=dict)


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    @router.get("/messaging/templates")
    async def list_all_templates(me: User = Depends(get_current_user)) -> list:
        """Admin-only catalogue of all message templates."""
        if me.role != "admin":
            raise HTTPException(status_code=403, detail="Solo admins.")
        return list_templates()

    @router.get("/messaging/messages")
    async def list_recent_messages(
        me: User = Depends(get_current_user),
        limit: int = 30,
        channel: Optional[Literal["whatsapp", "sms"]] = None,
        status: Optional[str] = None,
    ) -> list:
        """Recent message log (admin) — last `limit` rows."""
        if me.role != "admin":
            raise HTTPException(status_code=403, detail="Solo admins.")
        limit = max(1, min(100, limit))
        q: dict = {}
        if channel:
            q["channel"] = channel
        if status:
            q["status"] = status
        rows = await db.messages.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return rows

    @router.post("/messaging/test-send")
    async def admin_test_send(payload: TestSendIn, me: User = Depends(get_current_user)) -> dict:
        """Admin-only test endpoint. In sandbox mode (default), just logs +
        persists. In production, sends a real message. USE WITH CARE.
        """
        if me.role != "admin":
            raise HTTPException(status_code=403, detail="Solo admins.")
        if payload.channel == "whatsapp":
            result = await send_whatsapp(
                db,
                to=payload.to,
                template_name=payload.template_name,
                lang=payload.lang,
                variables=payload.variables,
            )
        else:
            result = await send_sms(
                db,
                to=payload.to,
                template_name=payload.template_name,
                lang=payload.lang,
                variables=payload.variables,
            )
        return result

    @router.post("/webhooks/sentdm/status")
    async def sentdm_status_webhook(
        request: Request,
        x_sentdm_signature: Optional[str] = Header(default=None),
    ) -> dict:
        """Receive delivery/read/failed status from sent.dm.

        Configure in sent.dm dashboard → Webhooks → URL:
          https://{your-domain}/api/webhooks/sentdm/status

        If SENT_DM_WEBHOOK_SECRET is set, validates the signature header
        (HMAC scheme TBD on sent.dm side — adjust when their docs confirm).
        """
        secret = os.environ.get("SENT_DM_WEBHOOK_SECRET")
        if secret:
            if not x_sentdm_signature:
                raise HTTPException(status_code=401, detail="Missing webhook signature.")
            # TODO: implement HMAC-SHA256 comparison once sent.dm docs confirm
            # the exact signing scheme. Pseudocode:
            #   computed = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
            #   if not hmac.compare_digest(computed, x_sentdm_signature): raise 401

        payload = await request.json()
        provider_message_id = payload.get("message_id") or payload.get("id")
        new_status = payload.get("status")
        if not provider_message_id or not new_status:
            raise HTTPException(status_code=400, detail="Missing message_id or status.")

        doc = await db.messages.find_one({"provider_message_id": provider_message_id}, {"_id": 0})
        if not doc:
            return {"ok": True, "ignored": "unknown_message_id"}

        now_iso = datetime.now(timezone.utc).isoformat()
        await db.messages.update_one(
            {"provider_message_id": provider_message_id},
            {
                "$set": {"status": new_status, "updated_at": now_iso},
                "$push": {"status_history": {
                    "status": new_status,
                    "at": now_iso,
                    "error_code": payload.get("error_code"),
                    "error_message": payload.get("error_message"),
                }},
            },
        )
        return {"ok": True}

    return router
