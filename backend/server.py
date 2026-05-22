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
from catalog import CATALOG as FULL_CATALOG, SECTOR_LABELS, SECTOR_COLORS, CITIES as SEO_CITIES
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
    # SECTION 13F — Mirror every notification attempt to the queue too.
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(db.sms_log.insert_one(dict(record)))
            queue_doc = {
                "queue_id": f"notif_{uuid.uuid4().hex[:14]}",
                "recipient_phone": to_phone,
                "recipient_email": "",
                "channel": "sms",
                "body": body[:600],
                "subject": "",
                "trigger_type": event,
                "status": "sent" if record.get("status") == "sent" else "pending",
                "attempts": 1 if record.get("status") in {"sent", "error"} else 0,
                "last_attempt": datetime.now(timezone.utc).isoformat() if record.get("status") in {"sent", "error"} else None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            loop.create_task(db.notification_queue.insert_one(dict(queue_doc)))
        else:
            asyncio.run(db.sms_log.insert_one(dict(record)))
    except Exception:
        pass
    return record

app = FastAPI(title="getamano API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# PRE-LAUNCH BUG-04 — Public query guard: hide all rows flagged as is_test=True
# (filled by the startup migration that flags business_name regex /^TEST/i).
# Use this in EVERY public-facing query, never in admin queries.
PUBLIC_GUARD = {"is_test": {"$ne": True}}

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
    category: Optional[Literal["trabajo_terminado", "antes_despues", "equipo", "herramientas", "negocio", "otro"]] = None

class GalleryReorderIn(BaseModel):
    order: List[str]  # ordered list of gallery item ids

class GalleryCategoryIn(BaseModel):
    category: Optional[Literal["trabajo_terminado", "antes_despues", "equipo", "herramientas", "negocio", "otro"]] = None

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

# ============ REPORTS (Sprint 2) ============
REPORT_REASONS_CLIENT_TO_PROVIDER = {
    "no_servicio": "No prestó el servicio acordado",
    "calidad_pobre": "Calidad del trabajo muy por debajo de lo esperado",
    "fraude_pago": "Cobros no acordados / fraude",
    "comportamiento_inapropiado": "Comportamiento inapropiado o irrespetuoso",
    "info_falsa": "Información falsa en el perfil (precio, ubicación, identidad)",
    "abandono": "Abandonó el trabajo sin terminar",
    "otro": "Otro motivo (describe)",
}
REPORT_REASONS_PROVIDER_TO_CLIENT = {
    "no_pago": "Cliente no pagó el servicio prestado",
    "trato_irrespetuoso": "Trato irrespetuoso o agresivo",
    "info_falsa_cliente": "Información falsa (dirección, alcance del trabajo)",
    "cambios_excesivos": "Cambios excesivos no acordados",
    "fake_review": "Reseña fake o injusta",
    "intento_fraude": "Intento de fraude o estafa",
    "otro": "Otro motivo (describe)",
}

class ReportIn(BaseModel):
    target_id: str  # user_id of the reported user
    target_role: Literal["client", "provider"]
    reason: str  # key from one of the dicts above
    description: str
    evidence_urls: List[str] = []  # up to 3 image/file URLs uploaded via /api/upload
    related_quote_request_id: Optional[str] = None
    related_provider_slug: Optional[str] = None

class ReportActionIn(BaseModel):
    action: Literal["dismiss", "warn", "suspend", "delete"]
    admin_notes: Optional[str] = ""

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

async def get_optional_user(request: Request) -> Optional[User]:
    """Returns the authenticated user or None — never raises 401.
    Used for endpoints that accept both anonymous and logged-in clients (e.g. /api/appointments)."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

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
        # SECTION 13 — Conversations index migrated to PARTIAL unique:
        # Only enforce dedup when client_id is a real string (legacy /messages flow).
        # New anonymous /messaging/start inserts have no client_id and must not collide.
        try:
            await db.conversations.drop_index("client_id_1_provider_id_1")
        except Exception:
            pass
        await db.conversations.create_index(
            [("client_id", 1), ("provider_id", 1)],
            unique=True,
            partialFilterExpression={"client_id": {"$type": "string"}},
        )
        await db.conversations.create_index([("provider_user_id", 1), ("last_message_at", -1)])
        await db.conversations.create_index([("participant_user_id", 1), ("last_message_at", -1)])
        await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
        await db.notification_queue.create_index([("status", 1), ("created_at", 1)])
        await db.referrals.create_index("referred_user_id", unique=True)
        await db.referrals.create_index("referrer_user_id")
        await db.appointments.create_index([("provider_id", 1), ("date", 1), ("time", 1)])
        await db.appointments.create_index([("provider_user_id", 1), ("status", 1), ("date", 1)])
        await db.translation_cache.create_index(
            [("source_id", 1), ("source_field", 1), ("target_lang", 1)], unique=True
        )
        # TTL: auto-expire translation cache entries after 90 days. Indexed on a
        # native BSON Date field (`expires_at`). Cheap insurance against unbounded growth.
        await db.translation_cache.create_index("expires_at", expireAfterSeconds=0)
        await db.reviews.create_index([("user_id", 1), ("provider_id", 1)], unique=True)
        await db.quote_requests.create_index([("provider_id", 1), ("created_at", -1)])
        await db.quote_requests.create_index([("country", 1), ("category_id", 1), ("city", 1)])
        await db.provider_rates.create_index([("category_id", 1), ("city", 1), ("country", 1)])
        await db.provider_rates.create_index([("provider_id", 1), ("is_active", 1)])
        # SECTION 24 — Email OTP verification
        await db.email_otps.create_index("email", unique=True)
        # TTL: clean up OTP docs as soon as their expires_at_native passes.
        await db.email_otps.create_index("expires_at_native", expireAfterSeconds=0)
        # SECTION 23 — rate limit buckets (auto-expire 2 minutes after creation)
        await db.rate_limit_buckets.create_index([("bucket_key", 1), ("ts", -1)])
        await db.rate_limit_buckets.create_index("expires_at_native", expireAfterSeconds=0)
        # Audit log — fast lookup by actor_id + action
        await db.audit_log.create_index([("actor_id", 1), ("created_at", -1)])
        await db.audit_log.create_index([("action", 1), ("created_at", -1)])
        # SECTION 18 — Geocoding cache
        await db.city_coordinates.create_index([("city", 1), ("state", 1)], unique=True)
        # Quiz funnel (PlanRecommender abandonment tracking)
        await db.quiz_funnel.create_index([("session_id", 1)])
        await db.quiz_funnel.create_index([("created_at", -1)])
        await db.quiz_funnel.create_index([("event", 1), ("created_at", -1)])
        # Email captures for the recovery flow
        await db.lead_recoveries.create_index("email", unique=True)
        await db.lead_recoveries.create_index([("status", 1), ("created_at", -1)])
        # Public recommendations (named endorsements with optional message + share token)
        await db.recommendations.create_index([("provider_id", 1), ("created_at", -1)])
        await db.recommendations.create_index(
            [("provider_id", 1), ("client_email", 1)],
            unique=True,
            partialFilterExpression={"client_email": {"$type": "string"}},
        )
        await db.recommendations.create_index("share_token", unique=True, sparse=True)
        await db.recommendations.create_index([("created_at", -1)])
    except Exception as e:
        logger.warning(f"Index creation: {e}")

    # SECTION 18 — Seed city_coordinates with 24 base cities (idempotent)
    try:
        seeded = 0
        for city, state, lat, lng in US_CITY_SEED:
            res = await db.city_coordinates.update_one(
                {"city": city, "state": state},
                {"$setOnInsert": {
                    "city": city, "state": state, "lat": lat, "lng": lng,
                    "display_name": f"{city.replace('-', ' ').title()}, {state}",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
            if res.upserted_id is not None:
                seeded += 1
        if seeded > 0:
            logger.info(f"Sec 18: seeded {seeded} city_coordinates")
    except Exception as e:
        logger.warning(f"Sec 18 city seed warn: {e}")

    # PRE-LAUNCH BUG-09 — Seed db.cities (admin catalog) with the active US cities
    try:
        for city, state, _lat, _lng in US_CITY_SEED:
            display_name = city.replace("-", " ").title()
            await db.cities.update_one(
                {"name": display_name, "state": state},
                {"$setOnInsert": {
                    "city_id": f"city_{uuid.uuid4().hex[:10]}",
                    "name": display_name, "state": state,
                    "featured": display_name.lower() in {"dallas", "houston", "los angeles", "miami", "chicago", "new york", "phoenix"},
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
    except Exception as e:
        logger.warning(f"Cities seed warn: {e}")

    # PRE-LAUNCH BUG-04 — Flag all TEST providers as is_test=True so they stay
    # hidden from PUBLIC endpoints (search, featured, founding-status, map).
    # Admin still sees them because admin endpoints don't apply this filter.
    try:
        r1 = await db.provider_profiles.update_many(
            {"$or": [
                {"business_name": {"$regex": "^TEST", "$options": "i"}},
                {"business_name": {"$regex": "^TEST_", "$options": "i"}},
            ], "is_test": {"$ne": True}},
            {"$set": {"is_test": True}}
        )
        if r1.modified_count > 0:
            logger.info(f"Pre-launch: flagged {r1.modified_count} TEST providers as hidden from public")
        # Also flag their users so founding-status recent shows real members only
        test_user_ids = [p["user_id"] async for p in db.provider_profiles.find(
            {"is_test": True}, {"_id": 0, "user_id": 1})]
        if test_user_ids:
            await db.users.update_many(
                {"user_id": {"$in": test_user_ids}, "is_test": {"$ne": True}},
                {"$set": {"is_test": True}}
            )
    except Exception as e:
        logger.warning(f"Pre-launch TEST flagging warn: {e}")

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

    # Seed full catalog (173 categories) — idempotent: only inserts slugs not yet present
    existing_slugs = {c["slug"] for c in await db.categories.find({}, {"_id": 0, "slug": 1}).to_list(500)}
    new_docs = []
    for item in FULL_CATALOG:
        if item["slug"] not in existing_slugs:
            new_docs.append({
                "category_id": f"cat_{uuid.uuid4().hex[:10]}",
                "slug": item["slug"],
                "name_es": item["name_es"],
                "name_en": item["name_en"],
                "sector": item["sector"],
                "sector_label": SECTOR_LABELS.get(item["sector"], item["sector"]),
                "license_flag": item["license"],
                "color": SECTOR_COLORS.get(item["sector"], "#2F9D94"),
                "icon": "🛠️",
            })
    if new_docs:
        await db.categories.insert_many(new_docs)
        logger.info(f"Seeded {len(new_docs)} new catalog categories (total now {len(existing_slugs) + len(new_docs)})")
    # Ensure license_flag/sector exist on legacy categories
    await db.categories.update_many({"license_flag": {"$exists": False}}, {"$set": {"license_flag": "green"}})
    await db.categories.update_many({"sector": {"$exists": False}}, {"$set": {"sector": "hogar", "sector_label": "Hogar y mantenimiento"}})

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
async def register(payload: RegisterIn, response: Response, ref: Optional[str] = None):
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
        "email_verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    # SECTION 16C — Track referral signup (best-effort, never blocks registration)
    if ref:
        try: await _track_referral_signup(user_id, ref)
        except Exception: logger.exception("referral tracking failed")
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
    cats = await db.categories.find({}, {"_id": 0}).to_list(500)
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
    has_video: Optional[bool] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    radius_miles: float = 75.0,
    limit: int = 24,
):
    query = {"is_active": True, **PUBLIC_GUARD}
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
    if has_video:
        query["video_url"] = {"$exists": True, "$ne": ""}
    if q:
        query["$or"] = [
            {"business_name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"services": {"$regex": q, "$options": "i"}},
        ]
    # Section 18F — Proximity search ("Near me"): if lat/lng provided, fetch
    # candidates with coordinates, compute haversine distance, filter by radius.
    # Radius input: accept BOTH radius_miles (preferred, US default) and radius_km (back-compat).
    use_proximity = lat is not None and lng is not None
    effective_radius_km = radius_km if radius_km is not None else (radius_miles * 1.60934)
    if use_proximity:
        query["latitude"] = {"$ne": None}
        query["longitude"] = {"$ne": None}
    # Plan-based sort: premium > pro > basic > free, then by likes, then by rating
    PLAN_ORDER = {"premium": 0, "pro": 1, "basic": 2, "free": 3}
    fetch_n = limit * 4 if use_proximity else limit * 2
    providers = await db.provider_profiles.find(query, {"_id": 0}).limit(fetch_n).to_list(fetch_n)
    if use_proximity:
        from math import radians, sin, cos, asin, sqrt
        def _hav_km(lat1, lng1, lat2, lng2):
            R = 6371.0
            la1, lo1, la2, lo2 = map(radians, (lat1, lng1, lat2, lng2))
            dlat = la2 - la1; dlng = lo2 - lo1
            a = sin(dlat/2)**2 + cos(la1)*cos(la2)*sin(dlng/2)**2
            return 2 * R * asin(sqrt(a))
        for p in providers:
            try:
                dist_km = _hav_km(lat, lng, float(p["latitude"]), float(p["longitude"]))
                p["distance_km"] = round(dist_km, 2)
                p["distance_miles"] = round(dist_km * 0.621371, 1)
            except Exception:
                p["distance_km"] = 9999.0
                p["distance_miles"] = 9999.0
        providers = [p for p in providers if p["distance_km"] <= effective_radius_km]
        providers.sort(key=lambda p: (p["distance_km"], PLAN_ORDER.get(p.get("plan", "free"), 9), -p.get("likes_count", 0)))
    else:
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
    query = {"is_active": True, **PUBLIC_GUARD}
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


# ============ SEO LOCAL: CITIES + STATS PER CITY/CATEGORY ============
@api_router.get("/seo/cities")
async def seo_cities():
    """Return all SEO-target cities for hub /ciudades."""
    items = []
    for c in SEO_CITIES:
        count = await db.provider_profiles.count_documents({"is_active": True, "city": {"$regex": f"^{c['name']}$", "$options": "i"}, **PUBLIC_GUARD})
        items.append({**c, "providers_count": count})
    items.sort(key=lambda x: -x["providers_count"])
    return {"items": items, "total": len(items)}


@api_router.get("/seo/sectors")
async def seo_sectors():
    """Return categories grouped by sector for hub /servicios."""
    cats = await db.categories.find({}, {"_id": 0}).to_list(500)
    by_sector: dict = {}
    for c in cats:
        s = c.get("sector", "hogar")
        by_sector.setdefault(s, []).append(c)
    out = []
    for sector_key, sector_label in SECTOR_LABELS.items():
        items = by_sector.get(sector_key, [])
        if not items:
            continue
        # add provider counts per category
        for cat in items:
            cat["providers_count"] = await db.provider_profiles.count_documents({"is_active": True, "category_id": cat["category_id"]})
        items.sort(key=lambda x: -x.get("providers_count", 0))
        out.append({"sector": sector_key, "label": sector_label, "color": SECTOR_COLORS.get(sector_key, "#2F9D94"), "categories": items})
    return {"sectors": out}


@api_router.get("/seo/city/{city_slug}")
async def seo_city_detail(city_slug: str):
    """Return categories available in a given city + count per category."""
    city = next((c for c in SEO_CITIES if c["slug"] == city_slug), None)
    if not city:
        raise HTTPException(status_code=404, detail="City not found")
    pipeline = [
        {"$match": {"is_active": True, "city": {"$regex": f"^{city['name']}$", "$options": "i"}, "is_test": {"$ne": True}}},
        {"$group": {"_id": "$category_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    agg = await db.provider_profiles.aggregate(pipeline).to_list(500)
    cat_ids = [a["_id"] for a in agg if a["_id"]]
    cats = await db.categories.find({"category_id": {"$in": cat_ids}}, {"_id": 0}).to_list(500)
    cat_map = {c["category_id"]: c for c in cats}
    items = []
    for a in agg:
        c = cat_map.get(a["_id"])
        if c:
            items.append({**c, "providers_count": a["count"]})
    return {"city": city, "categories": items, "total_providers": sum(a["count"] for a in agg)}


@api_router.get("/seo/category/{category_slug}")
async def seo_category_detail(category_slug: str):
    """Return cities where a given category has providers."""
    cat = await db.categories.find_one({"slug": category_slug}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    items = []
    for c in SEO_CITIES:
        count = await db.provider_profiles.count_documents({"is_active": True, "category_id": cat["category_id"], "city": {"$regex": f"^{c['name']}$", "$options": "i"}, **PUBLIC_GUARD})
        if count > 0:
            items.append({**c, "providers_count": count})
    items.sort(key=lambda x: -x["providers_count"])
    return {"category": cat, "cities": items, "total_cities": len(items)}


@api_router.get("/seo/page/{category_slug}/{city_slug}")
async def seo_page_data(category_slug: str, city_slug: str):
    """All data needed by the SEO landing page /servicios/{cat}/{city}."""
    cat = await db.categories.find_one({"slug": category_slug}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    city = next((c for c in SEO_CITIES if c["slug"] == city_slug), None)
    if not city:
        raise HTTPException(status_code=404, detail="City not found")
    providers = await db.provider_profiles.find(
        {"is_active": True, "category_id": cat["category_id"], "city": {"$regex": f"^{city['name']}$", "$options": "i"}, **PUBLIC_GUARD},
        {"_id": 0}
    ).limit(12).to_list(12)
    PLAN_RANK = {"premium": 0, "pro": 1, "basic": 2, "free": 3}
    providers.sort(key=lambda p: (-p.get("rating_count", 0), PLAN_RANK.get(p.get("plan", "free"), 9)))
    # related: same category in other cities (top 4) + other categories in same city (top 4)
    related_cities = []
    for c in SEO_CITIES:
        if c["slug"] == city_slug:
            continue
        cnt = await db.provider_profiles.count_documents({"is_active": True, "category_id": cat["category_id"], "city": {"$regex": f"^{c['name']}$", "$options": "i"}})
        related_cities.append({**c, "count": cnt})
    related_cities.sort(key=lambda x: -x["count"])
    related_cities = [c for c in related_cities if c["count"] > 0][:4] or [{**c, "count": 0} for c in SEO_CITIES if c["slug"] != city_slug][:4]
    # related categories
    same_sector_cats = await db.categories.find({"sector": cat.get("sector"), "slug": {"$ne": cat["slug"]}}, {"_id": 0}).limit(4).to_list(4)
    return {
        "category": cat,
        "city": city,
        "providers": providers,
        "related_cities": related_cities,
        "related_categories": same_sector_cats,
    }


# ============ SITEMAP.XML + ROBOTS.TXT ============
from fastapi.responses import PlainTextResponse, Response

@app.get("/api/sitemap.xml")
async def sitemap():
    base = "https://getamano.us"
    urls = [
        f"<url><loc>{base}/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>",
        f"<url><loc>{base}/servicios</loc><priority>0.9</priority><changefreq>weekly</changefreq></url>",
        f"<url><loc>{base}/ciudades</loc><priority>0.9</priority><changefreq>weekly</changefreq></url>",
        f"<url><loc>{base}/plans</loc><priority>0.8</priority><changefreq>monthly</changefreq></url>",
        f"<url><loc>{base}/comunidad</loc><priority>0.8</priority><changefreq>weekly</changefreq></url>",
        f"<url><loc>{base}/instalar</loc><priority>0.7</priority><changefreq>monthly</changefreq></url>",
        f"<url><loc>{base}/terminos</loc><priority>0.3</priority><changefreq>monthly</changefreq></url>",
        f"<url><loc>{base}/privacidad</loc><priority>0.3</priority><changefreq>monthly</changefreq></url>",
    ]
    # SECTION 22 SEO category hubs — Spanish + English routes both index
    SEO_CATEGORY_SLUGS = [
        "cleaning", "catering", "construction", "handyman", "auto", "beauty",
        "moving", "legal", "landscaping", "events", "tutoring", "health",
    ]
    for slug in SEO_CATEGORY_SLUGS:
        urls.append(f"<url><loc>{base}/categoria/{slug}</loc><priority>0.9</priority><changefreq>weekly</changefreq></url>")
        urls.append(f"<url><loc>{base}/category/{slug}</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>")
    cats = await db.categories.find({}, {"_id": 0, "slug": 1}).to_list(500)
    for cat in cats:
        urls.append(f"<url><loc>{base}/servicios/{cat['slug']}</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>")
        for city in SEO_CITIES:
            urls.append(f"<url><loc>{base}/servicios/{cat['slug']}/{city['slug']}</loc><priority>0.8</priority><changefreq>weekly</changefreq></url>")
    for city in SEO_CITIES:
        urls.append(f"<url><loc>{base}/ciudades/{city['slug']}</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>")
    providers = await db.provider_profiles.find({"is_active": True, **PUBLIC_GUARD}, {"_id": 0, "slug": 1}).to_list(2000)
    for p in providers:
        if p.get("slug"):
            urls.append(f"<url><loc>{base}/proveedor/{p['slug']}</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>"
    return Response(content=xml, media_type="application/xml")


@app.get("/api/robots.txt", response_class=PlainTextResponse)
async def robots():
    return """User-agent: *
Allow: /
Allow: /servicios/
Allow: /ciudades/
Allow: /proveedor/
Disallow: /dashboard/
Disallow: /admin/
Disallow: /api/
Disallow: /login
Disallow: /register

Sitemap: https://getamano.us/sitemap.xml
"""


# ============ SEO CONTENT AI (cached per cat × city) ============
@api_router.get("/seo/content/{category_slug}/{city_slug}")
async def get_seo_content(category_slug: str, city_slug: str):
    """Returns AI-generated unique 100-word paragraph for a (cat, city) page.
    Cached in `seo_content_cache` collection; generates lazily on first request."""
    cached = await db.seo_content_cache.find_one({"cat_slug": category_slug, "city_slug": city_slug}, {"_id": 0})
    if cached and cached.get("content"):
        return {"content": cached["content"], "generated_at": cached.get("generated_at"), "cached": True}

    cat = await db.categories.find_one({"slug": category_slug}, {"_id": 0})
    city = next((c for c in SEO_CITIES if c["slug"] == city_slug), None)
    if not cat or not city:
        raise HTTPException(status_code=404, detail="Not found")

    prompt = (
        f"Eres un copywriter latino para getamano, marketplace que conecta a latinos en USA con proveedores latinos verificados. "
        f"Escribe UN ÚNICO PÁRRAFO de 90-110 palabras en español neutro sobre buscar servicios de '{cat['name_es']}' en {city['name']}, {city['state']}. "
        f"Tono cálido, profesional, útil. Menciona que getamano conecta con proveedores latinos verificados. "
        f"NO listas, NO emojis, NO títulos. NO inventes datos numéricos (precios, cantidades). "
        f"Termina con un llamado sutil a explorar la lista o pedir cotización. NO menciones competidores."
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"seo_{category_slug}_{city_slug}",
            system_message="Eres un copywriter SEO bilingüe para la comunidad latina en USA."
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        content = (await chat.send_message(UserMessage(text=prompt))).strip()
        if not content:
            raise ValueError("Empty response")
        doc = {
            "cat_slug": category_slug,
            "city_slug": city_slug,
            "content": content,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.seo_content_cache.update_one(
            {"cat_slug": category_slug, "city_slug": city_slug},
            {"$set": doc},
            upsert=True,
        )
        return {"content": content, "generated_at": doc["generated_at"], "cached": False}
    except Exception as e:
        logger.warning(f"SEO AI content gen failed for {category_slug}/{city_slug}: {e}")
        fallback = (
            f"En getamano encontrarás proveedores latinos verificados de {cat['name_es'].lower()} "
            f"en {city['name']}, {city['state']}. Compara reseñas reales, solicita cotización gratis en español, "
            f"y contrata con confianza. Apoya a la comunidad mientras resuelves lo que necesitas."
        )
        return {"content": fallback, "generated_at": datetime.now(timezone.utc).isoformat(), "cached": False, "fallback": True}


# ============ REPORTS (Sprint 2 — bidirectional safety) ============
@api_router.get("/reports/reasons")
async def report_reasons():
    return {
        "client_to_provider": [{"key": k, "label": v} for k, v in REPORT_REASONS_CLIENT_TO_PROVIDER.items()],
        "provider_to_client": [{"key": k, "label": v} for k, v in REPORT_REASONS_PROVIDER_TO_CLIENT.items()],
    }


@api_router.post("/reports")
async def create_report(payload: ReportIn, user: User = Depends(get_current_user)):
    if user.user_id == payload.target_id:
        raise HTTPException(status_code=400, detail="Cannot report yourself")
    target = await db.users.find_one({"user_id": payload.target_id}, {"_id": 0, "user_id": 1, "role": 1, "name": 1, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")
    if user.role == "client":
        valid_reasons = REPORT_REASONS_CLIENT_TO_PROVIDER
    elif user.role == "provider":
        valid_reasons = REPORT_REASONS_PROVIDER_TO_CLIENT
    else:
        raise HTTPException(status_code=403, detail="Only clients and providers can report")
    if payload.reason not in valid_reasons:
        raise HTTPException(status_code=400, detail="Invalid reason for your role")
    evidence = (payload.evidence_urls or [])[:3]
    doc = {
        "report_id": f"rep_{uuid.uuid4().hex[:12]}",
        "reporter_id": user.user_id,
        "reporter_role": user.role,
        "reporter_name": user.name,
        "reporter_email": user.email,
        "target_id": payload.target_id,
        "target_role": payload.target_role,
        "target_name": target.get("name"),
        "target_email": target.get("email"),
        "reason": payload.reason,
        "reason_label": valid_reasons[payload.reason],
        "description": payload.description.strip()[:2000],
        "evidence_urls": evidence,
        "related_quote_request_id": payload.related_quote_request_id,
        "related_provider_slug": payload.related_provider_slug,
        "status": "pending",
        "admin_notes": "",
        "action_taken": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reports.insert_one(doc)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    recent_count = await db.reports.count_documents({"target_id": payload.target_id, "created_at": {"$gte": cutoff}})
    if recent_count >= 3:
        await db.users.update_one(
            {"user_id": payload.target_id},
            {"$set": {"flagged_by_reports": True, "flagged_count": recent_count, "flagged_at": datetime.now(timezone.utc).isoformat()}},
        )
    doc.pop("_id", None)
    return doc


@api_router.get("/reports/mine")
async def list_my_reports(user: User = Depends(get_current_user)):
    items = await db.reports.find({"reporter_id": user.user_id}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"items": items, "total": len(items)}


@api_router.get("/admin/reports")
async def admin_list_reports(
    status: Optional[Literal["pending", "resolved", "dismissed"]] = None,
    reporter_role: Optional[Literal["client", "provider"]] = None,
    target_role: Optional[Literal["client", "provider"]] = None,
    user: User = Depends(require_admin),
):
    query: dict = {}
    if status:
        query["status"] = status
    if reporter_role:
        query["reporter_role"] = reporter_role
    if target_role:
        query["target_role"] = target_role
    items = await db.reports.find(query, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    pending = await db.reports.count_documents({"status": "pending"})
    total_90d = await db.reports.count_documents({"created_at": {"$gte": cutoff}})
    flagged_users = await db.users.count_documents({"flagged_by_reports": True})
    return {"items": items, "total": len(items), "pending": pending, "total_90d": total_90d, "flagged_users": flagged_users}


@api_router.put("/admin/reports/{report_id}")
async def admin_action_on_report(report_id: str, payload: ReportActionIn, user: User = Depends(require_admin)):
    rep = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found")
    update = {
        "status": "dismissed" if payload.action == "dismiss" else "resolved",
        "action_taken": payload.action,
        "admin_notes": (payload.admin_notes or "").strip()[:1000],
        "resolved_by_admin_id": user.user_id,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reports.update_one({"report_id": report_id}, {"$set": update})
    target_id = rep.get("target_id")
    target_role = rep.get("target_role")
    if payload.action == "warn":
        await db.users.update_one({"user_id": target_id}, {"$inc": {"warnings_count": 1}, "$set": {"last_warning_at": datetime.now(timezone.utc).isoformat()}})
    elif payload.action == "suspend":
        await db.users.update_one({"user_id": target_id}, {"$set": {"is_suspended": True, "suspended_at": datetime.now(timezone.utc).isoformat()}})
        if target_role == "provider":
            await db.provider_profiles.update_one({"user_id": target_id}, {"$set": {"is_active": False}})
    elif payload.action == "delete":
        await db.users.update_one({"user_id": target_id}, {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat(), "is_suspended": True}})
        if target_role == "provider":
            await db.provider_profiles.update_one({"user_id": target_id}, {"$set": {"is_active": False}})
    return {"ok": True, "action": payload.action, "report_id": report_id}



# === GEOCODING (Nominatim OpenStreetMap — free, no API key) ===
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
GEOCODE_USER_AGENT = "getamano-marketplace/1.0 (hola@getamano.us)"
_GEOCODE_MEMO: dict = {}  # in-process cache key -> (lat, lng)


async def _geocode_address(address: Optional[str], city: Optional[str], state: Optional[str], zip_code: Optional[str], country: str = "US") -> Optional[dict]:
    """Geocode using Nominatim. Returns {lat, lng} or None. Cached in-memory and persisted to provider doc upstream."""
    parts = [p for p in [address, city, state, zip_code, country] if p]
    if not parts:
        return None
    key = ", ".join(str(p).strip() for p in parts).lower()
    if key in _GEOCODE_MEMO:
        return _GEOCODE_MEMO[key]
    try:
        async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": GEOCODE_USER_AGENT}) as client:
            r = await client.get(NOMINATIM_URL, params={"q": ", ".join(parts), "format": "json", "limit": 1, "countrycodes": "us"})
            if r.status_code != 200:
                _GEOCODE_MEMO[key] = None
                return None
            data = r.json()
            if not data:
                _GEOCODE_MEMO[key] = None
                return None
            result = {"lat": float(data[0]["lat"]), "lng": float(data[0]["lon"])}
            _GEOCODE_MEMO[key] = result
            return result
    except Exception as e:
        logger.warning(f"Geocode error for {key}: {e}")
        _GEOCODE_MEMO[key] = None
        return None


@api_router.get("/providers/map")
async def providers_map(
    q: Optional[str] = None,
    category: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    verified: Optional[bool] = None,
    language: Optional[str] = None,
    owner_identity: Optional[Literal["latino", "american"]] = None,
    country: Optional[str] = DEFAULT_COUNTRY,
    has_video: Optional[bool] = None,
    limit: int = 60,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
):
    """Returns active providers with lat/lng for map display. Geocodes missing ones at most 5 per request
    (rate-limit safety) and persists them. Supports optional bounding-box filtering for the
    'Buscar en esta zona' feature — when bbox is supplied, only providers with stored coords inside
    the box are returned (no geocoding triggered). City/state/zip filters still apply."""
    query = {"is_active": True, **PUBLIC_GUARD}
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
    if owner_identity:
        query["owner_identity"] = owner_identity
    if has_video:
        query["video_url"] = {"$exists": True, "$ne": ""}
    if q:
        query["$or"] = [
            {"business_name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"services": {"$regex": q, "$options": "i"}},
        ]
    bbox_mode = all(v is not None for v in [min_lat, max_lat, min_lng, max_lng])
    if bbox_mode:
        query["latitude"] = {"$gte": min_lat, "$lte": max_lat}
        query["longitude"] = {"$gte": min_lng, "$lte": max_lng}

    providers = await db.provider_profiles.find(query, {"_id": 0}).limit(limit).to_list(limit)

    items = []
    geocoded_this_call = 0
    MAX_GEOCODE_PER_CALL = 5
    for p in providers:
        lat = p.get("latitude")
        lng = p.get("longitude")
        # Skip if explicitly marked as un-geocodable
        if p.get("geocode_failed") is True:
            continue
        # When bbox is supplied, never geocode — items must already have stored coords
        if not bbox_mode and (lat is None or lng is None) and geocoded_this_call < MAX_GEOCODE_PER_CALL:
            # Only attempt if we have city or zip
            if not (p.get("city") or p.get("zip_code") or p.get("address")):
                await db.provider_profiles.update_one(
                    {"provider_id": p["provider_id"]},
                    {"$set": {"geocode_failed": True}}
                )
                continue
            geo = await _geocode_address(p.get("address"), p.get("city"), p.get("state"), p.get("zip_code"), country or "US")
            geocoded_this_call += 1
            if geo:
                lat = geo["lat"]
                lng = geo["lng"]
                await db.provider_profiles.update_one(
                    {"provider_id": p["provider_id"]},
                    {"$set": {"latitude": lat, "longitude": lng}}
                )
            else:
                await db.provider_profiles.update_one(
                    {"provider_id": p["provider_id"]},
                    {"$set": {"geocode_failed": True}}
                )
                continue
        if lat is None or lng is None:
            continue
        items.append({
            "provider_id": p["provider_id"],
            "slug": p.get("slug"),
            "business_name": p.get("business_name"),
            "city": p.get("city"),
            "state": p.get("state"),
            "category_id": p.get("category_id"),
            "owner_identity": p.get("owner_identity"),
            "verified": p.get("verification_status") == "approved",
            "rating_avg": p.get("rating_avg", 0),
            "rating_count": p.get("rating_count", 0),
            "logo_url": p.get("logo_url"),
            "cover_url": p.get("cover_url"),
            "video_url": p.get("video_url"),
            "lat": lat,
            "lng": lng,
        })
    return {"items": items, "geocoded_this_call": geocoded_this_call, "total_with_coords": len(items), "total_matched": len(providers)}

@api_router.get("/providers/featured")
async def featured_providers():
    providers = await db.provider_profiles.find(
        {"is_active": True, "verification_status": "approved", **PUBLIC_GUARD}, {"_id": 0}
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
    # reviews (exclude hidden — see /app/backend/scripts/cleanup_test_providers.py)
    reviews = await db.reviews.find(
        {"provider_id": p["provider_id"], "is_hidden": {"$ne": True}},
        {"_id": 0, "paid_amount_range": 0},
    ).sort("created_at", -1).limit(20).to_list(20)
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
    # SECTION 23 — input validation to prevent test/junk data from polluting public stats.
    name = (payload.business_name or "").strip()
    if len(name) < 3:
        raise HTTPException(status_code=400, detail="El nombre del negocio debe tener al menos 3 caracteres.")
    if re.search(r"\b(test|qa|prueba|asdf|xxxx)\b", name.lower()) or "test_" in name.lower():
        raise HTTPException(status_code=400, detail="Nombre del negocio no válido. Usa el nombre real de tu empresa.")
    if name == name.lower() and len(name) <= 8 and len(name.split()) <= 2:
        raise HTTPException(status_code=400, detail="Escribe el nombre completo de tu negocio con mayúsculas iniciales.")
    desc = (payload.description or "").strip()
    if desc and len(desc) < 20:
        raise HTTPException(status_code=400, detail="La descripción debe tener al menos 20 caracteres. Cuéntale al cliente qué haces.")
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
         "features_es": ["eCard básica con enlace único", "1 categoría de servicio", "Hasta 20 fotos en tu galería", "Analytics básicos", "Formulario de contacto"],
         "features_en": ["Basic eCard with unique link", "1 service category", "Up to 20 photos in your gallery", "Basic analytics", "Contact form"]},
        {"id": "basic", "name": "Básico", "name_en": "Basic", "price_monthly": 10,
         "badge": "Básico", "badge_color": "#94a3b8", "highlight": False,
         "features_es": ["Todo lo de Gratis +", "Hasta 3 categorías", "Fotos ilimitadas en tu galería", "Analytics mejorados", "Responder reseñas", "1 boost mensual de visibilidad"],
         "features_en": ["Everything in Free +", "Up to 3 categories", "Unlimited gallery photos", "Enhanced analytics", "Respond to reviews", "1 visibility boost/month"]},
        {"id": "pro", "name": "Pro", "name_en": "Pro", "price_monthly": 15,
         "badge": "Pro", "badge_color": "#F97316", "highlight": True, "label": "Más popular",
         "features_es": ["Todo lo de Básico +", "Hasta 5 categorías", "Fotos ilimitadas + 1 video de presentación", "Mejor posición en búsquedas", "Notificaciones en tiempo real", "Botón WhatsApp directo", "3 boosts mensuales", "Soporte prioritario"],
         "features_en": ["Everything in Basic +", "Up to 5 categories", "Unlimited photos + 1 presentation video", "Better search ranking", "Real-time notifications", "Direct WhatsApp button", "3 visibility boosts/month", "Priority support"]},
        {"id": "premium", "name": "Premium", "name_en": "Premium", "price_monthly": 25,
         "badge": "Premium", "badge_color": "#D97706", "highlight": False, "label": "Mejor valor",
         "features_es": ["Todo lo de Pro +", "Categorías ilimitadas", "Fotos ilimitadas + 1 video de presentación", "Posición TOP en búsquedas", "Aparece en homepage", "Campañas mensuales", "QR personalizado descargable", "eCard premium con branding", "Reportes avanzados", "5 boosts mensuales"],
         "features_en": ["Everything in Pro +", "Unlimited categories", "Unlimited photos + 1 presentation video", "TOP search position", "Featured on homepage", "Monthly campaigns", "Downloadable custom QR", "Premium eCard", "Advanced reports", "5 visibility boosts/month"]},
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
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/avi"}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB images
MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200 MB videos
GALLERY_COMPRESS_MAX_WIDTH = 1200
GALLERY_COMPRESS_QUALITY = 85

# Plan-based photo limits. None = unlimited.
PLAN_PHOTO_LIMITS = {"free": 20, "basic": None, "pro": None, "premium": None}
# Plans that may upload a presentation video
VIDEO_ALLOWED_PLANS = {"pro", "premium"}

PHOTO_CATEGORY_LABELS = {
    "trabajo_terminado": "Trabajo terminado",
    "antes_despues": "Antes y después",
    "equipo": "Mi equipo",
    "herramientas": "Mis herramientas",
    "negocio": "Mi negocio / local",
    "otro": "Otro",
}


def _compress_image_bytes(data: bytes, content_type: str) -> tuple[bytes, str]:
    """Resize to GALLERY_COMPRESS_MAX_WIDTH (keep aspect) and re-encode JPEG q=85.
    Returns (new_bytes, new_content_type). GIFs and transparent PNGs are passed through unchanged.
    """
    try:
        from PIL import Image, ImageOps
        try:
            from pillow_heif import register_heif_opener  # noqa: WPS433
            register_heif_opener()
        except Exception:
            pass
        import io as _io
        # GIFs may be animated; do not re-encode
        if content_type == "image/gif":
            return data, content_type
        img = Image.open(_io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        # Preserve transparency for PNG/WebP if alpha present
        has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
        if img.width > GALLERY_COMPRESS_MAX_WIDTH:
            ratio = GALLERY_COMPRESS_MAX_WIDTH / float(img.width)
            new_h = int(img.height * ratio)
            img = img.resize((GALLERY_COMPRESS_MAX_WIDTH, new_h), Image.LANCZOS)
        out = _io.BytesIO()
        if has_alpha:
            img.save(out, format="PNG", optimize=True)
            return out.getvalue(), "image/png"
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(out, format="JPEG", quality=GALLERY_COMPRESS_QUALITY, optimize=True, progressive=True)
        return out.getvalue(), "image/jpeg"
    except Exception as e:
        logger.warning(f"Image compression failed, keeping original: {e}")
        return data, content_type

@api_router.post("/upload")
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Solo imágenes (jpg/png/webp/gif/heic)")
    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="El archivo supera 10 MB")
    # Auto-compress images to reduce storage + speed up page load
    data, content_type = _compress_image_bytes(data, content_type)
    # File extension follows the (possibly transcoded) content type
    ext = content_type.split("/")[-1]
    if ext == "jpeg":
        ext = "jpg"
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
@api_router.get("/providers/me/gallery/limit")
async def my_gallery_limit(user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "gallery": 1, "plan": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    plan = prof.get("plan") or "free"
    max_photos = PLAN_PHOTO_LIMITS.get(plan, PLAN_PHOTO_LIMITS["free"])
    used = len(prof.get("gallery") or [])
    return {
        "plan": plan,
        "used": used,
        "max": max_photos,  # None = unlimited
        "can_upload": (max_photos is None) or (used < max_photos),
        "remaining": (None if max_photos is None else max(0, max_photos - used)),
    }

@api_router.post("/providers/me/gallery")
async def add_gallery_item(payload: GalleryItemIn, user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    plan = prof.get("plan") or "free"
    max_photos = PLAN_PHOTO_LIMITS.get(plan, PLAN_PHOTO_LIMITS["free"])
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

@api_router.put("/providers/me/gallery/reorder")
async def reorder_gallery(payload: GalleryReorderIn, user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "gallery": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    current = prof.get("gallery") or []
    by_id = {g["id"]: g for g in current}
    # Reorder: items in payload.order first (deduped, only valid ids), then any leftovers preserving original order
    seen = set()
    ordered = []
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

@api_router.put("/providers/me/gallery/{item_id}/category")
async def set_gallery_category(item_id: str, payload: GalleryCategoryIn, user: User = Depends(get_current_user)):
    res = await db.provider_profiles.update_one(
        {"user_id": user.user_id, "gallery.id": item_id},
        {"$set": {"gallery.$.category": payload.category}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    return {"ok": True, "category": payload.category}

@api_router.delete("/providers/me/gallery/{item_id}")
async def remove_gallery_item(item_id: str, user: User = Depends(get_current_user)):
    await db.provider_profiles.update_one(
        {"user_id": user.user_id}, {"$pull": {"gallery": {"id": item_id}}}
    )
    return {"ok": True}

@api_router.get("/gallery/photo-categories")
async def list_photo_categories():
    """Public list of photo categories used to tag/filter gallery photos."""
    return [{"key": k, "label": v} for k, v in PHOTO_CATEGORY_LABELS.items()]

# ============ PROVIDER VIDEO (Pro / Premium only) ============
@api_router.post("/providers/me/video")
async def upload_provider_video(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "plan": 1, "video_url": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    plan = (prof.get("plan") or "free").lower()
    if plan not in VIDEO_ALLOWED_PLANS:
        raise HTTPException(status_code=403, detail="El video de presentación está disponible en los planes Pro y Premium.")
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa MP4, MOV o AVI.")
    data = await file.read()
    if len(data) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=400, detail="El video supera 200 MB.")
    ext_map = {"video/mp4": "mp4", "video/quicktime": "mov", "video/x-msvideo": "avi", "video/avi": "avi"}
    ext = ext_map.get(content_type, "mp4")
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/videos/{user.user_id}/{file_id}.{ext}"
    try:
        result = put_object(path, data, content_type)
    except Exception as e:
        logger.exception("Video upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
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

@api_router.delete("/providers/me/video")
async def delete_provider_video(user: User = Depends(get_current_user)):
    res = await db.provider_profiles.update_one(
        {"user_id": user.user_id},
        {"$unset": {"video_url": "", "video_content_type": "", "video_uploaded_at": ""}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="No provider profile")
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
        c["my_role"] = "provider" if c.get("provider_user_id") == user.user_id else "client"
        if c["my_role"] == "provider":
            c["unread"] = c.get("unread_for_provider", 0) or c.get("unread_count_provider", 0) or 0
        else:
            c["unread"] = c.get("unread_for_client", 0) or c.get("unread_count_participant", 0) or 0
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
        {"founding_member": True, "founding_member_at": {"$ne": None}, "is_test": {"$ne": True}},
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
    # SOURCE OF TRUTH: Free $0 / Basic $10 / Pro $15 / Premium $25 (matches /api/plans).
    PLAN_PRICES = {"free": 0, "basic": 10, "pro": 15, "premium": 25}
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

    # Revenue (SOURCE OF TRUTH: matches /api/plans)
    PLAN_PRICES = {"free": 0, "basic": 10, "pro": 15, "premium": 25}
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
                "why": f"Tienes {free_count} proveedores en Free. Con conversión 10% al plan Pro ganarías ~${free_count * 0.1 * 15:.0f}/mes.",
                "action": "Lanza una campaña con beneficios Pro vs Free + descuento founding mientras queden cupos.",
                "priority": "medium",
                "icon": "dollar",
                "impact_estimate": f"+${int(free_count * 0.1 * 15)}/mes",
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
    # BUG-05: real stats with TEST data excluded
    base_q = {"verification_status": "approved", "is_active": True, **PUBLIC_GUARD}
    total = await db.provider_profiles.count_documents(base_q)
    registered_total = await db.provider_profiles.count_documents({"is_active": True, **PUBLIC_GUARD})
    states = await db.provider_profiles.distinct("state", {"is_active": True, **PUBLIC_GUARD})
    avg_doc = await db.provider_profiles.aggregate([
        {"$match": {"rating_count": {"$gt": 0}, "is_test": {"$ne": True}}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating_avg"}}}
    ]).to_list(1)
    avg = round(avg_doc[0]["avg"], 1) if avg_doc else 4.9
    # Until 'approved' count reaches critical mass, show 'registered'.
    label_key = "verified" if total >= 25 else "registered"
    return {
        "providers": total if total >= 25 else registered_total,
        "providers_label": label_key,
        "states": len([s for s in states if s]),
        "rating": avg,
    }

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
            "body": "Plan Pro: prioridad en búsquedas, badge destacado, sin límite de fotos. $15/mes (o gratis hasta 2027 si te haces Founding).",
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


# ════════════════════════════════════════════════════════════════════
# SECTIONS 13–16 — Comunicación, Calendario, Licencia, Escala
# All additions live below to avoid touching the historic core (line numbers stay stable for refs)
# ════════════════════════════════════════════════════════════════════

import secrets as _secrets

def _gen_ref_code() -> str:
    """Generate a 6-char uppercase alphanumeric referral code."""
    alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # excluded I,O,0,1 for clarity
    return "".join(_secrets.choice(alpha) for _ in range(6))


async def enqueue_notification(*, recipient_phone: str = "", recipient_email: str = "",
                                channel: str = "sms", body: str = "", subject: str = "",
                                trigger_type: str = "generic") -> dict:
    """Producer for the notification queue. Always inserts a row regardless of
    Twilio credentials presence. When `send_sms` is called and successful it also
    marks the queue row as `sent`; otherwise the row stays `pending` and a future
    cron worker will retry once Twilio is active."""
    row = {
        "queue_id": f"notif_{uuid.uuid4().hex[:14]}",
        "recipient_phone": (recipient_phone or "").strip(),
        "recipient_email": (recipient_email or "").strip(),
        "channel": channel,
        "body": body[:600],
        "subject": subject[:200],
        "trigger_type": trigger_type,
        "status": "pending",
        "attempts": 0,
        "last_attempt": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notification_queue.insert_one(dict(row))
    row.pop("_id", None)
    return row


# ─── SECTION 15 — Licencia de oficio (opcional, autodeclarada) ────────────
class LicenseIn(BaseModel):
    has_license: Literal["yes", "no", "prefer_not_to_say"] = "prefer_not_to_say"
    license_type: Optional[str] = None
    license_number: Optional[str] = None  # full number stored server-side; only last 4 shown publicly
    license_state: Optional[str] = None
    license_expires_year: Optional[int] = None

LICENSE_TYPES = [
    "Contratista General", "Electricista", "Plomero", "Techador (Roofer)",
    "HVAC / Aire Acondicionado", "Pest Control", "Cosmetólogo / Barbero",
    "Chofer Comercial (CDL)", "Cuidado de Niños / Childcare",
    "Enfermería / Cuidado de Adultos", "Otra licencia profesional",
]

@api_router.get("/license/types")
async def list_license_types():
    return [{"key": t, "label": t} for t in LICENSE_TYPES]

@api_router.put("/providers/me/license")
async def upsert_license(payload: LicenseIn, user: User = Depends(get_current_user)):
    upd = {
        "license": {
            "has_license": payload.has_license,
            "license_type": payload.license_type,
            "license_number": payload.license_number,
            "license_state": payload.license_state,
            "license_expires_year": payload.license_expires_year,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    }
    res = await db.provider_profiles.update_one({"user_id": user.user_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="No provider profile")
    return {"ok": True, "license": upd["license"]}


# ─── SECTION 16A — Profile completion score ──────────────────────────────
def _completion_for(profile: dict) -> dict:
    """Compute the 0–100 completion score with per-section breakdown."""
    rules = [
        ("logo_url", "Foto de perfil", 10, "/dashboard/provider?tab=perfil"),
        ("description", "Descripción del negocio", 15, "/dashboard/provider?tab=perfil"),
        ("category_id", "Categoría de servicio", 10, "/dashboard/provider?tab=perfil"),
        ("service_areas", "Zonas de cobertura", 10, "/dashboard/provider?tab=perfil"),
        ("phone", "Número de teléfono", 10, "/dashboard/provider?tab=perfil"),
        ("hours", "Horario de atención", 10, "/dashboard/provider?tab=perfil"),
        ("gallery", "Foto en galería", 10, "/dashboard/provider?tab=galeria"),
        ("rates", "Tarifa registrada", 10, "/dashboard/provider?tab=tarifas"),
        ("calendar_active", "Calendario activo", 10, "/dashboard/provider?tab=calendario"),
        ("rating_count", "Primera reseña", 5, "/dashboard/provider?tab=resenas"),
    ]
    score = 0
    missing = []
    for field, label, pts, deep in rules:
        v = profile.get(field)
        ok = False
        if field == "gallery":
            ok = bool(v and len(v) > 0)
        elif field == "service_areas":
            ok = bool(v and len(v) > 0)
        elif field == "rates":
            # rates are in a separate document — caller injects if present
            ok = bool(profile.get("_has_rates"))
        elif field == "calendar_active":
            ok = bool(profile.get("calendar_active"))
        elif field == "rating_count":
            ok = (v or 0) > 0
        else:
            ok = bool(v) and (not isinstance(v, str) or v.strip())
        if ok:
            score += pts
        else:
            missing.append({"label": label, "points": pts, "deep_link": deep})
    return {"score": score, "missing": missing}


@api_router.get("/providers/me/completion")
async def my_completion(user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    has_rates = await db.provider_rates.count_documents({"provider_id": prof.get("provider_id")}) > 0
    prof["_has_rates"] = has_rates
    return _completion_for(prof)


# ─── SECTION 16B — Engagement badges ─────────────────────────────────────
async def _badges_for_provider(provider_id: str, user_id: str = "") -> list[dict]:
    """Compute live badges. Cheap enough to call per provider in listing endpoints.
    Cache-friendly: badges depend only on relative timestamps and counts."""
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()
    badges: list[dict] = []
    # Activo esta semana: provider sent at least one message OR logged in within 7d
    last_active = await db.sessions.find_one(
        {"user_id": user_id, "created_at": {"$gte": week_ago}},
        {"_id": 0}, sort=[("created_at", -1)],
    ) if user_id else None
    if last_active:
        badges.append({"key": "active_week", "label": "Activo esta semana", "icon": "🟢"})
    # Responde rápido: avg response time under 2h (last 30d)
    pipeline = [
        {"$match": {"provider_id": provider_id, "response_time_seconds": {"$gt": 0},
                    "created_at": {"$gte": month_ago}}},
        {"$group": {"_id": None, "avg": {"$avg": "$response_time_seconds"}, "n": {"$sum": 1}}},
    ]
    cur = db.quote_requests.aggregate(pipeline)
    docs = [d async for d in cur]
    if docs and docs[0].get("n", 0) >= 3 and (docs[0].get("avg") or 99999) < 7200:
        badges.append({"key": "fast_responder", "label": "Responde rápido", "icon": "⚡"})
    # Muy solicitado: 5+ contact requests in last 30d (quote requests or messages)
    qcount = await db.quote_requests.count_documents({"provider_id": provider_id, "created_at": {"$gte": month_ago}})
    if qcount >= 5:
        badges.append({"key": "in_demand", "label": "Muy solicitado", "icon": "🔥"})
    return badges


@api_router.get("/providers/{provider_id}/badges")
async def get_provider_badges(provider_id: str):
    prof = await db.provider_profiles.find_one({"provider_id": provider_id}, {"_id": 0, "user_id": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="Provider not found")
    return await _badges_for_provider(provider_id, prof.get("user_id", ""))


# ─── SECTION 16C — Referrals ─────────────────────────────────────────────
@api_router.get("/providers/me/referrals")
async def my_referrals(user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    # Ensure ref_code exists (backfill on demand)
    ref_code = prof.get("ref_code")
    if not ref_code:
        # generate a unique one
        for _ in range(8):
            cand = _gen_ref_code()
            existing = await db.provider_profiles.find_one({"ref_code": cand}, {"_id": 0, "user_id": 1})
            if not existing:
                ref_code = cand
                break
        await db.provider_profiles.update_one({"user_id": user.user_id}, {"$set": {"ref_code": ref_code}})
    referrals = await db.referrals.find({"referrer_user_id": user.user_id}, {"_id": 0}).to_list(200)
    paid = sum(1 for r in referrals if r.get("status") in {"paid", "credited"})
    credited_months = sum(1 for r in referrals if r.get("status") == "credited")
    return {
        "ref_code": ref_code,
        "share_url": f"/registro?ref={ref_code}",
        "total_referred": len(referrals),
        "total_paid": paid,
        "credited_months": credited_months,
        "items": referrals,
    }


async def _track_referral_signup(referred_user_id: str, ref_code: str) -> None:
    """Call this on /auth/register when the request includes ?ref=CODE."""
    if not ref_code:
        return
    ref_code = ref_code.strip().upper()
    if not ref_code or len(ref_code) != 6:
        return
    referrer = await db.provider_profiles.find_one({"ref_code": ref_code}, {"_id": 0, "user_id": 1})
    if not referrer:
        return
    if referrer["user_id"] == referred_user_id:  # self-referral guard
        return
    # Idempotency
    exists = await db.referrals.find_one({"referred_user_id": referred_user_id}, {"_id": 0})
    if exists:
        return
    await db.referrals.insert_one({
        "referral_id": f"ref_{uuid.uuid4().hex[:14]}",
        "referrer_user_id": referrer["user_id"],
        "referred_user_id": referred_user_id,
        "ref_code": ref_code,
        "status": "registered",  # → "paid" when subscription pays → "credited" when month applied
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# ─── SECTION 13G + 14E — Conversations, messages, appointments (in-app, no Realtime) ───
class ConversationStartIn(BaseModel):
    provider_id: str
    participant_name: str = Field(min_length=2, max_length=100)
    participant_phone: str = Field(min_length=7, max_length=20)
    participant_email: Optional[str] = None
    message: str = Field(min_length=2, max_length=1000)
    conversation_type: Literal["direct", "quote", "job", "appointment"] = "direct"
    reference_id: Optional[str] = None

class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    attachment_url: Optional[str] = None
    attachment_type: Optional[Literal["image", "pdf"]] = None


@api_router.post("/messaging/start")
async def messaging_start(payload: ConversationStartIn, request: Request, user: Optional[User] = Depends(get_optional_user)):
    """Anonymous OR authenticated visitor starts a conversation with a provider.
    Sends first message + enqueues a notification to the provider."""
    prof = await db.provider_profiles.find_one({"provider_id": payload.provider_id}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="Provider not found")
    conv_id = f"conv_{uuid.uuid4().hex[:14]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    conv = {
        "conversation_id": conv_id,
        "provider_id": payload.provider_id,
        "provider_user_id": prof.get("user_id"),
        "participant_user_id": user.user_id if user else None,
        "participant_name": payload.participant_name.strip(),
        "participant_phone": payload.participant_phone.strip(),
        "participant_email": (payload.participant_email or "").strip(),
        "conversation_type": payload.conversation_type,
        "reference_id": payload.reference_id,
        "unread_count_provider": 1,
        "unread_count_participant": 0,
        "last_message_at": now_iso,
        "last_message_preview": payload.message[:120],
        "created_at": now_iso,
    }
    await db.conversations.insert_one(dict(conv))
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:14]}",
        "conversation_id": conv_id,
        "sender_type": "participant",
        "sender_user_id": user.user_id if user else None,
        "sender_name": payload.participant_name.strip(),
        "body": payload.message,
        "attachment_url": None,
        "attachment_type": None,
        "is_read": False,
        "created_at": now_iso,
    }
    await db.messages.insert_one(dict(msg))
    # Notify provider via queue + best-effort SMS now
    body = f"💬 Nuevo mensaje en getamano de {payload.participant_name}: '{payload.message[:80]}'. Responde en getamano.us/dashboard/mensajes"
    await enqueue_notification(recipient_phone=prof.get("phone", ""), channel="sms",
                                body=body, trigger_type="new_message_to_provider")
    if prof.get("phone"):
        try: send_sms(prof["phone"], body, event="new_message_to_provider")
        except Exception: pass
    conv.pop("_id", None); msg.pop("_id", None)
    return {"conversation_id": conv_id, "message": msg}


@api_router.get("/messaging/conversations")
async def my_conversations(user: User = Depends(get_current_user),
                            filter: Optional[Literal["all", "unread", "quote", "job", "appointment"]] = "all",
                            search: Optional[str] = None):
    """Provider's inbox (or participant's). Returns list of conversations."""
    clauses: list[dict] = [{"$or": [{"provider_user_id": user.user_id}, {"participant_user_id": user.user_id}]}]
    if filter == "unread":
        clauses.append({"$or": [
            {"provider_user_id": user.user_id, "unread_count_provider": {"$gt": 0}},
            {"participant_user_id": user.user_id, "unread_count_participant": {"$gt": 0}},
        ]})
    elif filter in {"quote", "job", "appointment"}:
        clauses.append({"conversation_type": filter})
    if search:
        clauses.append({"$or": [
            {"participant_name": {"$regex": search, "$options": "i"}},
            {"last_message_preview": {"$regex": search, "$options": "i"}},
        ]})
    q = {"$and": clauses} if len(clauses) > 1 else clauses[0]
    items = await db.conversations.find(q, {"_id": 0}).sort("last_message_at", -1).to_list(200)
    return {"items": items, "total": len(items)}


@api_router.get("/messaging/conversations/{conversation_id}/messages")
async def get_conv_messages(conversation_id: str, user: User = Depends(get_current_user),
                             limit: int = 50, before: Optional[str] = None):
    conv = await db.conversations.find_one({"conversation_id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user.user_id not in {conv.get("provider_user_id"), conv.get("participant_user_id")}:
        raise HTTPException(status_code=403, detail="Not your conversation")
    q = {"conversation_id": conversation_id}
    if before:
        q["created_at"] = {"$lt": before}
    msgs = await db.messages.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    msgs.reverse()
    # mark as read for this side
    side = "provider" if user.user_id == conv.get("provider_user_id") else "participant"
    await db.conversations.update_one({"conversation_id": conversation_id},
                                       {"$set": {f"unread_count_{side}": 0}})
    return {"items": msgs, "conversation": conv}


@api_router.post("/messaging/conversations/{conversation_id}/messages")
async def post_message(conversation_id: str, payload: MessageIn,
                       user: User = Depends(get_current_user)):
    conv = await db.conversations.find_one({"conversation_id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user.user_id not in {conv.get("provider_user_id"), conv.get("participant_user_id")}:
        raise HTTPException(status_code=403, detail="Not your conversation")
    is_provider = user.user_id == conv.get("provider_user_id")
    sender_type = "provider" if is_provider else "participant"
    now_iso = datetime.now(timezone.utc).isoformat()
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:14]}",
        "conversation_id": conversation_id,
        "sender_type": sender_type,
        "sender_user_id": user.user_id,
        "sender_name": user.name,
        "body": payload.body,
        "attachment_url": payload.attachment_url,
        "attachment_type": payload.attachment_type,
        "is_read": False,
        "created_at": now_iso,
    }
    await db.messages.insert_one(dict(msg))
    incr_field = "unread_count_participant" if is_provider else "unread_count_provider"
    await db.conversations.update_one(
        {"conversation_id": conversation_id},
        {"$set": {"last_message_at": now_iso, "last_message_preview": payload.body[:120]},
         "$inc": {incr_field: 1}},
    )
    # Enqueue notification to the recipient
    recipient_phone = conv.get("participant_phone") if is_provider else ""
    if not is_provider:
        prof = await db.provider_profiles.find_one({"provider_id": conv.get("provider_id")}, {"_id": 0, "phone": 1})
        recipient_phone = (prof or {}).get("phone", "")
    if recipient_phone:
        body = f"💬 Nuevo mensaje en getamano de {user.name}: '{payload.body[:80]}'."
        await enqueue_notification(recipient_phone=recipient_phone, channel="sms",
                                    body=body, trigger_type="new_message")
        try: send_sms(recipient_phone, body, event="new_message")
        except Exception: pass
    msg.pop("_id", None)
    return msg


@api_router.get("/messaging/unread-count")
async def unread_count(user: User = Depends(get_current_user)):
    """Total unread across all conversations for the current user — used for the navbar badge."""
    pipeline = [
        {"$match": {"$or": [{"provider_user_id": user.user_id}, {"participant_user_id": user.user_id}]}},
        {"$project": {
            "_id": 0,
            "n": {"$cond": [{"$eq": ["$provider_user_id", user.user_id]},
                            "$unread_count_provider", "$unread_count_participant"]}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$n"}}},
    ]
    res = [d async for d in db.conversations.aggregate(pipeline)]
    return {"unread": int(res[0]["total"]) if res else 0}


# ─── Contact preferences (Sec 13D) ───────────────────────────────────────
class ContactPrefsIn(BaseModel):
    show_call: bool = True
    show_whatsapp: bool = True
    show_email: bool = False
    show_message_form: bool = True

@api_router.put("/providers/me/contact-prefs")
async def upsert_contact_prefs(payload: ContactPrefsIn, user: User = Depends(get_current_user)):
    # At least one must be enabled
    if not any([payload.show_call, payload.show_whatsapp, payload.show_email, payload.show_message_form]):
        raise HTTPException(status_code=400, detail="Debes habilitar al menos un canal de contacto.")
    upd = {"contact_prefs": payload.dict()}
    res = await db.provider_profiles.update_one({"user_id": user.user_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="No provider profile")
    return {"ok": True, "contact_prefs": upd["contact_prefs"]}


# ─── SECTION 16H — Abandoned registrations ───────────────────────────────
@api_router.get("/admin/incomplete-registrations")
async def admin_incomplete_regs(admin: User = Depends(require_admin)):
    """Providers who created their user account but have no provider_profile yet,
    OR have an empty/incomplete profile. Inserted within last 30d."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    users = await db.users.find(
        {"role": "provider", "created_at": {"$gte": cutoff}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "phone": 1, "created_at": 1}
    ).to_list(500)
    items = []
    for u in users:
        prof = await db.provider_profiles.find_one({"user_id": u["user_id"]}, {"_id": 0, "business_name": 1, "description": 1})
        if not prof or not (prof.get("business_name") and prof.get("description")):
            items.append({**u, "has_profile": bool(prof)})
    return {"items": items, "total": len(items)}


