"""
Web Push subscription module — Section 68.

Stores PushSubscription objects from `navigator.serviceWorker.PushManager`
and provides a server-side helper to deliver Web Push notifications via
the pywebpush library + VAPID keys.

Environment variables (read by the helper at delivery time):
  VAPID_PRIVATE_KEY_B64 — base64-encoded PEM of the EC private key
  VAPID_PUBLIC_KEY      — base64url of the uncompressed P-256 public key
  VAPID_SUBJECT         — mailto: identifier for VAPID claims

Endpoints (`/api/push/*`):
  GET    /push/public-key     — public key for client subscribe()
  POST   /push/subscribe      — register a new subscription
  POST   /push/unsubscribe    — remove a subscription by endpoint
  GET    /push/me             — list my subscriptions (for debugging)
"""

import base64
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000)
    keys: PushKeys
    user_agent: Optional[str] = Field(default=None, max_length=300)


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=10)


def _get_private_pem() -> Optional[str]:
    """Decode VAPID_PRIVATE_KEY_B64 → PEM string."""
    b64 = os.environ.get("VAPID_PRIVATE_KEY_B64", "")
    if not b64:
        return None
    try:
        return base64.b64decode(b64).decode()
    except Exception:
        return None


async def send_push_to_user(db, user_id: str, payload: dict) -> dict:
    """Helper invoked by other backend modules to push a notification.

    Returns {sent, removed_invalid, total_subs}. Silently skips when VAPID
    isn't configured. Safe to call from any background task.
    """
    private_pem = _get_private_pem()
    subject = os.environ.get("VAPID_SUBJECT", "mailto:contact@getamano.com")
    if not private_pem:
        return {"sent": 0, "removed_invalid": 0, "total_subs": 0, "reason": "vapid_not_configured"}

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return {"sent": 0, "removed_invalid": 0, "total_subs": 0, "reason": "pywebpush_missing"}

    subs = await db.push_subscriptions.find(
        {"user_id": user_id, "is_active": True},
        {"_id": 0},
    ).to_list(20)

    sent, removed = 0, 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                },
                data=json.dumps(payload),
                vapid_private_key=private_pem,
                vapid_claims={"sub": subject},
            )
            sent += 1
        except WebPushException as e:
            # Subscription likely invalid (HTTP 404/410 from push service)
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                await db.push_subscriptions.update_one(
                    {"endpoint": sub["endpoint"]},
                    {"$set": {"is_active": False, "invalidated_at": datetime.now(timezone.utc).isoformat()}},
                )
                removed += 1
            else:
                logger.warning(f"webpush failed for user {user_id}: {e}")
        except Exception as e:
            logger.warning(f"webpush unexpected error for user {user_id}: {e}")

    return {"sent": sent, "removed_invalid": removed, "total_subs": len(subs)}


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    @router.get("/push/public-key")
    async def get_public_key() -> dict:
        """Return the VAPID public key (base64url) for browser subscribe().
        Public on purpose — the key is meant to be shared with clients.
        """
        pk = os.environ.get("VAPID_PUBLIC_KEY", "")
        if not pk:
            raise HTTPException(status_code=503, detail="Push notifications not configured.")
        return {"public_key": pk}

    @router.post("/push/subscribe")
    async def subscribe(payload: PushSubscribeIn, me: User = Depends(get_current_user)) -> dict:
        """Register or refresh a Web Push subscription for the current user."""
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.push_subscriptions.update_one(
            {"endpoint": payload.endpoint},
            {
                "$set": {
                    "user_id": me.user_id,
                    "endpoint": payload.endpoint,
                    "p256dh": payload.keys.p256dh,
                    "auth": payload.keys.auth,
                    "user_agent": payload.user_agent,
                    "is_active": True,
                    "invalidated_at": None,
                    "last_seen_at": now_iso,
                },
                "$setOnInsert": {
                    "subscription_id": f"psub_{uuid.uuid4().hex[:12]}",
                    "created_at": now_iso,
                },
            },
            upsert=True,
        )
        return {"ok": True}

    @router.post("/push/unsubscribe")
    async def unsubscribe(payload: PushUnsubscribeIn, me: User = Depends(get_current_user)) -> dict:
        res = await db.push_subscriptions.update_one(
            {"endpoint": payload.endpoint, "user_id": me.user_id},
            {"$set": {"is_active": False, "invalidated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True, "matched": res.matched_count}

    @router.get("/push/me")
    async def list_my_subscriptions(me: User = Depends(get_current_user)) -> list:
        rows = await db.push_subscriptions.find(
            {"user_id": me.user_id, "is_active": True},
            {"_id": 0, "endpoint": 1, "user_agent": 1, "created_at": 1, "last_seen_at": 1},
        ).to_list(20)
        return rows

    return router
