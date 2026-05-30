"""
PDF Card Preview (V13 + V14)
============================

Generates a real-size mock-up of a provider's physical NFC business card
as a 2-page PDF (front + back) at 85.6 × 54 mm (CR-80 standard).

V14: optional AI-generated background + custom palette override. When
`ai_bg_b64` is supplied we composite it under the text layer; otherwise
we fall back to the deterministic gradient mock from V13.
"""
import base64
import logging
import os
from io import BytesIO
from typing import Optional, Tuple

from reportlab.lib.colors import HexColor, white, Color
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)

CARD_W = 85.6 * mm
CARD_H = 54.0 * mm
DEEP_BLUE = HexColor("#03045E")
ACCENT = HexColor("#0077B6")
SOFT_GREY = HexColor("#94A3B8")
LIGHT_GREY = HexColor("#E2E8F0")
DARK_GREY = HexColor("#0F172A")

VERIFY_BADGE_PATHS = [
    "/app/frontend/public/verify-badge-128.png",
    "/app/frontend/public/verify-badge-64.png",
]


def _safe(s: Optional[str]) -> str:
    return (s or "").strip()


def _hex(s: Optional[str], fallback):
    if not s:
        return fallback
    try:
        return HexColor(s)
    except Exception:
        return fallback


def render_card_pdf(
    *,
    business_name: str,
    city: Optional[str],
    state: Optional[str],
    slug: Optional[str],
    getamano_code: Optional[str],
    is_verified: bool = False,
    ai_bg_b64: Optional[str] = None,
    palette: Optional[Tuple[str, str, str]] = None,
) -> bytes:
    """Renders the 2-page (front + back) NFC card PDF."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(CARD_W, CARD_H))
    c.setTitle(f"getamano card · {_safe(business_name) or 'preview'}")
    c.setAuthor("getamano.us")

    primary_c = _hex(palette[0] if palette else None, DEEP_BLUE)
    deep_c = _hex(palette[1] if palette else None, ACCENT)
    accent_c = _hex(palette[2] if palette else None, ACCENT)

    # ─── PAGE 1: FRONT ──────────────────────────────────────────────
    drew_ai_bg = False
    if ai_bg_b64:
        try:
            img = ImageReader(BytesIO(base64.b64decode(ai_bg_b64)))
            c.drawImage(
                img, 0, 0, width=CARD_W, height=CARD_H,
                preserveAspectRatio=False, mask=None,
            )
            # Dark overlay so white text always reads, regardless of bg.
            c.setFillColor(Color(0, 0, 0, alpha=0.32))
            c.rect(0, 0, CARD_W, CARD_H, fill=1, stroke=0)
            drew_ai_bg = True
        except Exception as e:
            logger.warning(f"AI bg draw failed, falling back to gradient: {e}")

    if not drew_ai_bg:
        c.setFillColor(primary_c)
        c.rect(0, 0, CARD_W, CARD_H, fill=1, stroke=0)
        c.setFillColor(deep_c)
        p = c.beginPath()
        p.moveTo(CARD_W * 0.55, 0)
        p.lineTo(CARD_W, 0)
        p.lineTo(CARD_W, CARD_H)
        p.lineTo(CARD_W * 0.85, CARD_H)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

    # Logo placeholder square top-left
    c.setFillColorRGB(1, 1, 1, alpha=0.15)
    c.roundRect(5 * mm, CARD_H - 12 * mm, 8 * mm, 8 * mm, 1.2 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(7.5 * mm, CARD_H - 9 * mm, _safe(business_name)[:1].upper() or "·")

    # Business name
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(5 * mm, CARD_H - 22 * mm, _safe(business_name)[:24] or "Tu negocio")

    # City / state line
    loc = ", ".join([s for s in [_safe(city), _safe(state)] if s])
    if loc:
        c.setFillColorRGB(1, 1, 1, alpha=0.8)
        c.setFont("Helvetica", 8)
        c.drawString(5 * mm, CARD_H - 27 * mm, loc[:36])

    # Verified badge (top-right)
    if is_verified:
        for p_ in VERIFY_BADGE_PATHS:
            if os.path.exists(p_):
                try:
                    c.drawImage(p_, CARD_W - 12 * mm, CARD_H - 11 * mm,
                                width=7 * mm, height=7 * mm, mask="auto",
                                preserveAspectRatio=True)
                    break
                except Exception as e:
                    logger.warning(f"verify badge draw skipped: {e}")

    # Footer brand lockup + getamano_code
    c.setFillColorRGB(1, 1, 1, alpha=0.65)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(5 * mm, 4 * mm, "get")
    c.setFillColor(accent_c)
    c.drawString(5 * mm + 5.2 * mm, 4 * mm, "amano")
    if getamano_code:
        c.setFillColorRGB(1, 1, 1, alpha=0.55)
        c.setFont("Helvetica", 6.5)
        c.drawRightString(CARD_W - 5 * mm, 4 * mm, _safe(getamano_code))

    c.showPage()

    # ─── PAGE 2: BACK ───────────────────────────────────────────────
    c.setFillColor(white)
    c.rect(0, 0, CARD_W, CARD_H, fill=1, stroke=0)

    c.setStrokeColor(SOFT_GREY)
    c.setLineWidth(0.6)
    c.circle(CARD_W - 8 * mm, CARD_H - 8 * mm, 4 * mm, fill=0, stroke=1)
    c.setFillColor(SOFT_GREY)
    c.setFont("Helvetica-Bold", 5)
    c.drawCentredString(CARD_W - 8 * mm, CARD_H - 8.7 * mm, "NFC")

    c.setFillColor(SOFT_GREY)
    c.setFont("Helvetica-Bold", 6)
    c.drawString(5 * mm, CARD_H - 12 * mm, "TAP TO OPEN")

    c.setFillColor(primary_c)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(5 * mm, CARD_H - 18 * mm, _safe(business_name)[:30] or "Tu negocio")

    if slug:
        c.setFillColor(SOFT_GREY)
        c.setFont("Courier", 7)
        c.drawString(5 * mm, CARD_H - 23 * mm, f"getamano.us/p/{_safe(slug)[:36]}")

    c.setFillColor(SOFT_GREY)
    c.setFont("Helvetica", 6)
    c.drawString(5 * mm, 11 * mm, "Toca esta tarjeta con un celular")
    c.drawString(5 * mm, 8 * mm, "para abrir mi eCard pública.")

    qr_x = CARD_W - 14 * mm
    qr_y = 5 * mm
    sz = 2.5 * mm
    cells = ["BWBWBWBWB", "WBWBWBWBW", "BWWBWBWWB"]
    for row, pattern in enumerate(cells):
        for col, ch in enumerate(pattern[:3]):
            if ch == "B":
                c.setFillColor(DARK_GREY)
                c.rect(qr_x + col * sz, qr_y + row * sz, sz - 0.3 * mm,
                       sz - 0.3 * mm, fill=1, stroke=0)
            else:
                c.setFillColor(LIGHT_GREY)
                c.rect(qr_x + col * sz, qr_y + row * sz, sz - 0.3 * mm,
                       sz - 0.3 * mm, fill=1, stroke=0)

    c.showPage()
    c.save()
    return buf.getvalue()
