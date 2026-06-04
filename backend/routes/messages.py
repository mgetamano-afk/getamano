"""routes/messages.py — Conversational messaging between client and provider.

Section 92 (V19.4 refactor — extraction round 2).

Extracted from `server.py` lines 2735-2878 (~145 LOC). Powers the legacy
1-to-1 messaging UX (separate from the newer `/messaging/start` system
which uses anonymous/optional auth — that one stays in server.py for now).

Endpoints:
  • POST /messages                              create or continue thread
  • POST /messages/{conversation_id}/reply      reply within a thread
  • GET  /conversations                         my conversations (both roles)
  • GET  /conversations/{id}/messages           thread + mark-read

Notification side-effects:
  - SMS to the receiving party (via the injected `send_sms`)
  - Web Push (via routes.push.send_push_to_user)

`from __future__ import annotations` is INTENTIONALLY OMITTED so the
closure-captured `MessageIn` / `MessageReplyIn` Pydantic models are
resolved eagerly by FastAPI's `get_type_hints()`. Same rationale as
routes/auth.py line 19-21 and routes/admin_catalog.py.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException


def make_router(
    *,
    db: Any,
    User: Any,
    get_current_user: Callable[..., Any],
    MessageIn: Any,
    MessageReplyIn: Any,
    send_sms: Callable[..., Any],
    logger: logging.Logger | None = None,
) -> APIRouter:
    router = APIRouter()
    log = logger or logging.getLogger(__name__)

    @router.post("/messages")
    async def send_message(payload: MessageIn, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        provider = await db.provider_profiles.find_one({"provider_id": payload.provider_id}, {"_id": 0})
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
        if provider["user_id"] == user.user_id:
            raise HTTPException(status_code=400, detail="Cannot message yourself")
        # find or create conversation (client_id, provider_id)
        conv_key = {"client_id": user.user_id, "provider_id": payload.provider_id}
        conv = await db.conversations.find_one(conv_key, {"_id": 0})
        now = datetime.now(timezone.utc).isoformat()
        if not conv:
            conv = {
                **conv_key,
                "conversation_id": f"conv_{uuid.uuid4().hex[:12]}",
                "provider_user_id": provider["user_id"],
                "client_name": user.name,
                "business_name": provider["business_name"],
                "logo_url": provider.get("logo_url", ""),
                "slug": provider["slug"],
                "subject": payload.subject or "Solicitud",
                "last_message": payload.body[:140],
                "last_at": now,
                "unread_for_provider": True,
                "unread_for_client": False,
                "created_at": now,
            }
            await db.conversations.insert_one(conv)
        else:
            await db.conversations.update_one(
                {"conversation_id": conv["conversation_id"]},
                {"$set": {"last_message": payload.body[:140], "last_at": now, "unread_for_provider": True},
                 "$unset": {"client_nudge_sent_at": "", "client_nudge_delivery": "",
                            "client_nudge_skipped_reason": "", "client_nudge_alternatives_count": ""}},
            )
        msg = {
            "message_id": f"msg_{uuid.uuid4().hex[:10]}",
            "conversation_id": conv["conversation_id"],
            "sender_id": user.user_id,
            "sender_role": "client",
            "body": payload.body,
            "created_at": now,
        }
        await db.messages.insert_one(msg)

        # SMS notify provider
        prov_user = await db.users.find_one({"user_id": provider["user_id"]}, {"_id": 0})
        if prov_user and prov_user.get("phone"):
            send_sms(prov_user["phone"], f"[getamano] Nuevo mensaje de {user.name}: {payload.body[:120]}", event="new_message_to_provider")

        # Web Push to provider — lazy import so this module stays cheap
        # to load and avoids hard-coupling against routes/push.py.
        try:
            from routes.push import send_push_to_user
            await send_push_to_user(db, provider["user_id"], {
                "title": f"Mensaje de {user.name}",
                "body": payload.body[:140],
                "icon": "/getamano-logo-mark.png",
                "url": f"/dashboard/provider?tab=mensajes&conversation={conv['conversation_id']}",
                "tag": f"msg_{conv['conversation_id']}",
            })
        except Exception as exc:  # noqa: BLE001
            log.warning(f"push send_push (message) failed: {exc}")

        msg.pop("_id", None)
        return msg

    @router.post("/messages/{conversation_id}/reply")
    async def reply_message(conversation_id: str, payload: MessageReplyIn, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        conv = await db.conversations.find_one({"conversation_id": conversation_id}, {"_id": 0})
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        is_provider = conv["provider_user_id"] == user.user_id
        is_client = conv["client_id"] == user.user_id
        if not (is_provider or is_client):
            raise HTTPException(status_code=403, detail="Not your conversation")
        now = datetime.now(timezone.utc).isoformat()
        msg = {
            "message_id": f"msg_{uuid.uuid4().hex[:10]}",
            "conversation_id": conversation_id,
            "sender_id": user.user_id,
            "sender_role": "provider" if is_provider else "client",
            "body": payload.body,
            "created_at": now,
        }
        await db.messages.insert_one(msg)
        update = {"last_message": payload.body[:140], "last_at": now}
        if is_provider:
            update["unread_for_client"] = True
            update["unread_for_provider"] = False
        else:
            update["unread_for_provider"] = True
            update["unread_for_client"] = False
        await db.conversations.update_one({"conversation_id": conversation_id}, {"$set": update})

        # SMS notify the other party
        other_user_id = conv["client_id"] if is_provider else conv["provider_user_id"]
        other_user = await db.users.find_one({"user_id": other_user_id}, {"_id": 0})
        if other_user and other_user.get("phone"):
            sender_label = conv["business_name"] if is_provider else user.name
            send_sms(other_user["phone"], f"[getamano] {sender_label}: {payload.body[:140]}", event="message_reply")

        msg.pop("_id", None)
        return msg

    @router.get("/conversations")
    async def list_conversations(user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        # Match both legacy `client_id` and new `participant_user_id` schemas.
        query = {"$or": [
            {"client_id": user.user_id},
            {"participant_user_id": user.user_id},
            {"provider_user_id": user.user_id},
        ]}
        convs = await db.conversations.find(query, {"_id": 0}).sort("last_at", -1).to_list(200)
        for c in convs:
            c["my_role"] = "provider" if c.get("provider_user_id") == user.user_id else "client"
            if c["my_role"] == "provider":
                c["unread"] = c.get("unread_for_provider", 0) or c.get("unread_count_provider", 0) or 0
            else:
                c["unread"] = c.get("unread_for_client", 0) or c.get("unread_count_participant", 0) or 0
        return convs

    @router.get("/conversations/{conversation_id}/messages")
    async def list_messages(conversation_id: str, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        conv = await db.conversations.find_one({"conversation_id": conversation_id}, {"_id": 0})
        if not conv:
            raise HTTPException(status_code=404, detail="Not found")
        # Conversations have two possible schemas (legacy + new). Accept both.
        is_provider = conv.get("provider_user_id") == user.user_id
        is_client = (conv.get("client_id") == user.user_id) or (conv.get("participant_user_id") == user.user_id)
        if not (is_provider or is_client):
            raise HTTPException(status_code=403, detail="Not your conversation")
        # Mark read for the viewer — write BOTH legacy + new fields so the
        # list endpoint picks it up regardless of which schema is stored.
        if is_provider:
            update = {"unread_for_provider": False, "unread_count_provider": 0}
        else:
            update = {"unread_for_client": False, "unread_count_participant": 0}
        await db.conversations.update_one({"conversation_id": conversation_id}, {"$set": update})
        msgs = await db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
        return {"conversation": conv, "messages": msgs}

    return router