@api_router.post("/admin/incomplete-registrations/{user_id}/remind")
async def admin_remind_incomplete(user_id: str, admin: User = Depends(require_admin)):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    body = f"Hola {u.get('name', '').split(' ')[0]}, casi tienes lista tu eCard en getamano. Termínala en 2 min: getamano.us/registro"
    await enqueue_notification(recipient_phone=u.get("phone", ""), channel="sms",
                                body=body, trigger_type="incomplete_registration")
    if u.get("phone"):
        try: send_sms(u["phone"], body, event="incomplete_registration")
        except Exception: pass
    return {"ok": True}


# ════════════════════════════════════════════════════════════════════
# SECTION 14 — Appointment Calendar (availability + booking)
# ════════════════════════════════════════════════════════════════════

class AvailabilityRuleIn(BaseModel):
    """Provider's weekly availability template."""
    is_active: bool = True
    weekly: dict  # {"mon": [{"start":"09:00","end":"17:00"}], ...}
    slot_duration_min: int = Field(60, ge=15, le=240)  # default 60 min, allowed 15-240
    buffer_min: int = Field(15, ge=0, le=120)
    advance_days: int = Field(30, ge=1, le=90)
    timezone: str = "America/Chicago"


@api_router.get("/providers/me/availability")
async def get_my_availability(user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "availability": 1, "calendar_active": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    return prof.get("availability") or {
        "is_active": False,
        "weekly": {d: [] for d in ["mon","tue","wed","thu","fri","sat","sun"]},
        "slot_duration_min": 60, "buffer_min": 15, "advance_days": 30,
        "timezone": "America/Chicago",
    }


@api_router.put("/providers/me/availability")
async def upsert_availability(payload: AvailabilityRuleIn, user: User = Depends(get_current_user)):
    upd = {
        "availability": payload.dict(),
        "calendar_active": bool(payload.is_active),
    }
    res = await db.provider_profiles.update_one({"user_id": user.user_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="No provider profile")
    return {"ok": True, **upd}


def _parse_hm(s: str) -> int:
    """'HH:MM' -> minutes since 00:00. Returns -1 on parse failure."""
    try:
        h, m = s.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return -1


def _weekday_key(d: datetime) -> str:
    return ["mon","tue","wed","thu","fri","sat","sun"][d.weekday()]


@api_router.get("/providers/{provider_id}/slots")
async def get_provider_slots(provider_id: str, date: str):
    """Public: returns ISO list of available slot start times for a given date (YYYY-MM-DD).
    Excludes already-booked slots (status pending/confirmed)."""
    prof = await db.provider_profiles.find_one({"provider_id": provider_id}, {"_id": 0, "availability": 1, "calendar_active": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="Provider not found")
    avail = prof.get("availability") or {}
    if not prof.get("calendar_active") or not avail.get("is_active"):
        return {"slots": [], "calendar_active": False}
    try:
        target = datetime.fromisoformat(date)
    except Exception:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    today = datetime.now(timezone.utc).date()
    if target.date() < today:
        return {"slots": [], "calendar_active": True}
    horizon = today + timedelta(days=avail.get("advance_days", 30))
    if target.date() > horizon:
        return {"slots": [], "calendar_active": True}
    day_key = _weekday_key(target)
    blocks = (avail.get("weekly") or {}).get(day_key, []) or []
    dur = int(avail.get("slot_duration_min", 60))
    buf = int(avail.get("buffer_min", 15))
    # Build candidate slots
    candidates: list[str] = []
    for b in blocks:
        start_m = _parse_hm(b.get("start", "00:00"))
        end_m = _parse_hm(b.get("end", "00:00"))
        if start_m < 0 or end_m <= start_m:
            continue
        t = start_m
        while t + dur <= end_m:
            h, m = divmod(t, 60)
            candidates.append(f"{h:02d}:{m:02d}")
            t += dur + buf
    if not candidates:
        return {"slots": [], "calendar_active": True}
    # Exclude booked slots for that date
    day_iso = target.date().isoformat()
    booked = await db.appointments.find(
        {"provider_id": provider_id, "date": day_iso,
         "status": {"$in": ["pending", "confirmed"]}},
        {"_id": 0, "time": 1}
    ).to_list(200)
    booked_set = {b["time"] for b in booked}
    return {"slots": [s for s in candidates if s not in booked_set], "calendar_active": True}


class AppointmentIn(BaseModel):
    provider_id: str
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    client_name: str = Field(min_length=2, max_length=100)
    client_phone: str = Field(min_length=7, max_length=20)
    client_email: Optional[str] = None
    service_description: str = Field(min_length=4, max_length=500)


@api_router.post("/appointments")
async def book_appointment(payload: AppointmentIn, request: Request,
                            user: Optional[User] = Depends(get_optional_user)):
    prof = await db.provider_profiles.find_one({"provider_id": payload.provider_id}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="Provider not found")
    if not prof.get("calendar_active"):
        raise HTTPException(status_code=400, detail="Este proveedor no tiene el calendario activo.")
    # Verify slot is still available
    available = await get_provider_slots(payload.provider_id, payload.date)
    if payload.time not in available.get("slots", []):
        raise HTTPException(status_code=409, detail="Ese horario ya no está disponible. Refresca para ver opciones actualizadas.")
    apt = {
        "appointment_id": f"apt_{uuid.uuid4().hex[:14]}",
        "provider_id": payload.provider_id,
        "provider_user_id": prof.get("user_id"),
        "client_user_id": user.user_id if user else None,
        "client_name": payload.client_name.strip(),
        "client_phone": payload.client_phone.strip(),
        "client_email": (payload.client_email or "").strip(),
        "service_description": payload.service_description.strip(),
        "date": payload.date,
        "time": payload.time,
        "status": "pending",  # pending → confirmed/declined → completed/no_show
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.appointments.insert_one(dict(apt))
    body = f"📅 Nueva cita en getamano: {payload.client_name} pidió visita el {payload.date} a las {payload.time}. Confirma en getamano.us/dashboard/citas"
    await enqueue_notification(recipient_phone=prof.get("phone", ""), channel="sms",
                                body=body, trigger_type="new_appointment_request")
    if prof.get("phone"):
        try: send_sms(prof["phone"], body, event="new_appointment_request")
        except Exception: pass
    apt.pop("_id", None)
    return apt


@api_router.get("/providers/me/appointments")
async def my_appointments(user: User = Depends(get_current_user),
                           status: Optional[Literal["pending","confirmed","declined","completed","no_show","cancelled","all"]] = "all"):
    q = {"provider_user_id": user.user_id}
    if status and status != "all":
        q["status"] = status
    items = await db.appointments.find(q, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(500)
    return {"items": items, "total": len(items)}


class AppointmentActionIn(BaseModel):
    action: Literal["confirm", "decline", "complete", "no_show", "cancel"]
    note: Optional[str] = None


@api_router.put("/appointments/{appointment_id}")
async def update_appointment(appointment_id: str, payload: AppointmentActionIn,
                              user: User = Depends(get_current_user)):
    apt = await db.appointments.find_one({"appointment_id": appointment_id}, {"_id": 0})
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if user.user_id not in {apt.get("provider_user_id"), apt.get("client_user_id")}:
        raise HTTPException(status_code=403, detail="Not your appointment")
    new_status = {"confirm": "confirmed", "decline": "declined", "complete": "completed",
                  "no_show": "no_show", "cancel": "cancelled"}[payload.action]
    await db.appointments.update_one(
        {"appointment_id": appointment_id},
        {"$set": {"status": new_status, "admin_note": (payload.note or "")[:300],
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Notify the other party
    notify_phone = apt.get("client_phone") if user.user_id == apt.get("provider_user_id") else ""
    if notify_phone:
        verb = {"confirm": "confirmó", "decline": "rechazó", "cancel": "canceló"}.get(payload.action, "actualizó")
        body = f"📅 Tu cita en getamano fue {verb} para el {apt['date']} a las {apt['time']}."
        await enqueue_notification(recipient_phone=notify_phone, channel="sms",
                                    body=body, trigger_type="appointment_update")
        try: send_sms(notify_phone, body, event="appointment_update")
        except Exception: pass
    return {"ok": True, "status": new_status}


# ════════════════════════════════════════════════════════════════════
# SECTION 16G — Activity feed (public, for homepage)
# ════════════════════════════════════════════════════════════════════

@api_router.get("/activity-feed")
async def activity_feed(limit: int = 12):
    """Mix of recent providers joined, reviews posted, milestones reached.
    Public endpoint — feeds the landing's 'Lo que está pasando' card."""
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=14)).isoformat()
    items: list[dict] = []
    # Recent providers
    recent = await db.provider_profiles.find(
        {"created_at": {"$gte": cutoff}, "is_active": True},
        {"_id": 0, "business_name": 1, "city": 1, "state": 1, "slug": 1, "category_id": 1, "created_at": 1}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    for p in recent:
        items.append({
            "type": "new_provider",
            "icon": "👋",
            "text_es": f"{p.get('business_name', '?')} se unió a getamano en {p.get('city','')}",
            "text_en": f"{p.get('business_name', '?')} joined getamano in {p.get('city','')}",
            "link": f"/services/{p.get('slug', '')}",
            "at": p.get("created_at"),
        })
    # Recent reviews
    recent_reviews = await db.reviews.find(
        {"created_at": {"$gte": cutoff}},
        {"_id": 0, "provider_id": 1, "rating": 1, "created_at": 1, "user_name": 1}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    for r in recent_reviews:
        prof = await db.provider_profiles.find_one({"provider_id": r["provider_id"]}, {"_id": 0, "business_name": 1, "slug": 1, "city": 1})
        if not prof: continue
        items.append({
            "type": "new_review",
            "icon": "⭐",
            "text_es": f"Nueva reseña {r.get('rating', 5)}★ para {prof.get('business_name', '?')} en {prof.get('city','')}",
            "text_en": f"New {r.get('rating', 5)}★ review for {prof.get('business_name', '?')} in {prof.get('city','')}",
            "link": f"/services/{prof.get('slug','')}",
            "at": r.get("created_at"),
        })
    items.sort(key=lambda x: x.get("at", ""), reverse=True)
    return {"items": items[:limit], "generated_at": now.isoformat()}


# ════════════════════════════════════════════════════════════════════
# SECTION 17D/E — Translation cache (infrastructure, ready for Google API)
# ════════════════════════════════════════════════════════════════════

class TranslateRequestIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    target_lang: Literal["es", "en"]
    source_id: str = Field(min_length=1, max_length=120)
    source_field: str = Field(min_length=1, max_length=60)
    source_lang: Literal["es", "en"] = "es"


@api_router.post("/translate")
async def translate_text(payload: TranslateRequestIn):
    """Translation service with cache. Returns original text when no API key is set
    (gracefully degrades — UI shows the 'translate' button but click reveals original)."""
    if payload.source_lang == payload.target_lang:
        return {"translated_text": payload.text, "cached": True, "source": "noop"}
    # 1) Check cache
    cached = await db.translation_cache.find_one(
        {"source_id": payload.source_id, "source_field": payload.source_field,
         "target_lang": payload.target_lang},
        {"_id": 0}
    )
    if cached:
        return {"translated_text": cached["translated_text"], "cached": True, "source": "cache"}
    # 2) Call Google Translate if API key configured
    # Section 18: unified GOOGLE_API_KEY (Translation + Vision + Places + Maps + Geocoding)
    # Backwards-compatible: also accepts the legacy GOOGLE_TRANSLATE_API_KEY name.
    api_key = (os.environ.get("GOOGLE_API_KEY") or os.environ.get("GOOGLE_TRANSLATE_API_KEY", "")).strip()
    if not api_key:
        # Graceful fallback: return original. UI shows a small note "Traducción no disponible aún".
        return {"translated_text": payload.text, "cached": False, "source": "no_api_key",
                "note": "Sistema de traducción automática no configurado aún."}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.post(
                f"https://translation.googleapis.com/language/translate/v2?key={api_key}",
                json={"q": payload.text, "target": payload.target_lang,
                      "source": payload.source_lang, "format": "text"},
            )
            r.raise_for_status()
            translated = r.json()["data"]["translations"][0]["translatedText"]
    except Exception as e:
        logger.warning(f"translate API call failed: {e}")
        return {"translated_text": payload.text, "cached": False, "source": "api_error"}
    # 3) Store in cache (upsert defensively)
    now_dt = datetime.now(timezone.utc)
    await db.translation_cache.update_one(
        {"source_id": payload.source_id, "source_field": payload.source_field, "target_lang": payload.target_lang},
        {"$set": {
            "source_id": payload.source_id, "source_field": payload.source_field,
            "source_lang": payload.source_lang, "target_lang": payload.target_lang,
            "original_text": payload.text, "translated_text": translated,
            "created_at": now_dt.isoformat(),
            # TTL anchor: native Date 90 days from now. MongoDB removes the doc
            # automatically once this timestamp is passed.
            "expires_at": now_dt + timedelta(days=90),
        }},
        upsert=True,
    )
    return {"translated_text": translated, "cached": False, "source": "google"}


# ════════════════════════════════════════════════════════════════════
# SECTION 24 — Email OTP verification (6-digit code)
# ════════════════════════════════════════════════════════════════════
# Two-step flow:
#   1. POST /api/auth/send-otp        { email }            → fires email
#   2. POST /api/auth/verify-otp      { email, code }      → marks user verified
#
# When RESEND_API_KEY is not set, the OTP is printed to the backend log
# (still works end-to-end during development). Once the founder configures
# Resend in /app/backend/.env, real emails fly automatically.

import secrets as _secrets
import asyncio as _asyncio

OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_ATTEMPTS = 5

class SendOtpIn(BaseModel):
    email: str
    locale: Optional[str] = "es"

class VerifyOtpIn(BaseModel):
    email: str
    code: str

def _otp_email_html(code: str, locale: str = "es") -> str:
    """Branded HTML email — uses inline CSS only for max client compatibility."""
    is_en = locale.startswith("en")
    title = "Confirm your email" if is_en else "Confirma tu correo"
    intro = ("Use this code to verify your getamano account. It expires in 10 minutes."
             if is_en else "Usa este código para verificar tu cuenta de getamano. Caduca en 10 minutos.")
    note = ("If you didn't request this, ignore this email."
            if is_en else "Si no solicitaste este código, ignora este correo.")
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:40px 20px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.06);">
      <tr><td style="background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);padding:32px 28px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">getamano</h1>
        <p style="margin:6px 0 0 0;color:rgba(255,255,255,0.85);font-size:13px;">{("Latino marketplace USA" if is_en else "Marketplace latino en USA")}</p>
      </td></tr>
      <tr><td style="padding:36px 32px 8px 32px;">
        <h2 style="margin:0 0 12px 0;color:#0F172A;font-size:20px;font-weight:700;">{title}</h2>
        <p style="margin:0 0 28px 0;color:#475569;font-size:15px;line-height:1.55;">{intro}</p>
        <div style="text-align:center;margin:0 0 28px 0;">
          <div style="display:inline-block;background:#F8FAFC;border:2px dashed #E2E8F0;border-radius:16px;padding:18px 28px;">
            <span style="display:block;font-size:11px;color:#94A3B8;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">{("Your code" if is_en else "Tu código")}</span>
            <span style="display:block;font-size:38px;letter-spacing:10px;font-weight:800;color:#025F67;font-family:'SF Mono',Menlo,Monaco,monospace;">{code}</span>
          </div>
        </div>
        <p style="margin:0 0 8px 0;color:#94A3B8;font-size:13px;line-height:1.5;">{note}</p>
      </td></tr>
      <tr><td style="background:#F8FAFC;padding:18px 32px;text-align:center;border-top:1px solid #E2E8F0;">
        <p style="margin:0;color:#94A3B8;font-size:12px;">© getamano 2026 — {("Verified Latino marketplace" if is_en else "Marketplace latino verificado")}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""

async def _send_email_via_resend(to: str, subject: str, html: str) -> dict:
    """Send a transactional email. Falls back to logger when RESEND_API_KEY missing."""
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    sender = (os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev").strip()
    if not api_key:
        # Dev fallback — log the email content so the founder can copy the OTP code.
        logger.warning("[EMAIL DEV-FALLBACK] To=%s | Subject=%s | (set RESEND_API_KEY to send for real)", to, subject)
        # Extract any visible 6-digit number from the HTML so devs can read it
        # without scrolling through HTML — convenient when testing locally.
        m = re.search(r"monospace;\">(\d{6})<", html)
        if m:
            logger.warning("[EMAIL DEV-FALLBACK] OTP code for %s = %s", to, m.group(1))
        return {"sent": False, "reason": "no_api_key"}
    try:
        import resend
        resend.api_key = api_key
        params = {"from": sender, "to": [to], "subject": subject, "html": html}
        result = await _asyncio.to_thread(resend.Emails.send, params)
        return {"sent": True, "id": result.get("id")}
    except Exception:
        logger.exception("Resend send failed for %s", to)
        return {"sent": False, "reason": "resend_error"}

async def _consume_resend_cooldown(email: str) -> Optional[int]:
    """Return seconds remaining if the user hit the resend cooldown."""
    last = await db.email_otps.find_one({"email": email}, {"_id": 0, "created_at": 1})
    if not last:
        return None
    try:
        prev = datetime.fromisoformat(last["created_at"])
    except Exception:
        return None
    elapsed = (datetime.now(timezone.utc) - prev).total_seconds()
    if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
        return int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
    return None

@api_router.post("/auth/send-otp")
async def send_otp(payload: SendOtpIn):
    """Generate a fresh 6-digit code, store it, and email it."""
    email = (payload.email or "").strip().lower()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Email no válido.")

    user_doc = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1, "email_verified": 1})
    if not user_doc:
        # Don't leak which emails exist — still respond OK and burn a fake delay.
        await _asyncio.sleep(0.4)
        return {"ok": True, "delivery": "queued"}
    if user_doc.get("email_verified"):
        return {"ok": True, "already_verified": True}

    cooldown = await _consume_resend_cooldown(email)
    if cooldown:
        raise HTTPException(status_code=429, detail=f"Espera {cooldown} segundos antes de pedir otro código.")

    code = f"{_secrets.randbelow(1_000_000):06d}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
    await db.email_otps.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "code_hash": hash_password(code),  # store hashed, never plaintext
            "attempts": 0,
            "expires_at": expires_at.isoformat(),
            "expires_at_native": expires_at,   # for TTL index
            "created_at": now.isoformat(),
        }},
        upsert=True,
    )

    locale = (payload.locale or "es").lower()
    subject = "Tu código de verificación · getamano" if locale.startswith("es") else "Your verification code · getamano"
    html = _otp_email_html(code, locale)
    delivery = await _send_email_via_resend(email, subject, html)
    return {"ok": True, "delivery": "sent" if delivery.get("sent") else "logged"}

@api_router.post("/auth/verify-otp")
async def verify_otp(payload: VerifyOtpIn):
    email = (payload.email or "").strip().lower()
    code = (payload.code or "").strip()
    if not email or not code or len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Código inválido.")

    rec = await db.email_otps.find_one({"email": email}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="No hay código activo para este correo. Solicita uno nuevo.")

    # Expiry check
    try:
        if datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc):
            await db.email_otps.delete_one({"email": email})
            raise HTTPException(status_code=400, detail="El código expiró. Solicita uno nuevo.")
    except (KeyError, ValueError):
        await db.email_otps.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="Código inválido. Solicita uno nuevo.")

    # Brute-force guard
    if rec.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        await db.email_otps.delete_one({"email": email})
        raise HTTPException(status_code=429, detail="Demasiados intentos. Solicita un código nuevo.")

    if not verify_password(code, rec["code_hash"]):
        await db.email_otps.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Código incorrecto.")

    # Success — mark verified and burn the OTP
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"email": email},
        {"$set": {"email_verified": True, "email_verified_at": now_iso}}
    )
    await db.email_otps.delete_one({"email": email})
    return {"ok": True, "verified_at": now_iso}

