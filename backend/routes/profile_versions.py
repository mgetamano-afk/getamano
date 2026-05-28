"""
Profile Versions — auto-save & restore for provider profiles.

Why it exists
─────────────
Providers spend real time filling in their profile (bio, services, gallery
order, hours, prices, languages…). Losing that work — even partially — is
demoralizing and a churn risk. This module gives every provider a Google-
Docs-style version history of their profile, scoped by plan tier.

Storage model
─────────────
Collection: `profile_versions`
  {
    version_id:   "pv_<14hex>",
    user_id:      "user_…",
    provider_id:  "pro_…",
    snapshot:     { ...full provider_profiles doc snapshot, _id stripped },
    label:        str | null,    # user-friendly title ("Before holidays")
    created_at:   ISO,
    source:       "auto" | "manual" | "restored",
    restored_from: version_id | null,
  }

Plan tier quotas (queried via `_plan_quota` helper)
  - free:    1 snapshot retained, no restore
  - basic:   5 snapshots, 7-day TTL
  - pro:     30 snapshots, 30-day TTL, manual labels, restore
  - premium: ∞ snapshots, manual labels, restore, named pinning

Endpoints (all behind get_current_user)
  POST   /api/providers/me/versions/snapshot       — create now
  GET    /api/providers/me/versions                — list mine
  GET    /api/providers/me/versions/{vid}          — read one
  POST   /api/providers/me/versions/{vid}/restore  — overwrite live profile
  DELETE /api/providers/me/versions/{vid}          — delete one
  GET    /api/providers/me/versions/quota          — plan limits + usage

The `auto_snapshot()` helper is also imported by server.py and called
inside the PUT /providers/me handler so EVERY profile save creates a
version (subject to dedupe + quota trimming).
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


# ── Plan quotas — single source of truth ──────────────────────────────
PLAN_QUOTA = {
    "free":    {"max_versions": 1,   "retention_days": None, "can_restore": False, "can_label": False},
    "basic":   {"max_versions": 5,   "retention_days": 7,    "can_restore": True,  "can_label": False},
    "pro":     {"max_versions": 30,  "retention_days": 30,   "can_restore": True,  "can_label": True},
    "premium": {"max_versions": None, "retention_days": None, "can_restore": True, "can_label": True},
}


def _quota_for_plan(plan: str) -> dict:
    return PLAN_QUOTA.get(plan or "free", PLAN_QUOTA["free"])


def _strip_internal_keys(doc: dict) -> dict:
    """Snapshot must be pure data, no Mongo internals."""
    if not doc:
        return {}
    return {k: v for k, v in doc.items() if k != "_id"}


def _normalize_diff_fingerprint(snapshot: dict) -> str:
    """Cheap dedupe key — JSON of fields that meaningfully change. We don't
    want to hash `updated_at` (changes on every save) or computed metrics
    (`rating_avg`, `rating_count`, `views_count`, etc.)."""
    import json
    ignored = {
        "updated_at", "rating_avg", "rating_count", "rating_total",
        "views_count", "contact_clicks", "monthly_uniques",
        "monthly_uniques_month", "verification_status_changed_at",
    }
    payload = {k: v for k, v in (snapshot or {}).items() if k not in ignored}
    try:
        return json.dumps(payload, sort_keys=True, default=str)[:10000]
    except (TypeError, ValueError):
        return ""


async def _trim_to_quota(db, user_id: str, plan: str) -> None:
    """Keep the latest N versions per the user's plan, drop the rest.
    Also drop anything older than retention_days when set."""
    q = _quota_for_plan(plan)
    max_v = q["max_versions"]
    if max_v is not None:
        # Delete versions beyond the max_versions newest, EXCEPT manually
        # labeled ones (those are user-pinned and shouldn't auto-evict).
        all_unlabeled = await db.profile_versions.find(
            {"user_id": user_id, "$or": [{"label": None}, {"label": ""}]},
            {"_id": 0, "version_id": 1, "created_at": 1},
        ).sort("created_at", -1).to_list(length=10_000)
        if len(all_unlabeled) > max_v:
            obsolete_ids = [v["version_id"] for v in all_unlabeled[max_v:]]
            await db.profile_versions.delete_many({"version_id": {"$in": obsolete_ids}})

    days = q["retention_days"]
    if days:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        await db.profile_versions.delete_many({
            "user_id": user_id,
            "created_at": {"$lt": cutoff},
            "$or": [{"label": None}, {"label": ""}],   # spare labeled
        })


async def auto_snapshot(db, user_id: str, source: str = "auto", label: Optional[str] = None) -> Optional[dict]:
    """Snapshot the user's CURRENT live provider profile.

    - Dedupes against the most recent snapshot — if the fingerprint
      matches, skips (caller saved twice in a row with no real changes).
    - Trims old versions to enforce the plan quota.

    Returns the newly created version dict, or None if dedupe skipped it.
    """
    prof = await db.provider_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not prof:
        return None
    new_fp = _normalize_diff_fingerprint(prof)

    # Dedupe against last snapshot
    last = await db.profile_versions.find_one(
        {"user_id": user_id},
        sort=[("created_at", -1)],
        projection={"_id": 0, "snapshot": 1, "version_id": 1},
    )
    if last and _normalize_diff_fingerprint(last.get("snapshot") or {}) == new_fp:
        # Nothing changed — still update the touched timestamp on the
        # latest so we know they hit save (useful for "guardado hace X").
        await db.profile_versions.update_one(
            {"version_id": last["version_id"]},
            {"$set": {"touched_at": datetime.now(timezone.utc).isoformat()}},
        )
        return None

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "plan": 1}) or {}
    plan = user.get("plan") or "free"

    version_id = f"pv_{uuid.uuid4().hex[:14]}"
    version = {
        "version_id": version_id,
        "user_id": user_id,
        "provider_id": prof.get("provider_id"),
        "snapshot": _strip_internal_keys(prof),
        "label": label,
        "source": source,
        "restored_from": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.profile_versions.insert_one(version)
    await _trim_to_quota(db, user_id, plan)
    return _strip_internal_keys(version)


# ── Public router ─────────────────────────────────────────────────────
class LabelIn(BaseModel):
    label: Optional[str] = None


def build_profile_versions_router(*, db, get_current_user) -> APIRouter:
    router = APIRouter()

    async def _user_plan(user) -> str:
        u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "plan": 1})
        return (u or {}).get("plan") or "free"

    @router.get("/providers/me/versions/quota")
    async def get_quota(user=Depends(get_current_user)) -> dict:
        plan = await _user_plan(user)
        q = _quota_for_plan(plan)
        count = await db.profile_versions.count_documents({"user_id": user.user_id})
        return {
            "plan": plan,
            "max_versions": q["max_versions"],
            "retention_days": q["retention_days"],
            "can_restore": q["can_restore"],
            "can_label": q["can_label"],
            "current_count": count,
        }

    @router.get("/providers/me/versions")
    async def list_versions(user=Depends(get_current_user)) -> List[dict]:
        items = await db.profile_versions.find(
            {"user_id": user.user_id},
            {"_id": 0, "snapshot": 0},  # exclude bulky snapshot from list
        ).sort("created_at", -1).to_list(length=200)
        return items

    @router.get("/providers/me/versions/{version_id}")
    async def get_version(version_id: str, user=Depends(get_current_user)) -> dict:
        v = await db.profile_versions.find_one(
            {"version_id": version_id, "user_id": user.user_id},
            {"_id": 0},
        )
        if not v:
            raise HTTPException(status_code=404, detail="Version not found")
        return v

    @router.post("/providers/me/versions/snapshot")
    async def create_manual_snapshot(payload: LabelIn, user=Depends(get_current_user)) -> dict:
        plan = await _user_plan(user)
        q = _quota_for_plan(plan)
        label = (payload.label or "").strip() or None
        if label and not q["can_label"]:
            label = None  # silently drop label for tiers that can't use it
        v = await auto_snapshot(db, user.user_id, source="manual", label=label)
        if v is None:
            return {"ok": True, "skipped": True, "reason": "no_changes_since_last_snapshot"}
        return {"ok": True, "version": v}

    @router.post("/providers/me/versions/{version_id}/restore")
    async def restore_version(version_id: str, user=Depends(get_current_user)) -> dict:
        plan = await _user_plan(user)
        q = _quota_for_plan(plan)
        if not q["can_restore"]:
            raise HTTPException(
                status_code=402,
                detail="restore_requires_paid_plan",
            )
        v = await db.profile_versions.find_one(
            {"version_id": version_id, "user_id": user.user_id},
            {"_id": 0, "snapshot": 1, "version_id": 1},
        )
        if not v:
            raise HTTPException(status_code=404, detail="Version not found")

        # Take an "undo restore" safety snapshot of the current profile
        # FIRST so the user can revert the restore if they regret it.
        await auto_snapshot(db, user.user_id, source="auto", label="Antes de restaurar")

        snap = v.get("snapshot") or {}
        # Don't restore identity fields that should never move backward:
        # provider_id (immutable), user_id (immutable), created_at,
        # founding_member flag, verification_status (admin-controlled).
        protected = {
            "provider_id", "user_id", "created_at", "founding_member",
            "founding_member_at", "founding_member_number",
            "verification_status", "verification_status_changed_at",
            "verified_at", "claimed_by",
            "rating_avg", "rating_count", "rating_total",
            "views_count", "contact_clicks",
        }
        restore_update = {k: v_ for k, v_ in snap.items() if k not in protected}
        restore_update["updated_at"] = datetime.now(timezone.utc).isoformat()
        restore_update["last_restored_from"] = version_id
        restore_update["last_restored_at"] = restore_update["updated_at"]
        await db.provider_profiles.update_one(
            {"user_id": user.user_id},
            {"$set": restore_update},
        )

        # Mark the new "current" state in the version log too
        await db.profile_versions.update_one(
            {"version_id": version_id},
            {"$set": {"last_used_at": restore_update["updated_at"]}},
        )

        return {"ok": True, "restored_from": version_id}

    @router.delete("/providers/me/versions/{version_id}")
    async def delete_version(version_id: str, user=Depends(get_current_user)) -> dict:
        res = await db.profile_versions.delete_one(
            {"version_id": version_id, "user_id": user.user_id}
        )
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Version not found")
        return {"ok": True}

    return router
