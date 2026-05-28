"""
Reviews & Favorites — Section 71 backend refactor.

Holds every `/api/reviews`, `/api/admin/reviews/*` and `/api/favorites*`
endpoint extracted from server.py. They share the same trust-and-quality
domain (social proof for providers), so they live in one focused module.

Endpoints
─────────
Public (authenticated user):
  POST   /reviews                       — submit a review (one per provider per user)
  GET    /favorites                     — list my favorited providers (full docs)
  POST   /favorites                     — add provider to my favorites
  DELETE /favorites/{provider_id}       — remove from favorites

Admin (require_admin):
  GET    /admin/reviews                 — list reviews, optional `flagged` filter
  POST   /admin/reviews/{review_id}/flag — flag a review for moderation
  DELETE /admin/reviews/{review_id}     — delete a review (recomputes rating)

Verified-reviews logic (Section 50)
───────────────────────────────────
A review is auto-marked `verified=True` when there is documented prior
interaction between the reviewer and the provider:
  1. Existing conversation in `db.conversations`
  2. Existing service request in `db.service_requests`
  3. Existing appointment in `db.appointments`

The factory `build_reviews_router(...)` wires shared deps in the same
closure pattern as the other extracted modules (auth.py, community.py,
saved_ecards.py, profile_versions.py).
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Literal, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

PaidRange = Literal["<100", "100-300", "300-700", "700-1500", ">1500", "prefer_not_to_say"]


class ReviewIn(BaseModel):
    provider_id: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = ""
    paid_amount_range: Optional[PaidRange] = None


class FavoriteIn(BaseModel):
    provider_id: str


async def _detect_verified_source(db, provider_id: str, user_id: str) -> Optional[str]:
    """Return the source of verification ('messaging'|'service_request'|'appointment')
    or None if the reviewer has no documented interaction with the provider."""
    try:
        prof = await db.provider_profiles.find_one(
            {"provider_id": provider_id}, {"_id": 0, "user_id": 1}
        )
        provider_user_id = (prof or {}).get("user_id")

        conv = await db.conversations.find_one(
            {"provider_id": provider_id, "client_id": user_id},
            {"_id": 0, "conversation_id": 1},
        )
        if conv:
            return "messaging"

        req = await db.service_requests.find_one(
            {"provider_id": provider_id, "client_id": user_id},
            {"_id": 0, "request_id": 1},
        )
        if req:
            return "service_request"

        if provider_user_id:
            appt = await db.appointments.find_one(
                {
                    "$or": [
                        {"provider_id": provider_id, "client_user_id": user_id},
                        {"provider_user_id": provider_user_id, "client_user_id": user_id},
                    ]
                },
                {"_id": 0, "appointment_id": 1},
            )
            if appt:
                return "appointment"
    except Exception as e:  # noqa: BLE001 — best-effort; never block a review
        logger.warning("verified-review-check failed: %s", e)
    return None


async def _recompute_rating(db, provider_id: str) -> None:
    """Recompute the provider's rating_avg + rating_count from the live
    reviews collection. Called after any insert/delete."""
    all_revs = await db.reviews.find(
        {"provider_id": provider_id}, {"_id": 0, "rating": 1}
    ).to_list(10000)
    if all_revs:
        avg = sum(r["rating"] for r in all_revs) / len(all_revs)
        await db.provider_profiles.update_one(
            {"provider_id": provider_id},
            {"$set": {"rating_avg": round(avg, 2), "rating_count": len(all_revs)}},
        )
    else:
        await db.provider_profiles.update_one(
            {"provider_id": provider_id},
            {"$set": {"rating_avg": 0.0, "rating_count": 0}},
        )


def build_reviews_router(*, db, User, get_current_user, require_admin) -> APIRouter:
    """Build & return the reviews+favorites APIRouter wired to shared deps."""
    router = APIRouter()

    # ── REVIEWS ───────────────────────────────────────────────────────
    @router.post("/reviews")
    async def create_review(
        payload: ReviewIn,
        user: User = Depends(get_current_user),
    ) -> dict:
        existing = await db.reviews.find_one(
            {"provider_id": payload.provider_id, "user_id": user.user_id}
        )
        if existing:
            raise HTTPException(status_code=400, detail="You already reviewed this provider")

        verification_source = await _detect_verified_source(
            db, payload.provider_id, user.user_id
        )

        review = {
            "review_id": f"rev_{uuid.uuid4().hex[:10]}",
            "provider_id": payload.provider_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "rating": payload.rating,
            "comment": payload.comment or "",
            "paid_amount_range": payload.paid_amount_range,
            "verified": verification_source is not None,
            "verification_source": verification_source,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.reviews.insert_one(review)
        await _recompute_rating(db, payload.provider_id)
        review.pop("_id", None)
        return review

    # ── FAVORITES ─────────────────────────────────────────────────────
    @router.get("/favorites")
    async def list_favorites(user: User = Depends(get_current_user)) -> List[dict]:
        favs = await db.favorites.find(
            {"user_id": user.user_id}, {"_id": 0}
        ).to_list(200)
        provider_ids = [f["provider_id"] for f in favs]
        providers = await db.provider_profiles.find(
            {"provider_id": {"$in": provider_ids}}, {"_id": 0}
        ).to_list(200)
        return providers

    @router.post("/favorites")
    async def add_favorite(
        payload: FavoriteIn,
        user: User = Depends(get_current_user),
    ) -> dict:
        await db.favorites.update_one(
            {"user_id": user.user_id, "provider_id": payload.provider_id},
            {"$set": {
                "user_id": user.user_id,
                "provider_id": payload.provider_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        return {"ok": True}

    @router.delete("/favorites/{provider_id}")
    async def remove_favorite(
        provider_id: str,
        user: User = Depends(get_current_user),
    ) -> dict:
        await db.favorites.delete_one(
            {"user_id": user.user_id, "provider_id": provider_id}
        )
        return {"ok": True}

    # ── ADMIN REVIEWS ─────────────────────────────────────────────────
    @router.get("/admin/reviews")
    async def admin_list_reviews(
        flagged: Optional[bool] = None,
        _: User = Depends(require_admin),
    ) -> List[dict]:
        q: dict = {}
        if flagged is not None:
            q["is_flagged"] = flagged
        items = await db.reviews.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        # enrich with provider business name
        pids = list({r["provider_id"] for r in items})
        provs_list = await db.provider_profiles.find(
            {"provider_id": {"$in": pids}},
            {"_id": 0, "provider_id": 1, "business_name": 1, "slug": 1},
        ).to_list(500)
        provs = {p["provider_id"]: p for p in provs_list}
        for r in items:
            r["provider"] = provs.get(r["provider_id"])
        return items

    @router.post("/admin/reviews/{review_id}/flag")
    async def admin_flag_review(
        review_id: str,
        admin: User = Depends(require_admin),
    ) -> dict:
        await db.reviews.update_one(
            {"review_id": review_id}, {"$set": {"is_flagged": True}}
        )
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}",
            "admin_id": admin.user_id,
            "action": "review:flag",
            "target": review_id,
            "note": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True}

    @router.delete("/admin/reviews/{review_id}")
    async def admin_delete_review(
        review_id: str,
        admin: User = Depends(require_admin),
    ) -> dict:
        review = await db.reviews.find_one({"review_id": review_id}, {"_id": 0})
        if not review:
            raise HTTPException(status_code=404, detail="Not found")
        await db.reviews.delete_one({"review_id": review_id})
        await _recompute_rating(db, review["provider_id"])
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:10]}",
            "admin_id": admin.user_id,
            "action": "review:delete",
            "target": review_id,
            "note": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True}

    return router
