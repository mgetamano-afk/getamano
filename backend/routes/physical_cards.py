"""
Physical Cards (V7 Item 3) — admin + provider self-service flow
================================================================

Providers can order NFC business cards pre-tapped with their eCard URL.
Admin sees every order and can move it through the fulfilment funnel:
  ordered → printing → shipped → delivered

Collections
-----------
`physical_card_orders`:
  { order_id, user_id, provider_id, slug,
    business_name, qty, total_usd, shipping_address,
    status, status_history[],
    tracking_carrier?, tracking_number?,
    created_at, updated_at }

Endpoints
---------
  POST   /api/physical-cards/orders            (provider) — place an order
  GET    /api/physical-cards/orders/me         (provider) — list my orders
  GET    /api/admin/physical-cards             (admin)    — list every order
  PATCH  /api/admin/physical-cards/{order_id}  (admin)    — update status/tracking
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

PRICE_PER_PACK_USD = 29
CARDS_PER_PACK = 10
STATUSES = ["ordered", "printing", "shipped", "delivered", "cancelled"]


# Section V13 — Print-with-getamano funnel
# ----------------------------------------
# Providers tap "Imprimir con getamano" → a `print_card_orders` row is
# created with the PDF stored as base64 (small, ~30 KB). The admin panel
# lists everything pending and downloads the PDF to forward to the
# printer.
PRINT_PACK_PRICE_USD = 39  # opening + 1 starter pack of CARDS_PER_PACK


class PrintCardsOrderIn(BaseModel):
    provider_id: str = Field(..., max_length=80)
    packs: int = Field(default=1, ge=1, le=10)
    notes: Optional[str] = Field(default=None, max_length=400)
    # V14 — optional AI design reference; if provided we composite the
    # AI background into the printed PDF instead of the gradient mock.
    design_id: Optional[str] = Field(default=None, max_length=80)


class AiDesignIn(BaseModel):
    provider_id: str = Field(..., max_length=80)
    # Three hex colours. We store all three so the print PDF + the live
    # web preview pull from the same source of truth.
    palette: List[str] = Field(..., min_length=3, max_length=3)
    # Optional category override (defaults to whatever's on the eCard).
    category_label: Optional[str] = Field(default=None, max_length=80)
    seed_hint: Optional[str] = Field(default=None, max_length=120)


class ShippingAddressIn(BaseModel):
    name: str = Field(..., max_length=120)
    line1: str = Field(..., max_length=200)
    line2: Optional[str] = Field(default=None, max_length=200)
    city: str = Field(..., max_length=80)
    state: str = Field(..., max_length=40)
    zip: str = Field(..., max_length=12)
    phone: Optional[str] = Field(default=None, max_length=20)


class PhysicalCardOrderIn(BaseModel):
    packs: int = Field(..., ge=1, le=10)
    shipping: ShippingAddressIn


class PhysicalCardStatusIn(BaseModel):
    status: Literal["ordered", "printing", "shipped", "delivered", "cancelled"]
    tracking_carrier: Optional[str] = Field(default=None, max_length=40)
    tracking_number: Optional[str] = Field(default=None, max_length=60)


def make_router(*, db: Any, User: type, get_current_user, require_admin) -> APIRouter:
    router = APIRouter()

    @router.post("/physical-cards/orders")
    async def create_order(payload: PhysicalCardOrderIn, user: User = Depends(get_current_user)) -> dict:
        prof = await db.provider_profiles.find_one(
            {"user_id": user.user_id, "is_active": True},
            {"_id": 0, "provider_id": 1, "slug": 1, "business_name": 1},
        )
        if not prof:
            raise HTTPException(status_code=403, detail="Activa tu perfil de proveedor primero.")
        now = datetime.now(timezone.utc).isoformat()
        order = {
            "order_id": f"pcord_{uuid.uuid4().hex[:12]}",
            "user_id": user.user_id,
            "provider_id": prof["provider_id"],
            "slug": prof.get("slug"),
            "business_name": prof.get("business_name"),
            "qty_cards": payload.packs * CARDS_PER_PACK,
            "packs": payload.packs,
            "total_usd": payload.packs * PRICE_PER_PACK_USD,
            "shipping_address": payload.shipping.model_dump(),
            "status": "ordered",
            "status_history": [{"status": "ordered", "at": now}],
            "tracking_carrier": None,
            "tracking_number": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.physical_card_orders.insert_one(order)

        # Notify admin via push (best-effort)
        try:
            from routes.push import send_push_to_user
            admins = await db.users.find({"role": "admin"}, {"_id": 0, "user_id": 1}).to_list(20)
            for adm in admins:
                await send_push_to_user(db, adm["user_id"], {
                    "title": "Nueva orden de tarjetas físicas",
                    "body": f"{prof.get('business_name')} · {payload.packs} pack(s) · ${order['total_usd']}",
                    "icon": "/getamano-logo-mark.png",
                    "url": "/dashboard/admin?section=physical-cards",
                    "tag": f"pcord_{order['order_id']}",
                })
        except Exception as _e:
            logger.warning(f"physical card admin push failed: {_e}")

        order.pop("_id", None)
        return order

    @router.get("/physical-cards/orders/me")
    async def list_my_orders(user: User = Depends(get_current_user)) -> List[dict]:
        return await db.physical_card_orders.find(
            {"user_id": user.user_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)

    # ─── V13: PDF preview + print order funnel ────────────────────

    async def _resolve_owned_ecard(user_id: str, provider_id: Optional[str]) -> dict:
        """Looks up an eCard, defaulting to the user's primary one if no
        `provider_id` is supplied. Raises 404 if it doesn't belong to the
        caller — providers must own the eCard they're printing."""
        from services.card_pdf import render_card_pdf  # noqa: F401 — keep lazy
        query: dict = {"user_id": user_id}
        if provider_id:
            query["provider_id"] = provider_id
        cur = db.provider_profiles.find(query, {"_id": 0}).sort("created_at", 1)
        docs = await cur.to_list(20)
        if not docs:
            raise HTTPException(status_code=404, detail="eCard no encontrada o no es tuya.")
        return docs[0]

    @router.get("/physical-cards/preview-pdf")
    async def preview_pdf(provider_id: Optional[str] = None, design_id: Optional[str] = None,
                          user: User = Depends(get_current_user)):
        """Returns a 2-page PDF (front + back, real-size 85.6×54mm) for
        the caller's eCard. If `design_id` is supplied (or the provider
        has a saved AI design), the AI background is composited in."""
        from services.card_pdf import render_card_pdf
        prof = await _resolve_owned_ecard(user.user_id, provider_id)
        ai_bg_b64, palette = await _load_design(user.user_id, prof["provider_id"], design_id)
        pdf = render_card_pdf(
            business_name=prof.get("business_name", ""),
            city=prof.get("city"),
            state=prof.get("state"),
            slug=prof.get("slug"),
            getamano_code=prof.get("getamano_code"),
            is_verified=prof.get("verification_status") == "approved",
            ai_bg_b64=ai_bg_b64,
            palette=palette,
        )
        filename = f"getamano-card-{prof.get('slug', 'preview')}.pdf"
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    async def _load_design(user_id: str, provider_id: str, explicit_design_id: Optional[str]):
        """Resolves which design to use for previews/print.

        Priority:
          1. Explicit `design_id` (must belong to caller).
          2. Latest design saved for this provider_id.
          3. None → fall back to the deterministic gradient.
        Returns (b64_or_none, palette_or_none).
        """
        if explicit_design_id:
            d = await db.card_designs.find_one(
                {"design_id": explicit_design_id, "user_id": user_id},
                {"_id": 0},
            )
        else:
            d = await db.card_designs.find_one(
                {"user_id": user_id, "provider_id": provider_id, "is_active": True},
                sort=[("created_at", -1)],
            )
        if not d:
            return None, None
        return d.get("image_b64"), tuple(d.get("palette") or []) or None

    @router.post("/physical-cards/ai-design")
    async def ai_design(payload: AiDesignIn, user: User = Depends(get_current_user)) -> dict:
        """Generates a new AI background for the caller's eCard via Gemini
        Nano Banana. Unlimited regenerations are allowed — only the LATEST
        active design is used at print time. Each call costs ~1.5¢ of
        Emergent LLM credits."""
        from services.ai_card_design import generate_card_background
        prof = await _resolve_owned_ecard(user.user_id, payload.provider_id)

        category_label = payload.category_label or prof.get("category_label")
        if not category_label and prof.get("category_id"):
            cat = await db.categories.find_one({"category_id": prof["category_id"]}, {"_id": 0, "name_es": 1, "name_en": 1})
            if cat:
                category_label = cat.get("name_es") or cat.get("name_en")
        category_label = category_label or prof.get("business_name", "professional service")

        try:
            bg_b64 = await generate_card_background(
                category_label=category_label,
                palette=(payload.palette[0], payload.palette[1], payload.palette[2]),
                business_name=prof.get("business_name"),
                seed_hint=payload.seed_hint,
            )
        except Exception as e:
            logger.exception("AI design generation failed")
            raise HTTPException(status_code=502, detail=f"La IA no pudo generar el diseño: {e}")

        now = datetime.now(timezone.utc).isoformat()
        design_id = f"des_{uuid.uuid4().hex[:14]}"
        # Mark older designs as inactive so only the latest one feeds print.
        await db.card_designs.update_many(
            {"user_id": user.user_id, "provider_id": prof["provider_id"]},
            {"$set": {"is_active": False}},
        )
        doc = {
            "design_id": design_id,
            "user_id": user.user_id,
            "provider_id": prof["provider_id"],
            "palette": payload.palette,
            "category_label": category_label,
            "seed_hint": payload.seed_hint,
            "image_b64": bg_b64,
            "image_size_bytes": len(bg_b64) * 3 // 4,
            "is_active": True,
            "created_at": now,
        }
        await db.card_designs.insert_one(doc)
        doc.pop("_id", None)
        # Don't echo the full image (it's ~600 KB); return a thumbnail-style
        # data URL the frontend can render directly + the design_id.
        return {
            "design_id": design_id,
            "palette": payload.palette,
            "category_label": category_label,
            "preview_data_url": f"data:image/png;base64,{bg_b64}",
            "created_at": now,
        }

    @router.get("/physical-cards/ai-design/active")
    async def get_active_design(provider_id: Optional[str] = None, user: User = Depends(get_current_user)) -> dict:
        prof = await _resolve_owned_ecard(user.user_id, provider_id)
        d = await db.card_designs.find_one(
            {"user_id": user.user_id, "provider_id": prof["provider_id"], "is_active": True},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        if not d:
            return {"design_id": None, "preview_data_url": None, "palette": None}
        return {
            "design_id": d["design_id"],
            "palette": d.get("palette"),
            "category_label": d.get("category_label"),
            "preview_data_url": f"data:image/png;base64,{d['image_b64']}",
            "created_at": d["created_at"],
        }

    @router.post("/physical-cards/print-orders")
    async def submit_print_order(payload: PrintCardsOrderIn, user: User = Depends(get_current_user)) -> dict:
        """Creates a print-with-getamano order. The rendered PDF (with the
        AI background if one is active) is stored alongside the order so
        the admin panel can download exactly what the provider previewed.
        Status starts at "pending_payment" because Stripe is still mocked."""
        import base64
        from services.card_pdf import render_card_pdf
        prof = await _resolve_owned_ecard(user.user_id, payload.provider_id)
        ai_bg_b64, palette = await _load_design(user.user_id, prof["provider_id"], payload.design_id)
        pdf = render_card_pdf(
            business_name=prof.get("business_name", ""),
            city=prof.get("city"),
            state=prof.get("state"),
            slug=prof.get("slug"),
            getamano_code=prof.get("getamano_code"),
            is_verified=prof.get("verification_status") == "approved",
            ai_bg_b64=ai_bg_b64,
            palette=palette,
        )
        now = datetime.now(timezone.utc).isoformat()
        order = {
            "order_id": f"pco_{uuid.uuid4().hex[:12]}",
            "user_id": user.user_id,
            "provider_id": prof["provider_id"],
            "slug": prof.get("slug"),
            "business_name": prof.get("business_name", ""),
            "packs": payload.packs,
            "qty_cards": payload.packs * CARDS_PER_PACK,
            "total_usd": payload.packs * PRICE_PER_PACK_USD,
            "notes": payload.notes,
            "design_id": payload.design_id,
            "has_ai_background": bool(ai_bg_b64),
            "status": "pending_payment",
            "status_history": [{"status": "pending_payment", "at": now}],
            "pdf_b64": base64.b64encode(pdf).decode("ascii"),
            "pdf_size_bytes": len(pdf),
            "created_at": now,
            "updated_at": now,
        }
        await db.print_card_orders.insert_one(order)
        order.pop("_id", None)
        # Best-effort push to admins so they see it instantly.
        try:
            from routes.push import send_push_to_user
            admins = await db.users.find({"role": "admin"}, {"_id": 0, "user_id": 1}).to_list(20)
            for adm in admins:
                await send_push_to_user(db, adm["user_id"], {
                    "title": "Nueva orden de impresión",
                    "body": f"{prof.get('business_name')} · {payload.packs} pack(s) · ${order['total_usd']}",
                    "icon": "/getamano-logo-mark.png",
                    "url": "/dashboard/admin?section=print-orders",
                    "tag": f"pco_{order['order_id']}",
                })
        except Exception as _e:
            logger.warning(f"print-order admin push failed: {_e}")
        out = {k: v for k, v in order.items() if k != "pdf_b64"}
        return out

    @router.get("/physical-cards/print-orders/me")
    async def my_print_orders(user: User = Depends(get_current_user)) -> List[dict]:
        cur = db.print_card_orders.find(
            {"user_id": user.user_id}, {"_id": 0, "pdf_b64": 0}
        ).sort("created_at", -1)
        return await cur.to_list(50)

    # ─── Admin counterparts ──────────────────────────────────────

    @router.get("/admin/print-orders")
    async def admin_list_print_orders(status: Optional[str] = None, _: User = Depends(require_admin)) -> List[dict]:
        q: dict = {}
        if status:
            q["status"] = status
        cur = db.print_card_orders.find(q, {"_id": 0, "pdf_b64": 0}).sort("created_at", -1)
        return await cur.to_list(500)

    @router.get("/admin/print-orders/{order_id}/pdf")
    async def admin_download_print_order_pdf(order_id: str, _: User = Depends(require_admin)):
        import base64
        order = await db.print_card_orders.find_one({"order_id": order_id}, {"_id": 0})
        if not order or not order.get("pdf_b64"):
            raise HTTPException(status_code=404, detail="Orden o PDF no encontrado.")
        pdf = base64.b64decode(order["pdf_b64"])
        filename = f"getamano-print-{order['order_id']}.pdf"
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @router.patch("/admin/print-orders/{order_id}")
    async def admin_update_print_order(order_id: str, status: str, _: User = Depends(require_admin)) -> dict:
        if status not in ("pending_payment", "queued_for_print", "printing", "shipped", "delivered", "cancelled"):
            raise HTTPException(status_code=400, detail="Estado inválido.")
        now = datetime.now(timezone.utc).isoformat()
        r = await db.print_card_orders.find_one_and_update(
            {"order_id": order_id},
            {"$set": {"status": status, "updated_at": now},
             "$push": {"status_history": {"status": status, "at": now}}},
        )
        if not r:
            raise HTTPException(status_code=404, detail="Orden no encontrada.")
        return {"ok": True, "status": status}

    @router.get("/admin/physical-cards")
    async def admin_list_orders(status: Optional[str] = None, _: User = Depends(require_admin)) -> List[dict]:
        q: dict = {}
        if status:
            q["status"] = status
        return await db.physical_card_orders.find(q, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)

    @router.patch("/admin/physical-cards/{order_id}")
    async def admin_update_order(order_id: str, payload: PhysicalCardStatusIn, admin: User = Depends(require_admin)) -> dict:
        order = await db.physical_card_orders.find_one({"order_id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Orden no encontrada.")
        now = datetime.now(timezone.utc).isoformat()
        update = {
            "status": payload.status,
            "updated_at": now,
        }
        if payload.tracking_carrier:
            update["tracking_carrier"] = payload.tracking_carrier
        if payload.tracking_number:
            update["tracking_number"] = payload.tracking_number
        await db.physical_card_orders.update_one(
            {"order_id": order_id},
            {
                "$set": update,
                "$push": {"status_history": {"status": payload.status, "at": now, "by": admin.user_id}},
            },
        )

        # Push the provider when the order moves forward
        try:
            from routes.push import send_push_to_user
            label_map = {
                "printing": "🖨️ Tus tarjetas físicas están en imprenta",
                "shipped": "📦 Tus tarjetas físicas fueron enviadas",
                "delivered": "✅ Tus tarjetas físicas fueron entregadas",
                "cancelled": "Orden cancelada",
            }
            title = label_map.get(payload.status)
            if title:
                body = (
                    f"Carrier {payload.tracking_carrier or ''} · {payload.tracking_number or ''}".strip()
                    if payload.tracking_number else "Pronto recibirás tus tarjetas NFC."
                )
                await send_push_to_user(db, order["user_id"], {
                    "title": title,
                    "body": body,
                    "icon": "/getamano-logo-mark.png",
                    "url": "/dashboard/provider?tab=tarjetas",
                    "tag": f"pcord_{order_id}_{payload.status}",
                })
        except Exception as _e:
            logger.warning(f"physical card status push failed: {_e}")

        return {"ok": True, "status": payload.status}

    return router


async def ensure_physical_cards_indexes(db) -> None:
    try:
        await db.physical_card_orders.create_index("created_at")
        await db.physical_card_orders.create_index("user_id")
        await db.physical_card_orders.create_index("status")
        logger.info("physical_card_orders indexes ensured")
    except Exception as e:
        logger.warning(f"physical_card_orders indexes skipped: {e}")
