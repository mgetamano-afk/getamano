"""
Reel video post-processor (V15.3)
==================================

Post-processes uploaded reels:
  1. Probes duration; if > MAX_REEL_DURATION_S we trim to 60 s.
  2. Generates a 480×854 JPEG thumbnail at t=1s.
  3. Re-encodes to a single H.264 / AAC MP4 so the feed can stream
     anywhere (Safari iOS, Android Chrome, desktop).

The function operates on bytes (no FS state leaked) and returns:
    {"video_bytes": ..., "thumbnail_bytes": ..., "duration_s": float}

Heavy lifting runs in a background thread so the request stays under
the FastAPI request limit. Fail-soft: if ffmpeg blows up, the caller
keeps the original bytes and continues without a thumbnail.
"""
import asyncio
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Optional

import ffmpeg

logger = logging.getLogger(__name__)

MAX_REEL_DURATION_S = 60
THUMBNAIL_AT_S = 1.0


@dataclass
class ProcessedReel:
    video_bytes: bytes
    thumbnail_bytes: Optional[bytes]
    duration_s: float
    was_trimmed: bool
    original_content_type: str
    output_content_type: str = "video/mp4"


def _probe_duration(path: str) -> float:
    try:
        meta = ffmpeg.probe(path)
        for s in meta.get("streams", []):
            if s.get("codec_type") == "video":
                dur = s.get("duration") or meta.get("format", {}).get("duration")
                if dur:
                    return float(dur)
        return float(meta.get("format", {}).get("duration", 0.0))
    except Exception as e:
        logger.warning(f"ffprobe failed: {e}")
        return 0.0


def _process_sync(raw: bytes, content_type: str) -> ProcessedReel:
    with tempfile.TemporaryDirectory() as td:
        src_path = os.path.join(td, "src.bin")
        out_path = os.path.join(td, "out.mp4")
        thumb_path = os.path.join(td, "thumb.jpg")
        with open(src_path, "wb") as f:
            f.write(raw)

        duration = _probe_duration(src_path) or float(MAX_REEL_DURATION_S)
        was_trimmed = duration > MAX_REEL_DURATION_S
        clip_dur = min(duration, float(MAX_REEL_DURATION_S))

        # Transcode + (optionally) trim. We always re-encode so the
        # output container is MP4 (H.264 / AAC) regardless of input.
        try:
            (
                ffmpeg
                .input(src_path, t=clip_dur)
                .output(
                    out_path,
                    vcodec="libx264",
                    acodec="aac",
                    preset="veryfast",
                    movflags="+faststart",  # web-streamable
                    pix_fmt="yuv420p",
                    audio_bitrate="96k",
                    video_bitrate="1500k",
                    loglevel="error",
                )
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )
            with open(out_path, "rb") as f:
                video_bytes = f.read()
        except ffmpeg.Error as e:
            logger.warning(f"ffmpeg transcode failed, returning original: {e.stderr}")
            video_bytes = raw

        # Thumbnail
        thumbnail_bytes = None
        try:
            at = min(THUMBNAIL_AT_S, max(0.0, clip_dur - 0.1))
            (
                ffmpeg
                .input(out_path if os.path.exists(out_path) else src_path, ss=at)
                .output(thumb_path, vframes=1, vf="scale=480:-2", loglevel="error")
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )
            if os.path.exists(thumb_path):
                with open(thumb_path, "rb") as f:
                    thumbnail_bytes = f.read()
        except ffmpeg.Error as e:
            logger.warning(f"ffmpeg thumbnail failed: {e.stderr}")
        except Exception as e:
            logger.warning(f"thumbnail unexpected: {e}")

        return ProcessedReel(
            video_bytes=video_bytes,
            thumbnail_bytes=thumbnail_bytes,
            duration_s=round(clip_dur, 2),
            was_trimmed=was_trimmed,
            original_content_type=content_type,
        )


async def process_reel(raw: bytes, content_type: str) -> ProcessedReel:
    """Async wrapper — runs the (blocking) ffmpeg work in a thread so
    the FastAPI event loop stays responsive."""
    return await asyncio.to_thread(_process_sync, raw, content_type)


def is_ffmpeg_available() -> bool:
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=True)
        return True
    except Exception:
        return False
