"""Quick helper: temporarily unset/restore demo.provider's logo_url so that
the FirstSteps logo step is PENDING (needed for MediaChooser UI testing).

Usage:
  python toggle_logo.py unset    # saves current logo_url, then clears
  python toggle_logo.py restore  # restores previously saved logo_url
"""
import asyncio
import json
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient

BACKUP_PATH = "/tmp/iter63_maria_logo_backup.json"
EMAIL = "demo.provider@getamano.com"


async def main(action: str):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    user = await db.users.find_one({"email": EMAIL}, {"_id": 0, "user_id": 1})
    if not user:
        print(f"ERROR: provider user {EMAIL} not found")
        return
    profile = await db.provider_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        print("ERROR: provider profile not found")
        return

    if action == "unset":
        with open(BACKUP_PATH, "w") as f:
            json.dump({"logo_url": profile.get("logo_url", "")}, f)
        await db.provider_profiles.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"logo_url": ""}},
        )
        print(f"OK: logo_url cleared. backup saved at {BACKUP_PATH}")
    elif action == "restore":
        try:
            with open(BACKUP_PATH) as f:
                backup = json.load(f)
        except FileNotFoundError:
            print("ERROR: no backup file")
            return
        await db.provider_profiles.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"logo_url": backup.get("logo_url", "")}},
        )
        print(f"OK: logo_url restored to {backup.get('logo_url','')[:80]}")
    else:
        print(f"unknown action {action}; use 'unset' or 'restore'")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "unset"))
