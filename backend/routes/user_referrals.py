"""
User Referrals — Section 72.

"Invite a provider to getamano, stay free yourself" model.

Mechanics (locked-in with founder):
  - 2 confirmed paying referees → 1 free month for the referrer.
  - 4 referees → 2 months. 6 → 3 months. (Every 2 paid = +1 month.)
  - Referee gets their FIRST MONTH FREE (extends pro_referral_until +30 days).
  - No cap. Free months stack as credits applied to next Stripe invoice.
  - Self-referral guard, idempotency, and "must confirm payment" gate.

Data flow:
  1. User shares link `/r/{code}` (code = ref_code from provider_profiles).
  2. New user signs up via /auth/register?ref=CODE.
  3. _track_referral_signup() inserts row into `referrals` collection with
     status='registered'.
  4. When the referee CONFIRMS a paid subscription (via Stripe webhook in
     production, or /user-referrals/simulate-paid/{user_id} in dev), we call
     `mark_referral_paid()`:
       - status → 'paid'
       - referee gets 30 days Pro free
       - referrer's counter increments
       - every 2 paid = +1 month credit in commission_credits ledger
  5. Same widget + sync-stripe + celebration mechanism kicks in.

Endpoints (`/api/user-referrals/*`):
  GET   /user-referrals/me                          — code, link, progress, paid count
  GET   /user-referrals/me/invites                  — invites list with status badges
  POST  /user-referrals/simulate-paid/{ref_id}      — DEV-ONLY: simulate referee paying
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException


# Standard "1 free month" value used when crediting a milestone. Matches
# the current Pro Monthly plan price. If pricing changes, update this
# constant (or migrate to fetch from a settings collection).
FREE_MONTH_CENTS = 900  # $9.00 USD

# Every N confirmed paying referees award 1 month free.
REFEREES_PER_MILESTONE = 2

# Days of Pro extended to a referee on their first confirmed payment.
REFEREE_FREE_DAYS = 30


async def _award_milestone_credit(db, referrer_user_id: str, milestone_index: int) -> None:
    """Append a free-month credit to the commission_credits ledger when
    the referrer hits a milestone (2, 4, 6, ... confirmed referees). Then
    fire an in-app + push notification celebrating it.

    Idempotent on (source='user_referral_milestone', source_id='milestone_{N}').
    """
    from routes.credits import record_commission_credit
    source_id = f"milestone_{milestone_index}"  # the Nth milestone (1, 2, 3...)
    await record_commission_credit(
        db,
        user_id=referrer_user_id,
        source_id=source_id,
        amount_cents=FREE_MONTH_CENTS,
        note=f"1 mes gratis Pro · hito #{milestone_index} ({REFEREES_PER_MILESTONE * milestone_index} amigos suscritos)",
        source="user_referral_milestone",
    )

    # Celebration notification (separate from the "credit applied" celebration
    # of Section 71b — this one fires at MILESTONE EARNED, before Stripe
    # applies it). User journey:
    #   1. friend pays → 🎉 "Ganaste 1 mes gratis"
    #   2. next billing → 🎉 "Te ahorramos $X este mes" (credit applied)
    try:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "notification_key": f"{referrer_user_id}::milestone_award::{milestone_index}",
            "user_id": referrer_user_id,
            "category": "referrals",
            "title": f"🎉 Ganaste 1 mes gratis Pro (hito #{milestone_index})",
            "body": (
                f"{REFEREES_PER_MILESTONE * milestone_index} amigos se suscribieron gracias a ti. "
                f"Refiere 2 más y gana otro mes. Esta app es tuya — mereces un espacio aquí."
            ),
            "cta_label": "Ver mi red",
            "cta_url": "/dashboard/provider?tab=red",
            "icon": "trophy",
            "priority": "high",
            "is_read": False,
            "dismissed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

    try:
        from routes.push import send_push_to_user
        await send_push_to_user(db, referrer_user_id, {
            "title": "🎉 Ganaste 1 mes gratis Pro",
            "body": "Refiere 2 más y gana otro. ¡Sigue construyendo tu red!",
            "url": "/dashboard/provider?tab=red",
            "tag": "user-referral-milestone",
            "icon": "/icon-192x192.png",
        })
    except Exception:
        pass

    # Section 73 — also deliver via WhatsApp / SMS (sandbox-safe).
    # The wrapper picks the right channel based on the user's profile
    # (provider+es → WhatsApp, client+en → SMS). No-op if no phone on file.
    try:
        from integrations.messaging import deliver_notification
        user_doc = await db.users.find_one(
            {"user_id": referrer_user_id},
            {"_id": 0, "name": 1},
        ) or {}
        first_name = (user_doc.get("name") or "").split(" ")[0] or "amigo"
        paid_count = REFEREES_PER_MILESTONE * milestone_index
        await deliver_notification(
            db,
            user_id=referrer_user_id,
            template_name="referral_milestone_unlocked",
            variables={"name": first_name, "paid_count": paid_count, "url": "/dashboard/provider?tab=red"},
        )
    except Exception:
        pass

    # Section 77 — Auto-post to community feed so other providers see the
    # achievement. Creates social proof + viral signal ("se puede ganar
    # gratis aquí"). Idempotent: only insert if no prior milestone post
    # exists for the same (user, milestone).
    try:
        existing_post = await db.community_posts.find_one(
            {"user_id": referrer_user_id, "type": "milestone", "milestone_index": milestone_index},
            {"_id": 0, "post_id": 1},
        )
        if not existing_post:
            user_doc = await db.users.find_one(
                {"user_id": referrer_user_id},
                {"_id": 0, "name": 1},
            ) or {}
            first_name = (user_doc.get("name") or "").split(" ")[0] or "alguien"
            paid_count = REFEREES_PER_MILESTONE * milestone_index
            month_label = "1 mes gratis" if milestone_index == 1 else f"{milestone_index} meses gratis"
            content = (
                f"🏆 ¡Acabo de ganar {month_label} en getamano! Refiriendo a {paid_count} "
                f"amigos suscritos. La app me devuelve lo que aporto a la comunidad — "
                f"esta app es nuestra. ¿Quién se anima a invitar más?"
            )
            post_doc = {
                "post_id": f"post_{uuid.uuid4().hex[:14]}",
                "user_id": referrer_user_id,
                "content": content,
                "image_url": None,
                "type": "milestone",                  # new field — distinguishes from regular posts
                "milestone_index": milestone_index,
                "milestone_paid_count": paid_count,
                "likes_count": 0,
                "comments_count": 0,
                "is_hidden": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.community_posts.insert_one(post_doc)
    except Exception:
        pass


async def _extend_referee_pro(db, referee_user_id: str) -> str:
    """Grant the referee 30 days of Pro by extending pro_referral_until.

    Stacks on top of existing bonus time if any. Returns the new
    timestamp.
    """
    now = datetime.now(timezone.utc)
    bonus_until = now + timedelta(days=REFEREE_FREE_DAYS)
    u = await db.users.find_one(
        {"user_id": referee_user_id},
        {"_id": 0, "pro_referral_until": 1},
    )
    new_until = bonus_until
    current = (u or {}).get("pro_referral_until")
    if current:
        try:
            current_dt = datetime.fromisoformat(current.replace("Z", "+00:00"))
            if current_dt > now:
                new_until = current_dt + timedelta(days=REFEREE_FREE_DAYS)
        except Exception:
            pass
    await db.users.update_one(
        {"user_id": referee_user_id},
        {"$set": {"pro_referral_until": new_until.isoformat()}},
    )
    return new_until.isoformat()


async def mark_referral_paid(db, referee_user_id: str) -> Optional[dict]:
    """Production hook: called when the referee confirms their FIRST paid
    subscription (via Stripe webhook `invoice.payment_succeeded`).

    Idempotent — status check prevents double-firing. Returns the updated
    referral row, or None if no referral exists for this user.
    """
    referral = await db.referrals.find_one(
        {"referred_user_id": referee_user_id},
        {"_id": 0},
    )
    if not referral:
        return None
    if referral.get("status") == "paid":
        return referral  # already processed
    now_iso = datetime.now(timezone.utc).isoformat()
    # 1. Update referral row
    await db.referrals.update_one(
        {"referral_id": referral["referral_id"]},
        {"$set": {"status": "paid", "paid_at": now_iso}},
    )
    # 2. Grant referee their free month
    referee_until = await _extend_referee_pro(db, referee_user_id)

    # 3. Notify the referee
    referrer_doc = await db.users.find_one(
        {"user_id": referral["referrer_user_id"]},
        {"_id": 0, "name": 1},
    ) or {}
    referrer_name = (referrer_doc.get("name") or "").split(" ")[0] or "tu compa"
    try:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "notification_key": f"{referee_user_id}::referee_first_month::{referral['referral_id']}",
            "user_id": referee_user_id,
            "category": "referrals",
            "title": "🎁 Tu primer mes Pro es gratis",
            "body": (
                f"Como llegaste por {referrer_name}, te regalamos 30 días Pro. "
                f"Esta app es tuya — bienvenido."
            ),
            "cta_label": "Ver mi plan",
            "cta_url": "/dashboard/provider?tab=cuenta",
            "icon": "gift",
            "priority": "high",
            "is_read": False,
            "dismissed_at": None,
            "created_at": now_iso,
        })
    except Exception:
        pass

    # Section 73 — also deliver via WhatsApp / SMS (sandbox-safe).
    try:
        from integrations.messaging import deliver_notification
        referee_doc = await db.users.find_one(
            {"user_id": referee_user_id},
            {"_id": 0, "name": 1},
        ) or {}
        referee_first_name = (referee_doc.get("name") or "").split(" ")[0] or "amigo"
        await deliver_notification(
            db,
            user_id=referee_user_id,
            template_name="referral_first_month_free",
            variables={
                "name": referee_first_name,
                "referrer_name": referrer_name,
                "url": "/dashboard/provider?tab=cuenta",
            },
        )
    except Exception:
        pass

    # 4. Count referrer's confirmed referees and check for milestone unlock
    paid_count = await db.referrals.count_documents({
        "referrer_user_id": referral["referrer_user_id"],
        "status": "paid",
    })
    # New milestones since last credit award. Example: paid_count=3 means
    # 1 milestone earned (at count=2). paid_count=4 → 2 milestones earned.
    milestones_earned = paid_count // REFEREES_PER_MILESTONE
    # Find which milestones have NOT been credited yet
    existing_credits = await db.commission_credits.count_documents({
        "user_id": referral["referrer_user_id"],
        "source": "user_referral_milestone",
    })
    for idx in range(existing_credits + 1, milestones_earned + 1):
        await _award_milestone_credit(db, referral["referrer_user_id"], idx)

    return {
        **referral,
        "status": "paid",
        "paid_at": now_iso,
        "referee_pro_until": referee_until,
        "referrer_paid_count": paid_count,
    }


async def _generate_or_get_ref_code(db, user_id: str) -> str:
    """Lazy-generate a 6-char uppercase code for the user. Stored on
    provider_profiles (legacy field name `ref_code` kept for compatibility
    with /auth/register?ref= flow).
    """
    prof = await db.provider_profiles.find_one(
        {"user_id": user_id},
        {"_id": 0, "ref_code": 1},
    )
    if prof and prof.get("ref_code"):
        return prof["ref_code"]
    # Collision-resistant 6-char base32. Try a few times.
    import secrets
    import string
    alphabet = string.ascii_uppercase + string.digits  # no lowercase to keep
    # codes legible on flyers
    alphabet = alphabet.replace("O", "").replace("0", "").replace("I", "").replace("1", "")
    for _ in range(8):
        candidate = "".join(secrets.choice(alphabet) for _ in range(6))
        # check unique
        exists = await db.provider_profiles.find_one({"ref_code": candidate}, {"_id": 0, "user_id": 1})
        if not exists:
            await db.provider_profiles.update_one(
                {"user_id": user_id},
                {"$set": {"ref_code": candidate}},
                upsert=False,
            )
            return candidate
    # Fallback (extremely unlikely): use uuid prefix
    return uuid.uuid4().hex[:6].upper()


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    @router.get("/user-referrals/me")
    async def my_referral_summary(me: User = Depends(get_current_user)) -> dict:
        """Code + share link + counters + progress toward next milestone."""
        if me.role != "provider":
            raise HTTPException(status_code=403, detail="Solo proveedores pueden invitar.")
        code = await _generate_or_get_ref_code(db, me.user_id)

        registered_count = await db.referrals.count_documents({
            "referrer_user_id": me.user_id,
            "status": {"$in": ["registered", "paid"]},
        })
        paid_count = await db.referrals.count_documents({
            "referrer_user_id": me.user_id,
            "status": "paid",
        })
        # Milestone math
        next_milestone_at = ((paid_count // REFEREES_PER_MILESTONE) + 1) * REFEREES_PER_MILESTONE
        needed_for_next = next_milestone_at - paid_count  # 1 or 2
        milestones_earned = paid_count // REFEREES_PER_MILESTONE

        # Section 77 — Latest milestone metadata. Frontend uses this combined
        # with localStorage to detect "unseen" milestones and fire the
        # confetti modal exactly once per new unlock.
        latest_milestone = await db.commission_credits.find_one(
            {"user_id": me.user_id, "source": "user_referral_milestone"},
            {"_id": 0, "credit_id": 1, "source_id": 1, "created_at": 1, "amount_cents": 1},
            sort=[("created_at", -1)],
        )

        # Public share URL — frontend resolves window.location.origin
        return {
            "ref_code": code,
            "share_path": f"/r/{code}",
            "registered_count": registered_count,
            "paid_count": paid_count,
            "free_months_earned": milestones_earned,
            "next_milestone_at": next_milestone_at,
            "needed_for_next": needed_for_next,
            "ratio": REFEREES_PER_MILESTONE,
            "referee_free_days": REFEREE_FREE_DAYS,
            "free_month_value_cents": FREE_MONTH_CENTS,
            "latest_milestone": latest_milestone,
            "headline": (
                f"Tienes {paid_count} amigo{'s' if paid_count != 1 else ''} suscrito{'s' if paid_count != 1 else ''}. "
                + (
                    f"¡Refiere {needed_for_next} más y gana 1 mes gratis!"
                    if needed_for_next > 0 else
                    "¡Estás en racha — sigue invitando!"
                )
            ),
        }

    @router.get("/user-referrals/me/invites")
    async def my_invites(me: User = Depends(get_current_user)) -> list:
        if me.role != "provider":
            raise HTTPException(status_code=403, detail="Solo proveedores.")
        rows = await db.referrals.find(
            {"referrer_user_id": me.user_id},
            {"_id": 0},
        ).sort("created_at", -1).to_list(100)
        # Enrich with referee name + city
        out = []
        for r in rows:
            u = await db.users.find_one(
                {"user_id": r["referred_user_id"]},
                {"_id": 0, "name": 1},
            ) or {}
            prof = await db.provider_profiles.find_one(
                {"user_id": r["referred_user_id"]},
                {"_id": 0, "business_name": 1, "city": 1, "slug": 1, "logo_url": 1},
            ) or {}
            out.append({
                **r,
                "referee": {
                    "name": u.get("name") or prof.get("business_name") or "—",
                    "business_name": prof.get("business_name"),
                    "city": prof.get("city"),
                    "slug": prof.get("slug"),
                    "logo_url": prof.get("logo_url"),
                },
            })
        return out

    @router.post("/user-referrals/simulate-paid/{referral_id}")
    async def simulate_referee_paid(referral_id: str, me: User = Depends(get_current_user)) -> dict:
        """DEV-ONLY: simulate the referee's first paid subscription
        confirmation. In production, Stripe webhook fires the same
        underlying `mark_referral_paid()` helper.

        Guards:
          - Only the referrer can simulate THEIR OWN invites.
          - Disabled when STRIPE_SECRET_KEY is configured (use webhook).
        """
        if os.environ.get("STRIPE_SECRET_KEY"):
            raise HTTPException(
                status_code=400,
                detail="Simulación deshabilitada en producción. Stripe webhook se encarga.",
            )
        ref = await db.referrals.find_one({"referral_id": referral_id}, {"_id": 0})
        if not ref:
            raise HTTPException(status_code=404, detail="Referral no encontrado.")
        if ref["referrer_user_id"] != me.user_id:
            raise HTTPException(status_code=403, detail="No es tu referido.")
        updated = await mark_referral_paid(db, ref["referred_user_id"])
        return {"ok": True, "mode": "dev-simulated", "referral": updated}

    return router
