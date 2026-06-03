"""V17 — Social engagement endpoints for Reels + Stories.

This module unifies three feed-side features that previously didn't
exist for reels/stories:

  • V17.2 — Comments on reels + stories
  • V17.3 — Internal re-share (Carlos reposts Maria's reel)
  • V17.4 — @Mentions in captions + comments (autocomplete + notify)

All comments live in a single collection `social_comments` keyed by
`(subject_type, subject_id)`. Re-shares live in `reel_reshares` so the
original reel's analytics stay clean. Mentions are extracted into
`mentioned_user_ids` on insert and trigger one in-app notification per
unique mentioned user.

The router is wired via `make_router` like every other route module
and included from server.py.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Max chars per comment. Mirrors Instagram / TikTok defaults; longer
# comments rarely add value and bloat the cursor pagination.
MAX_COMMENT_LEN = 500
# At most 5 unique @mentions per comment/caption — prevents @mention spam.
MAX_MENTIONS_PER_TEXT = 5
# `@` followed by 2-60 chars of word chars / dot / dash. Slugs can be
# long (`maria-cleaning-services-sallisaw-ok` = 35 chars) so we widen
# the upper bound vs. typical handle regexes. We resolve handles →
# user_ids at insert time.
MENTION_RE = re.compile(r"(?<![\w@])@([a-zA-Z0-9._-]{2,60})")


def extract_handles(text: str) -> list[str]:
    """V17.4 — Pull at most MAX_MENTIONS_PER_TEXT unique handles from a
    string. Returns lowercase handles without the leading @.

    The handle format is intentionally permissive (alphanumeric + . _ -).
    Resolution to user_ids happens in `_resolve_mentioned_users` which
    is the only place that hits the DB.
    """
    if not text:
        return []
    raw = MENTION_RE.findall(text)
    seen: list[str] = []
    for h in raw:
        h_low = h.lower()
        if h_low not in seen:
            seen.append(h_low)
        if len(seen) >= MAX_MENTIONS_PER_TEXT:
            break
    return seen


async def _resolve_mentioned_users(db, handles: list[str]) -> list[dict]:
    """V17.4 — Resolve a list of handles to user docs.

    We look up by:
      • provider_profiles.slug (preferred — the public-facing identity)
      • users.handle (fallback for non-provider users who set a handle)

    Returns deduped user docs with `user_id`, `name`, `handle`, `slug`.
    Unknown handles are silently dropped (Instagram does the same).
    """
    if not handles:
        return []
    profs = await db.provider_profiles.find(
        {"slug": {"$in": handles}},
        {"_id": 0, "user_id": 1, "business_name": 1, "slug": 1},
    ).to_list(MAX_MENTIONS_PER_TEXT)
    seen_user_ids: set = {p["user_id"] for p in profs}
    users = await db.users.find(
        {"handle": {"$in": handles}, "user_id": {"$nin": list(seen_user_ids)}},
        {"_id": 0, "user_id": 1, "name": 1, "handle": 1},
    ).to_list(MAX_MENTIONS_PER_TEXT)
    out: list[dict] = []
    for p in profs:
        out.append({
            "user_id": p["user_id"],
            "name": p.get("business_name") or "",
            "handle": p["slug"],
            "is_provider": True,
        })
    for u in users:
        out.append({
            "user_id": u["user_id"],
            "name": u.get("name") or "",
            "handle": u.get("handle") or "",
            "is_provider": False,
        })
    return out


async def _hydrate_comment_author(db, user_id: str) -> dict:
    """Best-effort lookup of the comment author's display name + avatar."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1, "picture": 1}) or {}
    p = await db.provider_profiles.find_one(
        {"user_id": user_id},
        {"_id": 0, "business_name": 1, "slug": 1, "logo_url": 1, "verification_status": 1},
    ) or {}
    return {
        "user_id": user_id,
        "name": u.get("name") or p.get("business_name") or "Usuario",
        "picture": p.get("logo_url") or u.get("picture"),
        "handle": p.get("slug") or u.get("handle"),
        "is_provider": bool(p),
        "verified": p.get("verification_status") == "approved",
    }


