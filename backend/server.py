from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, UploadFile, File, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import uuid
import bcrypt
import jwt
import httpx
import requests
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'getamano-dev-secret-change-me')
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 7
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# Emergent Object Storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "getamano"
_storage_key = None

def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 403:
        # reinit and retry once
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# Twilio SMS (log-only mode when credentials are absent)
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM = os.environ.get("TWILIO_PHONE_NUMBER", "").strip()
_twilio_client = None

def get_twilio():
    global _twilio_client
    if _twilio_client is not None:
        return _twilio_client
    if TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM:
        from twilio.rest import Client as TwilioClient
        _twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
    return _twilio_client

def send_sms(to_phone: str, body: str, event: str = "generic"):
    """Send SMS or log-only if Twilio not configured. Stores attempt in db.sms_log."""
    to_phone = (to_phone or "").strip()
    if not to_phone:
        return {"status": "skipped", "reason": "no phone"}
    twilio = get_twilio()
    record = {
        "to": to_phone, "body": body[:300], "event": event,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if twilio is None:
        record["status"] = "log_only"
        logger.info(f"[SMS log-only] event={event} to={to_phone} body={body!r}")
    else:
        try:
            msg = twilio.messages.create(to=to_phone, from_=TWILIO_FROM, body=body)
            record["status"] = "sent"
            record["sid"] = msg.sid
        except Exception as e:
            record["status"] = "error"
            record["error"] = str(e)[:200]
            logger.exception("Twilio send failed")
    # fire-and-forget insert (sync motor here would block — use create_task)
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(db.sms_log.insert_one(dict(record)))
        else:
            asyncio.run(db.sms_log.insert_one(dict(record)))
    except Exception:
        pass
    return record

app = FastAPI(title="getamano API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============ MODELS ============
Role = Literal["client", "provider", "admin"]
VerificationStatus = Literal["pending", "in_review", "needs_info", "approved", "rejected", "suspended"]

class User(BaseModel):
    user_id: str
    email: str
    name: str
    role: Role = "client"
    picture: Optional[str] = None
    phone: Optional[str] = None
    language: str = "es"
    country: str = "US"
    created_at: datetime

# ============ INTERNATIONALIZATION HELPERS (Sec 11) ============
DEFAULT_COUNTRY = "US"
DEFAULT_CURRENCY = "USD"

BUDGET_LABEL = {
    "<100": "menos de $100",
    "100-300": "$100–$300",
    "300-700": "$300–$700",
    "700-1500": "$700–$1500",
    ">1500": "más de $1500",
    "unknown": "sin definir",
}

def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """Normalize phone numbers to E.164 format. US default."""
    if not raw:
        return raw
    s = str(raw).strip()
    if not s:
        return s
    has_plus = s.startswith("+")
    digits = re.sub(r"\D", "", s)
    if not digits:
        return raw
    if has_plus:
        return "+" + digits
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    # Already includes country code (>11 digits) without +
    if len(digits) > 10:
        return "+" + digits
    return raw  # leave as-is for unusual formats

def format_phone_display(e164: Optional[str], country: str = "US") -> str:
    """Pretty-print E.164 phone for UI."""
    if not e164:
        return ""
    s = str(e164).strip()
    digits = re.sub(r"\D", "", s)
    if country == "US" and len(digits) == 11 and digits.startswith("1"):
        return f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return s

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None
    role: Role = "client"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class Category(BaseModel):
    category_id: str
    slug: str
    name_es: str
    name_en: str
    icon: str
    color: str

class ProviderProfileIn(BaseModel):
    business_name: str
    legal_name: Optional[str] = None
    category_id: str
    additional_categories: List[str] = []
    description: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    zip_code: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_home_based: bool = False
    languages: List[str] = ["es", "en"]
    services: List[str] = []
    service_areas: List[str] = []
    hours: dict = {}
    logo_url: Optional[str] = ""
    cover_url: Optional[str] = ""
    photos: List[str] = []
    gallery: List[dict] = []
    social: dict = {}
    price_range: Optional[str] = "quote"
    owner_identity: Optional[Literal["latino", "american"]] = None

class ProviderProfile(ProviderProfileIn):
    provider_id: str
    user_id: str
    slug: str
    verification_status: VerificationStatus = "pending"
    is_active: bool = True
    plan: str = "free"
    rating_avg: float = 0.0
    rating_count: int = 0
    views: int = 0
    contact_clicks: int = 0
    created_at: datetime
    updated_at: datetime

class ReviewIn(BaseModel):
    provider_id: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = ""
    paid_amount_range: Optional[Literal["<100", "100-300", "300-700", "700-1500", ">1500", "prefer_not_to_say"]] = None

class Review(BaseModel):
    review_id: str
    provider_id: str
    user_id: str
    user_name: str
    rating: int
    comment: str
    created_at: datetime

class ProviderRateIn(BaseModel):
    service_name: str = Field(min_length=2, max_length=120)
    price_type: Literal["por_hora", "por_proyecto", "por_visita", "por_pie_cuadrado", "precio_fijo", "a_consultar"]
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    unit_note: Optional[str] = ""

class ProviderRatesBulkIn(BaseModel):
    rates: list[ProviderRateIn] = Field(default_factory=list, max_length=10)

class QuoteRequestIn(BaseModel):
    provider_id: str
    description: str = Field(min_length=5, max_length=2000)
    category: Optional[str] = ""
    project_size: Literal["small", "medium", "large"]
    requested_date: Optional[str] = None
    budget_range: Optional[Literal["<100", "100-300", "300-700", "700-1500", ">1500", "unknown"]] = "unknown"
    client_name: Optional[str] = ""
    client_phone: Optional[str] = ""
    client_email: Optional[str] = ""
    preferred_contact: Literal["whatsapp", "call", "email"] = "whatsapp"

class QuoteResponseIn(BaseModel):
    response_text: str = Field(min_length=2, max_length=2000)
    quoted_price: Optional[float] = None
    price_type: Optional[Literal["por_hora", "por_proyecto", "a_consultar"]] = "a_consultar"
    price_shown_to_client: bool = True

class FavoriteIn(BaseModel):
    provider_id: str

class VerificationActionIn(BaseModel):
    status: VerificationStatus
    note: Optional[str] = ""

class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    picture: Optional[str] = None
    language: Optional[str] = None

class MessageIn(BaseModel):
    provider_id: str
    body: str
    subject: Optional[str] = ""

class MessageReplyIn(BaseModel):
    body: str

class PlanChangeIn(BaseModel):
    plan: Literal["free", "basic", "pro", "premium"]

class GalleryItemIn(BaseModel):
    url: str
    caption: Optional[str] = ""

class ServiceRequestIn(BaseModel):
    provider_id: str
    message: str = Field(min_length=3, max_length=2000)
    service_type: Optional[str] = ""
    contact_phone: Optional[str] = ""
    preferred_date: Optional[str] = ""

class ServiceRequestStatusIn(BaseModel):
    status: Literal["pending", "accepted", "declined", "completed"]

class CategoryIn(BaseModel):
    slug: str
    name_es: str
    name_en: str
    icon: str = "Sparkles"
    color: str = "#3B82F6"

class CityIn(BaseModel):
    name: str
    state: str
    featured: bool = False

class AdminProviderEditIn(BaseModel):
    business_name: Optional[str] = None
    legal_name: Optional[str] = None
    category_id: Optional[str] = None
    description: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    plan: Optional[str] = None
    verification_status: Optional[VerificationStatus] = None

class PromoCodeApplyIn(BaseModel):
    code: str

class AdIn(BaseModel):
    image_url: str = ""
    headline: str
    description: str = ""
    cta_text: str = "Saber más"
    cta_url: str = ""
    category_target: Optional[str] = None
    city_target: Optional[str] = None
    is_active: bool = True

class LatinoOwnedIn(BaseModel):
    latino_owned: Literal["yes", "serves", "prefer_not_say"]

class OwnerIdentityIn(BaseModel):
    owner_identity: Optional[Literal["latino", "american"]] = None

# ============ HELPERS ============
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_jwt(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    return text.strip('-')[:60]

async def get_current_user(request: Request) -> User:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth.split(" ", 1)[1]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Try JWT first
    user_id = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        # Try Emergent session token
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if session:
            expires_at = session.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at and expires_at < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Session expired")
            user_id = session["user_id"]

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    return User(**user_doc)

async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user

# ============ STARTUP: SEED DATA ============
DEFAULT_CATEGORIES = [
    {"slug": "cleaning", "name_es": "Limpieza", "name_en": "Cleaning", "icon": "Sparkles", "color": "#3B82F6"},
    {"slug": "catering", "name_es": "Catering Latino", "name_en": "Latin Catering", "icon": "UtensilsCrossed", "color": "#F97316"},
    {"slug": "construction", "name_es": "Construcción", "name_en": "Construction", "icon": "HardHat", "color": "#EAB308"},
    {"slug": "handyman", "name_es": "Mantenimiento", "name_en": "Handyman", "icon": "Wrench", "color": "#10B981"},
    {"slug": "auto", "name_es": "Automotriz", "name_en": "Automotive", "icon": "Car", "color": "#EF4444"},
    {"slug": "beauty", "name_es": "Belleza y Estética", "name_en": "Beauty", "icon": "Scissors", "color": "#EC4899"},
    {"slug": "moving", "name_es": "Mudanzas", "name_en": "Moving", "icon": "Truck", "color": "#8B5CF6"},
    {"slug": "legal", "name_es": "Servicios Legales", "name_en": "Legal Services", "icon": "Scale", "color": "#0EA5E9"},
    {"slug": "events", "name_es": "Eventos y Fiestas", "name_en": "Events & Parties", "icon": "PartyPopper", "color": "#F59E0B"},
    {"slug": "landscaping", "name_es": "Jardinería", "name_en": "Landscaping", "icon": "Trees", "color": "#22C55E"},
    {"slug": "tutoring", "name_es": "Tutoría / Educación", "name_en": "Tutoring", "icon": "GraduationCap", "color": "#6366F1"},
    {"slug": "health", "name_es": "Salud y Bienestar", "name_en": "Health & Wellness", "icon": "HeartPulse", "color": "#14B8A6"},
]

@app.on_event("startup")
async def seed():
    # init storage (non-fatal if unavailable)
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.warning(f"Storage init failed: {e}")

    # Indexes (idempotent)
    try:
        await db.provider_profiles.create_index("slug", unique=True)
        await db.provider_profiles.create_index("user_id", unique=True)
        await db.provider_profiles.create_index([("country", 1), ("category_id", 1), ("city", 1)])
        await db.provider_profiles.create_index([("country", 1), ("state", 1)])
        await db.users.create_index("email", unique=True)
        await db.users.create_index("country")
        await db.user_sessions.create_index("session_token", unique=True)
        await db.conversations.create_index([("client_id", 1), ("provider_id", 1)], unique=True)
        await db.reviews.create_index([("user_id", 1), ("provider_id", 1)], unique=True)
        await db.quote_requests.create_index([("provider_id", 1), ("created_at", -1)])
        await db.quote_requests.create_index([("country", 1), ("category_id", 1), ("city", 1)])
        await db.provider_rates.create_index([("category_id", 1), ("city", 1), ("country", 1)])
        await db.provider_rates.create_index([("provider_id", 1), ("is_active", 1)])
    except Exception as e:
        logger.warning(f"Index creation: {e}")

    # Migrations (idempotent): backfill country/currency on legacy docs
    try:
        await db.provider_profiles.update_many({"country": {"$exists": False}}, {"$set": {"country": DEFAULT_COUNTRY}})
        await db.users.update_many({"country": {"$exists": False}}, {"$set": {"country": DEFAULT_COUNTRY}})
        await db.quote_requests.update_many({"country": {"$exists": False}}, {"$set": {"country": DEFAULT_COUNTRY}})
        await db.provider_rates.update_many({"country": {"$exists": False}}, {"$set": {"country": DEFAULT_COUNTRY, "currency": DEFAULT_CURRENCY}})
        await db.quote_responses.update_many({"currency": {"$exists": False}}, {"$set": {"currency": DEFAULT_CURRENCY}})
        # Normalize phones on users + provider_profiles (idempotent)
        async for u in db.users.find({"phone": {"$nin": [None, ""]}}, {"_id": 0, "user_id": 1, "phone": 1}):
            norm = normalize_phone(u.get("phone"))
            if norm and norm != u.get("phone"):
                await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"phone": norm}})
        async for p in db.provider_profiles.find({"phone": {"$nin": [None, ""]}}, {"_id": 0, "provider_id": 1, "phone": 1}):
            norm = normalize_phone(p.get("phone"))
            if norm and norm != p.get("phone"):
                await db.provider_profiles.update_one({"provider_id": p["provider_id"]}, {"$set": {"phone": norm}})
        logger.info("Sec 11 migrations: country/currency/phone-normalize applied")
    except Exception as e:
        logger.warning(f"Sec 11 migration warn: {e}")

    # Migration: owner_identity (inclusive identity badge). Map legacy latino_owned="yes" → owner_identity="latino"
    try:
        await db.provider_profiles.update_many(
            {"owner_identity": {"$exists": False}, "latino_owned": "yes"},
            {"$set": {"owner_identity": "latino"}}
        )
        await db.provider_profiles.update_many(
            {"owner_identity": {"$exists": False}},
            {"$set": {"owner_identity": None}}
        )
        logger.info("owner_identity migration applied")
    except Exception as e:
        logger.warning(f"owner_identity migration warn: {e}")

    if await db.categories.count_documents({}) == 0:
        docs = []
        for c in DEFAULT_CATEGORIES:
            docs.append({"category_id": f"cat_{uuid.uuid4().hex[:10]}", **c})
        await db.categories.insert_many(docs)
        logger.info(f"Seeded {len(docs)} categories")

    # Seed an admin
    if not await db.users.find_one({"email": "admin@getamano.com"}):
        admin_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": admin_id, "email": "admin@getamano.com",
            "password_hash": hash_password("admin123"),
            "name": "getamano Admin", "role": "admin", "picture": None,
            "language": "es", "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info("Seeded admin user")

    # Seed founding members promo code (idempotent)
    if not await db.promo_codes.find_one({"code": "GETAMANO50"}):
        await db.promo_codes.insert_one({
            "code": "GETAMANO50",
            "plan_assigned": "pro",
            "max_uses": 50,
            "current_uses": 0,
            "expires_provider_plan_at": "2027-12-31T23:59:59+00:00",
            "founding_member": True,
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded GETAMANO50 promo code")

    # Demo provider — fully idempotent (ensures user + profile + showcase gallery)
    DEMO_EMAIL = "demo.provider@getamano.com"
    DEMO_SLUG = "maria-cleaning-services-sallisaw-ok"
    demo_user = await db.users.find_one({"email": DEMO_EMAIL})
    if not demo_user:
        prov_user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": prov_user_id, "email": DEMO_EMAIL,
            "password_hash": hash_password("provider123"),
            "name": "María González", "role": "provider", "picture": None,
            "language": "es", "created_at": datetime.now(timezone.utc).isoformat()
        })
    else:
        prov_user_id = demo_user["user_id"]

    cleaning_cat = await db.categories.find_one({"slug": "cleaning"}, {"_id": 0})
    now_iso = datetime.now(timezone.utc).isoformat()
    demo_gallery = [
        {"id": "g_seed1", "url": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800", "caption": "Limpieza profunda de cocina", "created_at": now_iso},
        {"id": "g_seed2", "url": "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=800", "caption": "Baño impecable", "created_at": now_iso},
        {"id": "g_seed3", "url": "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=800", "caption": "Post-construcción", "created_at": now_iso},
    ]
    demo_set = {
        "business_name": "María's Cleaning Services",
        "legal_name": "Maria Gonzalez LLC",
        "category_id": cleaning_cat["category_id"] if cleaning_cat else "",
        "additional_categories": [],
        "description": "Limpieza profesional residencial y comercial. Más de 8 años de experiencia sirviendo a familias latinas en Oklahoma.",
        "phone": "+1 (918) 555-0123",
        "email": "maria@example.com",
        "website": "",
        "address": "123 Main St",
        "city": "Sallisaw", "state": "OK", "zip_code": "74955",
        "latitude": 35.461, "longitude": -94.787,
        "is_home_based": False,
        "languages": ["es", "en"],
        "services": ["Limpieza profunda", "Limpieza regular", "Post-construcción", "Mudanzas"],
        "service_areas": ["Sallisaw, OK", "Muldrow, OK", "Fort Smith, AR"],
        "hours": {"mon": "8:00-18:00", "tue": "8:00-18:00", "wed": "8:00-18:00", "thu": "8:00-18:00", "fri": "8:00-18:00", "sat": "9:00-15:00", "sun": "Cerrado"},
        "logo_url": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=200",
        "cover_url": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200",
        "photos": [],
        "gallery": demo_gallery,
        "social": {"instagram": "maria_cleaning_ok", "facebook": "mariascleaning", "tiktok": "maria_clean", "youtube": ""},
        "price_range": "$$",
        "verification_status": "approved",
        "is_active": True, "plan": "pro",
        "rating_avg": 0.0, "rating_count": 0,
        "likes_count": 3,
        "latino_owned": "yes",
        "owner_identity": "latino",
        "user_id": prov_user_id,
        "slug": DEMO_SLUG,
        "updated_at": now_iso,
    }
    existing_profile = await db.provider_profiles.find_one({"slug": DEMO_SLUG})
    if not existing_profile:
        demo_set["provider_id"] = f"prov_{uuid.uuid4().hex[:12]}"
        demo_set["views"] = 0
        demo_set["contact_clicks"] = 0
        demo_set["created_at"] = now_iso
        await db.provider_profiles.insert_one(demo_set)
        logger.info("Seeded demo provider profile")
    else:
        # heal demo data on every startup so showcase is always presentable
        await db.provider_profiles.update_one({"slug": DEMO_SLUG}, {"$set": demo_set})
        logger.info("Demo provider profile refreshed")

# ============ AUTH ROUTES ============
@api_router.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "phone": normalize_phone(payload.phone),
        "role": payload.role if payload.role in ("client", "provider") else "client",
        "picture": None, "language": "es",
        "country": DEFAULT_COUNTRY,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_jwt(user_id)
    response.set_cookie("session_token", token, httponly=True, secure=True, samesite="none", path="/", max_age=7*24*3600)
    user_doc.pop("password_hash", None)
    user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    return {"user": User(**user_doc).model_dump(mode="json"), "token": token}

@api_router.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    user_doc = await db.users.find_one({"email": payload.email.lower()})
    if not user_doc or not user_doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(payload.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_jwt(user_doc["user_id"])
    response.set_cookie("session_token", token, httponly=True, secure=True, samesite="none", path="/", max_age=7*24*3600)
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    return {"user": User(**user_doc).model_dump(mode="json"), "token": token}

@api_router.post("/auth/google/session")
async def google_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    role = body.get("role", "client")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    async with httpx.AsyncClient(timeout=15) as client_http:
        r = await client_http.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data.get("email", "").lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email,
            "name": data.get("name", ""), "picture": data.get("picture"),
            "role": role if role in ("client", "provider") else "client",
            "language": "es",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    session_token = data.get("session_token")
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none", path="/", max_age=7*24*3600)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    return {"user": User(**user_doc).model_dump(mode="json")}

@api_router.get("/auth/me")
async def me(user: User = Depends(get_current_user)):
    return user.model_dump(mode="json")

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ============ CATEGORIES ============
@api_router.get("/categories")
async def list_categories():
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    return cats

# ============ PROVIDERS ============
@api_router.get("/providers")
async def search_providers(
    q: Optional[str] = None,
    category: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    verified: Optional[bool] = None,
    language: Optional[str] = None,
    latino_owned: Optional[bool] = None,
    owner_identity: Optional[Literal["latino", "american"]] = None,
    country: Optional[str] = DEFAULT_COUNTRY,
    limit: int = 24,
):
    query = {"is_active": True}
    if country:
        query["country"] = country
    if category:
        cat = await db.categories.find_one({"slug": category}, {"_id": 0})
        if cat:
            query["category_id"] = cat["category_id"]
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if state:
        query["state"] = {"$regex": f"^{state}$", "$options": "i"}
    if zip_code:
        query["zip_code"] = zip_code
    if verified:
        query["verification_status"] = "approved"
    if language:
        query["languages"] = language
    if latino_owned:
        query["latino_owned"] = "yes"
    if owner_identity:
        query["owner_identity"] = owner_identity
    if q:
        query["$or"] = [
            {"business_name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"services": {"$regex": q, "$options": "i"}},
        ]
    # Plan-based sort: premium > pro > basic > free, then by likes, then by rating
    PLAN_ORDER = {"premium": 0, "pro": 1, "basic": 2, "free": 3}
    providers = await db.provider_profiles.find(query, {"_id": 0}).limit(limit * 2).to_list(limit * 2)
    providers.sort(key=lambda p: (PLAN_ORDER.get(p.get("plan", "free"), 9), -p.get("likes_count", 0), -p.get("rating_avg", 0)))
    providers = providers[:limit]
    cats = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(100)}
    for p in providers:
        p["category"] = cats.get(p.get("category_id"))
    return providers

@api_router.get("/providers/identity-counts")
async def providers_identity_counts(
    q: Optional[str] = None,
    category: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    verified: Optional[bool] = None,
    language: Optional[str] = None,
    country: Optional[str] = DEFAULT_COUNTRY,
):
    """Counts of active providers by owner_identity respecting current search filters
    (excluding the owner_identity filter). Used by inclusive identity chips on /search."""
    query = {"is_active": True}
    if country:
        query["country"] = country
    if category:
        cat = await db.categories.find_one({"slug": category}, {"_id": 0})
        if cat:
            query["category_id"] = cat["category_id"]
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if state:
        query["state"] = {"$regex": f"^{state}$", "$options": "i"}
    if zip_code:
        query["zip_code"] = zip_code
    if verified:
        query["verification_status"] = "approved"
    if language:
        query["languages"] = language
    if q:
        query["$or"] = [
            {"business_name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"services": {"$regex": q, "$options": "i"}},
        ]
    total = await db.provider_profiles.count_documents(query)
    latino = await db.provider_profiles.count_documents({**query, "owner_identity": "latino"})
    american = await db.provider_profiles.count_documents({**query, "owner_identity": "american"})
    return {"all": total, "latino": latino, "american": american}

@api_router.get("/providers/featured")
async def featured_providers():
    providers = await db.provider_profiles.find(
        {"is_active": True, "verification_status": "approved"}, {"_id": 0}
    ).sort("rating_avg", -1).limit(6).to_list(6)
    cats = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(100)}
    for p in providers:
        p["category"] = cats.get(p.get("category_id"))
    return providers

@api_router.get("/providers/by-slug/{slug}")
async def get_provider_by_slug(slug: str):
    p = await db.provider_profiles.find_one({"slug": slug}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    cat = await db.categories.find_one({"category_id": p.get("category_id")}, {"_id": 0})
    p["category"] = cat
    # increment views
    await db.provider_profiles.update_one({"slug": slug}, {"$inc": {"views": 1}})
    # reviews
    reviews = await db.reviews.find({"provider_id": p["provider_id"]}, {"_id": 0, "paid_amount_range": 0}).sort("created_at", -1).limit(20).to_list(20)
    p["reviews"] = reviews
    return p

@api_router.get("/providers/me")
async def get_my_provider(user: User = Depends(get_current_user)):
    p = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not p:
        return None
    cat = await db.categories.find_one({"category_id": p.get("category_id")}, {"_id": 0})
    p["category"] = cat
    return p

@api_router.post("/providers")
async def create_provider(payload: ProviderProfileIn, user: User = Depends(get_current_user)):
    if user.role != "provider":
        # auto-upgrade to provider
        await db.users.update_one({"user_id": user.user_id}, {"$set": {"role": "provider"}})
    existing = await db.provider_profiles.find_one({"user_id": user.user_id})
    if existing:
        raise HTTPException(status_code=400, detail="Provider profile already exists")
    base_slug = slugify(f"{payload.business_name}-{payload.city or ''}-{payload.state or ''}")
    slug = base_slug
    i = 2
    while await db.provider_profiles.find_one({"slug": slug}):
        slug = f"{base_slug}-{i}"
        i += 1
    now = datetime.now(timezone.utc).isoformat()
    payload_data = payload.model_dump()
    if payload_data.get("phone"):
        payload_data["phone"] = normalize_phone(payload_data["phone"])
    doc = {
        "provider_id": f"prov_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id, "slug": slug,
        **payload_data,
        "country": DEFAULT_COUNTRY,
        "verification_status": "pending",
        "is_active": True, "plan": "free",
        "rating_avg": 0.0, "rating_count": 0,
        "views": 0, "contact_clicks": 0,
        "created_at": now, "updated_at": now,
    }
    await db.provider_profiles.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/providers/me")
async def update_my_provider(payload: ProviderProfileIn, user: User = Depends(get_current_user)):
    existing = await db.provider_profiles.find_one({"user_id": user.user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="No provider profile")
    update = payload.model_dump(exclude_unset=True)
    if "phone" in update and update["phone"]:
        update["phone"] = normalize_phone(update["phone"])
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.provider_profiles.update_one({"user_id": user.user_id}, {"$set": update})
    doc = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    return doc

@api_router.post("/providers/{provider_id}/contact-click")
async def track_contact_click(provider_id: str):
    await db.provider_profiles.update_one({"provider_id": provider_id}, {"$inc": {"contact_clicks": 1}})
    return {"ok": True}

# ============ REVIEWS ============
@api_router.post("/reviews")
async def create_review(payload: ReviewIn, user: User = Depends(get_current_user)):
    existing = await db.reviews.find_one({"provider_id": payload.provider_id, "user_id": user.user_id})
    if existing:
        raise HTTPException(status_code=400, detail="You already reviewed this provider")
    review = {
        "review_id": f"rev_{uuid.uuid4().hex[:10]}",
        "provider_id": payload.provider_id,
        "user_id": user.user_id, "user_name": user.name,
        "rating": payload.rating, "comment": payload.comment or "",
        "paid_amount_range": payload.paid_amount_range,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(review)
    # recompute aggregate
    all_revs = await db.reviews.find({"provider_id": payload.provider_id}, {"_id": 0, "rating": 1}).to_list(10000)
    if all_revs:
        avg = sum(r["rating"] for r in all_revs) / len(all_revs)
        await db.provider_profiles.update_one(
            {"provider_id": payload.provider_id},
            {"$set": {"rating_avg": round(avg, 2), "rating_count": len(all_revs)}}
        )
    review.pop("_id", None)
    return review

# ============ FAVORITES ============
@api_router.get("/favorites")
async def list_favorites(user: User = Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": user.user_id}, {"_id": 0}).to_list(200)
    provider_ids = [f["provider_id"] for f in favs]
    providers = await db.provider_profiles.find({"provider_id": {"$in": provider_ids}}, {"_id": 0}).to_list(200)
    return providers

@api_router.post("/favorites")
async def add_favorite(payload: FavoriteIn, user: User = Depends(get_current_user)):
    await db.favorites.update_one(
        {"user_id": user.user_id, "provider_id": payload.provider_id},
        {"$set": {"user_id": user.user_id, "provider_id": payload.provider_id, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"ok": True}

@api_router.delete("/favorites/{provider_id}")
async def remove_favorite(provider_id: str, user: User = Depends(get_current_user)):
    await db.favorites.delete_one({"user_id": user.user_id, "provider_id": provider_id})
    return {"ok": True}

# ============ ADMIN ============
@api_router.get("/admin/providers")
async def admin_list_providers(status: Optional[str] = None, _: User = Depends(require_admin)):
    query = {}
    if status:
        query["verification_status"] = status
    providers = await db.provider_profiles.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return providers

@api_router.post("/admin/providers/{provider_id}/verify")
async def admin_verify(provider_id: str, payload: VerificationActionIn, admin: User = Depends(require_admin)):
    result = await db.provider_profiles.update_one(
        {"provider_id": provider_id},
        {"$set": {"verification_status": payload.status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}",
        "admin_id": admin.user_id, "action": f"verify:{payload.status}",
        "target": provider_id, "note": payload.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # SMS notify provider on status change
    provider = await db.provider_profiles.find_one({"provider_id": provider_id}, {"_id": 0})
    if provider:
        prov_user = await db.users.find_one({"user_id": provider["user_id"]}, {"_id": 0})
        if prov_user and prov_user.get("phone"):
            label = {"approved": "¡Felicidades! Tu perfil fue verificado por getamano.",
                     "rejected": "Tu solicitud de verificación fue rechazada. Revisa los requisitos.",
                     "needs_info": "Necesitamos más información para verificar tu perfil.",
                     "suspended": "Tu perfil fue suspendido. Contacta soporte.",
                     "in_review": "Tu perfil está siendo revisado por nuestro equipo.",
                     "pending": "Tu perfil está pendiente de revisión."}.get(payload.status, f"Estado actualizado: {payload.status}")
            send_sms(prov_user["phone"], f"[getamano] {label}", event=f"verify_{payload.status}")

    return {"ok": True}

@api_router.get("/admin/stats")
async def admin_stats(_: User = Depends(require_admin)):
    total_providers = await db.provider_profiles.count_documents({})
    pending = await db.provider_profiles.count_documents({"verification_status": "pending"})
    approved = await db.provider_profiles.count_documents({"verification_status": "approved"})
    total_users = await db.users.count_documents({})
    total_clients = await db.users.count_documents({"role": "client"})
    total_reviews = await db.reviews.count_documents({})
    return {
        "total_providers": total_providers, "pending_providers": pending,
        "approved_providers": approved, "total_users": total_users,
        "total_clients": total_clients, "total_reviews": total_reviews,
    }

# ============ PLANS (UI only) ============
@api_router.get("/plans")
async def list_plans():
    return [
        {"id": "free", "name": "Gratis", "name_en": "Free", "price_monthly": 0,
         "badge": None, "highlight": False,
         "features_es": ["eCard básica con enlace único", "1 categoría de servicio", "Hasta 3 fotos", "Analytics básicos", "Formulario de contacto"],
         "features_en": ["Basic eCard with unique link", "1 service category", "Up to 3 photos", "Basic analytics", "Contact form"]},
        {"id": "basic", "name": "Básico", "name_en": "Basic", "price_monthly": 10,
         "badge": "Básico", "badge_color": "#94a3b8", "highlight": False,
         "features_es": ["Todo lo de Gratis +", "Hasta 3 categorías", "Hasta 10 fotos", "Analytics mejorados", "Responder reseñas", "1 boost mensual de visibilidad"],
         "features_en": ["Everything in Free +", "Up to 3 categories", "Up to 10 photos", "Enhanced analytics", "Respond to reviews", "1 visibility boost/month"]},
        {"id": "pro", "name": "Pro", "name_en": "Pro", "price_monthly": 15,
         "badge": "Pro", "badge_color": "#F97316", "highlight": True, "label": "Más popular",
         "features_es": ["Todo lo de Básico +", "Hasta 5 categorías", "Hasta 15 fotos + 1 video", "Mejor posición en búsquedas", "Notificaciones en tiempo real", "Botón WhatsApp directo", "3 boosts mensuales", "Soporte prioritario"],
         "features_en": ["Everything in Basic +", "Up to 5 categories", "Up to 15 photos + 1 video", "Better search ranking", "Real-time notifications", "Direct WhatsApp button", "3 visibility boosts/month", "Priority support"]},
        {"id": "premium", "name": "Premium", "name_en": "Premium", "price_monthly": 25,
         "badge": "Premium", "badge_color": "#D97706", "highlight": False, "label": "Mejor valor",
         "features_es": ["Todo lo de Pro +", "Categorías ilimitadas", "Fotos ilimitadas", "Posición TOP en búsquedas", "Aparece en homepage", "Campañas mensuales", "QR personalizado descargable", "eCard premium con branding", "Reportes avanzados", "5 boosts mensuales"],
         "features_en": ["Everything in Pro +", "Unlimited categories", "Unlimited photos", "TOP search position", "Featured on homepage", "Monthly campaigns", "Downloadable custom QR", "Premium eCard", "Advanced reports", "5 visibility boosts/month"]},
    ]

# ============ SERVICE REQUESTS ============
@api_router.post("/service-requests")
async def create_service_request(payload: ServiceRequestIn, user: User = Depends(get_current_user)):
    provider = await db.provider_profiles.find_one({"provider_id": payload.provider_id}, {"_id": 0})
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider["user_id"] == user.user_id:
        raise HTTPException(status_code=400, detail="Cannot request from yourself")
    now = datetime.now(timezone.utc).isoformat()
    req = {
        "request_id": f"req_{uuid.uuid4().hex[:12]}",
        "client_id": user.user_id,
        "client_name": user.name,
        "client_phone": payload.contact_phone or user.phone or "",
        "provider_id": payload.provider_id,
        "provider_user_id": provider["user_id"],
        "business_name": provider["business_name"],
        "slug": provider["slug"],
        "message": payload.message,
        "service_type": payload.service_type or "",
        "preferred_date": payload.preferred_date or "",
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    await db.service_requests.insert_one(req)
    await db.provider_profiles.update_one({"provider_id": payload.provider_id}, {"$inc": {"contact_clicks": 1}})

    # SMS notify provider
    prov_user = await db.users.find_one({"user_id": provider["user_id"]}, {"_id": 0})
    if prov_user and prov_user.get("phone"):
        send_sms(prov_user["phone"], f"[getamano] Nueva solicitud de cotización de {user.name}: {payload.message[:120]}", event="new_quote_request")

    req.pop("_id", None)
    return req

@api_router.get("/service-requests")
async def list_service_requests(user: User = Depends(get_current_user)):
    q = {"$or": [{"client_id": user.user_id}, {"provider_user_id": user.user_id}]}
    items = await db.service_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.put("/service-requests/{request_id}/status")
async def update_request_status(request_id: str, payload: ServiceRequestStatusIn, user: User = Depends(get_current_user)):
    req = await db.service_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["provider_user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Only the provider can change status")
    await db.service_requests.update_one({"request_id": request_id}, {"$set": {"status": payload.status, "updated_at": datetime.now(timezone.utc).isoformat()}})

    # SMS notify client
    client_user = await db.users.find_one({"user_id": req["client_id"]}, {"_id": 0})
    if client_user and client_user.get("phone"):
        label = {"accepted": "aceptó", "declined": "rechazó", "completed": "marcó como completada"}.get(payload.status, payload.status)
        send_sms(client_user["phone"], f"[getamano] {req['business_name']} {label} tu solicitud.", event=f"request_{payload.status}")
    return {"ok": True}

# ============ ADMIN: REVIEWS MODERATION ============
@api_router.get("/admin/reviews")
async def admin_list_reviews(flagged: Optional[bool] = None, _: User = Depends(require_admin)):
    q = {}
    if flagged is not None:
        q["is_flagged"] = flagged
    items = await db.reviews.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # enrich with provider business name
    pids = list({r["provider_id"] for r in items})
    provs = {p["provider_id"]: p for p in await db.provider_profiles.find({"provider_id": {"$in": pids}}, {"_id": 0, "provider_id": 1, "business_name": 1, "slug": 1}).to_list(500)}
    for r in items:
        r["provider"] = provs.get(r["provider_id"])
    return items

@api_router.post("/admin/reviews/{review_id}/flag")
async def admin_flag_review(review_id: str, admin: User = Depends(require_admin)):
    await db.reviews.update_one({"review_id": review_id}, {"$set": {"is_flagged": True}})
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
        "action": "review:flag", "target": review_id, "note": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

@api_router.delete("/admin/reviews/{review_id}")
async def admin_delete_review(review_id: str, admin: User = Depends(require_admin)):
    review = await db.reviews.find_one({"review_id": review_id}, {"_id": 0})
    if not review:
        raise HTTPException(status_code=404, detail="Not found")
    await db.reviews.delete_one({"review_id": review_id})
    # recompute aggregate
    pid = review["provider_id"]
    all_revs = await db.reviews.find({"provider_id": pid}, {"_id": 0, "rating": 1}).to_list(10000)
    avg = (sum(r["rating"] for r in all_revs) / len(all_revs)) if all_revs else 0.0
    await db.provider_profiles.update_one({"provider_id": pid}, {"$set": {"rating_avg": round(avg, 2), "rating_count": len(all_revs)}})
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
        "action": "review:delete", "target": review_id, "note": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

# ============ ADMIN: CATEGORIES CRUD ============
@api_router.post("/admin/categories")
async def admin_create_category(payload: CategoryIn, admin: User = Depends(require_admin)):
    if await db.categories.find_one({"slug": payload.slug}):
        raise HTTPException(status_code=400, detail="Slug already exists")
    doc = {"category_id": f"cat_{uuid.uuid4().hex[:10]}", **payload.model_dump()}
    await db.categories.insert_one(doc)
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
        "action": "category:create", "target": doc["category_id"], "note": payload.slug,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    doc.pop("_id", None)
    return doc

@api_router.put("/admin/categories/{category_id}")
async def admin_update_category(category_id: str, payload: CategoryIn, admin: User = Depends(require_admin)):
    result = await db.categories.update_one({"category_id": category_id}, {"$set": payload.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
        "action": "category:update", "target": category_id, "note": payload.slug,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

@api_router.delete("/admin/categories/{category_id}")
async def admin_delete_category(category_id: str, admin: User = Depends(require_admin)):
    used = await db.provider_profiles.count_documents({"category_id": category_id})
    if used > 0:
        raise HTTPException(status_code=400, detail=f"Used by {used} providers")
    await db.categories.delete_one({"category_id": category_id})
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
        "action": "category:delete", "target": category_id, "note": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

# ============ ADMIN: CITIES ============
@api_router.get("/admin/cities")
async def admin_list_cities(_: User = Depends(require_admin)):
    cities = await db.cities.find({}, {"_id": 0}).sort("featured", -1).to_list(500)
    return cities

@api_router.post("/admin/cities")
async def admin_create_city(payload: CityIn, admin: User = Depends(require_admin)):
    existing = await db.cities.find_one({"name": payload.name, "state": payload.state})
    if existing:
        raise HTTPException(status_code=400, detail="City already exists")
    doc = {"city_id": f"city_{uuid.uuid4().hex[:10]}", **payload.model_dump()}
    await db.cities.insert_one(doc)
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
        "action": "city:create", "target": doc["city_id"], "note": f"{payload.name}, {payload.state}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    doc.pop("_id", None)
    return doc

@api_router.delete("/admin/cities/{city_id}")
async def admin_delete_city(city_id: str, admin: User = Depends(require_admin)):
    await db.cities.delete_one({"city_id": city_id})
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
        "action": "city:delete", "target": city_id, "note": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

@api_router.get("/cities")
async def public_cities():
    return await db.cities.find({"featured": True}, {"_id": 0}).limit(50).to_list(50)

# ============ ADMIN: AUDIT LOG ============
@api_router.get("/admin/audit-log")
async def admin_audit_log(limit: int = 100, _: User = Depends(require_admin)):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    admin_ids = list({log["admin_id"] for log in logs})
    admins = {u["user_id"]: u for u in await db.users.find({"user_id": {"$in": admin_ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(100)}
    for log in logs:
        log["admin"] = admins.get(log["admin_id"])
    return logs

# ============ ADMIN: PROVIDER EDIT (override) ============
@api_router.patch("/admin/providers/{provider_id}")
async def admin_edit_provider(provider_id: str, payload: AdminProviderEditIn, admin: User = Depends(require_admin)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        return {"ok": True}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.provider_profiles.update_one({"provider_id": provider_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id,
        "action": "provider:edit", "target": provider_id, "note": ",".join(update.keys()),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

# ============ USER UPDATE ============
@api_router.put("/users/me")
async def update_user(payload: UserUpdateIn, user: User = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        return user.model_dump(mode="json")
    await db.users.update_one({"user_id": user.user_id}, {"$set": update})
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0})
    if isinstance(doc.get("created_at"), str):
        doc["created_at"] = datetime.fromisoformat(doc["created_at"])
    return User(**doc).model_dump(mode="json")

# ============ UPLOAD ============
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_SIZE = 8 * 1024 * 1024  # 8 MB

@api_router.post("/upload")
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only image files allowed (jpg/png/webp/gif)")
    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 8MB)")
    ext = (file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin").lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = content_type.split("/")[-1]
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{user.user_id}/{file_id}.{ext}"
    try:
        result = put_object(path, data, content_type)
    except Exception as e:
        logger.exception("Upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
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

@api_router.get("/files/{path:path}")
async def download(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data, ct = get_object(path)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Storage error: {e}")
    return Response(content=data, media_type=record.get("content_type") or ct)

# ============ GALLERY ============
@api_router.post("/providers/me/gallery")
async def add_gallery_item(payload: GalleryItemIn, user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    item = {
        "id": f"g_{uuid.uuid4().hex[:10]}",
        "url": payload.url,
        "caption": payload.caption or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.provider_profiles.update_one({"user_id": user.user_id}, {"$push": {"gallery": item}})
    return item

@api_router.delete("/providers/me/gallery/{item_id}")
async def remove_gallery_item(item_id: str, user: User = Depends(get_current_user)):
    await db.provider_profiles.update_one(
        {"user_id": user.user_id}, {"$pull": {"gallery": {"id": item_id}}}
    )
    return {"ok": True}

# ============ PLAN CHANGE (mock - no Stripe) ============
@api_router.post("/providers/me/plan")
async def change_plan(payload: PlanChangeIn, user: User = Depends(get_current_user)):
    result = await db.provider_profiles.update_one(
        {"user_id": user.user_id},
        {"$set": {"plan": payload.plan, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="No provider profile")
    return {"ok": True, "plan": payload.plan}

# ============ MESSAGING ============
@api_router.post("/messages")
async def send_message(payload: MessageIn, user: User = Depends(get_current_user)):
    provider = await db.provider_profiles.find_one({"provider_id": payload.provider_id}, {"_id": 0})
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider["user_id"] == user.user_id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    # find or create conversation (client_id, provider_id)
    conv_key = {"client_id": user.user_id, "provider_id": payload.provider_id}
    conv = await db.conversations.find_one(conv_key, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    if not conv:
        conv = {
            **conv_key,
            "conversation_id": f"conv_{uuid.uuid4().hex[:12]}",
            "provider_user_id": provider["user_id"],
            "client_name": user.name,
            "business_name": provider["business_name"],
            "logo_url": provider.get("logo_url", ""),
            "slug": provider["slug"],
            "subject": payload.subject or "Solicitud",
            "last_message": payload.body[:140],
            "last_at": now,
            "unread_for_provider": True,
            "unread_for_client": False,
            "created_at": now,
        }
        await db.conversations.insert_one(conv)
    else:
        await db.conversations.update_one(
            {"conversation_id": conv["conversation_id"]},
            {"$set": {"last_message": payload.body[:140], "last_at": now, "unread_for_provider": True}}
        )
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:10]}",
        "conversation_id": conv["conversation_id"],
        "sender_id": user.user_id,
        "sender_role": "client",
        "body": payload.body,
        "created_at": now,
    }
    await db.messages.insert_one(msg)

    # SMS notify provider
    prov_user = await db.users.find_one({"user_id": provider["user_id"]}, {"_id": 0})
    if prov_user and prov_user.get("phone"):
        send_sms(prov_user["phone"], f"[getamano] Nuevo mensaje de {user.name}: {payload.body[:120]}", event="new_message_to_provider")

    msg.pop("_id", None)
    return msg

@api_router.post("/messages/{conversation_id}/reply")
async def reply_message(conversation_id: str, payload: MessageReplyIn, user: User = Depends(get_current_user)):
    conv = await db.conversations.find_one({"conversation_id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    is_provider = conv["provider_user_id"] == user.user_id
    is_client = conv["client_id"] == user.user_id
    if not (is_provider or is_client):
        raise HTTPException(status_code=403, detail="Not your conversation")
    now = datetime.now(timezone.utc).isoformat()
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:10]}",
        "conversation_id": conversation_id,
        "sender_id": user.user_id,
        "sender_role": "provider" if is_provider else "client",
        "body": payload.body,
        "created_at": now,
    }
    await db.messages.insert_one(msg)
    update = {"last_message": payload.body[:140], "last_at": now}
    if is_provider:
        update["unread_for_client"] = True
        update["unread_for_provider"] = False
    else:
        update["unread_for_provider"] = True
        update["unread_for_client"] = False
    await db.conversations.update_one({"conversation_id": conversation_id}, {"$set": update})

    # SMS notify the other party
    other_user_id = conv["client_id"] if is_provider else conv["provider_user_id"]
    other_user = await db.users.find_one({"user_id": other_user_id}, {"_id": 0})
    if other_user and other_user.get("phone"):
        sender_label = conv["business_name"] if is_provider else user.name
        send_sms(other_user["phone"], f"[getamano] {sender_label}: {payload.body[:140]}", event="message_reply")

    msg.pop("_id", None)
    return msg

@api_router.get("/conversations")
async def list_conversations(user: User = Depends(get_current_user)):
    query = {"$or": [{"client_id": user.user_id}, {"provider_user_id": user.user_id}]}
    convs = await db.conversations.find(query, {"_id": 0}).sort("last_at", -1).to_list(200)
    # mark which side I am
    for c in convs:
        c["my_role"] = "provider" if c["provider_user_id"] == user.user_id else "client"
        c["unread"] = c["unread_for_provider"] if c["my_role"] == "provider" else c["unread_for_client"]
    return convs

@api_router.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: str, user: User = Depends(get_current_user)):
    conv = await db.conversations.find_one({"conversation_id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    is_provider = conv["provider_user_id"] == user.user_id
    is_client = conv["client_id"] == user.user_id
    if not (is_provider or is_client):
        raise HTTPException(status_code=403, detail="Not your conversation")
    # mark read for the side viewing
    update = {"unread_for_provider": False} if is_provider else {"unread_for_client": False}
    await db.conversations.update_one({"conversation_id": conversation_id}, {"$set": update})
    msgs = await db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"conversation": conv, "messages": msgs}

# ============ INCLUDE ROUTER ============
# ============ LIKES ============
@api_router.post("/providers/{provider_id}/like")
async def toggle_like(provider_id: str, user: User = Depends(get_current_user)):
    existing = await db.likes.find_one({"user_id": user.user_id, "provider_id": provider_id})
    if existing:
        await db.likes.delete_one({"user_id": user.user_id, "provider_id": provider_id})
        await db.provider_profiles.update_one({"provider_id": provider_id}, {"$inc": {"likes_count": -1}})
        return {"liked": False}
    await db.likes.insert_one({
        "user_id": user.user_id, "provider_id": provider_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.provider_profiles.update_one({"provider_id": provider_id}, {"$inc": {"likes_count": 1}})
    return {"liked": True}

@api_router.get("/providers/{provider_id}/like-status")
async def like_status(provider_id: str, user: User = Depends(get_current_user)):
    liked = bool(await db.likes.find_one({"user_id": user.user_id, "provider_id": provider_id}))
    return {"liked": liked}

# ============ FOUNDING MEMBERS / PROMO CODES ============
@api_router.post("/promo-codes/apply")
async def apply_promo_code(payload: PromoCodeApplyIn, user: User = Depends(get_current_user)):
    code_doc = await db.promo_codes.find_one({"code": payload.code.upper().strip(), "active": True}, {"_id": 0})
    if not code_doc:
        raise HTTPException(status_code=404, detail="Código inválido")
    if code_doc["current_uses"] >= code_doc["max_uses"]:
        raise HTTPException(status_code=400, detail="Código agotado (cupos llenos)")
    # check if user already used a founding code
    if code_doc.get("founding_member") and await db.users.find_one({"user_id": user.user_id, "founding_member": True}):
        raise HTTPException(status_code=400, detail="Ya tienes Founding Member")
    # increment usage
    result = await db.promo_codes.update_one(
        {"code": code_doc["code"], "current_uses": {"$lt": code_doc["max_uses"]}},
        {"$inc": {"current_uses": 1}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Código agotado")
    # mark user as founding member and assign plan if provider profile exists
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"founding_member": bool(code_doc.get("founding_member")), "founding_member_at": datetime.now(timezone.utc).isoformat()}})
    await db.provider_profiles.update_one({"user_id": user.user_id}, {"$set": {"plan": code_doc["plan_assigned"], "plan_expires_at": code_doc.get("expires_provider_plan_at"), "founding_member": bool(code_doc.get("founding_member"))}})
    return {"ok": True, "plan_assigned": code_doc["plan_assigned"], "founding_member": bool(code_doc.get("founding_member")), "expires_at": code_doc.get("expires_provider_plan_at")}

@api_router.get("/promo-codes/founding-status")
async def founding_status():
    code_doc = await db.promo_codes.find_one({"code": "GETAMANO50"}, {"_id": 0})
    if not code_doc:
        return {"available": False, "used": 0, "max": 50, "recent": []}
    # Last 3 founding members (newest first) — public-safe fields only
    recent_cursor = db.users.find(
        {"founding_member": True, "founding_member_at": {"$ne": None}},
        {"_id": 0, "full_name": 1, "founding_member_at": 1, "user_id": 1}
    ).sort("founding_member_at", -1).limit(3)
    recent = []
    async for u in recent_cursor:
        name = (u.get("full_name") or "").strip()
        # Get provider city if profile exists
        prof = await db.provider_profiles.find_one({"user_id": u.get("user_id")}, {"_id": 0, "city": 1, "state": 1, "business_name": 1})
        biz = (prof.get("business_name") if prof else "") or ""
        # Prefer first name; fall back to first word of business name
        display = name.split(" ")[0] if name else (biz.split(" ")[0] if biz else "Nuev@")
        initial = (display[:1] or "?").upper()
        recent.append({
            "first_name": display,
            "initial": initial,
            "city": prof.get("city") if prof else None,
            "state": prof.get("state") if prof else None,
            "business_name": biz or None,
            "at": u.get("founding_member_at"),
        })
    return {
        "available": code_doc["current_uses"] < code_doc["max_uses"],
        "used": code_doc["current_uses"],
        "max": code_doc["max_uses"],
        "recent": recent,
    }

# ============ LATINO OWNED ============
@api_router.put("/providers/me/latino-owned")
async def set_latino_owned(payload: LatinoOwnedIn, user: User = Depends(get_current_user)):
    result = await db.provider_profiles.update_one({"user_id": user.user_id}, {"$set": {"latino_owned": payload.latino_owned}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="No provider profile")
    return {"ok": True}

# ============ OWNER IDENTITY (inclusive, no country flags) ============
@api_router.put("/providers/me/owner-identity")
async def set_owner_identity(payload: OwnerIdentityIn, user: User = Depends(get_current_user)):
    """Set provider's owner identity ('latino' | 'american' | null=prefer not to say)."""
    result = await db.provider_profiles.update_one(
        {"user_id": user.user_id},
        {"$set": {"owner_identity": payload.owner_identity}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="No provider profile")
    return {"ok": True, "owner_identity": payload.owner_identity}

# ============ ADS ============
@api_router.get("/ads")
async def list_active_ads(category: Optional[str] = None, city: Optional[str] = None):
    q = {"is_active": True}
    items = await db.ads.find(q, {"_id": 0}).to_list(50)
    out = []
    for a in items:
        ct = a.get("category_target") or ""
        ci = a.get("city_target") or ""
        if ct and category and ct != category:
            continue
        if ci and city and ci.lower() != city.lower():
            continue
        out.append(a)
        # track impressions
        asyncio_loop_safe_update("ads", a["ad_id"], "impressions_count")
    return out

def asyncio_loop_safe_update(coll: str, key_id: str, field: str):
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(db[coll].update_one({"ad_id": key_id}, {"$inc": {field: 1}}))
    except Exception:
        pass

@api_router.post("/ads/{ad_id}/click")
async def track_ad_click(ad_id: str):
    await db.ads.update_one({"ad_id": ad_id}, {"$inc": {"clicks_count": 1}})
    return {"ok": True}

@api_router.get("/admin/ads")
async def admin_list_ads(_: User = Depends(require_admin)):
    return await db.ads.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.post("/admin/ads")
async def admin_create_ad(payload: AdIn, admin: User = Depends(require_admin)):
    doc = {
        "ad_id": f"ad_{uuid.uuid4().hex[:10]}",
        **payload.model_dump(),
        "impressions_count": 0, "clicks_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ads.insert_one(doc)
    await db.audit_logs.insert_one({"log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id, "action": "ad:create", "target": doc["ad_id"], "note": payload.headline, "created_at": datetime.now(timezone.utc).isoformat()})
    doc.pop("_id", None)
    return doc

@api_router.put("/admin/ads/{ad_id}")
async def admin_update_ad(ad_id: str, payload: AdIn, admin: User = Depends(require_admin)):
    await db.ads.update_one({"ad_id": ad_id}, {"$set": payload.model_dump()})
    await db.audit_logs.insert_one({"log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id, "action": "ad:update", "target": ad_id, "note": "", "created_at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True}

@api_router.delete("/admin/ads/{ad_id}")
async def admin_delete_ad(ad_id: str, admin: User = Depends(require_admin)):
    await db.ads.delete_one({"ad_id": ad_id})
    await db.audit_logs.insert_one({"log_id": f"log_{uuid.uuid4().hex[:10]}", "admin_id": admin.user_id, "action": "ad:delete", "target": ad_id, "note": "", "created_at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True}

# ============ MILESTONES (hitos celebratorios) ============
# Catalog of milestones. Each entry: id, title (ES), message (ES, can use {name}), emoji, icon, threshold checker
MILESTONE_DEFS = [
    {"id": "first_view",       "title": "¡Tu primera vista! 👀",         "message": "Alguien acaba de descubrirte, {name}. Esto recién empieza.",                "emoji": "👀", "tier": "silver"},
    {"id": "ten_views",        "title": "10 personas te han visto 🌱",   "message": "Tu eCard está echando raíces. Sigue regándola, {name}.",                    "emoji": "🌱", "tier": "silver"},
    {"id": "fifty_views",      "title": "50 vistas — vas con todo 🚀",    "message": "50 personas conocieron tu negocio. Eres oficialmente parte del movimiento.", "emoji": "🚀", "tier": "gold"},
    {"id": "hundred_views",    "title": "¡100 vistas! 💯",                "message": "100 personas pasaron por tu eCard, {name}. Esto es comunidad creciendo.",    "emoji": "💯", "tier": "gold"},
    {"id": "first_contact",    "title": "Primer contacto 📞",             "message": "Alguien quiso comunicarse contigo. Tu trabajo está hablando por ti.",         "emoji": "📞", "tier": "silver"},
    {"id": "ten_contacts",     "title": "10 personas te contactaron 🔥",  "message": "10 clientes potenciales tocaron tu puerta. Vas en serio, {name}.",           "emoji": "🔥", "tier": "gold"},
    {"id": "first_review",     "title": "¡Tu primera reseña! ⭐",          "message": "Un cliente se tomó el tiempo de calificarte. Eso vale oro.",                  "emoji": "⭐", "tier": "silver"},
    {"id": "first_5_star",     "title": "¡Reseña 5 estrellas! 🌟",         "message": "¡5 estrellas, {name}! Qué orgullo verte brillar.",                            "emoji": "🌟", "tier": "gold"},
    {"id": "five_reviews",     "title": "5 reseñas — eres referente 🏆",  "message": "5 clientes hablaron de ti. La confianza se está construyendo sólida.",         "emoji": "🏆", "tier": "gold"},
    {"id": "verified",         "title": "¡Verificado! ✅",                 "message": "Eres oficialmente un proveedor verificado en getamano. Bienvenid@ a la familia.", "emoji": "✅", "tier": "platinum"},
    {"id": "founding_member",  "title": "Founding Member 🎖️",              "message": "Eres parte de los primeros 50 que construyen getamano. Gracias por creer.",   "emoji": "🎖️", "tier": "platinum"},
    {"id": "first_message",    "title": "Primer mensaje recibido 💬",      "message": "Alguien te escribió. Cada conversación es una posibilidad.",                  "emoji": "💬", "tier": "silver"},
    {"id": "first_request",    "title": "¡Primera solicitud! 📨",          "message": "Tu primera cotización pedida. Respóndele con cariño — ya están considerándote.", "emoji": "📨", "tier": "silver"},
    {"id": "first_like",       "title": "Alguien te recomienda 👍",         "message": "Un cliente te recomendó. Tu reputación está creciendo, {name}.",               "emoji": "👍", "tier": "silver"},
    {"id": "ten_likes",        "title": "10 recomendaciones 💛",           "message": "10 personas recomiendan tu negocio. Eres parte de la red de confianza latina.",  "emoji": "💛", "tier": "gold"},
    {"id": "plan_pro",         "title": "¡Ahora eres Pro! 💼",             "message": "Plan Pro activado. Más visibilidad, más clientes, más comunidad.",            "emoji": "💼", "tier": "gold"},
    {"id": "plan_premium",     "title": "¡Plan Premium! 👑",              "message": "Eres top of mind en getamano, {name}. Estamos orgullos@s de acompañarte.",     "emoji": "👑", "tier": "platinum"},
    {"id": "one_month",        "title": "Un mes en getamano 🎂",            "message": "Un mes contigo, {name}. Gracias por confiar en este camino.",                "emoji": "🎂", "tier": "gold"},
    {"id": "latino_owned",     "title": "Negocio latino-owned 🤝",        "message": "Marcaste tu negocio como dueño latino. Tu identidad es tu fuerza.",            "emoji": "🤝", "tier": "silver"},
]

def _milestone_unlocked(mid: str, prof: dict, user_doc: dict, extras: dict) -> bool:
    v = prof.get("views", 0) or 0
    c = prof.get("contact_clicks", 0) or 0
    rcount = prof.get("rating_count", 0) or 0
    likes = prof.get("likes_count", 0) or 0
    plan = prof.get("plan", "free")
    verified = prof.get("verification_status") == "approved"
    created_at = prof.get("created_at")
    checks = {
        "first_view": v >= 1,
        "ten_views": v >= 10,
        "fifty_views": v >= 50,
        "hundred_views": v >= 100,
        "first_contact": c >= 1,
        "ten_contacts": c >= 10,
        "first_review": rcount >= 1,
        "first_5_star": extras.get("has_5_star", False),
        "five_reviews": rcount >= 5,
        "verified": verified,
        "founding_member": bool(user_doc.get("founding_member")),
        "first_message": extras.get("msg_count", 0) >= 1,
        "first_request": extras.get("req_count", 0) >= 1,
        "first_like": likes >= 1,
        "ten_likes": likes >= 10,
        "plan_pro": plan == "pro",
        "plan_premium": plan == "premium",
        "latino_owned": prof.get("latino_owned") == "yes",
    }
    if mid in checks:
        return checks[mid]
    if mid == "one_month":
        if not created_at:
            return False
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00")) if isinstance(created_at, str) else created_at
            return (datetime.now(timezone.utc) - dt).days >= 30
        except Exception:
            return False
    return False

@api_router.get("/providers/me/milestones")
async def my_milestones(user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        return {"unlocked": [], "celebrate": []}
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    # Gather extras
    has_5_star = await db.reviews.find_one({"provider_id": prof["provider_id"], "rating": 5}) is not None
    msg_count = await db.conversations.count_documents({"provider_id": prof["provider_id"]})
    req_count = await db.service_requests.count_documents({"provider_id": prof["provider_id"]})
    extras = {"has_5_star": has_5_star, "msg_count": msg_count, "req_count": req_count}
    # Existing records
    existing = {r["milestone_id"]: r async for r in db.provider_milestones.find({"user_id": user.user_id}, {"_id": 0})}
    new_unlocked = []
    for d in MILESTONE_DEFS:
        if _milestone_unlocked(d["id"], prof, user_doc or {}, extras) and d["id"] not in existing:
            rec = {
                "record_id": f"ms_{uuid.uuid4().hex[:10]}",
                "user_id": user.user_id,
                "provider_id": prof["provider_id"],
                "milestone_id": d["id"],
                "unlocked_at": datetime.now(timezone.utc).isoformat(),
                "seen_at": None,
                "dismissed_at": None,
            }
            await db.provider_milestones.insert_one(rec)
            rec.pop("_id", None)
            existing[d["id"]] = rec
            new_unlocked.append(d["id"])
    # Build response: all unlocked + which need to celebrate (no dismissed_at)
    defs_by_id = {d["id"]: d for d in MILESTONE_DEFS}
    unlocked = []
    celebrate = []
    for mid, rec in existing.items():
        if mid not in defs_by_id:
            continue
        d = defs_by_id[mid]
        item = {
            "milestone_id": mid,
            "title": d["title"],
            "message": d["message"].format(name=(user.name or "compañer@").split(" ")[0]),
            "emoji": d["emoji"],
            "tier": d["tier"],
            "unlocked_at": rec["unlocked_at"],
            "dismissed": bool(rec.get("dismissed_at")),
        }
        unlocked.append(item)
        if not rec.get("dismissed_at"):
            celebrate.append(item)
    unlocked.sort(key=lambda x: x["unlocked_at"], reverse=True)
    celebrate.sort(key=lambda x: x["unlocked_at"])
    return {"unlocked": unlocked, "celebrate": celebrate, "newly_unlocked": new_unlocked}

@api_router.post("/providers/me/milestones/{milestone_id}/dismiss")
async def dismiss_milestone(milestone_id: str, user: User = Depends(get_current_user)):
    res = await db.provider_milestones.update_one(
        {"user_id": user.user_id, "milestone_id": milestone_id},
        {"$set": {"dismissed_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return {"ok": True}

# Progress hint for locked milestones (current/target)
def _milestone_progress(mid: str, prof: dict, extras: dict) -> dict:
    v = prof.get("views", 0) or 0
    c = prof.get("contact_clicks", 0) or 0
    rcount = prof.get("rating_count", 0) or 0
    likes = prof.get("likes_count", 0) or 0
    msg = extras.get("msg_count", 0) or 0
    req = extras.get("req_count", 0) or 0
    targets = {
        "first_view": (v, 1), "ten_views": (v, 10), "fifty_views": (v, 50), "hundred_views": (v, 100),
        "first_contact": (c, 1), "ten_contacts": (c, 10),
        "first_review": (rcount, 1), "five_reviews": (rcount, 5),
        "first_like": (likes, 1), "ten_likes": (likes, 10),
        "first_message": (msg, 1), "first_request": (req, 1),
    }
    if mid in targets:
        cur, tgt = targets[mid]
        return {"current": min(cur, tgt), "target": tgt, "pct": min(100, round((cur / tgt) * 100)) if tgt else 0}
    return {"current": 0, "target": 1, "pct": 0}

@api_router.get("/providers/me/journal")
async def my_journal(user: User = Depends(get_current_user)):
    """Achievement journal — full timeline of milestones unlocked + locked milestones with progress."""
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        return {"journey_start": None, "entries": [], "locked": [], "stats": {}}
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    name = (user.name or "compañer@").split(" ")[0]
    # Ensure milestones are computed/saved
    has_5_star = await db.reviews.find_one({"provider_id": prof["provider_id"], "rating": 5}) is not None
    msg_count = await db.conversations.count_documents({"provider_id": prof["provider_id"]})
    req_count = await db.service_requests.count_documents({"provider_id": prof["provider_id"]})
    extras = {"has_5_star": has_5_star, "msg_count": msg_count, "req_count": req_count}
    existing = {r["milestone_id"]: r async for r in db.provider_milestones.find({"user_id": user.user_id}, {"_id": 0})}
    for d in MILESTONE_DEFS:
        if _milestone_unlocked(d["id"], prof, user_doc or {}, extras) and d["id"] not in existing:
            rec = {
                "record_id": f"ms_{uuid.uuid4().hex[:10]}",
                "user_id": user.user_id,
                "provider_id": prof["provider_id"],
                "milestone_id": d["id"],
                "unlocked_at": datetime.now(timezone.utc).isoformat(),
                "seen_at": None,
                "dismissed_at": None,
            }
            await db.provider_milestones.insert_one(rec)
            rec.pop("_id", None)
            existing[d["id"]] = rec
    defs_by_id = {d["id"]: d for d in MILESTONE_DEFS}
    entries = []
    for mid, rec in existing.items():
        if mid not in defs_by_id:
            continue
        d = defs_by_id[mid]
        entries.append({
            "milestone_id": mid,
            "title": d["title"],
            "message": d["message"].format(name=name),
            "emoji": d["emoji"],
            "tier": d["tier"],
            "unlocked_at": rec["unlocked_at"],
        })
    entries.sort(key=lambda x: x["unlocked_at"], reverse=True)
    # Locked = not unlocked yet, with progress hint
    locked = []
    for d in MILESTONE_DEFS:
        if d["id"] in existing:
            continue
        prog = _milestone_progress(d["id"], prof, extras)
        locked.append({
            "milestone_id": d["id"],
            "title": d["title"],
            "message": d["message"].format(name=name),
            "emoji": d["emoji"],
            "tier": d["tier"],
            "progress": prog,
        })
    # Sort locked by closest to unlock first
    locked.sort(key=lambda x: -x["progress"]["pct"])
    return {
        "journey_start": prof.get("created_at"),
        "business_name": prof.get("business_name"),
        "entries": entries,
        "locked": locked,
        "stats": {
            "total_unlocked": len(entries),
            "total_possible": len(MILESTONE_DEFS),
            "views": prof.get("views", 0),
            "contacts": prof.get("contact_clicks", 0),
            "reviews": prof.get("rating_count", 0),
            "rating": prof.get("rating_avg", 0),
            "likes": prof.get("likes_count", 0),
        },
    }

@api_router.get("/admin/ceo-metrics")
async def ceo_metrics(admin: User = Depends(require_admin)):
    """Executive dashboard: live activity, growth, revenue projections, top performers."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    yesterday_start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=7)).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # === Volume ===
    total_users = await db.users.count_documents({})
    total_providers = await db.provider_profiles.count_documents({"is_active": True})
    approved = await db.provider_profiles.count_documents({"verification_status": "approved", "is_active": True})
    pending = await db.provider_profiles.count_documents({"verification_status": "pending"})
    total_clients = total_users - await db.provider_profiles.count_documents({})
    if total_clients < 0:
        total_clients = 0

    # === Acquisition (signups by period) ===
    signups_today = await db.users.count_documents({"created_at": {"$gte": today_start}})
    signups_yesterday = await db.users.count_documents({"created_at": {"$gte": yesterday_start, "$lt": today_start}})
    signups_week = await db.users.count_documents({"created_at": {"$gte": week_start}})
    signups_month = await db.users.count_documents({"created_at": {"$gte": month_start}})
    providers_today = await db.provider_profiles.count_documents({"created_at": {"$gte": today_start}})
    providers_week = await db.provider_profiles.count_documents({"created_at": {"$gte": week_start}})
    providers_month = await db.provider_profiles.count_documents({"created_at": {"$gte": month_start}})

    # === Engagement ===
    msgs_today = await db.messages.count_documents({"created_at": {"$gte": today_start}}) if "messages" in await db.list_collection_names() else 0
    requests_today = await db.service_requests.count_documents({"created_at": {"$gte": today_start}})
    reviews_today = await db.reviews.count_documents({"created_at": {"$gte": today_start}})
    milestones_today = await db.provider_milestones.count_documents({"unlocked_at": {"$gte": today_start}})
    milestones_week = await db.provider_milestones.count_documents({"unlocked_at": {"$gte": week_start}})
    total_milestones = await db.provider_milestones.count_documents({})
    likes_today = await db.likes.count_documents({"created_at": {"$gte": today_start}}) if "likes" in await db.list_collection_names() else 0

    # === Plan distribution ===
    plan_pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
    ]
    plan_rows = await db.provider_profiles.aggregate(plan_pipeline).to_list(20)
    plans_dist = {r["_id"] or "free": r["count"] for r in plan_rows}

    # === Revenue projection (MRR + ARR) ===
    PLAN_PRICES = {"free": 0, "basic": 19, "pro": 49, "premium": 99}
    mrr = sum(PLAN_PRICES.get(plan, 0) * count for plan, count in plans_dist.items())
    arr = mrr * 12
    # Founding members get pro free until 2027, so we don't count their MRR (but show count)
    founding_count = await db.users.count_documents({"founding_member": True})

    # === Geographic distribution ===
    state_pipeline = [
        {"$match": {"is_active": True, "state": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$state", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    state_rows = await db.provider_profiles.aggregate(state_pipeline).to_list(10)
    top_states = [{"state": r["_id"], "count": r["count"]} for r in state_rows]

    # === Categories distribution ===
    cat_pipeline = [
        {"$match": {"is_active": True, "category_id": {"$ne": None}}},
        {"$group": {"_id": "$category_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 8},
    ]
    cat_rows = await db.provider_profiles.aggregate(cat_pipeline).to_list(8)
    cats_meta = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(100)}
    top_categories = [{
        "category_id": r["_id"],
        "name": cats_meta.get(r["_id"], {}).get("name_es", r["_id"]),
        "count": r["count"]
    } for r in cat_rows]

    # === Top performers (by views) ===
    top_pipeline = [
        {"$match": {"is_active": True, "verification_status": "approved"}},
        {"$sort": {"views": -1}},
        {"$limit": 5},
        {"$project": {"_id": 0, "slug": 1, "business_name": 1, "views": 1, "contact_clicks": 1, "rating_avg": 1, "rating_count": 1, "city": 1, "state": 1, "logo_url": 1, "likes_count": 1, "plan": 1}},
    ]
    top_performers = await db.provider_profiles.aggregate(top_pipeline).to_list(5)

    # === Recent activity feed (mixed) ===
    activity = []
    # Recent users
    async for u in db.users.find({}, {"_id": 0, "name": 1, "created_at": 1, "role": 1}).sort("created_at", -1).limit(5):
        activity.append({"type": "signup", "at": u.get("created_at"), "title": f"{(u.get('name') or 'Nuevo usuario').split(' ')[0]} se registró", "role": u.get("role")})
    # Recent milestones
    async for m in db.provider_milestones.find({}, {"_id": 0}).sort("unlocked_at", -1).limit(5):
        defs_by_id = {d["id"]: d for d in MILESTONE_DEFS}
        d = defs_by_id.get(m["milestone_id"])
        if not d:
            continue
        prof = await db.provider_profiles.find_one({"user_id": m["user_id"]}, {"_id": 0, "business_name": 1})
        if not prof or (prof.get("business_name") or "").startswith("TEST_"):
            continue
        activity.append({"type": "milestone", "at": m["unlocked_at"], "title": f"{prof.get('business_name', 'Alguien')} desbloqueó {d['title']}", "tier": d["tier"]})
    activity.sort(key=lambda x: x.get("at") or "", reverse=True)
    activity = activity[:10]

    # === Founding cupos ===
    founding = await db.promo_codes.find_one({"code": "GETAMANO50"}, {"_id": 0}) or {}

    return {
        "generated_at": now.isoformat(),
        "volume": {
            "total_users": total_users,
            "total_clients": total_clients,
            "total_providers": total_providers,
            "approved_providers": approved,
            "pending_providers": pending,
        },
        "acquisition": {
            "signups": {"today": signups_today, "yesterday": signups_yesterday, "week": signups_week, "month": signups_month},
            "new_providers": {"today": providers_today, "week": providers_week, "month": providers_month},
        },
        "engagement": {
            "messages_today": msgs_today,
            "requests_today": requests_today,
            "reviews_today": reviews_today,
            "likes_today": likes_today,
            "milestones_today": milestones_today,
            "milestones_week": milestones_week,
            "total_milestones_unlocked": total_milestones,
        },
        "revenue": {
            "mrr_usd": mrr,
            "arr_usd": arr,
            "by_plan": plans_dist,
            "founding_members_count": founding_count,
            "founding_used": founding.get("current_uses", 0),
            "founding_max": founding.get("max_uses", 50),
            "plan_prices": PLAN_PRICES,
        },
        "geography": {"top_states": top_states},
        "categories": {"top": top_categories},
        "top_performers": top_performers,
        "activity": activity,
    }

@api_router.get("/admin/daily-brief")
async def daily_brief(admin: User = Depends(require_admin), language: str = "es", regenerate: bool = False):
    """AI-generated executive daily brief — warm CEO morning summary in natural language."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cache_id = f"brief_{today_key}_{language}"
    if not regenerate:
        cached = await db.daily_briefs.find_one({"brief_id": cache_id}, {"_id": 0})
        if cached:
            return cached

    # Gather metrics by reusing logic from ceo_metrics (compact)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    yesterday_start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=7)).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    three_days_ago = (now - timedelta(days=3)).isoformat()

    signups_today = await db.users.count_documents({"created_at": {"$gte": today_start}})
    signups_yesterday = await db.users.count_documents({"created_at": {"$gte": yesterday_start, "$lt": today_start}})
    signups_week = await db.users.count_documents({"created_at": {"$gte": week_start}})
    providers_today = await db.provider_profiles.count_documents({"created_at": {"$gte": today_start}})
    total_providers = await db.provider_profiles.count_documents({"is_active": True})
    pending = await db.provider_profiles.count_documents({"verification_status": "pending"})
    pending_stale = await db.provider_profiles.count_documents({"verification_status": "pending", "created_at": {"$lt": three_days_ago}})
    milestones_today = await db.provider_milestones.count_documents({"unlocked_at": {"$gte": today_start}})
    milestones_yesterday = await db.provider_milestones.count_documents({"unlocked_at": {"$gte": yesterday_start, "$lt": today_start}})
    requests_today = await db.service_requests.count_documents({"created_at": {"$gte": today_start}})

    # === Conversion funnel data (CRITICAL for traction) ===
    # Total client-to-provider ratio
    total_clients = await db.users.count_documents({"role": "client"})
    # Providers with zero views
    zero_view_providers = await db.provider_profiles.count_documents({"is_active": True, "verification_status": "approved", "$or": [{"views": 0}, {"views": {"$exists": False}}]})
    # Providers with views but no contacts
    no_contact_providers = await db.provider_profiles.count_documents({"is_active": True, "verification_status": "approved", "views": {"$gt": 5}, "$or": [{"contact_clicks": 0}, {"contact_clicks": {"$exists": False}}]})
    # Providers with no eCard photos (gallery empty)
    incomplete_providers = await db.provider_profiles.count_documents({"is_active": True, "$or": [{"gallery": {"$exists": False}}, {"gallery": {"$size": 0}}]})
    # State imbalance: providers vs clients per state
    state_providers = {}
    async for row in db.provider_profiles.aggregate([
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$state", "count": {"$sum": 1}}},
    ]):
        state_providers[row["_id"]] = row["count"]
    # Top state with imbalance (lots of providers, few clients — hypothetical)
    top_state = max(state_providers, key=state_providers.get) if state_providers else None
    top_state_providers = state_providers.get(top_state, 0) if top_state else 0

    # Revenue
    PLAN_PRICES = {"free": 0, "basic": 19, "pro": 49, "premium": 99}
    plan_rows = await db.provider_profiles.aggregate([
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
    ]).to_list(20)
    plans = {r["_id"] or "free": r["count"] for r in plan_rows}
    free_count = plans.get("free", 0)
    mrr = sum(PLAN_PRICES.get(p, 0) * c for p, c in plans.items())

    # Top stale pending (oldest pending approval, top 5)
    stale_pending = []
    async for p in db.provider_profiles.find(
        {"verification_status": "pending", "created_at": {"$lt": three_days_ago}},
        {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "state": 1, "created_at": 1, "category_id": 1}
    ).sort("created_at", 1).limit(5):
        stale_pending.append(p)

    # Inactive providers (no views in 14 days) — proxy: zero views & old
    fourteen_ago = (now - timedelta(days=14)).isoformat()
    inactive_top = []
    async for p in db.provider_profiles.find(
        {"is_active": True, "verification_status": "approved", "$or": [{"views": 0}, {"views": {"$exists": False}}], "created_at": {"$lt": fourteen_ago}},
        {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "state": 1, "category_id": 1}
    ).limit(5):
        inactive_top.append(p)

    # Leader of the month
    leader_rows = await db.provider_milestones.aggregate([
        {"$match": {"unlocked_at": {"$gte": month_start}}},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 3},
    ]).to_list(3)
    leader = None
    if leader_rows:
        lp = await db.provider_profiles.find_one({"user_id": leader_rows[0]["_id"]}, {"_id": 0, "business_name": 1, "city": 1, "state": 1})
        if lp and not (lp.get("business_name") or "").startswith("TEST_"):
            leader = {"name": lp.get("business_name"), "city": lp.get("city"), "count": leader_rows[0]["count"]}

    # Founding
    founding = await db.promo_codes.find_one({"code": "GETAMANO50"}, {"_id": 0}) or {}
    founding_remaining = founding.get("max_uses", 50) - founding.get("current_uses", 0)

    # Build compact data for LLM
    signup_delta = "—"
    if signups_yesterday > 0:
        d = signups_today - signups_yesterday
        pct = int(abs(d) / max(signups_yesterday, 1) * 100)
        signup_delta = f"{'+' if d >= 0 else '-'}{pct}% vs ayer"

    metrics = {
        "fecha": now.strftime("%d de %B de %Y"),
        "signups_hoy": signups_today,
        "signup_delta": signup_delta,
        "signups_semana": signups_week,
        "proveedores_nuevos_hoy": providers_today,
        "proveedores_activos": total_providers,
        "clientes_totales": total_clients,
        "ratio_provider_to_client": round(total_providers / max(total_clients, 1), 2),
        "pendientes_aprobacion": pending,
        "pendientes_atrasados_3dias_o_mas": pending_stale,
        "proveedores_zero_views": zero_view_providers,
        "proveedores_views_pero_sin_contactos": no_contact_providers,
        "proveedores_sin_galeria": incomplete_providers,
        "estado_con_mas_proveedores": top_state,
        "proveedores_en_estado_top": top_state_providers,
        "hitos_desbloqueados_hoy": milestones_today,
        "hitos_ayer": milestones_yesterday,
        "solicitudes_hoy": requests_today,
        "mrr_usd": mrr,
        "free_count": free_count,
        "founding_restantes": founding_remaining,
        "lider_del_mes": leader,
    }

    # === Generate narrative (Brief) ===
    system_msg_brief = (
        "Eres el compañero de café matutino de Verónica, CEO de getamano (marketplace que conecta a la comunidad latina en USA con proveedores latinos verificados). "
        "Entrégale un brief CÁLIDO, BREVE y HUMANO en español, tono de confidente. "
        "Habla en SEGUNDA PERSONA. Máximo 4-5 oraciones. Incluye un dato concreto y una emoción. "
        "Celebra logros con honestidad, sé esperanzador con caídas. TERMINA con una frase de ánimo no cliché. "
        "NO uses listas ni markdown."
    )
    narrative = ""
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"{cache_id}_brief",
            system_message=system_msg_brief,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        narrative = (await chat.send_message(UserMessage(text=f"Métricas de hoy: {metrics}"))).strip()
    except Exception:
        logger.exception("Daily brief narrative failed")
        narrative = f"Buen día, Verónica. Hoy tenemos {signups_today} nuevos usuarios y {milestones_today} hitos celebrados. MRR ${mrr}/mes. Sigamos construyendo. 🧡"

    # === Generate strategic recommendations (NEW: actionable for traction) ===
    system_msg_recs = (
        "Eres consultor estratégico de getamano (marketplace latino en USA, fase early-stage). "
        "Tu prioridad #1 es TRACCIÓN DE CLIENTES y CONVERSIÓN. "
        "Analiza las métricas y propone 3-4 acciones CONCRETAS, PRIORIZADAS y EJECUTABLES esta semana. "
        "Cada acción debe tener:\n"
        "  - title (corto, en español, accionable, empezando con verbo)\n"
        "  - why (1 oración con el dato/evidencia de las métricas)\n"
        "  - action (1-2 oraciones con el paso CONCRETO a hacer hoy/esta semana)\n"
        "  - priority (high/medium/low) — solo 1 high máximo\n"
        "  - icon (uno de: 'users','target','dollar','growth','support','marketing','retention','urgent')\n"
        "  - impact_estimate (corto, ej: '+15% conversión', '+$500 MRR', '5 ventas/semana')\n"
        "Enfócate en: captación de clientes, activación de proveedores dormidos, upgrade de free→pro, retención, geographic expansion, viralización. "
        "Sé específico: nombra ciudades, números, nombres de proveedores reales si los tienes. "
        "Responde SOLO con JSON válido en este formato: "
        '{"recommendations": [{"title":"...", "why":"...", "action":"...", "priority":"high|medium|low", "icon":"...", "impact_estimate":"..."}]}'
    )
    recommendations = []
    try:
        chat_recs = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"{cache_id}_recs",
            system_message=system_msg_recs,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat_recs.send_message(UserMessage(text=(
            f"Métricas operativas de getamano:\n{metrics}\n\n"
            f"Proveedores aprobados pero sin actividad reciente (top 5):\n{inactive_top}\n\n"
            f"Pendientes de verificación con más de 3 días (top 5):\n{stale_pending}\n\n"
            "Devuelve SOLO el JSON con recomendaciones de tracción para esta semana."
        )))
        # Extract JSON
        import json as _json
        clean = (raw or "").strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", clean, flags=re.MULTILINE).strip()
        parsed = _json.loads(clean)
        recommendations = parsed.get("recommendations", [])[:5]
    except Exception:
        logger.exception("Daily brief recommendations failed")
        # Heuristic fallback
        recommendations = []
        if pending_stale > 0:
            recommendations.append({
                "title": f"Aprobar {pending_stale} proveedores atrasados",
                "why": f"{pending_stale} proveedores llevan más de 3 días esperando verificación. Cada día perdido es un cliente que no llegó.",
                "action": "Entra a 'Cola de verificación' y procesa los pendientes más antiguos hoy mismo.",
                "priority": "high",
                "icon": "urgent",
                "impact_estimate": f"+{pending_stale * 5} clientes potenciales/mes",
            })
        if zero_view_providers > 0:
            recommendations.append({
                "title": f"Activar {zero_view_providers} proveedores con 0 vistas",
                "why": f"{zero_view_providers} negocios aprobados nunca recibieron una visita. Sin tráfico no hay conversión.",
                "action": "Envía un email/WhatsApp masivo invitándolos a compartir su eCard. Dales el QR descargable y el copy listo.",
                "priority": "high",
                "icon": "growth",
                "impact_estimate": "+30% activación",
            })
        if free_count > 5:
            recommendations.append({
                "title": f"Upgrade campaign: {free_count} en Free",
                "why": f"Tienes {free_count} proveedores en Free. Con conversión 10% al plan Pro ganarías ~${free_count * 0.1 * 49:.0f}/mes.",
                "action": "Lanza una campaña con beneficios Pro vs Free + descuento founding mientras queden cupos.",
                "priority": "medium",
                "icon": "dollar",
                "impact_estimate": f"+${int(free_count * 0.1 * 49)}/mes",
            })

    # Build structured highlights
    highlights = []
    if signups_today > 0:
        highlights.append({"icon": "users", "label": f"{signups_today} nuevos usuarios", "delta": signup_delta if signups_yesterday > 0 else None})
    if milestones_today > 0:
        highlights.append({"icon": "trophy", "label": f"{milestones_today} hitos desbloqueados", "delta": f"{milestones_today - milestones_yesterday:+d} vs ayer" if milestones_yesterday > 0 else None})
    if pending > 0:
        highlights.append({"icon": "shield", "label": f"{pending} proveedores esperando aprobación", "urgent": pending_stale > 0, "sub": f"{pending_stale} atrasados >3 días" if pending_stale > 0 else None})
    if leader:
        highlights.append({"icon": "crown", "label": f"Líder del mes: {leader['name']}", "sub": f"{leader['count']} logros · {leader.get('city') or ''}"})
    highlights.append({"icon": "dollar", "label": f"MRR ${mrr}/mes · ARR ${mrr*12}", "sub": f"{founding.get('current_uses', 0)}/{founding.get('max_uses', 50)} founding"})

    result = {
        "brief_id": cache_id,
        "date": now.strftime("%A, %d de %B de %Y").lower(),
        "date_iso": today_key,
        "generated_at": now.isoformat(),
        "narrative": narrative,
        "highlights": highlights,
        "recommendations": recommendations,
        "raw_metrics": metrics,
    }
    # Cache for the day
    await db.daily_briefs.update_one({"brief_id": cache_id}, {"$set": result}, upsert=True)
    result.pop("_id", None)
    return result

@api_router.get("/community/leaderboard")
async def leaderboard(period: str = "month", limit: int = 5):
    """Top providers by milestones unlocked in a period (month/all)."""
    limit = max(1, min(limit, 20))
    now = datetime.now(timezone.utc)
    match: dict = {}
    period_label = "all"
    if period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        match["unlocked_at"] = {"$gte": start}
        period_label = "month"
    elif period == "week":
        start = (now - timedelta(days=7)).isoformat()
        match["unlocked_at"] = {"$gte": start}
        period_label = "week"
    pipeline = [
        {"$match": match} if match else {"$match": {}},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}, "last_at": {"$max": "$unlocked_at"}}},
        {"$sort": {"count": -1, "last_at": -1}},
        {"$limit": limit * 4},  # over-fetch for filter out TEST/inactive
    ]
    rows = await db.provider_milestones.aggregate(pipeline).to_list(limit * 4)
    items = []
    rank = 0
    for row in rows:
        uid = row["_id"]
        user = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1}) or {}
        prof = await db.provider_profiles.find_one({"user_id": uid}, {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "state": 1, "logo_url": 1, "latino_owned": 1, "is_active": 1, "verification_status": 1}) or {}
        biz = prof.get("business_name") or ""
        if biz.startswith("TEST_") or not prof.get("is_active", True):
            continue
        name = (user.get("name") or "").strip()
        first = name.split(" ")[0] if name else (biz.split(" ")[0] if biz else "Negocio")
        rank += 1
        items.append({
            "rank": rank,
            "first_name": first,
            "business_name": biz or None,
            "city": prof.get("city"),
            "state": prof.get("state"),
            "slug": prof.get("slug"),
            "logo_url": prof.get("logo_url"),
            "latino_owned": prof.get("latino_owned") == "yes",
            "milestones_count": row["count"],
            "last_at": row.get("last_at"),
        })
        if rank >= limit:
            break
    return {"period": period_label, "items": items}

@api_router.get("/community/wall-of-fame")
async def wall_of_fame(limit: int = 50):
    """Public anonymized feed of recent milestone unlocks across providers."""
    limit = max(1, min(limit, 100))
    defs_by_id = {d["id"]: d for d in MILESTONE_DEFS}
    cursor = db.provider_milestones.find({}, {"_id": 0}).sort("unlocked_at", -1).limit(limit)
    items = []
    user_cache = {}
    prof_cache = {}
    async for rec in cursor:
        mid = rec.get("milestone_id")
        d = defs_by_id.get(mid)
        if not d:
            continue
        uid = rec.get("user_id")
        if uid not in user_cache:
            user_cache[uid] = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1}) or {}
        if uid not in prof_cache:
            prof_cache[uid] = await db.provider_profiles.find_one({"user_id": uid}, {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "state": 1, "logo_url": 1, "latino_owned": 1}) or {}
        u = user_cache[uid]
        prof = prof_cache[uid]
        biz = prof.get("business_name") or ""
        name = (u.get("name") or "").strip()
        first = name.split(" ")[0] if name else (biz.split(" ")[0] if biz else "Alguien")
        # Skip seeded test profiles from public feed
        if biz.startswith("TEST_"):
            continue
        items.append({
            "first_name": first,
            "city": prof.get("city"),
            "state": prof.get("state"),
            "business_name": biz or None,
            "slug": prof.get("slug"),
            "logo_url": prof.get("logo_url"),
            "latino_owned": prof.get("latino_owned") == "yes",
            "milestone_id": mid,
            "title": d["title"],
            "emoji": d["emoji"],
            "tier": d["tier"],
            "unlocked_at": rec.get("unlocked_at"),
        })
    # Aggregate stats for hero
    total_unlocked = await db.provider_milestones.count_documents({})
    total_providers = await db.provider_profiles.count_documents({"is_active": True})
    by_tier = {"silver": 0, "gold": 0, "platinum": 0}
    for it in items:
        if it["tier"] in by_tier:
            by_tier[it["tier"]] += 1
    return {"items": items, "stats": {"total_unlocked": total_unlocked, "total_providers": total_providers, "by_tier": by_tier}}

@api_router.get("/public/stats")
async def public_stats():
    total = await db.provider_profiles.count_documents({"verification_status": "approved", "is_active": True})
    states = await db.provider_profiles.distinct("state", {"is_active": True})
    avg_doc = await db.provider_profiles.aggregate([
        {"$match": {"rating_count": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating_avg"}}}
    ]).to_list(1)
    avg = round(avg_doc[0]["avg"], 1) if avg_doc else 4.9
    return {"providers": max(total, 100), "states": max(len([s for s in states if s]), 12), "rating": avg}

# ============ NOTIFICATIONS (inteligentes para proveedores y clientes) ============
# Notification templates. Each generator returns a list of dicts (key, title, body, cta_label, cta_url, icon, priority).
# `key` is stable per user so re-fetches don't duplicate.

PRIO_NUMERIC = {"high": 0, "medium": 1, "low": 2}

def _provider_notifications(user: dict, profile: dict, ctx: dict) -> list[dict]:
    """Generate notifications for a provider based on their profile state."""
    notes = []
    first = (user.get("name") or "").split(" ")[0] or "compañer@"
    slug = profile.get("slug")
    gallery_count = len(profile.get("gallery") or profile.get("photos") or [])
    services_count = len(profile.get("services") or [])
    description = (profile.get("description") or "").strip()
    plan = profile.get("plan", "free")
    has_logo = bool(profile.get("logo_url"))
    views = profile.get("views", 0) or 0
    rating_count = profile.get("rating_count", 0) or 0

    # eCard completion nudges
    if gallery_count == 0:
        notes.append({
            "key": "ecard_no_gallery",
            "category": "ecard_completion",
            "title": "Tu eCard está esperando fotos 📸",
            "body": f"{first}, los negocios con galería convierten 3x más. Sube 3-5 fotos hoy.",
            "cta_label": "Subir fotos",
            "cta_url": "/dashboard/provider?tab=galeria",
            "icon": "image", "priority": "high",
        })
    elif gallery_count < 3:
        notes.append({
            "key": "ecard_few_photos",
            "category": "ecard_completion",
            "title": "Agrega más fotos a tu galería",
            "body": f"Tienes {gallery_count} foto{'s' if gallery_count != 1 else ''}. Con 5+ tu eCard se ve mucho más profesional.",
            "cta_label": "Agregar fotos",
            "cta_url": "/dashboard/provider?tab=galeria",
            "icon": "image", "priority": "medium",
        })
    if services_count < 3:
        notes.append({
            "key": "ecard_few_services",
            "category": "ecard_completion",
            "title": "Agrega más servicios a tu eCard",
            "body": f"Tienes {services_count} servicio{'s' if services_count != 1 else ''}. Lista al menos 3-5 para aparecer en más búsquedas.",
            "cta_label": "Editar servicios",
            "cta_url": "/dashboard/provider?tab=perfil",
            "icon": "list", "priority": "high" if services_count == 0 else "medium",
        })
    if not description or len(description) < 80:
        notes.append({
            "key": "ecard_no_description",
            "category": "ecard_completion",
            "title": "Cuenta tu historia",
            "body": "Una descripción cálida (80+ caracteres) genera 2x más confianza. ¿Qué te apasiona de tu trabajo?",
            "cta_label": "Editar perfil",
            "cta_url": "/dashboard/provider?tab=perfil",
            "icon": "edit", "priority": "medium",
        })
    if not has_logo:
        notes.append({
            "key": "ecard_no_logo",
            "category": "ecard_completion",
            "title": "Sube tu logo o foto",
            "body": "Tu eCard sin logo se ve incompleta. Una imagen vale más que mil clicks.",
            "cta_label": "Subir logo",
            "cta_url": "/dashboard/provider?tab=perfil",
            "icon": "image", "priority": "medium",
        })

    # Engagement
    if ctx.get("unread_messages", 0) > 0:
        n = ctx["unread_messages"]
        notes.append({
            "key": "unread_messages",
            "category": "engagement",
            "title": f"{n} mensaje{'s' if n != 1 else ''} sin leer 💬",
            "body": "Tus clientes están esperando tu respuesta. Responde rápido para no perder oportunidades.",
            "cta_label": "Ver mensajes",
            "cta_url": "/dashboard/provider?tab=mensajes",
            "icon": "message", "priority": "high",
        })
    if ctx.get("pending_requests", 0) > 0:
        n = ctx["pending_requests"]
        notes.append({
            "key": "pending_requests",
            "category": "engagement",
            "title": f"{n} solicitud{'es' if n != 1 else ''} de cotización",
            "body": "Responde rápido — el 70% de los clientes contratan al primer proveedor que responde.",
            "cta_label": "Ver solicitudes",
            "cta_url": "/dashboard/provider?tab=solicitudes",
            "icon": "inbox", "priority": "high",
        })

    # Share/Growth
    if slug and views < 10:
        notes.append({
            "key": "share_ecard",
            "category": "growth",
            "title": "Comparte tu eCard en redes",
            "body": f"Tu eCard tiene {views} vistas. Comparte tu link en WhatsApp e Instagram para que más latinos te conozcan.",
            "cta_label": "Compartir ahora",
            "cta_url": "/dashboard/provider",
            "icon": "share", "priority": "medium",
        })

    # Plan upgrade
    if plan == "free":
        notes.append({
            "key": "upgrade_to_pro",
            "category": "monetization",
            "title": "¿Quieres aparecer primero en búsquedas? 👑",
            "body": "Plan Pro: prioridad en búsquedas, badge destacado, sin límite de fotos. $49/mes (o gratis hasta 2027 si te haces Founding).",
            "cta_label": "Ver planes",
            "cta_url": "/plans",
            "icon": "crown", "priority": "low",
        })

    # First-review nudge if zero reviews after 30+ views
    if views >= 30 and rating_count == 0:
        notes.append({
            "key": "ask_first_review",
            "category": "growth",
            "title": "Pide tu primera reseña ⭐",
            "body": f"Ya te vieron {views} personas pero nadie te ha calificado. Pídele a un cliente feliz que te reseñe.",
            "cta_label": "Cómo pedir reseñas",
            "cta_url": "/dashboard/provider?tab=diario",
            "icon": "star", "priority": "medium",
        })

    # Wall of fame teaser
    notes.append({
        "key": "wall_of_fame_tip",
        "category": "community",
        "title": "Mira el Wall of Fame de la comunidad 🏆",
        "body": "Cada hito que desbloqueas aparece en /comunidad. Tu historia inspira a otros latinos.",
        "cta_label": "Ver comunidad",
        "cta_url": "/comunidad",
        "icon": "trophy", "priority": "low",
    })

    return notes


def _client_notifications(user: dict, ctx: dict) -> list[dict]:
    """Generate notifications for a client based on saved providers, recent searches, location."""
    notes = []
    first = (user.get("name") or "").split(" ")[0] or "compañer@"
    city = (user.get("city") or "").strip()
    # Favorites with recent activity
    fav_providers = ctx.get("favorite_providers") or []
    # Welcome / first-time
    if ctx.get("days_since_signup", 0) <= 1 and len(fav_providers) == 0:
        notes.append({
            "key": "welcome_client",
            "category": "onboarding",
            "title": f"¡Bienvenid@ a getamano, {first}! 🧡",
            "body": "Explora servicios latinos verificados cerca de ti. ¿Qué necesitas resolver hoy?",
            "cta_label": "Explorar servicios",
            "cta_url": "/buscar",
            "icon": "search", "priority": "high",
        })
    # Favorites prompt — contextual ("¿Tienes algo en que Juan el mecánico pueda ayudarte?")
    for fp in fav_providers[:3]:
        biz = fp.get("business_name") or "este proveedor"
        slug = fp.get("slug")
        prov_first = (fp.get("contact_name") or biz).split(" ")[0] if fp.get("contact_name") else biz
        cat_name = fp.get("category_name") or "servicio"
        notes.append({
            "key": f"check_favorite_{slug}",
            "category": "favorites",
            "title": f"¿Tienes algo en que {prov_first} pueda ayudarte?",
            "body": f"Lo guardaste en favoritos. Ofrece {cat_name.lower()}. Escríbele y resuelve eso pendiente.",
            "cta_label": "Ver eCard",
            "cta_url": f"/p/{slug}" if slug else "/buscar",
            "icon": "heart", "priority": "medium",
        })
    # Suggested provider near user
    suggested = ctx.get("suggested_provider")
    if suggested and not fav_providers:
        notes.append({
            "key": f"suggested_{suggested.get('slug')}",
            "category": "discovery",
            "title": f"{suggested.get('business_name', 'Un proveedor')} está cerca de ti",
            "body": f"En {suggested.get('city') or 'tu ciudad'}, con {suggested.get('rating_avg', 0):.1f}⭐. Vale la pena conocerlo.",
            "cta_label": "Ver eCard",
            "cta_url": f"/p/{suggested.get('slug')}",
            "icon": "map", "priority": "medium",
        })
    # Re-engagement
    if ctx.get("days_since_last_login", 0) >= 14:
        notes.append({
            "key": "re_engagement",
            "category": "retention",
            "title": "Volvió a haber novedades 👀",
            "body": f"Hay nuevos proveedores latinos cerca de ti{f' en {city}' if city else ''}. Echa un vistazo.",
            "cta_label": "Ver novedades",
            "cta_url": "/comunidad",
            "icon": "sparkle", "priority": "low",
        })
    # Wall of fame teaser
    if len(notes) < 3:
        notes.append({
            "key": "wall_of_fame_tip_client",
            "category": "community",
            "title": "Conoce a los proveedores destacados",
            "body": "El Wall of Fame muestra los negocios latinos más activos. Una buena forma de descubrir gente confiable.",
            "cta_label": "Ver comunidad",
            "cta_url": "/comunidad",
            "icon": "trophy", "priority": "low",
        })
    return notes


async def _compute_notifications_for_user(user: User) -> list[dict]:
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
    notes_raw = []
    if user.role == "provider":
        profile = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
        if profile:
            ctx = {
                "unread_messages": await db.conversations.count_documents({"provider_id": profile["provider_id"], "unread_by_provider": {"$gt": 0}}) if profile.get("provider_id") else 0,
                "pending_requests": await db.service_requests.count_documents({"provider_id": profile.get("provider_id"), "status": {"$in": ["pending", "new"]}}),
            }
            notes_raw = _provider_notifications(user_doc, profile, ctx)
            # Weekly Market Pulse (Data Flywheel evolution)
            cat_id = profile.get("category_id")
            if cat_id:
                try:
                    pulse = await _compute_market_pulse(cat_id, profile.get("city"), profile.get("country") or DEFAULT_COUNTRY)
                    cat = await db.categories.find_one({"category_id": cat_id}, {"_id": 0, "name_es": 1})
                    cat_name = (cat or {}).get("name_es") or "tu categoría"
                    first_name = (user_doc.get("name") or "").split(" ")[0] or "compañer@"
                    pulse_note = _build_market_pulse_note(profile, pulse, first_name, cat_name)
                    if pulse_note:
                        notes_raw.append(pulse_note)
                except Exception as e:
                    logger.warning(f"Market pulse compute failed: {e}")
    else:
        # Client (or admin) — load favorites with provider info
        favs = await db.favorites.find({"user_id": user.user_id}, {"_id": 0}).limit(5).to_list(5)
        fav_providers = []
        cats_meta = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(100)}
        for f in favs:
            p = await db.provider_profiles.find_one({"provider_id": f.get("provider_id")}, {"_id": 0, "slug": 1, "business_name": 1, "contact_name": 1, "category_id": 1})
            if p and not (p.get("business_name") or "").startswith("TEST_"):
                p["category_name"] = cats_meta.get(p.get("category_id"), {}).get("name_es", "servicio")
                fav_providers.append(p)
        # Days since signup
        created = user_doc.get("created_at")
        days_since_signup = 999
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00")) if isinstance(created, str) else created
                days_since_signup = (datetime.now(timezone.utc) - dt).days
            except Exception:
                pass
        # Suggested provider (top rated in same city, or any approved)
        suggested = None
        if user_doc.get("city"):
            suggested = await db.provider_profiles.find_one(
                {"city": user_doc["city"], "verification_status": "approved", "is_active": True, "business_name": {"$not": {"$regex": "^TEST_"}}},
                {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "rating_avg": 1},
                sort=[("rating_avg", -1), ("views", -1)],
            )
        if not suggested:
            suggested = await db.provider_profiles.find_one(
                {"verification_status": "approved", "is_active": True, "business_name": {"$not": {"$regex": "^TEST_"}}},
                {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "rating_avg": 1},
                sort=[("rating_avg", -1)],
            )
        ctx = {
            "favorite_providers": fav_providers,
            "days_since_signup": days_since_signup,
            "days_since_last_login": 0,
            "suggested_provider": suggested,
        }
        notes_raw = _client_notifications(user_doc, ctx)

    # Upsert each by stable key
    out = []
    for n in notes_raw:
        key = f"{user.user_id}::{n['key']}"
        existing = await db.notifications.find_one({"notification_key": key}, {"_id": 0})
        if existing:
            # Refresh body/title in case data changed, preserve is_read & dismissed_at
            await db.notifications.update_one(
                {"notification_key": key},
                {"$set": {
                    "title": n["title"], "body": n["body"], "cta_label": n.get("cta_label"),
                    "cta_url": n.get("cta_url"), "icon": n.get("icon"), "priority": n.get("priority"),
                    "category": n.get("category"), "updated_at": datetime.now(timezone.utc).isoformat(),
                }}
            )
            existing.update(n)
            existing["notification_key"] = key
            if not existing.get("dismissed_at"):
                out.append(existing)
        else:
            doc = {
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "notification_key": key,
                "user_id": user.user_id,
                "role": user.role,
                "category": n.get("category"),
                "title": n["title"],
                "body": n["body"],
                "cta_label": n.get("cta_label"),
                "cta_url": n.get("cta_url"),
                "icon": n.get("icon"),
                "priority": n.get("priority", "medium"),
                "is_read": False,
                "dismissed_at": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.notifications.insert_one(doc)
            doc.pop("_id", None)
            out.append(doc)
    # Sort by priority then created_at desc
    out.sort(key=lambda x: (PRIO_NUMERIC.get(x.get("priority", "medium"), 1), x.get("is_read", False), -1 * (datetime.fromisoformat(x["created_at"].replace("Z", "+00:00")).timestamp() if x.get("created_at") else 0)))
    return out


@api_router.get("/notifications")
async def get_notifications(user: User = Depends(get_current_user)):
    notes = await _compute_notifications_for_user(user)
    unread = sum(1 for n in notes if not n.get("is_read"))
    return {"items": notes, "unread_count": unread}


@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: User = Depends(get_current_user)):
    res = await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


@api_router.post("/notifications/read-all")
async def mark_all_notifications_read(user: User = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user.user_id, "is_read": False},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"ok": True}


@api_router.post("/notifications/{notification_id}/dismiss")
async def dismiss_notification(notification_id: str, user: User = Depends(get_current_user)):
    res = await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"dismissed_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}

# ============ DATA FLYWHEEL (Sec 10): Provider Rates, Quotes, Pricing Intelligence ============
# Privacy rule (GOLDEN): individual prices/budgets are NEVER exposed across users.
# Aggregates require min 5 data points. Only admin sees raw analytics.

@api_router.get("/providers/me/rates")
async def get_my_rates(user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "provider_id": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    rates = await db.provider_rates.find({"provider_id": prof["provider_id"], "is_active": True}, {"_id": 0}).sort("created_at", 1).to_list(20)
    return {"rates": rates}

@api_router.put("/providers/me/rates")
async def upsert_my_rates(payload: ProviderRatesBulkIn, user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "provider_id": 1, "category_id": 1, "city": 1, "state": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    # Soft-delete existing
    await db.provider_rates.update_many({"provider_id": prof["provider_id"]}, {"$set": {"is_active": False}})
    inserted = []
    for r in payload.rates[:10]:
        doc = {
            "rate_id": f"rate_{uuid.uuid4().hex[:10]}",
            "provider_id": prof["provider_id"],
            "category_id": prof.get("category_id"),
            "city": prof.get("city"),
            "state": prof.get("state"),
            "country": DEFAULT_COUNTRY,
            "currency": DEFAULT_CURRENCY,
            "service_name": r.service_name,
            "price_type": r.price_type,
            "price_min": r.price_min,
            "price_max": r.price_max,
            "unit_note": r.unit_note or "",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.provider_rates.insert_one(doc)
        doc.pop("_id", None)
        inserted.append(doc)
    return {"rates": inserted}

@api_router.get("/providers/{provider_id}/rates")
async def get_public_rates(provider_id: str):
    """Public read of a provider's rates (shown in eCard)."""
    rates = await db.provider_rates.find({"provider_id": provider_id, "is_active": True}, {"_id": 0, "rate_id": 1, "service_name": 1, "price_type": 1, "price_min": 1, "price_max": 1, "unit_note": 1}).sort("created_at", 1).to_list(20)
    return {"rates": rates}

@api_router.get("/market-range")
async def public_market_range(provider_id: Optional[str] = None, category_id: Optional[str] = None, city: Optional[str] = None, state: Optional[str] = None, country: str = DEFAULT_COUNTRY):
    """Public market price range (educates clients during Quote Modal).
    Returns aggregated min/max ONLY when n>=10 to protect individual privacy.
    Combines: provider_rates (declared) + reviews.paid_amount_range (actual paid).
    """
    # If provider_id given, infer category+city from profile
    if provider_id and (not category_id or not city):
        prof = await db.provider_profiles.find_one({"provider_id": provider_id}, {"_id": 0, "category_id": 1, "city": 1, "state": 1, "country": 1})
        if prof:
            category_id = category_id or prof.get("category_id")
            city = city or prof.get("city")
            state = state or prof.get("state")
            country = prof.get("country") or country
    if not category_id:
        return {"available": False, "reason": "no_category"}
    rate_match = {"is_active": True, "category_id": category_id, "country": country, "price_min": {"$ne": None}}
    if city:
        rate_match["city"] = city
    agg = await db.provider_rates.aggregate([
        {"$match": rate_match},
        {"$group": {"_id": None, "avg_min": {"$avg": "$price_min"}, "avg_max": {"$avg": "$price_max"}, "min_price": {"$min": "$price_min"}, "max_price": {"$max": "$price_max"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    # Paid ranges from reviews (anonymous)
    paid_pipeline = [
        {"$lookup": {"from": "provider_profiles", "localField": "provider_id", "foreignField": "provider_id", "as": "prof"}},
        {"$unwind": "$prof"},
        {"$match": {"prof.category_id": category_id, "paid_amount_range": {"$nin": [None, "", "prefer_not_to_say"]}}},
        {"$group": {"_id": "$paid_amount_range", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    if city:
        paid_pipeline[2]["$match"]["prof.city"] = city
    paid_rows = await db.reviews.aggregate(paid_pipeline).to_list(20)
    paid_total = sum(r["count"] for r in paid_rows)
    rate_n = agg[0]["count"] if agg else 0
    total_n = rate_n + paid_total
    # PRIVACY THRESHOLD: need >=10 data points to expose
    if total_n < 10:
        return {"available": False, "reason": "not_enough_data", "sample_size": total_n, "needed": 10}
    response = {
        "available": True,
        "category_id": category_id,
        "city": city,
        "country": country,
        "currency": DEFAULT_CURRENCY,
        "sample_size": total_n,
    }
    if agg:
        a = agg[0]
        response.update({
            "avg_min": round(a["avg_min"], 0),
            "avg_max": round(a["avg_max"] or a["avg_min"], 0),
            "absolute_min": round(a["min_price"], 0),
            "absolute_max": round(a["max_price"] or a["min_price"], 0),
        })
    if paid_rows:
        response["top_paid_range"] = paid_rows[0]["_id"]
    # Build a human-readable hint
    if response.get("avg_min") and response.get("avg_max"):
        response["hint"] = f"Otros clientes en {city or 'tu zona'} pagaron entre ${int(response['avg_min'])} y ${int(response['avg_max'])} por servicios similares."
    return response

@api_router.post("/quote-requests")
async def create_quote_request(payload: QuoteRequestIn, request: Request):
    """Submit a structured quote request. Auth optional (guest allowed)."""
    user = None
    token = request.cookies.get("session_token")
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1]
    if token:
        try:
            payload_jwt = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            uid = payload_jwt.get("user_id")
            if uid:
                u = await db.users.find_one({"user_id": uid}, {"_id": 0})
                if u:
                    user = User(**u)
        except Exception:
            user = None
    prof = await db.provider_profiles.find_one({"provider_id": payload.provider_id}, {"_id": 0, "category_id": 1, "city": 1, "state": 1, "business_name": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="Provider not found")
    doc = {
        "quote_request_id": f"qr_{uuid.uuid4().hex[:12]}",
        "provider_id": payload.provider_id,
        "client_id": user.user_id if user else None,
        "client_name": payload.client_name or (user.name if user else ""),
        "client_phone": normalize_phone(payload.client_phone) if payload.client_phone else "",
        "client_email": payload.client_email or (user.email if user else ""),
        "preferred_contact": payload.preferred_contact,
        "category": payload.category or prof.get("category_id") or "",
        "category_id": prof.get("category_id"),
        "city": prof.get("city"),
        "state": prof.get("state"),
        "country": DEFAULT_COUNTRY,
        "description": payload.description,
        "project_size": payload.project_size,
        "budget_range": payload.budget_range or "unknown",
        "requested_date": payload.requested_date,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.quote_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/providers/me/quote-requests")
async def list_my_quote_requests(user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "provider_id": 1})
    if not prof:
        return {"items": []}
    items = await db.quote_requests.find({"provider_id": prof["provider_id"]}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return {"items": items}

@api_router.post("/quote-requests/{quote_request_id}/respond")
async def respond_to_quote(quote_request_id: str, payload: QuoteResponseIn, user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "provider_id": 1})
    if not prof:
        raise HTTPException(status_code=403, detail="Provider only")
    qr = await db.quote_requests.find_one({"quote_request_id": quote_request_id}, {"_id": 0})
    if not qr or qr.get("provider_id") != prof["provider_id"]:
        raise HTTPException(status_code=404, detail="Quote request not found")
    doc = {
        "quote_response_id": f"qrsp_{uuid.uuid4().hex[:12]}",
        "quote_request_id": quote_request_id,
        "provider_id": prof["provider_id"],
        "response_text": payload.response_text,
        "quoted_price": payload.quoted_price,
        "price_type": payload.price_type or "a_consultar",
        "price_shown_to_client": payload.price_shown_to_client,
        "currency": DEFAULT_CURRENCY,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.quote_responses.insert_one(doc)
    await db.quote_requests.update_one(
        {"quote_request_id": quote_request_id},
        {"$set": {"status": "responded", "responded_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    doc.pop("_id", None)
    return doc

# === WEEKLY MARKET PULSE (Data Flywheel evolution) ===
# Provider-facing weekly aggregated market signal: avg rates + WoW delta,
# quote demand in their category/city, top requested budget tier.
# Privacy threshold: only return aggregated numbers if total sample >= 3.

async def _compute_market_pulse(category_id: str, city: Optional[str], country: str = DEFAULT_COUNTRY) -> dict:
    """Compute weekly pulse for a (category, city, country) cohort.
    Returns dict with weekly_quotes, prev_weekly_quotes, delta_pct,
    avg_min/max for active rates, top_budget_range, top_service.
    """
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=7)).isoformat()
    prev_start = (now - timedelta(days=14)).isoformat()

    base_match: dict = {"category_id": category_id, "country": country}
    if city:
        base_match["city"] = city

    # Quotes this week vs previous
    this_week_n = await db.quote_requests.count_documents({**base_match, "created_at": {"$gte": week_start}})
    prev_week_n = await db.quote_requests.count_documents({**base_match, "created_at": {"$gte": prev_start, "$lt": week_start}})

    # Top budget range this week
    budget_agg = await db.quote_requests.aggregate([
        {"$match": {**base_match, "created_at": {"$gte": week_start}, "budget_range": {"$nin": [None, "", "unknown"]}}},
        {"$group": {"_id": "$budget_range", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1},
    ]).to_list(1)
    top_budget = budget_agg[0]["_id"] if budget_agg else None

    # Top project_size this week
    size_agg = await db.quote_requests.aggregate([
        {"$match": {**base_match, "created_at": {"$gte": week_start}, "project_size": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$project_size", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1},
    ]).to_list(1)
    top_size = size_agg[0]["_id"] if size_agg else None

    # Current vs prior avg rates (provider_rates updated_at)
    rate_match_cur = {"is_active": True, "category_id": category_id, "country": country, "price_min": {"$ne": None}}
    if city:
        rate_match_cur["city"] = city
    rates_agg = await db.provider_rates.aggregate([
        {"$match": rate_match_cur},
        {"$group": {"_id": None, "avg_min": {"$avg": "$price_min"}, "avg_max": {"$avg": "$price_max"}, "n": {"$sum": 1}}},
    ]).to_list(1)
    avg_min = round(rates_agg[0]["avg_min"], 0) if rates_agg and rates_agg[0]["avg_min"] is not None else None
    avg_max = round(rates_agg[0]["avg_max"] or (rates_agg[0]["avg_min"] or 0), 0) if rates_agg else None
    rate_n = rates_agg[0]["n"] if rates_agg else 0

    # Prior 30d avg (rough WoW signal for prices using created_at on rates)
    prior_match = {**rate_match_cur, "created_at": {"$lt": (now - timedelta(days=14)).isoformat()}}
    prior_agg = await db.provider_rates.aggregate([
        {"$match": prior_match},
        {"$group": {"_id": None, "avg_min": {"$avg": "$price_min"}, "avg_max": {"$avg": "$price_max"}}},
    ]).to_list(1)
    prior_avg_max = round(prior_agg[0]["avg_max"] or prior_agg[0]["avg_min"] or 0, 0) if prior_agg and prior_agg[0]["avg_min"] is not None else None

    delta_quotes_pct = None
    if prev_week_n > 0:
        delta_quotes_pct = round(((this_week_n - prev_week_n) / prev_week_n) * 100, 0)
    elif this_week_n > 0:
        delta_quotes_pct = 100

    delta_price_pct = None
    if prior_avg_max and avg_max:
        delta_price_pct = round(((avg_max - prior_avg_max) / prior_avg_max) * 100, 1)

    return {
        "category_id": category_id,
        "city": city,
        "country": country,
        "week_start": week_start,
        "generated_at": now.isoformat(),
        "weekly_quotes": this_week_n,
        "prev_weekly_quotes": prev_week_n,
        "delta_quotes_pct": delta_quotes_pct,
        "avg_min": avg_min,
        "avg_max": avg_max,
        "prior_avg_max": prior_avg_max,
        "delta_price_pct": delta_price_pct,
        "rate_sample_size": rate_n,
        "top_budget_range": top_budget,
        "top_project_size": top_size,
        "has_signal": (this_week_n + rate_n) >= 3,
        "currency": DEFAULT_CURRENCY,
    }


def _humanize_budget_range(rng: Optional[str]) -> str:
    if not rng:
        return ""
    return BUDGET_LABEL.get(rng, rng)


def _build_market_pulse_note(profile: dict, pulse: dict, first_name: str, cat_name: str) -> Optional[dict]:
    """Builds a notification dict for the weekly market pulse. Returns None if no useful signal."""
    if not pulse.get("has_signal"):
        return None
    q = pulse.get("weekly_quotes", 0)
    delta = pulse.get("delta_quotes_pct")
    avg_max = pulse.get("avg_max")
    avg_min = pulse.get("avg_min")
    delta_price = pulse.get("delta_price_pct")
    top_budget = _humanize_budget_range(pulse.get("top_budget_range"))
    city = pulse.get("city") or "tu zona"

    # Build a concise headline
    parts = []
    if q > 0:
        if delta is not None and delta > 0:
            parts.append(f"{q} cotización{'es' if q != 1 else ''} en {cat_name.lower()} esta semana (+{int(delta)}% vs semana pasada)")
        elif delta is not None and delta < 0:
            parts.append(f"{q} cotización{'es' if q != 1 else ''} en {cat_name.lower()} esta semana ({int(delta)}% vs anterior)")
        else:
            parts.append(f"{q} cotización{'es' if q != 1 else ''} nuevas en {cat_name.lower()}")
    if avg_min and avg_max:
        if delta_price and abs(delta_price) >= 2:
            arrow = "↑" if delta_price > 0 else "↓"
            parts.append(f"precio promedio: ${int(avg_min)}–${int(avg_max)} ({arrow}{abs(delta_price)}%)")
        else:
            parts.append(f"precio promedio: ${int(avg_min)}–${int(avg_max)}")
    if top_budget:
        parts.append(f"budget más pedido: {top_budget}")

    body = " · ".join(parts) if parts else f"Hay movimiento en {cat_name.lower()} en {city}."

    return {
        "key": "weekly_market_pulse",
        "category": "market_pulse",
        "title": f"📊 Pulso semanal de {cat_name} en {city}",
        "body": f"{first_name}, {body}.",
        "cta_label": "Ver Market Pulse",
        "cta_url": "/dashboard/provider?tab=tarifas",
        "icon": "trending-up",
        "priority": "medium",
    }


@api_router.get("/providers/me/market-pulse")
async def get_my_market_pulse(user: User = Depends(get_current_user)):
    """Returns the Weekly Market Pulse for the authenticated provider."""
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    cat_id = prof.get("category_id")
    if not cat_id:
        return {"available": False, "reason": "no_category"}
    pulse = await _compute_market_pulse(cat_id, prof.get("city"), prof.get("country") or DEFAULT_COUNTRY)
    cat = await db.categories.find_one({"category_id": cat_id}, {"_id": 0, "name_es": 1, "name_en": 1, "slug": 1})
    pulse["category_name"] = (cat or {}).get("name_es") or "tu categoría"
    pulse["category_slug"] = (cat or {}).get("slug")
    if not pulse.get("has_signal"):
        return {"available": False, "reason": "not_enough_data", **pulse}
    pulse["available"] = True
    return pulse

# === Pricing Intelligence (Admin only) ===
@api_router.get("/admin/pricing-intelligence")
async def admin_pricing_intelligence(
    admin: User = Depends(require_admin),
    category_id: Optional[str] = None,
    state: Optional[str] = None,
    days: int = 365,
):
    since = (datetime.now(timezone.utc) - timedelta(days=max(days, 1))).isoformat()
    cats = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(200)}

    # Rates by category
    rate_match: dict = {"is_active": True, "price_min": {"$ne": None}}
    if category_id:
        rate_match["category_id"] = category_id
    if state:
        rate_match["state"] = state
    rates_agg = await db.provider_rates.aggregate([
        {"$match": rate_match},
        {"$group": {
            "_id": "$category_id",
            "avg_min": {"$avg": "$price_min"},
            "avg_max": {"$avg": "$price_max"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"count": -1}},
        {"$limit": 30},
    ]).to_list(30)
    by_category = []
    for r in rates_agg:
        cid = r["_id"]
        # Most common budget for this category
        budget_rows = await db.quote_requests.aggregate([
            {"$match": {"category_id": cid, "budget_range": {"$nin": [None, "", "unknown"]}, "created_at": {"$gte": since}}},
            {"$group": {"_id": "$budget_range", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 1},
        ]).to_list(1)
        # Most common paid range from reviews
        paid_rows = await db.reviews.aggregate([
            {"$lookup": {"from": "provider_profiles", "localField": "provider_id", "foreignField": "provider_id", "as": "prof"}},
            {"$unwind": "$prof"},
            {"$match": {"prof.category_id": cid, "paid_amount_range": {"$nin": [None, "", "prefer_not_to_say"]}}},
            {"$group": {"_id": "$paid_amount_range", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 1},
        ]).to_list(1)
        by_category.append({
            "category_id": cid,
            "category_name": cats.get(cid, {}).get("name_es", cid),
            "avg_min": round(r["avg_min"] or 0, 2),
            "avg_max": round(r["avg_max"] or 0, 2),
            "sample_size": r["count"],
            "top_budget_range": budget_rows[0]["_id"] if budget_rows else None,
            "top_paid_range": paid_rows[0]["_id"] if paid_rows else None,
        })

    # Demand by city
    city_match = {"created_at": {"$gte": since}}
    if state:
        city_match["state"] = state
    city_rows = await db.quote_requests.aggregate([
        {"$match": city_match},
        {"$group": {
            "_id": {"city": "$city", "state": "$state"},
            "count": {"$sum": 1},
            "top_category": {"$push": "$category_id"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]).to_list(20)
    demand = []
    for c in city_rows:
        if not c["_id"].get("city"):
            continue
        top_cat = max(set(c["top_category"]), key=c["top_category"].count) if c["top_category"] else None
        demand.append({
            "city": c["_id"]["city"], "state": c["_id"].get("state"),
            "count": c["count"],
            "top_category": cats.get(top_cat, {}).get("name_es", top_cat),
        })

    # Response rate metrics
    total_quotes = await db.quote_requests.count_documents({"created_at": {"$gte": since}})
    responded = await db.quote_requests.count_documents({"created_at": {"$gte": since}, "status": "responded"})
    response_rate = round((responded / total_quotes) * 100, 1) if total_quotes else 0
    # Avg response time (hours) — only responded
    rt_pipeline = [
        {"$match": {"created_at": {"$gte": since}, "status": "responded", "responded_at": {"$ne": None}}},
        {"$project": {
            "_id": 0,
            "delta": {"$divide": [{"$subtract": [
                {"$dateFromString": {"dateString": "$responded_at"}},
                {"$dateFromString": {"dateString": "$created_at"}}
            ]}, 3600000]}
        }},
        {"$group": {"_id": None, "avg": {"$avg": "$delta"}}},
    ]
    rt_rows = await db.quote_requests.aggregate(rt_pipeline).to_list(1)
    avg_response_hours = round(rt_rows[0]["avg"], 1) if rt_rows else None
    # % responses with price
    with_price = await db.quote_responses.count_documents({"quoted_price": {"$ne": None}, "created_at": {"$gte": since}})
    total_responses = await db.quote_responses.count_documents({"created_at": {"$gte": since}})
    price_rate = round((with_price / total_responses) * 100, 1) if total_responses else 0

    return {
        "filters": {"category_id": category_id, "state": state, "days": days},
        "by_category": by_category,
        "demand_by_city": demand,
        "operations": {
            "total_quotes": total_quotes, "responded": responded, "response_rate_pct": response_rate,
            "avg_response_hours": avg_response_hours,
            "responses_total": total_responses, "responses_with_price": with_price, "price_rate_pct": price_rate,
        },
    }

@api_router.get("/admin/pricing-intelligence/export.csv")
async def admin_pricing_intelligence_csv(admin: User = Depends(require_admin)):
    """Export anonymized pricing data."""
    import csv
    from io import StringIO
    from fastapi.responses import Response as FastResponse
    out = StringIO()
    writer = csv.writer(out)
    writer.writerow(["type", "category_id", "state", "city", "price_min", "price_max", "price_type", "budget_range", "paid_range", "created_at"])
    async for r in db.provider_rates.find({"is_active": True}, {"_id": 0}):
        writer.writerow(["rate", r.get("category_id"), r.get("state"), r.get("city"), r.get("price_min"), r.get("price_max"), r.get("price_type"), "", "", r.get("created_at")])
    async for q in db.quote_requests.find({}, {"_id": 0}):
        writer.writerow(["quote_request", q.get("category_id"), q.get("state"), q.get("city"), "", "", "", q.get("budget_range"), "", q.get("created_at")])
    async for rv in db.reviews.find({"paid_amount_range": {"$ne": None}}, {"_id": 0}):
        prof = await db.provider_profiles.find_one({"provider_id": rv.get("provider_id")}, {"_id": 0, "category_id": 1, "state": 1, "city": 1})
        writer.writerow(["review_paid", prof.get("category_id") if prof else "", prof.get("state") if prof else "", prof.get("city") if prof else "", "", "", "", "", rv.get("paid_amount_range"), rv.get("created_at")])
    return FastResponse(content=out.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=getamano-pricing.csv"})

# === Market Benchmark (Premium plan only) ===
@api_router.get("/providers/me/benchmark")
async def my_benchmark(user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    plan = prof.get("plan", "free")
    if plan != "premium":
        return {"available": False, "reason": "premium_only", "plan": plan}
    own_rates = await db.provider_rates.find({"provider_id": prof["provider_id"], "is_active": True}, {"_id": 0}).to_list(10)
    if not own_rates:
        return {"available": False, "reason": "no_rates"}
    # Aggregate same category + city, excluding self
    peers = await db.provider_rates.aggregate([
        {"$match": {
            "is_active": True,
            "category_id": prof.get("category_id"),
            "city": prof.get("city"),
            "provider_id": {"$ne": prof["provider_id"]},
            "price_min": {"$ne": None},
        }},
        {"$group": {"_id": None, "avg_min": {"$avg": "$price_min"}, "avg_max": {"$avg": "$price_max"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    if not peers or peers[0]["count"] < 5:
        return {"available": False, "reason": "not_enough_data", "sample_size": peers[0]["count"] if peers else 0}
    p = peers[0]
    own_min = sum((r["price_min"] or 0) for r in own_rates if r.get("price_min")) / max(sum(1 for r in own_rates if r.get("price_min")), 1)
    own_max = sum((r["price_max"] or 0) for r in own_rates if r.get("price_max")) / max(sum(1 for r in own_rates if r.get("price_max")), 1)
    # Position: below / aligned / above
    avg_peer = (p["avg_min"] + p["avg_max"]) / 2 if p.get("avg_max") else p["avg_min"]
    avg_own = (own_min + own_max) / 2 if own_max else own_min
    diff_pct = round(((avg_own - avg_peer) / max(avg_peer, 1)) * 100, 1) if avg_peer else 0
    if abs(diff_pct) <= 10:
        position = "aligned"
        message = "Tu precio está alineado con el promedio de tu ciudad. Buen posicionamiento."
    elif diff_pct < 0:
        position = "below"
        message = "Tu precio está por debajo del promedio. Considera ajustarlo para reflejar tu valor real."
    else:
        position = "above"
        message = "Tu precio está sobre el promedio. Asegúrate de comunicar lo que justifica esa prima (galería, reseñas, experiencia)."
    cats = {c["category_id"]: c for c in await db.categories.find({"category_id": prof.get("category_id")}, {"_id": 0}).to_list(1)}
    return {
        "available": True,
        "category": cats.get(prof.get("category_id"), {}).get("name_es", "tu categoría"),
        "city": prof.get("city"), "state": prof.get("state"),
        "peer_avg_min": round(p["avg_min"], 2),
        "peer_avg_max": round(p["avg_max"] or p["avg_min"], 2),
        "own_avg_min": round(own_min, 2),
        "own_avg_max": round(own_max, 2),
        "sample_size": p["count"],
        "position": position,
        "diff_pct": diff_pct,
        "message": message,
    }

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