@api_router.get("/auth/me/email-verified")
async def is_email_verified(user: User = Depends(get_current_user)):
    """Quick poll endpoint so the frontend can ask 'is this user verified yet?'"""
    u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "email": 1, "email_verified": 1})
    return {"email": u.get("email") if u else None, "email_verified": bool(u and u.get("email_verified"))}


# ════════════════════════════════════════════════════════════════════
# SECTION 25 — AI description improver for providers
# ════════════════════════════════════════════════════════════════════
# When a provider writes their service description, a Claude assistant
# offers to polish the text into something more professional. We use
# claude-haiku (fastest + cheapest model) since this is a short
# rewrite task that runs on every keystroke pause.

class ImproveDescriptionIn(BaseModel):
    text: str
    category: Optional[str] = None
    business_name: Optional[str] = None
    locale: Optional[str] = "es"  # "es" or "en"

@api_router.post("/ai/improve-description")
async def improve_description(payload: ImproveDescriptionIn, user: User = Depends(get_current_user)):
    """Rewrite a provider description into a polished, conversion-friendly version."""
    text = (payload.text or "").strip()
    if len(text) < 10:
        raise HTTPException(status_code=400, detail="El texto es muy corto. Escribe al menos 10 caracteres.")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="El texto es demasiado largo (máximo 2000 caracteres).")

    locale = (payload.locale or "es").lower()
    is_en = locale.startswith("en")

    if is_en:
        system_msg = (
            "You are a copy-editing assistant for getamano, a Latino services marketplace in the US. "
            "You take a service provider's raw description and polish it. Keep it warm, human, and Latino — never corporate. "
            "Rules:\n"
            "1. 2-4 sentences, concise and punchy.\n"
            "2. Highlight strengths the provider mentioned. Do NOT invent experience, prices or years.\n"
            "3. End with a soft, natural call to action (\"Reach out for a free quote\" / \"Book a slot today\").\n"
            "4. Forbidden phrases: \"the best\", \"#1\", \"amazing\", \"world-class\".\n"
            "5. Use clear English. Fix typos and grammar.\n"
            "6. Output ONLY the polished text. No quotes, no preface, no explanation."
        )
        user_msg = (
            f"Service category: {payload.category or 'Home services'}\n"
            f"{f'Provider: {payload.business_name}' if payload.business_name else ''}\n\n"
            f"Original description:\n\"{text}\"\n\nPolish this description."
        )
    else:
        system_msg = (
            "Eres un asistente de redacción para getamano, un marketplace de servicios latinos en USA. "
            "Tomas la descripción de un proveedor y la mejoras. Tono cercano y latino — no corporativo, no frío. "
            "Reglas:\n"
            "1. Entre 2 y 4 oraciones, concisa y poderosa.\n"
            "2. Destaca las fortalezas que el proveedor mencionó. NO inventes experiencia, precios ni años.\n"
            "3. Termina con una llamada a la acción natural (\"Contáctame para tu cotización gratis\" / \"Agenda hoy mismo\").\n"
            "4. Prohibidas las frases vacías: \"el mejor\", \"#1\", \"increíble\", \"de clase mundial\".\n"
            "5. Español claro y correcto. Corrige errores de ortografía y gramática.\n"
            "6. Devuelve SOLO el texto pulido. Sin comillas, sin prefijos, sin explicaciones."
        )
        user_msg = (
            f"Categoría del servicio: {payload.category or 'Servicios del hogar'}\n"
            f"{f'Proveedor: {payload.business_name}' if payload.business_name else ''}\n\n"
            f"Descripción original:\n\"{text}\"\n\nMejora esta descripción."
        )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"improve_desc_{user.user_id}_{int(datetime.now(timezone.utc).timestamp())}",
            system_message=system_msg,
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        improved = (await chat.send_message(UserMessage(text=user_msg))).strip()
    except Exception as e:
        logger.exception("AI improve-description failed")
        raise HTTPException(status_code=503, detail="No pudimos mejorar el texto en este momento. Intenta de nuevo.") from e

    # Strip leading/trailing quotes Claude sometimes adds
    if improved.startswith(("\"", "'")) and improved.endswith(("\"", "'")):
        improved = improved[1:-1].strip()

    # Cheap word-overlap heuristic to detect whether the rewrite is meaningful
    a_words = set(text.lower().split())
    b_words = set(improved.lower().split())
    overlap = len(a_words & b_words) / max(len(a_words | b_words), 1)
    was_improved = overlap < 0.85

    return {
        "improved": improved,
        "original": text,
        "was_improved": was_improved,
        "model": "claude-haiku-4-5",
    }