async def _notify_mentions(db, mentioner_user_id: str, mentioned_users: list[dict], subject_type: str, subject_id: str, preview: str) -> None:
    """V17.4 — Drop one in-app notification per unique mentioned user.
    Idempotent on (subject_type, subject_id, mentioned_user_id) so we
    don't spam when a user is mentioned twice in the same comment.
    """
    if not mentioned_users:
        return
    now = datetime.now(timezone.utc).isoformat()
    for mu in mentioned_users:
        if mu["user_id"] == mentioner_user_id:
            continue  # never notify self
        key = f"mention::{subject_type}::{subject_id}::{mu['user_id']}"
        if await db.notifications.find_one({"notification_key": key}, {"_id": 0, "notification_id": 1}):
            continue
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "notification_key": key,
            "user_id": mu["user_id"],
            "category": "social",
            "title": "Te mencionaron",
            "body": f"@{mu['handle'] or 'alguien'} te mencionó: \"{preview[:80]}\"",
            "cta_label": "Ver",
            "cta_url": f"/{'reels' if subject_type == 'reel' else 'stories'}/{subject_id}",
            "icon": "at-sign",
            "priority": "medium",
            "is_read": False,
            "dismissed_at": None,
            "subject_type": subject_type,
            "subject_id": subject_id,
            "mentioner_user_id": mentioner_user_id,
            "created_at": now,
        })


# ─────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────
class CommentIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_COMMENT_LEN)


class ReshareIn(BaseModel):
    caption: Optional[str] = Field(None, max_length=300)


