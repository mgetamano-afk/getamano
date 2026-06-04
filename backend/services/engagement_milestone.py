"""V18.1 — Engagement milestones for reels + stories.

When a creator's reel/story crosses an engagement threshold (5, 10, 25,
50, 100, 250, 500, 1000 reactions) within 24h of creation, we fire a
celebratory in-app notification + push so they feel the dopamine of
their content taking off.

Milestones are tracked in `reels.milestones` / `stories.milestones` as
a list of crossed integer thresholds. Each threshold fires exactly once
per reel/story (idempotent — the same milestone is not re-fired even
if the count later dips below the threshold and crosses again).

Why 24h: outside that window the content is no longer "fresh" — if a
year-old reel slowly accumulates 100 likes it doesn't feel like a
viral moment to the creator. Fresh reels crossing thresholds = fire.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# Ordered thresholds. Each is fired at most once per reel/story. We
# pick the LARGEST threshold the count just crossed in this update, so
# a single +5 likes burst that crosses both 5 and 10 fires only one
# notification (the higher one — more exciting).
ENGAGEMENT_THRESHOLDS: list[int] = [5, 10, 25, 50, 100, 250, 500, 1000]

# Window during which milestones are eligible to fire (24h from creation).
# After this, the content is no longer "fresh" for celebration.
MILESTONE_FRESHNESS_HOURS = 24


def _format_minutes_since(created_iso: str) -> str:
    """Render a human-friendly duration since `created_iso` for the toast."""
    try:
        created = datetime.fromisoformat(str(created_iso).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return ""
    delta = datetime.now(timezone.utc) - created
    minutes = max(1, int(delta.total_seconds() // 60))
    if minutes < 60:
        return f"en {minutes} min"
    hours = minutes // 60
    if hours < 24:
        return f"en {hours} h"
    days = hours // 24
    return f"en {days} d"


async def maybe_fire_engagement_milestone(
    db: Any,
    *,
    subject_type: str,           # "reel" | "story"
    subject_id: str,
    new_count: int,              # count AFTER the just-applied increment
    metric: str = "reaction",    # "like" | "wow" | "reaction"
) -> dict | None:
    """V18.1 — Fire a milestone if the new count crossed a threshold.

    Idempotent — uses `$pull` + `$addToSet` semantics on `milestones`
    so the same threshold is never fired twice for the same reel/story.

    Returns the persisted notification doc (without `_id`) when one was
    fired, or None otherwise. Best-effort: any DB / push error logs
    and swallows.
    """
    if new_count < ENGAGEMENT_THRESHOLDS[0]:
        return None

    # Largest threshold the count crossed in this update
    threshold = None
    for t in reversed(ENGAGEMENT_THRESHOLDS):
        if new_count >= t:
            threshold = t
            break
    if threshold is None:
        return None

    coll = db.reels if subject_type == "reel" else db.stories
    id_field = "reel_id" if subject_type == "reel" else "story_id"

    # Atomic claim: $addToSet returns whether the milestone was newly added.
    # We `$ne` on the threshold value to make the update a no-op when it
    # already exists — then matched_count tells us if we actually claimed.
    result = await coll.update_one(
        {id_field: subject_id, "milestones": {"$ne": threshold}},
        {"$addToSet": {"milestones": threshold}},
    )
    if result.modified_count == 0:
        return None  # already fired

    subject = await coll.find_one(
        {id_field: subject_id},
        {"_id": 0, "user_id": 1, "provider_user_id": 1, "caption": 1, "created_at": 1},
    )
    if not subject:
        return None

    # Freshness check (24h) — if the subject is older than the window we
    # still claim the milestone (so it doesn't re-fire on a third pass)
    # but don't bother notifying.
    created_iso = subject.get("created_at") or ""
    if created_iso:
        try:
            created = datetime.fromisoformat(str(created_iso).replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - created > timedelta(hours=MILESTONE_FRESHNESS_HOURS):
                return None
        except ValueError:
            pass

    owner_id = subject.get("user_id") or subject.get("provider_user_id")
    if not owner_id:
        return None

    elapsed = _format_minutes_since(created_iso)
    surface = "reel" if subject_type == "reel" else "historia"
    body = f"¡Tu {surface} pasó las {threshold} reacciones {elapsed}! 🔥" if elapsed \
        else f"¡Tu {surface} pasó las {threshold} reacciones! 🔥"
    cta_url = "/reels" if subject_type == "reel" else "/"

    notification_key = f"engagement_milestone::{subject_type}::{subject_id}::{threshold}"

    # Idempotent insert (notification_key is unique per milestone)
    doc = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "notification_key": notification_key,
        "user_id": owner_id,
        "category": "engagement",
        "title": "🔥 Tu contenido está prendiendo",
        "body": body,
        "cta_label": "Ver",
        "cta_url": cta_url,
        "icon": "flame",
        "priority": "high",
        "is_read": False,
        "dismissed_at": None,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "milestone": threshold,
        "metric": metric,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.notifications.insert_one(doc.copy())  # copy so insert doesn't mutate doc's _id
    except Exception as e:  # noqa: BLE001 — duplicate key on notification_key when race; ignore
        logger.warning(f"milestone notif insert race: {e}")
        return None

    # Best-effort push (web/PWA)
    try:
        from routes.push import send_push_to_user
        await send_push_to_user(db, owner_id, {
            "title": "🔥 Tu contenido está prendiendo",
            "body": body,
            "icon": "/icon-192x192.png",
            "url": cta_url,
            "tag": notification_key,
        })
    except Exception as e:  # noqa: BLE001
        logger.debug(f"milestone push failed: {e}")

    return doc