# ════════════════════════════════════════════════════════════════════
# SECTION 18 — Google Cloud APIs (Geocoding + Translation unified key)
# ════════════════════════════════════════════════════════════════════
# Translation endpoint is defined above (Section 17D). Geocoding here.
# A single GOOGLE_API_KEY environment variable powers all Google services.

US_CITY_SEED = [
    ("dallas", "TX", 32.7767, -96.7970), ("houston", "TX", 29.7604, -95.3698),
    ("san-antonio", "TX", 29.4241, -98.4936), ("austin", "TX", 30.2672, -97.7431),
    ("el-paso", "TX", 31.7619, -106.4850), ("fort-worth", "TX", 32.7555, -97.3308),
    ("los-angeles", "CA", 34.0522, -118.2437), ("san-diego", "CA", 32.7157, -117.1611),
    ("fresno", "CA", 36.7378, -119.7871), ("san-jose", "CA", 37.3382, -121.8863),
    ("miami", "FL", 25.7617, -80.1918), ("orlando", "FL", 28.5383, -81.3792),
    ("tampa", "FL", 27.9506, -82.4572), ("chicago", "IL", 41.8781, -87.6298),
    ("new-york", "NY", 40.7128, -74.0060), ("phoenix", "AZ", 33.4484, -112.0740),
    ("las-vegas", "NV", 36.1699, -115.1398), ("denver", "CO", 39.7392, -104.9903),
    ("charlotte", "NC", 35.2271, -80.8431), ("atlanta", "GA", 33.7490, -84.3880),
    ("tucson", "AZ", 32.2226, -110.9747), ("albuquerque", "NM", 35.0853, -106.6056),
    ("san-bernardino", "CA", 34.1083, -117.2898), ("sallisaw", "OK", 35.4612, -94.7872),
]