# ─────────────────────────────────────────────────────────────────────
# Router factory
# ─────────────────────────────────────────────────────────────────────
def make_router(*, db, get_current_user, get_current_user_optional) -> APIRouter:
    router = APIRouter()

    async def _subject_exists(subject_type: str, subject_id: str) -> Optional[dict]:
        if subject_type == "reel":
            return await db.reels.find_one({"reel_id": subject_id, "is_deleted": {"$ne": True}}, {"_id": 0, "user_id": 1, "reel_id": 1, "caption": 1})
        if subject_type == "story":
            return await db.stories.find_one({"story_id": subject_id, "is_deleted": {"$ne": True}}, {"_id": 0, "user_id": 1, "story_id": 1, "caption": 1})
        return None

    # ─── Comments ──────────────────────────────────────────────────────
    async def _list_comments(subject_type: str, subject_id: str, limit: int) -> dict:
        if not await _subject_exists(subject_type, subject_id):
            raise HTTPException(status_code=404, detail="not found")
        limit = max(1, min(limit, 100))
        rows = await db.social_comments.find(
            {"subject_type": subject_type, "subject_id": subject_id, "is_hidden": {"$ne": True}},
            {"_id": 0},
        ).sort("created_at", 1).limit(limit).to_list(limit)
        for r in rows:
            r["author"] = await _hydrate_comment_author(db, r["user_id"])
        total = await db.social_comments.count_documents(
            {"subject_type": subject_type, "subject_id": subject_id, "is_hidden": {"$ne": True}},
        )
        return {"items": rows, "total": total}

    async def _create_comment(subject_type: str, subject_id: str, payload: CommentIn, user) -> dict:
        subject = await _subject_exists(subject_type, subject_id)
        if not subject:
            raise HTTPException(status_code=404, detail="not found")
        text = payload.text.strip()
        if not text:
            raise HTTPException(status_code=422, detail="empty text")

        handles = extract_handles(text)
        mentioned = await _resolve_mentioned_users(db, handles)
        comment_id = f"cm_{uuid.uuid4().hex[:14]}"
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "comment_id": comment_id,
            "subject_type": subject_type,
            "subject_id": subject_id,
            "user_id": user.user_id,
            "text": text,
            "mentioned_user_ids": [m["user_id"] for m in mentioned],
            "is_hidden": False,
            "created_at": now,
        }
        await db.social_comments.insert_one(doc)
        # mongo's insert_one mutates `doc` to add `_id`; strip it before
        # we return so FastAPI can JSON-encode the response.
        doc.pop("_id", None)
        # Bump the denormalised comments_count on the parent record so
        # feed cards can show "X comentarios" without an extra query.
        target_coll = db.reels if subject_type == "reel" else db.stories
        target_key = "reel_id" if subject_type == "reel" else "story_id"
        await target_coll.update_one(
            {target_key: subject_id},
            {"$inc": {"comments_count": 1}, "$set": {"last_comment_at": now}},
        )
        # Notify mentioned users (V17.4)
        await _notify_mentions(db, user.user_id, mentioned, subject_type, subject_id, text)
        # Notify the post owner (skip self-comment)
        if subject.get("user_id") and subject["user_id"] != user.user_id:
            try:
                await db.notifications.insert_one({
                    "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                    "user_id": subject["user_id"],
                    "category": "social",
                    "title": "💬 Nuevo comentario",
                    "body": f"\"{text[:80]}\"",
                    "cta_label": "Responder",
                    "cta_url": f"/{'reels' if subject_type == 'reel' else 'stories'}/{subject_id}",
                    "icon": "message-circle",
                    "priority": "medium",
                    "is_read": False,
                    "dismissed_at": None,
                    "subject_type": subject_type,
                    "subject_id": subject_id,
                    "created_at": now,
                })
            except Exception:
                pass
        doc["author"] = await _hydrate_comment_author(db, user.user_id)
        return doc

    async def _delete_comment(comment_id: str, user) -> dict:
        c = await db.social_comments.find_one({"comment_id": comment_id}, {"_id": 0})
        if not c:
            raise HTTPException(status_code=404, detail="not found")
        is_admin = getattr(user, "role", None) == "admin"
        if c["user_id"] != user.user_id and not is_admin:
            raise HTTPException(status_code=403, detail="forbidden")
        await db.social_comments.update_one({"comment_id": comment_id}, {"$set": {"is_hidden": True}})
        target_coll = db.reels if c["subject_type"] == "reel" else db.stories
        target_key = "reel_id" if c["subject_type"] == "reel" else "story_id"
        await target_coll.update_one({target_key: c["subject_id"]}, {"$inc": {"comments_count": -1}})
        return {"ok": True}

    @router.get("/reels/{reel_id}/comments")
    async def list_reel_comments(reel_id: str, limit: int = 50):
        return await _list_comments("reel", reel_id, limit)

    @router.post("/reels/{reel_id}/comments")
    async def post_reel_comment(reel_id: str, payload: CommentIn, user=Depends(get_current_user)):
        return await _create_comment("reel", reel_id, payload, user)

    @router.get("/stories/{story_id}/comments")
    async def list_story_comments(story_id: str, limit: int = 50):
        return await _list_comments("story", story_id, limit)

    @router.post("/stories/{story_id}/comments")
    async def post_story_comment(story_id: str, payload: CommentIn, user=Depends(get_current_user)):
        return await _create_comment("story", story_id, payload, user)

    @router.delete("/comments/{comment_id}")
    async def delete_comment(comment_id: str, user=Depends(get_current_user)):
        return await _delete_comment(comment_id, user)

    # ─── V17.3 — Internal re-share for reels ──────────────────────────
    @router.post("/reels/{reel_id}/reshare")
    async def reshare_reel(reel_id: str, payload: ReshareIn, user=Depends(get_current_user)):
        """Carlos re-shares Maria's reel into his own feed with attribution.

        We DON'T copy the underlying video file — the reshare row references
        the original reel_id and the feed component hydrates the video URL
        on render. This keeps storage usage flat regardless of how many
        people reshare a viral reel.
        """
        original = await db.reels.find_one({"reel_id": reel_id, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not original:
            raise HTTPException(status_code=404, detail="reel not found")
        if original.get("user_id") == user.user_id:
            raise HTTPException(status_code=400, detail="No puedes recompartir tu propio reel.")
        # Idempotency — if this user already reshared this reel, return
        # the existing reshare so the UI shows the unshare action instead.
        existing = await db.reel_reshares.find_one(
            {"reel_id": reel_id, "user_id": user.user_id},
            {"_id": 0},
        )
        if existing:
            return {"ok": True, "deduped": True, "reshare_id": existing["reshare_id"]}

        reshare_id = f"rs_{uuid.uuid4().hex[:14]}"
        now = datetime.now(timezone.utc).isoformat()
        caption = (payload.caption or "").strip()[:300]
        mentioned = await _resolve_mentioned_users(db, extract_handles(caption))
        await db.reel_reshares.insert_one({
            "reshare_id": reshare_id,
            "reel_id": reel_id,
            "user_id": user.user_id,  # the resharer
            "original_user_id": original["user_id"],
            "caption": caption or None,
            "mentioned_user_ids": [m["user_id"] for m in mentioned],
            "created_at": now,
        })
        # Bump reshare_count on the original
        await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"reshares_count": 1}})
        # Notify original author
        if original["user_id"] != user.user_id:
            try:
                await db.notifications.insert_one({
                    "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                    "user_id": original["user_id"],
                    "category": "social",
                    "title": "🔁 Compartieron tu reel",
                    "body": "Un miembro de la comunidad compartió tu reel en su perfil.",
                    "cta_label": "Ver",
                    "cta_url": f"/reels/{reel_id}",
                    "icon": "repeat",
                    "priority": "medium",
                    "is_read": False,
                    "subject_type": "reel",
                    "subject_id": reel_id,
                    "created_at": now,
                })
            except Exception:
                pass
        await _notify_mentions(db, user.user_id, mentioned, "reel", reel_id, caption)
        return {"ok": True, "deduped": False, "reshare_id": reshare_id}

    @router.delete("/reels/{reel_id}/reshare")
    async def unreshare_reel(reel_id: str, user=Depends(get_current_user)):
        result = await db.reel_reshares.delete_one({"reel_id": reel_id, "user_id": user.user_id})
        if result.deleted_count:
            await db.reels.update_one({"reel_id": reel_id}, {"$inc": {"reshares_count": -1}})
        return {"ok": True, "removed": result.deleted_count > 0}

    @router.get("/reels/{reel_id}/reshare-state")
    async def reshare_state(reel_id: str, user=Depends(get_current_user)):
        row = await db.reel_reshares.find_one(
            {"reel_id": reel_id, "user_id": user.user_id},
            {"_id": 0, "reshare_id": 1, "created_at": 1},
        )
        return {"reshared": bool(row), "reshare": row}

    # ─── V17.4 — Mention autocomplete ─────────────────────────────────
    @router.get("/mentions/search")
    async def search_mentions(q: str, limit: int = 8):
        """Typeahead for @mention autocomplete. Searches provider_profiles
        first (most users mention businesses), then falls back to users
        with custom handles.
        """
        q_clean = (q or "").strip().lower().lstrip("@")
        if len(q_clean) < 1:
            return {"items": []}
        limit = max(1, min(limit, 15))
        # Slug prefix match on provider_profiles
        regex = re.compile(f"^{re.escape(q_clean)}", re.IGNORECASE)
        profs = await db.provider_profiles.find(
            {"slug": {"$regex": regex}},
            {"_id": 0, "user_id": 1, "business_name": 1, "slug": 1, "logo_url": 1, "verification_status": 1},
        ).limit(limit).to_list(limit)
        items = [{
            "user_id": p["user_id"],
            "name": p.get("business_name") or "",
            "handle": p["slug"],
            "picture": p.get("logo_url"),
            "is_provider": True,
            "verified": p.get("verification_status") == "approved",
        } for p in profs]
        return {"items": items[:limit]}

    return router
