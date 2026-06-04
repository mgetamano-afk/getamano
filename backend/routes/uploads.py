"""routes/uploads.py — Generic file uploads + reel-specific pipeline.

Section 98 (V19.5 refactor — extraction round 3).

Endpoints:
  • POST /upload                 generic image upload (auto-compress + storage)
  • POST /reels/upload-video     video upload with ffmpeg post-process + thumbnail
  • GET  /files/{path:path}      streaming download

The compression helper (`compress_image_bytes`) and storage helpers
(`put_object`, `get_object`) are passed as factory parameters so this
module doesn't pin a specific storage backend — exactly how the
original inline code worked in server.py.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response


def make_router(
    *,
    db: Any,
    User: Any,
    get_current_user: Callable[..., Any],
    allowed_image_types: set,
    allowed_reel_video_types: set,
    max_upload_size: int,
    max_reel_video_size: int,
    app_name: str,
    put_object: Callable[..., Any],
    get_object: Callable[..., Any],
    compress_image_bytes: Callable[[bytes, str], tuple],
    logger: logging.Logger | None = None,
) -> APIRouter:
    router = APIRouter()
    log = logger or logging.getLogger(__name__)

    @router.post("/reels/upload-video")
    async def upload_reel_video(file: UploadFile = File(...), user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        """V15 — Dedicated video upload for reels. Any logged-in user
        (verified or not) can upload. Accepts WebM (MediaRecorder output)
        + imported MP4/MOV.

        V15.3 — Server-side ffmpeg post-process: trim >60s, re-encode to
        H.264/AAC MP4, auto-generate 480p JPEG thumbnail. Fail-soft."""
        content_type = (file.content_type or "application/octet-stream").lower().split(";")[0].strip()
        if content_type not in allowed_reel_video_types:
            raise HTTPException(
                status_code=400,
                detail="Formato no soportado para Reels. Usa MP4, WebM, MOV o AVI.",
            )
        data = await file.read()
        if len(data) > max_reel_video_size:
            raise HTTPException(status_code=400, detail="El video supera 80 MB. Recorta tu reel a ≤ 60s.")

        # V15.3 — server-side trim + thumbnail. Best-effort so the upload
        # survives an ffmpeg blip.
        final_bytes = data
        final_ct = content_type
        thumbnail_bytes = None
        duration_s = None
        was_trimmed = False
        try:
            from services.reel_video import process_reel, is_ffmpeg_available, ReelTooShortError, MIN_REEL_DURATION_S
            if is_ffmpeg_available():
                try:
                    proc = await process_reel(data, content_type)
                    final_bytes = proc.video_bytes
                    final_ct = proc.output_content_type if proc.video_bytes is not data else content_type
                    thumbnail_bytes = proc.thumbnail_bytes
                    duration_s = proc.duration_s
                    was_trimmed = proc.was_trimmed
                except ReelTooShortError as exc:
                    raise HTTPException(
                        status_code=422,
                        detail=f"El video es muy corto ({exc.duration:.1f}s). Mínimo {MIN_REEL_DURATION_S}s.",
                    )
        except HTTPException:
            raise
        except Exception as exc:
            log.warning(f"reel post-process skipped: {exc}")

        ext_map = {
            "video/mp4": "mp4", "video/quicktime": "mov", "video/x-msvideo": "avi",
            "video/avi": "avi", "video/webm": "webm", "video/x-matroska": "mkv",
        }
        ext = "mp4" if final_ct == "video/mp4" else ext_map.get(final_ct, "mp4")
        file_id = str(uuid.uuid4())
        path = f"{app_name}/reels/{user.user_id}/{file_id}.{ext}"
        try:
            result = put_object(path, final_bytes, final_ct)
        except Exception as exc:
            log.exception("Reel video upload failed")
            raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")

        thumb_url = None
        if thumbnail_bytes:
            try:
                thumb_path = f"{app_name}/reels/{user.user_id}/{file_id}-thumb.jpg"
                thumb_result = put_object(thumb_path, thumbnail_bytes, "image/jpeg")
                thumb_url = f"/api/files/{thumb_result['path']}"
                await db.files.insert_one({
                    "file_id": f"{file_id}-thumb",
                    "user_id": user.user_id,
                    "storage_path": thumb_result["path"],
                    "original_filename": f"{file_id}-thumb.jpg",
                    "content_type": "image/jpeg",
                    "size": thumb_result.get("size", len(thumbnail_bytes)),
                    "is_deleted": False,
                    "kind": "reel-thumb",
                    "parent_file_id": file_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
            except Exception as exc:
                log.warning(f"thumbnail upload skipped: {exc}")

        await db.files.insert_one({
            "file_id": file_id, "user_id": user.user_id, "storage_path": result["path"],
            "original_filename": file.filename or "", "content_type": final_ct,
            "size": result.get("size", len(final_bytes)), "is_deleted": False,
            "kind": "reel-video",
            "thumbnail_url": thumb_url,
            "duration_s": duration_s,
            "was_trimmed": was_trimmed,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {
            "file_id": file_id,
            "path": result["path"],
            "url": f"/api/files/{result['path']}",
            "thumbnail_url": thumb_url,
            "duration_s": duration_s,
            "was_trimmed": was_trimmed,
            "content_type": final_ct,
            "size": result.get("size", len(final_bytes)),
        }

    @router.post("/upload")
    async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):  # type: ignore[valid-type]
        content_type = file.content_type or "application/octet-stream"
        if content_type.startswith("video/"):
            raise HTTPException(
                status_code=400,
                detail="Los videos van a /api/reels/upload-video, no a /api/upload.",
            )
        if content_type not in allowed_image_types:
            raise HTTPException(status_code=400, detail="Solo imágenes (jpg/png/webp/gif/heic)")
        data = await file.read()
        if len(data) > max_upload_size:
            raise HTTPException(status_code=400, detail="El archivo supera 10 MB")
        data, content_type = compress_image_bytes(data, content_type)
        ext = content_type.split("/")[-1]
        if ext == "jpeg":
            ext = "jpg"
        file_id = str(uuid.uuid4())
        path = f"{app_name}/uploads/{user.user_id}/{file_id}.{ext}"
        try:
            result = put_object(path, data, content_type)
        except Exception as exc:
            log.exception("Upload failed")
            raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")
        await db.files.insert_one({
            "file_id": file_id,
            "user_id": user.user_id,
            "storage_path": result["path"],
            "original_filename": file.filename or "",
            "content_type": content_type,
            "size": result.get("size", len(data)),
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"file_id": file_id, "path": result["path"], "url": f"/api/files/{result['path']}"}

    @router.get("/files/{path:path}")
    async def download(path: str):
        record = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
        if not record:
            raise HTTPException(status_code=404, detail="File not found")
        try:
            data, ct = get_object(path)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Storage error: {exc}")
        return Response(content=data, media_type=record.get("content_type") or ct)

    return router
