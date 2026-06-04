"""routes/galleries.py — Provider gallery + presentation video.

Section 97 (V19.5 refactor — extraction round 3).

Powers everything photo/video related on the provider eCard:
  • plan-based photo quota check
  • add / reorder / categorize / delete gallery items
  • upload + delete presentation video (Pro/Premium only)
  • public photo-category list
  • plan change (mock, no Stripe)

Endpoints:
  • GET    /providers/me/gallery/limit
  • POST   /providers/me/gallery
  • PUT    /providers/me/gallery/reorder
  • PUT    /providers/me/gallery/{item_id}/category
  • DELETE /providers/me/gallery/{item_id}
  • POST   /providers/me/video
  • DELETE /providers/me/video
  • POST   /providers/me/plan
  • GET    /gallery/photo-categories

`from __future__ import annotations` intentionally omitted (factory
needs to capture Pydantic body models by eager closure binding).
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File


def make_router(
    *,
    db: Any,
    User: Any,
    get_current_user: Callable[..., Any],
    GalleryItemIn: Any,
    GalleryReorderIn: Any,
    GalleryCategoryIn: Any,
    PlanChangeIn: Any,
    plan_photo_limits: dict,
    video_allowed_plans: set,
    allowed_video_types: set,
    max_video_size: int,
    photo_category_labels: dict,
    app_name: str,
    put_object: Callable[..., Any],
    logger: logging.Logger | None = None,
) -> APIRouter:
    router = APIRouter()
    log = logger or logging.getLogger(__name__)

    @router.get("/providers/me/gallery/limit")
    async def my_gallery_limit(user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "gallery": 1, "plan": 1})
        if not prof:
            raise HTTPException(status_code=404, detail="No provider profile")
        plan = prof.get("plan") or "free"
        max_photos = plan_photo_limits.get(plan, plan_photo_limits["free"])
        used = len(prof.get("gallery") or [])
        return {
            "plan": plan,
            "used": used,
            "max": max_photos,
            "can_upload": (max_photos is None) or (used < max_photos),
            "remaining": (None if max_photos is None else max(0, max_photos - used)),
        }

    @router.post("/providers/me/gallery")
    async def add_gallery_item(payload: GalleryItemIn, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
        if not prof:
            raise HTTPException(status_code=404, detail="No provider profile")
        plan = prof.get("plan") or "free"
        max_photos = plan_photo_limits.get(plan, plan_photo_limits["free"])
        current = prof.get("gallery") or []
        if max_photos is not None and len(current) >= max_photos:
            raise HTTPException(
                status_code=403,
                detail=f"Has llegado al límite de {max_photos} fotos del plan {plan.capitalize()}. Actualiza tu plan para subir fotos ilimitadas.",
            )
        next_sort = (max((g.get("sort_order", 0) for g in current), default=-1)) + 1
        item = {
            "id": f"g_{uuid.uuid4().hex[:10]}",
            "url": payload.url,
            "caption": payload.caption or "",
            "category": payload.category,
            "sort_order": next_sort,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.provider_profiles.update_one({"user_id": user.user_id}, {"$push": {"gallery": item}})
        return item

    @router.put("/providers/me/gallery/reorder")
    async def reorder_gallery(payload: GalleryReorderIn, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "gallery": 1})
        if not prof:
            raise HTTPException(status_code=404, detail="No provider profile")
        current = prof.get("gallery") or []
        by_id = {g["id"]: g for g in current}
        seen: set = set()
        ordered: list = []
        for idx, gid in enumerate(payload.order):
            if gid in by_id and gid not in seen:
                g = dict(by_id[gid])
                g["sort_order"] = idx
                ordered.append(g)
                seen.add(gid)
        for g in current:
            if g["id"] not in seen:
                g2 = dict(g)
                g2["sort_order"] = len(ordered)
                ordered.append(g2)
        await db.provider_profiles.update_one(
            {"user_id": user.user_id},
            {"$set": {"gallery": ordered}},
        )
        return {"ok": True, "count": len(ordered)}

    @router.put("/providers/me/gallery/{item_id}/category")
    async def set_gallery_category(item_id: str, payload: GalleryCategoryIn, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        res = await db.provider_profiles.update_one(
            {"user_id": user.user_id, "gallery.id": item_id},
            {"$set": {"gallery.$.category": payload.category}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Foto no encontrada")
        return {"ok": True, "category": payload.category}

    @router.delete("/providers/me/gallery/{item_id}")
    async def remove_gallery_item(item_id: str, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        await db.provider_profiles.update_one(
            {"user_id": user.user_id}, {"$pull": {"gallery": {"id": item_id}}},
        )
        return {"ok": True}

    @router.get("/gallery/photo-categories")
    async def list_photo_categories():
        """Public list of photo categories used to tag/filter gallery photos."""
        return [{"key": k, "label": v} for k, v in photo_category_labels.items()]

    # ─── Provider video (Pro / Premium only) ────────────────────────
    @router.post("/providers/me/video")
    async def upload_provider_video(file: UploadFile = File(...), user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "plan": 1, "video_url": 1})
        if not prof:
            raise HTTPException(status_code=404, detail="No provider profile")
        plan = (prof.get("plan") or "free").lower()
        if plan not in video_allowed_plans:
            raise HTTPException(status_code=403, detail="El video de presentación está disponible en los planes Pro y Premium.")
        content_type = file.content_type or "application/octet-stream"
        if content_type not in allowed_video_types:
            raise HTTPException(status_code=400, detail="Formato no soportado. Usa MP4, MOV o AVI.")
        data = await file.read()
        if len(data) > max_video_size:
            raise HTTPException(status_code=400, detail="El video supera 200 MB.")
        ext_map = {"video/mp4": "mp4", "video/quicktime": "mov", "video/x-msvideo": "avi", "video/avi": "avi"}
        ext = ext_map.get(content_type, "mp4")
        file_id = str(uuid.uuid4())
        path = f"{app_name}/videos/{user.user_id}/{file_id}.{ext}"
        try:
            result = put_object(path, data, content_type)
        except Exception as exc:
            log.exception("Video upload failed")
            raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")
        await db.files.insert_one({
            "file_id": file_id, "user_id": user.user_id, "storage_path": result["path"],
            "original_filename": file.filename or "", "content_type": content_type,
            "size": result.get("size", len(data)), "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        video_url = f"/api/files/{result['path']}"
        await db.provider_profiles.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "video_url": video_url,
                "video_content_type": content_type,
                "video_uploaded_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        return {"ok": True, "video_url": video_url, "content_type": content_type, "size": len(data)}

    @router.delete("/providers/me/video")
    async def delete_provider_video(user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        res = await db.provider_profiles.update_one(
            {"user_id": user.user_id},
            {"$unset": {"video_url": "", "video_content_type": "", "video_uploaded_at": ""}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="No provider profile")
        return {"ok": True}

    # ─── Plan change (mock — no Stripe yet) ─────────────────────────
    @router.post("/providers/me/plan")
    async def change_plan(payload: PlanChangeIn, user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        result = await db.provider_profiles.update_one(
            {"user_id": user.user_id},
            {"$set": {"plan": payload.plan, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="No provider profile")
        return {"ok": True, "plan": payload.plan}

    return router
