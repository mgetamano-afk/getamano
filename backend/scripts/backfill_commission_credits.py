"""
One-shot backfill: scan all completed referral_jobs and ensure each has a
corresponding row in commission_credits. Safe to re-run (idempotent via
the unique source+source_id check inside record_commission_credit).

Usage:
  cd /app/backend && python scripts/backfill_commission_credits.py
"""
import asyncio
import os
import sys
from pathlib import Path

# Make `routes/` importable when run as a standalone script.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Load .env so MONGO_URL / DB_NAME are available when run standalone.
from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from routes.credits import record_commission_credit  # noqa: E402


async def main() -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    cursor = db.referral_jobs.find(
        {"status": "completed", "commission_amount": {"$gt": 0}},
        {"_id": 0, "referral_id": 1, "referrer_user_id": 1, "commission_amount": 1, "client_name": 1, "completed_at": 1},
    )
    rows = await cursor.to_list(10_000)
    print(f"Found {len(rows)} completed referrals.")
    created = 0
    skipped = 0
    for r in rows:
        before = await db.commission_credits.find_one(
            {"source": "referral", "source_id": r["referral_id"], "user_id": r["referrer_user_id"]},
            {"_id": 0, "credit_id": 1},
        )
        await record_commission_credit(
            db,
            user_id=r["referrer_user_id"],
            source_id=r["referral_id"],
            amount_cents=int(round(float(r["commission_amount"]) * 100)),
            note=f"5% comisión por trabajo de {r.get('client_name', '—')}",
        )
        if before:
            skipped += 1
        else:
            created += 1
    print(f"Created {created} new credit rows, skipped {skipped} existing (idempotent).")

    # Quick sanity report
    total_cents = 0
    async for c in db.commission_credits.find({"status": "pending"}, {"_id": 0, "amount_cents": 1}):
        total_cents += int(c.get("amount_cents", 0))
    print(f"Pending balance across all users: ${total_cents/100:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