class GeocodeRequestIn(BaseModel):
    city: str = Field(min_length=2, max_length=120)
    state: str = Field(min_length=2, max_length=80)


async def _geocode_lookup(city: str, state: str) -> Optional[dict]:
    """Return {lat, lng, display_name, source} or None. Cache-first via MongoDB."""
    key = (city.strip().lower(), state.strip().upper())
    cached = await db.city_coordinates.find_one(
        {"city": key[0], "state": key[1]}, {"_id": 0}
    )
    if cached:
        return {"lat": cached["lat"], "lng": cached["lng"],
                "display_name": cached.get("display_name", f"{city}, {state}"),
                "source": "cache"}
    api_key = (os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": f"{city}, {state}, USA", "key": api_key},
            )
            r.raise_for_status()
            data = r.json()
        if data.get("status") != "OK" or not data.get("results"):
            return None
        loc = data["results"][0]["geometry"]["location"]
        lat, lng = float(loc["lat"]), float(loc["lng"])
    except Exception as e:
        logger.warning(f"geocode failed for {city},{state}: {e}")
        return None
    await db.city_coordinates.update_one(
        {"city": key[0], "state": key[1]},
        {"$set": {
            "city": key[0], "state": key[1],
            "lat": lat, "lng": lng,
            "display_name": f"{city}, {state}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"lat": lat, "lng": lng, "display_name": f"{city}, {state}", "source": "google"}


@api_router.post("/geocode")
async def geocode_city(payload: GeocodeRequestIn):
    """Public endpoint. Returns {lat, lng, display_name, source} or 404 if not found
    AND no Google API key configured. With key+billing enabled, falls back to Google Geocoding API."""
    res = await _geocode_lookup(payload.city, payload.state)
    if not res:
        raise HTTPException(status_code=404, detail="No coordinates available for this city.")
    return res


@api_router.post("/admin/geocode/seed")
async def admin_geocode_seed(_user: User = Depends(require_admin)):
    """Pre-seed the city_coordinates collection with the 24 active getamano cities.
    Idempotent — safe to call multiple times."""
    n = 0
    for city, state, lat, lng in US_CITY_SEED:
        res = await db.city_coordinates.update_one(
            {"city": city, "state": state},
            {"$setOnInsert": {
                "city": city, "state": state, "lat": lat, "lng": lng,
                "display_name": f"{city.replace('-', ' ').title()}, {state}",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        if res.upserted_id is not None:
            n += 1
    return {"ok": True, "inserted": n, "total_seed": len(US_CITY_SEED)}


# ════════════════════════════════════════════════════════════════════
# SECTION 18A — Business Card Scanner (Google Cloud Vision API)
# ════════════════════════════════════════════════════════════════════
# Uses Vision API's TEXT_DETECTION on a base64 image. Extracts business name,
# phone, email, address via regex + heuristics from the OCR text.
# Falls back to MOCK MODE when GOOGLE_API_KEY missing OR Vision API blocked.

class CardScanIn(BaseModel):
    image_b64: str = Field(min_length=64, description="Base64 image (no data: prefix)")


_PHONE_RE = re.compile(r"(?:\+?1[\s\-.])?\(?(\d{3})\)?[\s\-.](\d{3})[\s\-.](\d{4})")
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_URL_RE = re.compile(r"(?:https?://)?(?:www\.)?([a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:/[\w\-./?#=&%+]*)?)")
_ZIP_RE = re.compile(r"\b(\d{5})(?:[\-\s](\d{4}))?\b")
_STATE_RE = re.compile(r"\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b")


def _parse_card_text(text: str) -> dict:
    """Heuristic parser. Lines come from Vision API's DOCUMENT_TEXT_DETECTION result."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    out = {"business_name": "", "owner_name": "", "phone": "", "email": "",
           "website": "", "city": "", "state": "", "zip_code": "",
           "raw_text": text, "lines_count": len(lines)}
    # email + phone + url first (high-confidence regex matches)
    em = _EMAIL_RE.search(text)
    if em:
        out["email"] = em.group(0).lower()
    ph = _PHONE_RE.search(text)
    if ph:
        out["phone"] = f"+1 ({ph.group(1)}) {ph.group(2)}-{ph.group(3)}"
    url = _URL_RE.search(text.replace(out["email"], ""))  # don't grab email domain
    if url:
        out["website"] = url.group(1).lower()
    z = _ZIP_RE.search(text)
    if z:
        out["zip_code"] = z.group(1)
    st = _STATE_RE.search(text)
    if st:
        out["state"] = st.group(0)
    # Heuristic: largest UPPER/Title-case line near top = business name; 2nd-largest = owner
    candidates = [l for l in lines if not _PHONE_RE.search(l) and not _EMAIL_RE.search(l) and not _URL_RE.search(l) and len(l) >= 3 and len(l) <= 60]
    if candidates:
        out["business_name"] = candidates[0]
        if len(candidates) > 1:
            out["owner_name"] = candidates[1]
    # City: look for "City, ST" pattern on any line
    city_match = re.search(r"([A-Z][a-zA-Z\.\s]{2,30}),\s*([A-Z]{2})\b", text)
    if city_match:
        out["city"] = city_match.group(1).strip()
        out["state"] = city_match.group(2)
    return out


@api_router.post("/card-scan")
async def scan_business_card(payload: CardScanIn, user: Optional[User] = Depends(get_optional_user)):
    """Scan a business card image and extract structured fields.

    Returns: { source, fields: {...}, raw_text, note? }
    - source = 'vision'      → real Google Vision OCR result
    - source = 'no_api_key'  → MOCK MODE (no Google API key configured)
    - source = 'api_error'   → Vision API returned 4xx/5xx (e.g., API disabled on GCP project)

    Frontend should always check `fields` and let the user edit before saving.
    """
    api_key = (os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        return {"source": "no_api_key",
                "fields": {}, "raw_text": "",
                "note": "Sistema OCR no configurado aún. Llena el formulario manualmente."}
    # Strip data: prefix if present
    img_b64 = payload.image_b64
    if img_b64.startswith("data:"):
        try:
            img_b64 = img_b64.split(",", 1)[1]
        except IndexError:
            raise HTTPException(status_code=400, detail="Invalid base64 image")
    try:
        async with httpx.AsyncClient(timeout=20.0) as cli:
            r = await cli.post(
                f"https://vision.googleapis.com/v1/images:annotate?key={api_key}",
                json={"requests": [{
                    "image": {"content": img_b64},
                    "features": [{"type": "DOCUMENT_TEXT_DETECTION", "maxResults": 1}],
                    "imageContext": {"languageHints": ["es", "en"]},
                }]},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning(f"Vision OCR call failed: {e}")
        return {"source": "api_error", "fields": {}, "raw_text": "",
                "note": "El servicio OCR no respondió. Llena el formulario manualmente."}
    try:
        annotation = data["responses"][0].get("fullTextAnnotation") or {}
        text = annotation.get("text", "") or ""
        if not text and data["responses"][0].get("textAnnotations"):
            text = data["responses"][0]["textAnnotations"][0].get("description", "")
    except Exception:
        text = ""
    if not text:
        return {"source": "vision", "fields": {}, "raw_text": "",
                "note": "No detectamos texto. Asegúrate de que la tarjeta esté enfocada y bien iluminada."}
    fields = _parse_card_text(text)
    return {"source": "vision", "fields": fields, "raw_text": text}


# ════════════════════════════════════════════════════════════════════
# QUIZ FUNNEL — Recovery system for abandoned plan-recommender visitors
# ════════════════════════════════════════════════════════════════════
# Every quiz interaction emits an event to /api/quiz/track. When the user
# leaves after answering 2+ questions (without finishing) we capture an
# "abandoned" event. The /api/quiz/recover endpoint stores their email +
# partial answers so we can email them later (once Resend is configured).

class QuizTrackIn(BaseModel):
    session_id: str = Field(min_length=8, max_length=80)
    event: Literal["opened", "answered", "completed", "abandoned", "cta_clicked"]
    step: Optional[int] = Field(default=None, ge=0, le=10)
    answers: Optional[dict] = None
    recommended_plan: Optional[str] = None
    lang: Optional[str] = "es"
    variant: Optional[Literal["A", "B"]] = None
    experiment: Optional[str] = "result_cta_v1"


class LeadRecoveryIn(BaseModel):
    session_id: str = Field(min_length=8, max_length=80)
    email: str = Field(min_length=5, max_length=200)
    answers: dict
    recommended_plan: Optional[str] = None
    lang: Optional[str] = "es"
    variant: Optional[Literal["A", "B"]] = None
    experiment: Optional[str] = "result_cta_v1"


@api_router.post("/quiz/track")
async def quiz_track(payload: QuizTrackIn, request: Request,
                     user: Optional[User] = Depends(get_optional_user)):
    """Fire-and-forget endpoint: store one quiz funnel event.
    Public — no auth required. session_id is generated client-side."""
    doc = {
        "session_id": payload.session_id,
        "event": payload.event,
        "step": payload.step,
        "answers": payload.answers or {},
        "recommended_plan": payload.recommended_plan,
        "lang": payload.lang or "es",
        "variant": payload.variant,
        "experiment": payload.experiment or "result_cta_v1",
        "user_id": user.user_id if user else None,
        "ip": request.client.host if request.client else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.quiz_funnel.insert_one(doc)
    return {"ok": True}


@api_router.post("/quiz/recover")
async def quiz_recover(payload: LeadRecoveryIn, request: Request,
                       user: Optional[User] = Depends(get_optional_user)):
    """Capture an email at quiz-abandonment. Persisted in lead_recoveries
    with status='pending'. When Resend (or similar) is enabled, a background
    worker will read these and send the recovery email."""
    email = payload.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email")
    await db.lead_recoveries.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "session_id": payload.session_id,
            "answers": payload.answers,
            "recommended_plan": payload.recommended_plan,
            "lang": payload.lang or "es",
            "variant": payload.variant,
            "experiment": payload.experiment or "result_cta_v1",
            "status": "pending",
            "user_id": user.user_id if user else None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, "$setOnInsert": {
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    # Drop a matching funnel event so the abandonment is paired with recovery
    await db.quiz_funnel.insert_one({
        "session_id": payload.session_id,
        "event": "email_captured",
        "step": None,
        "answers": payload.answers,
        "recommended_plan": payload.recommended_plan,
        "lang": payload.lang or "es",
        "variant": payload.variant,
        "experiment": payload.experiment or "result_cta_v1",
        "user_id": user.user_id if user else None,
        "email": email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "message": "lead_captured"}


@api_router.get("/admin/quiz-funnel")
async def admin_quiz_funnel(_user: User = Depends(require_admin)):
    """Admin dashboard data. Returns funnel + plan distribution + recent leads
    (legacy shape kept) PLUS a dict of active experiments with per-variant funnels.
    Each experiment is computed independently so a single session can contribute
    to multiple experiment buckets."""
    # Step 1: pull every event ordered by time
    all_events = await db.quiz_funnel.find({}, {"_id": 0}).sort("created_at", 1).to_list(50000)

    # Step 2: group events by (experiment, session_id) for per-experiment funnels.
    # Also collect "any-experiment" session events for the overall funnel display.
    by_exp = {}  # { exp_name: { sid: {events:[], variant, recommended_plan, lang} } }
    by_overall = {}  # { sid: {events:[], recommended_plan, lang} }
    for ev in all_events:
        sid = ev.get("session_id")
        if not sid:
            continue
        # Overall (any experiment) accumulator — used for the legacy KPI cards
        overall = by_overall.setdefault(sid, {"events": [], "recommended_plan": None, "lang": None})
        overall["events"].append(ev["event"])
        overall["recommended_plan"] = ev.get("recommended_plan") or overall["recommended_plan"]
        overall["lang"] = ev.get("lang") or overall["lang"]
        exp = ev.get("experiment")
        if exp:
            exp_bucket = by_exp.setdefault(exp, {})
            sess = exp_bucket.setdefault(sid, {"events": [], "variant": None, "recommended_plan": None, "lang": None})
            sess["events"].append(ev["event"])
            sess["variant"] = ev.get("variant") or sess["variant"]
            sess["recommended_plan"] = ev.get("recommended_plan") or sess["recommended_plan"]
            sess["lang"] = ev.get("lang") or sess["lang"]

    def empty_counts():
        return {"sessions": 0, "started": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0,
                "completed": 0, "cta_clicked": 0, "abandoned": 0, "email_captured": 0,
                "plan_dist": {"free": 0, "basic": 0, "pro": 0, "premium": 0}}

    def accumulate(bucket, sess):
        bucket["sessions"] += 1
        evs = sess["events"]
        if "opened" in evs: bucket["started"] += 1
        answered_count = sum(1 for e in evs if e == "answered")
        for q_n in range(1, 5):
            if answered_count >= q_n: bucket[f"q{q_n}"] += 1
        if "completed" in evs:
            bucket["completed"] += 1
            if sess.get("recommended_plan") in bucket["plan_dist"]:
                bucket["plan_dist"][sess["recommended_plan"]] += 1
        if "cta_clicked" in evs: bucket["cta_clicked"] += 1
        if "email_captured" in evs: bucket["email_captured"] += 1

    def derive_rates(b):
        abandoned = max(0, b["q1"] - b["completed"])
        b["abandoned"] = abandoned
        b["completion_rate_pct"] = round(b["completed"] / max(b["started"], 1) * 100, 1)
        b["cta_conversion_pct"] = round(b["cta_clicked"] / max(b["completed"], 1) * 100, 1)
        b["recovery_rate_pct"] = round(b["email_captured"] / max(abandoned, 1) * 100, 1) if abandoned > 0 else 0.0
        b["overall_conversion_pct"] = round(b["cta_clicked"] / max(b["started"], 1) * 100, 1)
        return b

    # Build legacy overall funnel (KPI cards + step bars + plan dist)
    overall = empty_counts()
    for sid, sess in by_overall.items():
        accumulate(overall, sess)
    overall = derive_rates(overall)

    # Build per-experiment A/B comparison
    # Each experiment has its own "primary KPI":
    #   result_cta_v1   → overall_conversion_pct (started → cta_clicked)
    #   question_order_v1 → completion_rate_pct (started → completed)
    #   plan_card_order_v1 → overall_conversion_pct (started → cta_clicked)
    PRIMARY_KPI = {
        "question_order_v1": "completion_rate_pct",
        "result_cta_v1": "overall_conversion_pct",
        "plan_card_order_v1": "overall_conversion_pct",
    }
    experiments_out = {}
    for exp_name, sessions in by_exp.items():
        variants = {"A": empty_counts(), "B": empty_counts(), "unassigned": empty_counts()}
        for sid, sess in sessions.items():
            v = sess.get("variant") if sess.get("variant") in {"A", "B"} else "unassigned"
            accumulate(variants[v], sess)
        for k in variants:
            variants[k] = derive_rates(variants[k])
        # Pick the right primary KPI per experiment for the winner calc
        kpi = PRIMARY_KPI.get(exp_name, "overall_conversion_pct")
        diff_pct = variants["B"][kpi] - variants["A"][kpi]
        can_call = variants["A"]["started"] >= 30 and variants["B"]["started"] >= 30
        sig = {
            "samples_ready": can_call,
            "samples_needed_each": 30,
            "primary_kpi": kpi,
            "diff_pp": round(diff_pct, 1),
            "winner": (("B" if diff_pct > 0 else "A") if can_call and abs(diff_pct) >= 3.0 else None),
            "note": ("Significant" if can_call and abs(diff_pct) >= 3.0 else "Keep collecting data"),
        }
        experiments_out[exp_name] = {"variants": variants, "significance": sig}

    leads = await db.lead_recoveries.find(
        {}, {"_id": 0, "email": 1, "recommended_plan": 1, "status": 1, "created_at": 1, "lang": 1, "variant": 1, "experiment": 1}
    ).sort("created_at", -1).limit(20).to_list(20)

    return {
        "totals": {k: overall[k] for k in ("sessions", "started", "q1", "q2", "q3", "q4",
                                             "completed", "cta_clicked", "abandoned", "email_captured")},
        "rates": {
            "completion_rate_pct": overall["completion_rate_pct"],
            "cta_conversion_pct": overall["cta_conversion_pct"],
            "recovery_rate_pct": overall["recovery_rate_pct"],
        },
        "plan_distribution": overall["plan_dist"],
        "recent_leads": leads,
        # Legacy key kept for the existing card (defaults to result_cta_v1)
        "ab_test": (lambda: {
            "experiment": "result_cta_v1",
            "variants": experiments_out.get("result_cta_v1", {"variants": {"A": empty_counts(), "B": empty_counts(), "unassigned": empty_counts()}})["variants"],
            "significance": experiments_out.get("result_cta_v1", {"significance": {"samples_ready": False, "samples_needed_each": 30, "diff_pp": 0.0, "winner": None, "note": "Keep collecting data"}})["significance"],
        })(),
        # NEW: dict of every active experiment for the multi-experiment UI
        "experiments": experiments_out,
    }


@api_router.get("/admin/lead-recoveries")
async def admin_list_leads(status: Optional[str] = None, _user: User = Depends(require_admin)):
    """Admin: full list of captured leads for outreach (until Resend is wired)."""
    q = {}
    if status:
        q["status"] = status
    leads = await db.lead_recoveries.find(q, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    return {"items": leads, "total": len(leads)}


# ════════════════════════════════════════════════════════════════════
# RECOMMENDATIONS — Public client-driven endorsements (viral growth loop)
# ════════════════════════════════════════════════════════════════════
# A client says "I recommend this provider" → optional message → gets a
# unique share_token → WhatsApp/copy-link to friends. Other visitors land
# on the eCard with a "Recommended by [name]" hero that adds social proof.

class RecommendationIn(BaseModel):
    client_name: str = Field(min_length=2, max_length=80)
    client_email: Optional[str] = Field(default=None, max_length=200)
    client_city: Optional[str] = Field(default=None, max_length=80)
    message: Optional[str] = Field(default=None, max_length=240)
    source: Optional[Literal["ecard_button", "post_booking", "post_message", "share_link"]] = "ecard_button"


def _make_share_token() -> str:
    return f"r_{uuid.uuid4().hex[:14]}"


@api_router.post("/providers/{provider_id}/recommend")
async def recommend_provider(provider_id: str, payload: RecommendationIn, request: Request,
                              user: Optional[User] = Depends(get_optional_user)):
    """Public endpoint — anonymous-OK. Creates (or updates) a recommendation
    for this provider. If the same email already recommended this provider,
    we UPDATE the existing record instead of creating a duplicate."""
    prof = await db.provider_profiles.find_one({"provider_id": provider_id, "is_active": True}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="Provider not found")

    email = (payload.client_email or "").strip().lower() or None
    name = payload.client_name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Nombre requerido")

    now = datetime.now(timezone.utc).isoformat()
    rec = {
        "recommendation_id": f"rec_{uuid.uuid4().hex[:12]}",
        "provider_id": provider_id,
        "provider_slug": prof.get("slug"),
        "provider_business_name": prof.get("business_name"),
        "client_name": name,
        "client_email": email,
        "client_city": (payload.client_city or "").strip() or None,
        "client_user_id": user.user_id if user else None,
        "message": (payload.message or "").strip() or None,
        "source": payload.source or "ecard_button",
        "share_token": _make_share_token(),
        "is_public": True,
        "created_at": now,
        "updated_at": now,
        "ip": request.client.host if request.client else None,
    }
    # Upsert by (provider_id, client_email) when email is provided.
    if email:
        existing = await db.recommendations.find_one(
            {"provider_id": provider_id, "client_email": email}, {"_id": 0}
        )
        if existing:
            await db.recommendations.update_one(
                {"recommendation_id": existing["recommendation_id"]},
                {"$set": {
                    "client_name": name,
                    "client_city": rec["client_city"],
                    "message": rec["message"],
                    "updated_at": now,
                }},
            )
            return {
                "ok": True, "deduped": True,
                "recommendation_id": existing["recommendation_id"],
                "share_token": existing["share_token"],
                "share_url": f"/services/{prof.get('slug')}?via={existing['share_token']}",
            }
    await db.recommendations.insert_one(rec)
    # Denormalize the count for fast eCard rendering
    await db.provider_profiles.update_one(
        {"provider_id": provider_id},
        {"$inc": {"recommendations_count": 1}},
    )
    return {
        "ok": True, "deduped": False,
        "recommendation_id": rec["recommendation_id"],
        "share_token": rec["share_token"],
        "share_url": f"/services/{prof.get('slug')}?via={rec['share_token']}",
    }


@api_router.get("/providers/{provider_id}/recommendations")
async def list_recommendations(provider_id: str, limit: int = 50):
    """Public list of named recommendations for this provider."""
    items = await db.recommendations.find(
        {"provider_id": provider_id, "is_public": True},
        {"_id": 0, "ip": 0, "client_email": 0, "client_user_id": 0}
    ).sort("created_at", -1).limit(min(limit, 100)).to_list(min(limit, 100))
    total = await db.recommendations.count_documents(
        {"provider_id": provider_id, "is_public": True}
    )
    return {"items": items, "total": total}


@api_router.get("/recommendations/by-token/{share_token}")
async def recommendation_by_token(share_token: str):
    """Resolve a share_token → recommendation + provider basic info.
    Used when a referred visitor opens /services/{slug}?via={token} so the
    eCard can show the 'Recommended by [name]' hero banner."""
    rec = await db.recommendations.find_one(
        {"share_token": share_token, "is_public": True},
        {"_id": 0, "ip": 0, "client_email": 0, "client_user_id": 0}
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"recommendation": rec}


@api_router.get("/providers/top-recommended")
async def top_recommended(limit: int = 8):
    """Most-recommended active providers — used on Landing/Community for social
    proof. Excludes TEST data via PUBLIC_GUARD."""
    providers = await db.provider_profiles.find(
        {"is_active": True, "recommendations_count": {"$gt": 0}, **PUBLIC_GUARD},
        {"_id": 0}
    ).sort("recommendations_count", -1).limit(min(limit, 24)).to_list(min(limit, 24))
    cats = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(200)}
    for p in providers:
        p["category"] = cats.get(p.get("category_id"))
    return providers


# ════════════════════════════════════════════════════════════════════
# SECTION 23 — Light rate limiting + audit log + sitemap.xml
# ════════════════════════════════════════════════════════════════════
# We don't ship full slowapi yet — that's overkill for early-stage traffic
# and adds a dependency. Instead, a 60-second sliding window per (IP, path)
# stored in MongoDB protects the most-attacked routes (auth, OTP, AI) from
# brute force without user impact.

_RATE_LIMITED_PATHS = {
    "/api/auth/login":        {"limit": 8,  "window": 60},
    "/api/auth/register":     {"limit": 5,  "window": 60},
    "/api/auth/send-otp":     {"limit": 5,  "window": 60},
    "/api/auth/verify-otp":   {"limit": 12, "window": 60},
    "/api/ai/improve-description": {"limit": 20, "window": 60},
    "/api/translate":         {"limit": 60, "window": 60},
    "/api/card-scan":         {"limit": 10, "window": 60},
}

@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    path = request.url.path
    rule = _RATE_LIMITED_PATHS.get(path)
    if not rule:
        return await call_next(request)
    # Real client IP — proxy adds X-Forwarded-For; first IP is the user.
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip = fwd or (request.client.host if request.client else "unknown")
    bucket_key = f"{ip}:{path}"
    window_start = datetime.now(timezone.utc) - timedelta(seconds=rule["window"])
    try:
        count = await db.rate_limit_buckets.count_documents({
            "bucket_key": bucket_key,
            "ts": {"$gte": window_start.isoformat()},
        })
        if count >= rule["limit"]:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Demasiadas peticiones. Espera {rule['window']} segundos."},
            )
        await db.rate_limit_buckets.insert_one({
            "bucket_key": bucket_key,
            "ts": datetime.now(timezone.utc).isoformat(),
            "expires_at_native": datetime.now(timezone.utc) + timedelta(seconds=rule["window"] * 2),
        })
    except Exception:
        # Never block legit traffic if Mongo hiccups — fail open.
        logger.exception("Rate limiter degraded")
    return await call_next(request)


async def audit_log(actor_id: Optional[str], action: str, details: Optional[dict] = None, request=None):
    """Append a structured audit-log entry. Best-effort — never raises."""
    try:
        ip = None
        if request is not None:
            fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
            ip = fwd or (request.client.host if request.client else None)
        await db.audit_log.insert_one({
            "actor_id": actor_id,
            "action": action,
            "details": details or {},
            "ip": ip,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        logger.exception("audit_log write failed")


# ─── Sitemap ────────────────────────────────────────────────────────
# A comprehensive /api/sitemap.xml + /api/robots.txt already live near
# the top of this file (around line 1160). The Section 22 SEO category
# hub URLs (/categoria/<slug>) were appended there. We don't redefine
# the endpoints here — leaving room for future enhancement.


# Mount api_router AFTER all route definitions so Sections 13–18 are included.
app.include_router(api_router)
