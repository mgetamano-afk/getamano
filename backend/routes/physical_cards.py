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
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

PRICE_PER_PACK_USD = 29
CARDS_PER_PACK = 10
STATUSES = ["ordered", "printing", "shipped", "delivered", "cancelled"]


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
