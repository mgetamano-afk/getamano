from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, UploadFile, File, Form, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os
import logging
import re
import secrets
import string
import uuid
import bcrypt
import jwt
from catalog import CATALOG as FULL_CATALOG, SECTOR_LABELS, SECTOR_COLORS, CITIES as SEO_CITIES
import httpx
import requests
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator, model_validator
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
    preferred_language: Optional[Literal["es", "en"]] = None

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

def _extract_session_token(request: Request) -> Optional[str]:
    """Pull session token from cookie first, then `Authorization: Bearer …`."""
    token = request.cookies.get("session_token")
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.split(" ", 1)[1]
    return None


def _user_id_from_jwt(token: str) -> Optional[str]:
    """Decode our own JWT. Returns None on any failure (lets caller fall back)."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        return None
    return payload.get("sub")


async def _user_id_from_emergent_session(token: str) -> Optional[str]:
    """Resolve user_id from a stored Emergent OAuth session, enforcing expiry."""
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    return session["user_id"]


async def get_current_user(request: Request) -> User:
    token = _extract_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = _user_id_from_jwt(token) or await _user_id_from_emergent_session(token)
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
    {"slug": "catering", "name_es": "Catering y Eventos", "name_en": "Catering & Events", "icon": "UtensilsCrossed", "color": "#F97316"},
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
        # Section 55 — Saved eCards (bookmark + like)
        await db.saved_ecards.create_index([("user_id", 1), ("provider_id", 1)], unique=True)
        await db.saved_ecards.create_index([("user_id", 1), ("saved_at", -1)])
        await db.saved_ecards.create_index([("provider_id", 1), ("save_type", 1)])
        # Marketplace de Banners
        await db.banner_shares.create_index("share_id", unique=True)
        await db.banner_shares.create_index([("is_public", 1), ("likes", -1), ("created_at", -1)])
        await db.banner_shares.create_index([("provider_user_id", 1), ("created_at", -1)])
        await db.banner_likes.create_index([("share_id", 1), ("user_id", 1)], unique=True)
        # ── Section 60 / Stories — Instagram-style ephemeral 24h stories ──
        await db.stories.create_index("story_id", unique=True)
        await db.stories.create_index([("expires_at", 1)], expireAfterSeconds=0)  # TTL → auto-delete
        await db.stories.create_index([("provider_user_id", 1), ("created_at", -1)])
        await db.stories.create_index([("is_public", 1), ("created_at", -1)])
        await db.story_views.create_index([("story_id", 1), ("viewer_user_id", 1)], unique=True)
        await db.story_likes.create_index([("story_id", 1), ("user_id", 1)], unique=True)
        await db.story_likes.create_index([("story_id", 1)])
        # Section 58 — extra indexes for scale (60M-user readiness)
        await db.reviews.create_index([("provider_id", 1), ("created_at", -1)])
        await db.reviews.create_index([("provider_id", 1), ("rating", -1)])
        await db.service_requests.create_index([("provider_id", 1), ("created_at", -1)])
        await db.service_requests.create_index([("client_id", 1), ("created_at", -1)])
        await db.messages.create_index([("conversation_id", 1), ("status", 1)])
        await db.share_events.create_index([("provider_user_id", 1), ("created_at", -1)])
        await db.exit_leads.create_index([("status", 1), ("created_at", -1)])
        await db.favorites.create_index([("user_id", 1), ("provider_id", 1)])
        await db.notification_queue.create_index([("user_id", 1), ("created_at", -1)])
        await db.audit_log.create_index([("user_id", 1), ("created_at", -1)])
        # Geo provider lookups (city + state) — already partially covered by compound idx above
        await db.provider_profiles.create_index([("verification_status", 1), ("rating_avg", -1)])
        await db.provider_profiles.create_index([("plan", 1), ("rating_avg", -1)])
        await db.quote_requests.create_index([("provider_id", 1), ("created_at", -1)])
        # Section 35/36 — community feed indexes
        await db.community_posts.create_index([("created_at", -1)])
        await db.community_posts.create_index("user_id")
        await db.post_likes.create_index([("post_id", 1), ("user_id", 1)], unique=True)
        await db.provider_follows.create_index([("follower_user_id", 1), ("provider_user_id", 1)], unique=True)
        await db.provider_follows.create_index("provider_user_id")
        # Comments
        await db.community_comments.create_index([("post_id", 1), ("created_at", 1)])
        await db.community_comments.create_index("user_id")
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
        # SECTION 26 — subscriptions (one per user)
        await db.subscriptions.create_index("user_id", unique=True)
        await db.subscriptions.create_index("status")
        # SECTION 18 — Geocoding cache
        await db.city_coordinates.create_index([("city", 1), ("state", 1)], unique=True)
        # Quiz funnel (PlanRecommender abandonment tracking)
        await db.quiz_funnel.create_index([("session_id", 1)])
        await db.quiz_funnel.create_index([("created_at", -1)])
        await db.quiz_funnel.create_index([("event", 1), ("created_at", -1)])
        # Email captures for the recovery flow
        await db.lead_recoveries.create_index("email", unique=True)
        await db.lead_recoveries.create_index([("status", 1), ("created_at", -1)])
        # Exit-intent leads (phone-based, SMS/WhatsApp manual outreach)
        await db.exit_leads.create_index("lead_id", unique=True)
        await db.exit_leads.create_index([("status", 1), ("created_at", -1)])
        await db.exit_leads.create_index([("phone", 1), ("created_at", -1)])
        # Public recommendations (named endorsements with optional message + share token)
        await db.recommendations.create_index([("provider_id", 1), ("created_at", -1)])
        await db.recommendations.create_index(
            [("provider_id", 1), ("client_email", 1)],
            unique=True,
            partialFilterExpression={"client_email": {"$type": "string"}},
        )
        await db.recommendations.create_index("share_token", unique=True, sparse=True)
        await db.recommendations.create_index([("created_at", -1)])
        # SECTION 30 (CAMBIO C) — Gigs / Chambas
        await db.gigs.create_index("status")
        await db.gigs.create_index([("category", 1), ("status", 1), ("created_at", -1)])
        await db.gigs.create_index([("created_by", 1), ("created_at", -1)])
        await db.gigs.create_index("expires_at_native", expireAfterSeconds=0)
        await db.gig_applications.create_index([("gig_id", 1), ("provider_id", 1)], unique=True)
        await db.gig_applications.create_index([("provider_id", 1), ("created_at", -1)])
        # SECTION 46 — Viral share tracking
        # share_events: append-only log of provider WhatsApp/Email/QR shares
        await db.share_events.create_index([("provider_user_id", 1), ("created_at", -1)])
        # share_view_dedup: 24h TTL collection that prevents counter inflation
        await db.share_view_dedup.create_index([("referrer_slug", 1), ("ip", 1)], unique=True)
        await db.share_view_dedup.create_index("expires_at_native", expireAfterSeconds=0)
        # Section 46B — Reward claims: unique per (user, tier) so a user can
        # never claim the same reward twice (Mongo $insert raises DuplicateKeyError).
        await db.share_reward_claims.create_index([("user_id", 1), ("tier_id", 1)], unique=True)
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

    # Section 28 — Demo client (so testers can verify the client experience)
    DEMO_CLIENT_EMAIL = "demo.client@getamano.com"
    if not await db.users.find_one({"email": DEMO_CLIENT_EMAIL}):
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": DEMO_CLIENT_EMAIL,
            "password_hash": hash_password("client123"),
            "name": "Carlos Demo",
            "role": "client",
            "picture": None,
            "language": "es",
            "country": DEFAULT_COUNTRY,
            "email_verified": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded demo client: %s", DEMO_CLIENT_EMAIL)

    # Section 33 — Seed a credited referral on the demo provider so the
    # engagement signals (referrer badge on eCard + "✨ traíd@" on the reel
    # card + dashboard referral stats) all have meaningful data out of the box.
    # Idempotent: upsert keyed on a stable demo invitee user_id.
    demo_profile = await db.provider_profiles.find_one({"slug": DEMO_SLUG}, {"_id": 0, "ref_code": 1, "provider_id": 1})
    if demo_profile and demo_profile.get("ref_code"):
        await db.referrals.update_one(
            {"referred_user_id": "user_demo_invitee_001"},
            {"$setOnInsert": {
                "referral_id": "ref_demo_seed_001",
                "referrer_user_id": prov_user_id,
                "referred_user_id": "user_demo_invitee_001",
                "ref_code": demo_profile["ref_code"],
                "status": "credited",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "credited_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )

    # Section 34 — Seed a 5-day active-streak so the dashboard streak widget
    # and the public eCard "🔥 N días seguidos" badge have meaningful state
    # on first boot. We backdate sessions over the past 5 UTC days. Idempotent
    # via a marker doc keyed on `streak_demo_seed=true`.
    if demo_profile and demo_profile.get("provider_id"):
        already_seeded = await db.streaks.find_one({"user_id": prov_user_id, "streak_demo_seed": True}, {"_id": 0})
        if not already_seeded:
            today_utc = datetime.now(timezone.utc)
            for offset in range(5):
                day = today_utc - timedelta(days=offset)
                await db.sessions.insert_one({
                    "session_id": f"sess_demo_{offset}_{uuid.uuid4().hex[:6]}",
                    "user_id": prov_user_id,
                    "created_at": day.replace(hour=10, minute=0, second=0, microsecond=0).isoformat(),
                    "ip_address": "0.0.0.0",
                    "user_agent": "demo-seed",
                    "demo_seed": True,
                })
            await db.streaks.update_one(
                {"user_id": prov_user_id},
                {"$set": {
                    "user_id": prov_user_id,
                    "provider_id": demo_profile["provider_id"],
                    "best_days": 5,
                    "current_days": 5,
                    "last_active_date": today_utc.date().isoformat(),
                    "streak_demo_seed": True,
                    "updated_at": today_utc.isoformat(),
                }},
                upsert=True,
            )
            logger.info("Seeded 5-day demo streak for demo provider")

    # Section 35/36 — Seed 2 demo community posts for María so /comunidad has
    # meaningful content on first boot. Idempotent via stable post_ids.
    if demo_profile and demo_profile.get("provider_id"):
        seeds = [
            {
                "post_id": "post_demo_seed_001",
                "user_id": prov_user_id,
                "content": "¡Hola comunidad! 👋 Soy María de María's Cleaning Services en Sallisaw, OK. Llevo 8 años limpiando casas latinas con muchísimo cariño. Si necesitan ayuda, escríbanme — siempre traigo mis propios productos y descuento del 10% para primeras visitas. ✨",
                "image_url": None,
                "likes_count": 12,
                "comments_count": 0,
                "is_hidden": False,
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat(),
            },
            {
                "post_id": "post_demo_seed_002",
                "user_id": prov_user_id,
                "content": "Tip de la semana: para mantener la cocina sin grasa, usa bicarbonato + vinagre + agua tibia. Funciona mejor que cualquier producto comercial y es seguro para los niños. ¡Cuéntenme sus trucos! 🧽",
                "image_url": None,
                "likes_count": 8,
                "comments_count": 0,
                "is_hidden": False,
                "created_at": (datetime.now(timezone.utc) - timedelta(days=1, hours=2)).isoformat(),
            },
        ]
        for s in seeds:
            await db.community_posts.update_one({"post_id": s["post_id"]}, {"$setOnInsert": s}, upsert=True)

# ============ AUTH ROUTES ============
# Extracted to routes/auth.py — wired at the bottom of this file alongside the
# community router.

# ============ CATEGORIES ============
@api_router.get("/categories")
async def list_categories():
    cats = await db.categories.find({}, {"_id": 0}).to_list(500)
    return cats

# ============ PROVIDERS + SEARCH ============
# Extracted to routes/search.py — wired at the bottom of this file alongside
# the community and auth routers. See SECTION 27 for smart-search synonyms.


# ════════════════════════════════════════════════════════════════════
# SECTION 30 (CAMBIO C) — Gigs / Chambas marketplace
# ════════════════════════════════════════════════════════════════════
# Extracted to routes/jobs.py — wired at the bottom of this file alongside the
# community, auth, and search routers.


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
# Extracted to routes/seo.py — wired at the bottom of this file. Endpoints:
#   GET /seo/cities · /seo/sectors · /seo/city/{slug} · /seo/category/{slug}
#   GET /seo/page/{cat}/{city} · /seo/content/{cat}/{city}
#   GET /sitemap.xml · /robots.txt

from fastapi.responses import PlainTextResponse  # noqa: E402,F401  — still imported by older sections


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


@api_router.get("/reports/against-me")
async def list_reports_against_me(user: User = Depends(get_current_user)):
    """Section 45 — Transparency: any user can see reports filed AGAINST them.

    Reporter identity is NEVER exposed; only status, reason, dates and resolution
    notes go to the reported user. Pending reports are shown as "Under review"
    without revealing the detailed description (to prevent retaliation).
    """
    items = await db.reports.find(
        {"target_id": user.user_id},
        {"_id": 0, "reporter_id": 0, "reporter_email": 0, "reporter_name": 0},
    ).sort("created_at", -1).limit(50).to_list(50)
    # Anonymize and filter sensitive details per status
    for r in items:
        if r.get("status") == "pending":
            r["description"] = "(En revisión — el equipo de getamano analizará el caso en 24-48h)"
        # Reporter role stays visible so users see "cliente" vs "proveedor".
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

# ─── SECTION 33 — Featured Providers Reel (paid plans only) ───────────────
# Returns the up-to-20 paid providers (basic/pro/premium → mapped as base/plus/pro
# in the frontend prompt vocabulary) for the landing-page slider. Free plan
# providers are excluded by design — this is the visibility benefit of paying.
@api_router.get("/providers/featured-reel")
async def featured_reel():
    """Featured reel for landing page. Paid plans only, sorted by tier+rating.

    Plan tier mapping (DB → reel-friendly):
      premium ($25) → tier 1  (label "★ Pro")
      pro     ($15) → tier 2  (label "✓ Plus")
      basic   ($10) → tier 3  (label "Activo")
      free          → excluded
    """
    PLAN_TIER = {"premium": 1, "pro": 2, "basic": 3}
    PAID_PLANS = list(PLAN_TIER.keys())

    # First, look at active subscriptions
    paid_subs = await db.subscriptions.find(
        {"plan": {"$in": PAID_PLANS}, "status": "active"},
        {"_id": 0, "user_id": 1, "plan": 1},
    ).to_list(500)
    user_to_plan = {s["user_id"]: s["plan"] for s in paid_subs}

    # Also include legacy `plan` field on provider_profiles (founding members)
    legacy = await db.provider_profiles.find(
        {"plan": {"$in": PAID_PLANS}, "is_active": True, "verification_status": "approved", **PUBLIC_GUARD},
        {"_id": 0, "user_id": 1, "plan": 1},
    ).to_list(500)
    for prof in legacy:
        if prof["user_id"] not in user_to_plan:
            user_to_plan[prof["user_id"]] = prof["plan"]

    if not user_to_plan:
        return []

    # Pull full provider profiles for those users
    profs = await db.provider_profiles.find(
        {
            "user_id": {"$in": list(user_to_plan.keys())},
            "is_active": True,
            "verification_status": "approved",
            **PUBLIC_GUARD,
        },
        {"_id": 0},
    ).to_list(500)

    cats = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(200)}

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # Precompute referrals credited per referrer (gamification engagement signal)
    ref_pipeline = [
        {"$match": {"status": "credited", "referrer_user_id": {"$in": list(user_to_plan.keys())}}},
        {"$group": {"_id": "$referrer_user_id", "n": {"$sum": 1}}},
    ]
    ref_counts = {}
    async for d in db.referrals.aggregate(ref_pipeline):
        ref_counts[d["_id"]] = d.get("n", 0)

    # Online detection — anyone with a session created in the past 7 days
    active_user_ids = set()
    async for d in db.sessions.find(
        {"user_id": {"$in": list(user_to_plan.keys())}, "created_at": {"$gte": week_ago}},
        {"_id": 0, "user_id": 1},
    ):
        active_user_ids.add(d["user_id"])

    out = []
    for p in profs:
        plan = user_to_plan.get(p["user_id"], "basic")
        cat = cats.get(p.get("category_id"))
        out.append({
            "provider_id": p.get("provider_id"),
            "user_id": p.get("user_id"),
            "slug": p.get("slug"),
            "business_name": p.get("business_name"),
            "photo_url": p.get("logo_url") or p.get("photo_url"),
            "main_category": (cat or {}).get("name_es") or p.get("category_name", ""),
            "category_slug": (cat or {}).get("slug"),
            "city": p.get("city"),
            "state": p.get("state"),
            "rating": round(p.get("rating_avg") or 0, 1),
            "reviews_count": p.get("reviews_count") or 0,
            "likes_count": p.get("likes_count") or 0,
            "is_online": p["user_id"] in active_user_ids,
            "verified": p.get("verification_status") == "approved",
            "plan": plan,
            "referrals_credited": ref_counts.get(p["user_id"], 0),
        })

    # Sort: plan tier ascending, then rating descending, then reviews descending
    out.sort(key=lambda x: (
        PLAN_TIER.get(x["plan"], 99),
        -(x["rating"] or 0),
        -(x["reviews_count"] or 0),
    ))
    return out[:20]

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

    # Section 50 — Verified Reviews:
    # A review is "verified" when there's documented prior interaction between
    # the reviewer and the provider — i.e. an existing conversation, a service
    # request submitted, or a booked appointment.
    is_verified = False
    verification_source = None
    try:
        prof = await db.provider_profiles.find_one({"provider_id": payload.provider_id}, {"_id": 0, "user_id": 1})
        provider_user_id = prof.get("user_id") if prof else None

        # 1. Conversation (in-app message exchange)
        conv = await db.conversations.find_one({
            "provider_id": payload.provider_id,
            "client_id": user.user_id,
        }, {"_id": 0, "conversation_id": 1})
        if conv:
            is_verified = True
            verification_source = "messaging"

        # 2. Service request (quote requested)
        if not is_verified:
            req = await db.service_requests.find_one({
                "provider_id": payload.provider_id,
                "client_id": user.user_id,
            }, {"_id": 0, "request_id": 1})
            if req:
                is_verified = True
                verification_source = "service_request"

        # 3. Appointment (booking)
        if not is_verified and provider_user_id:
            appt = await db.appointments.find_one({
                "$or": [
                    {"provider_id": payload.provider_id, "client_user_id": user.user_id},
                    {"provider_user_id": provider_user_id, "client_user_id": user.user_id},
                ]
            }, {"_id": 0, "appointment_id": 1})
            if appt:
                is_verified = True
                verification_source = "appointment"
    except Exception as e:
        logger.warning(f"verified-review-check failed: {e}")

    review = {
        "review_id": f"rev_{uuid.uuid4().hex[:10]}",
        "provider_id": payload.provider_id,
        "user_id": user.user_id, "user_name": user.name,
        "rating": payload.rating, "comment": payload.comment or "",
        "paid_amount_range": payload.paid_amount_range,
        "verified": is_verified,
        "verification_source": verification_source,
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


# ============ SECTION 55 — Saved eCards (extracted) ============
# All `/api/saved-ecards/*` endpoints have been moved to `routes/saved_ecards.py`
# and are wired via `api_router.include_router(...)` near the bottom of this file.


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

        # SECTION 72 — Verification no longer auto-grants a referral reward.
        # The new model (2 paid referees = 1 free month) requires the referee
        # to confirm a PAID subscription, not just verification. This is
        # handled by `mark_referral_paid()` invoked from the Stripe webhook
        # `invoice.payment_succeeded` (or the dev simulate endpoint).
        # Legacy `_grant_referral_reward` is kept for backwards compatibility
        # but no longer triggered here.

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
    # Section 68 / C6 — Simplified to 2 tiers (Free + Pro). CEO direction:
    # remove the 4-plan ladder that created decision fatigue. One paid SKU
    # at $29/mo (or $290/yr → 2 months free).
    # Note: backend keeps the legacy plan ids ('basic', 'pro', 'premium')
    # in PLAN_TIER / PLAN_PRICES dicts so historical subscriptions keep
    # working. We only expose Free + Pro on the public /plans listing.
    return [
        {"id": "free", "name": "Gratis", "name_en": "Free", "price_monthly": 0, "price_annual": 0, "annual_savings": 0,
         "badge": None, "highlight": False,
         "features_es": [
             "eCard básica con enlace único",
             "1 categoría de servicio",
             "Hasta 20 fotos en tu galería",
             "Analytics básicos",
             "Formulario de contacto",
         ],
         "features_en": [
             "Basic eCard with unique link",
             "1 service category",
             "Up to 20 photos in your gallery",
             "Basic analytics",
             "Contact form",
         ]},
        {"id": "pro", "name": "Pro", "name_en": "Pro", "price_monthly": 29, "price_annual": 290, "annual_savings": 58,
         "badge": "Pro", "badge_color": "#F97316", "highlight": True, "label": "Más popular",
         "features_es": [
             "Todo lo de Gratis +",
             "Categorías ilimitadas",
             "Fotos ilimitadas + 1 video de presentación",
             "Mejor posición en búsquedas",
             "Notificaciones en tiempo real",
             "Botón WhatsApp directo",
             "Responder reseñas",
             "Boosts mensuales de visibilidad",
             "Reportes avanzados",
             "Soporte prioritario",
         ],
         "features_en": [
             "Everything in Free +",
             "Unlimited categories",
             "Unlimited photos + 1 presentation video",
             "Better search ranking",
             "Real-time notifications",
             "Direct WhatsApp button",
             "Respond to reviews",
             "Monthly visibility boosts",
             "Advanced reports",
             "Priority support",
         ]},
    ]


# ════════════════════════════════════════════════════════════════════
# SECTION 26 — Subscription management (annual plans + FTC cancellation)
# ════════════════════════════════════════════════════════════════════
# We're pre-Stripe — these endpoints record the user's intent and lifecycle
# so that when Stripe Connect goes live we can swap the in-memory record for
# real billing without changing the frontend. The cancellation flow is FTC
# "Click-to-Cancel Rule" compliant: one click from the dashboard, immediate
# email confirmation, access preserved until the paid period ends.

_PLAN_PRICES = {
    "free":    {"monthly": 0,  "annual": 0,   "savings": 0},
    "basic":   {"monthly": 10, "annual": 100, "savings": 20},
    "pro":     {"monthly": 15, "annual": 150, "savings": 30},
    "premium": {"monthly": 25, "annual": 250, "savings": 50},
}

class SubscribeIn(BaseModel):
    plan: str  # "free" | "basic" | "pro" | "premium"
    billing_cycle: Optional[str] = "monthly"

class CancelSubIn(BaseModel):
    reason: Optional[str] = None

def _renewal_in_days(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

def _cancellation_email_html(name: str, plan_label: str, access_until: str, locale: str = "es") -> str:
    is_en = locale.startswith("en")
    headline = "Subscription cancelled" if is_en else "Suscripción cancelada"
    body1 = (f"We've confirmed your <strong>{plan_label}</strong> plan cancellation."
             if is_en else f"Confirmamos que tu plan <strong>{plan_label}</strong> ha sido cancelado.")
    body2 = (f"Your access stays active until <strong>{access_until}</strong>. After that you'll automatically move to the free plan."
             if is_en else f"Tu acceso sigue activo hasta el <strong>{access_until}</strong>. Después pasarás automáticamente al plan Gratis.")
    body3 = ("Changed your mind? Reactivate anytime in your dashboard."
             if is_en else "¿Cambiaste de opinión? Reactiva en cualquier momento desde tu panel.")
    contact = "Questions? hola@getamano.us" if is_en else "¿Dudas? Escríbenos a hola@getamano.us"
    return f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:40px 20px;"><tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.06);">
  <tr><td style="background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);padding:32px 28px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">getamano</h1>
  </td></tr>
  <tr><td style="padding:36px 32px;">
    <h2 style="margin:0 0 16px 0;color:#0F172A;font-size:22px;font-weight:700;">{headline}</h2>
    <p style="margin:0 0 12px 0;color:#475569;font-size:15px;line-height:1.6;">Hola {name},</p>
    <p style="margin:0 0 12px 0;color:#475569;font-size:15px;line-height:1.6;">{body1}</p>
    <p style="margin:0 0 12px 0;color:#475569;font-size:15px;line-height:1.6;">{body2}</p>
    <p style="margin:0 0 24px 0;color:#475569;font-size:15px;line-height:1.6;">{body3}</p>
    <p style="margin:24px 0 0 0;color:#94A3B8;font-size:12px;">{contact}</p>
  </td></tr>
</table></td></tr></table></body></html>"""


@api_router.get("/me/subscription")
async def get_my_subscription(user: User = Depends(get_current_user)):
    sub = await db.subscriptions.find_one({"user_id": user.user_id}, {"_id": 0})
    if not sub:
        return {
            "plan": "free", "billing_cycle": "monthly", "amount": 0,
            "annual_discount_applied": False, "status": "active",
            "next_renewal_date": None, "cancelled_at": None,
        }
    return sub

@api_router.post("/me/subscription")
async def subscribe(payload: SubscribeIn, request: Request, user: User = Depends(get_current_user)):
    plan = payload.plan if payload.plan in _PLAN_PRICES else "free"
    billing = payload.billing_cycle if payload.billing_cycle in ("monthly", "annual") else "monthly"
    prices = _PLAN_PRICES[plan]
    amount = prices["annual"] if billing == "annual" else prices["monthly"]
    now = datetime.now(timezone.utc).isoformat()
    days = 365 if billing == "annual" else 30
    sub_doc = {
        "user_id": user.user_id,
        "plan": plan,
        "billing_cycle": billing,
        "amount": amount,
        "annual_discount_applied": billing == "annual" and plan != "free",
        "next_renewal_date": _renewal_in_days(days) if plan != "free" else None,
        "status": "active",
        "cancelled_at": None,
        "cancel_reason": None,
        "updated_at": now,
    }
    existing = await db.subscriptions.find_one({"user_id": user.user_id}, {"_id": 0})
    if existing:
        await db.subscriptions.update_one({"user_id": user.user_id}, {"$set": sub_doc})
    else:
        sub_doc["created_at"] = now
        await db.subscriptions.insert_one(sub_doc)
    await audit_log(user.user_id, "subscription.upserted", {"plan": plan, "billing_cycle": billing}, request)
    sub_doc.pop("_id", None)
    return sub_doc

@api_router.post("/me/subscription/cancel")
async def cancel_my_subscription(payload: CancelSubIn, request: Request, user: User = Depends(get_current_user)):
    """FTC Click-to-Cancel — flag the sub as cancelled, keep access until next_renewal_date."""
    sub = await db.subscriptions.find_one({"user_id": user.user_id}, {"_id": 0})
    if not sub or sub.get("plan") == "free":
        raise HTTPException(status_code=400, detail="No tienes una suscripción de pago activa.")
    if sub.get("status") == "cancelled":
        return {**sub, "_already_cancelled": True}
    now = datetime.now(timezone.utc).isoformat()
    await db.subscriptions.update_one(
        {"user_id": user.user_id, "status": "active"},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": now,
            "cancel_reason": (payload.reason or "").strip()[:280] or None,
            "updated_at": now,
        }},
    )
    await audit_log(user.user_id, "subscription.cancelled", {"plan": sub.get("plan"), "reason": payload.reason}, request)

    # FTC requires immediate email confirmation — fall back to log when Resend not configured.
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "email": 1, "name": 1, "language": 1})
    if user_doc and user_doc.get("email"):
        locale = (user_doc.get("language") or "es").lower()
        plan_label = {"basic": "Básico", "pro": "Pro", "premium": "Premium"}.get(sub.get("plan"), sub.get("plan", "").title())
        next_date = (sub.get("next_renewal_date") or now)[:10]
        subject = ("Tu suscripción a getamano ha sido cancelada"
                   if locale.startswith("es") else "Your getamano subscription has been cancelled")
        html = _cancellation_email_html(
            name=user_doc.get("name") or "amigo",
            plan_label=plan_label,
            access_until=next_date,
            locale=locale,
        )
        await _send_email_via_resend(user_doc["email"], subject, html)

    return await db.subscriptions.find_one({"user_id": user.user_id}, {"_id": 0})

@api_router.post("/me/subscription/reactivate")
async def reactivate_my_subscription(request: Request, user: User = Depends(get_current_user)):
    """Undo a cancellation before the next renewal date hits."""
    sub = await db.subscriptions.find_one({"user_id": user.user_id}, {"_id": 0})
    if not sub or sub.get("status") != "cancelled":
        raise HTTPException(status_code=400, detail="Tu suscripción no está cancelada.")
    next_date = sub.get("next_renewal_date")
    try:
        if next_date and datetime.fromisoformat(next_date) < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="El periodo ya expiró. Elige un plan en /plans.")
    except (TypeError, ValueError):
        pass
    await db.subscriptions.update_one(
        {"user_id": user.user_id},
        {"$set": {"status": "active", "cancelled_at": None, "cancel_reason": None,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await audit_log(user.user_id, "subscription.reactivated", {"plan": sub.get("plan")}, request)
    return await db.subscriptions.find_one({"user_id": user.user_id}, {"_id": 0})


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

# ============ WEEKLY GIG DIGEST ENDPOINTS ============
@api_router.get("/providers/me/weekly-digest")
async def get_my_weekly_digest(user: User = Depends(get_current_user)):
    """Provider preview — what the digest will look like *right now*."""
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores tienen digest semanal.")
    digest = await _compute_provider_weekly_digest(user.user_id)
    if not digest:
        return {"available": False, "reason": "no_matching_gigs"}
    # Strip the email + user_id from the public-facing preview
    digest.pop("email", None)
    digest.pop("user_id", None)
    digest["available"] = True
    return digest

@api_router.post("/admin/digest/send-weekly")
async def admin_send_weekly_digest(request: Request, admin: User = Depends(require_admin)):
    """Fan out the weekly gig digest to all eligible verified providers.

    Eligibility: active + approved + has category_id + has city + has email.
    Returns the per-provider send result so admin can audit. When
    RESEND_API_KEY is not set we still iterate but the email goes to backend
    logs only (dev-fallback) — useful for staging dry runs.
    """
    # Pick the public URL from the request — falls back to env if needed
    forwarded = request.headers.get("origin") or request.headers.get("referer") or ""
    public_url = forwarded.split("/api", 1)[0] if forwarded else os.environ.get("PUBLIC_URL", "https://getamano.us")
    eligible = await db.provider_profiles.find(
        {
            "is_active": True,
            "verification_status": "approved",
            "category_id": {"$exists": True, "$ne": None},
            "city": {"$exists": True, "$ne": None},
            "business_name": {"$not": {"$regex": "^TEST_"}},
        },
        {"_id": 0, "user_id": 1},
    ).limit(500).to_list(500)
    results = []
    for prof in eligible:
        try:
            res = await _send_weekly_digest_to_provider(prof["user_id"], public_url)
            results.append(res)
        except Exception as e:
            logger.warning(f"weekly digest failed for {prof.get('user_id')}: {e}")
            results.append({"user_id": prof.get("user_id"), "sent": False, "reason": "exception"})
    sent = sum(1 for r in results if r.get("sent"))
    skipped = sum(1 for r in results if r.get("skipped"))
    await audit_log(admin.user_id, "digest.weekly_sent", {"sent": sent, "skipped": skipped, "total": len(results)}, request)
    return {"ok": True, "sent": sent, "skipped": skipped, "total": len(results), "results": results[:50]}

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
            {"$set": {"last_message": payload.body[:140], "last_at": now, "unread_for_provider": True},
             "$unset": {"client_nudge_sent_at": "", "client_nudge_delivery": "",
                        "client_nudge_skipped_reason": "", "client_nudge_alternatives_count": ""}}
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
    # Match both legacy `client_id` and new `participant_user_id` schemas.
    query = {"$or": [
        {"client_id": user.user_id},
        {"participant_user_id": user.user_id},
        {"provider_user_id": user.user_id},
    ]}
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
    # Conversations have two possible schemas:
    #   · Old schema: {client_id, provider_user_id, unread_for_provider, unread_for_client}
    #   · New schema: {participant_user_id, provider_user_id, unread_count_provider, unread_count_participant}
    # We accept both to keep all historical threads readable.
    is_provider = conv.get("provider_user_id") == user.user_id
    is_client = (conv.get("client_id") == user.user_id) or (conv.get("participant_user_id") == user.user_id)
    if not (is_provider or is_client):
        raise HTTPException(status_code=403, detail="Not your conversation")
    # Mark read for the side viewing — write BOTH legacy fields so list_conversations
    # picks it up regardless of schema. Harmless if the field doesn't exist.
    if is_provider:
        update = {"unread_for_provider": False, "unread_count_provider": 0}
    else:
        update = {"unread_for_client": False, "unread_count_participant": 0}
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


# ════════════════════════════════════════════════════════════════════════
# ════════════════════════════════════════════════════════════════════════
# SECTION 35+36+42 — Community module (REFACTORED into routes/community.py)
# ════════════════════════════════════════════════════════════════════════
# Mounted below, after audit_log is defined.


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
    # Section 30 — also include ad-hoc inserted notifications (gig fanout,
    # gig applicant alerts) which don't come from the rule engine.
    seen_keys = {n.get("notification_key") for n in notes if n.get("notification_key")}
    raw = await db.notifications.find(
        {
            "user_id": user.user_id,
            "category": {"$in": ["gigs", "referrals", "streaks", "rewards", "community", "follow", "credits"]},
            "dismissed_at": None,
        },
        {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)
    for r in raw:
        if r.get("notification_key") in seen_keys:
            continue
        notes.append(r)
    # Re-sort merged list
    notes.sort(key=lambda x: (PRIO_NUMERIC.get(x.get("priority", "medium"), 1), x.get("is_read", False), -1 * (datetime.fromisoformat(x["created_at"].replace("Z", "+00:00")).timestamp() if x.get("created_at") else 0)))
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


import asyncio
# ════════════════════════════════════════════════════════════════════════
# Periodic jobs that the platform needs to run on its own:
#   • Monthly leaderboard snapshot (1st of month, after 06:00 UTC)
#   • Daily streak reminders (after 19:00 UTC)
# State persisted in `scheduler_state` collection keyed by job_name so we
# never double-run within the same window even if the backend restarts.
# Loops every 30 minutes — light enough to be a no-op when off-schedule.
# ════════════════════════════════════════════════════════════════════════

SCHEDULER_TICK_SECONDS = 1800  # 30 minutes


async def _job_should_run(job_name: str, since_iso: str) -> bool:
    """Return True if the job hasn't run since `since_iso`."""
    rec = await db.scheduler_state.find_one({"job_name": job_name}, {"_id": 0, "last_run_at": 1})
    if not rec or not rec.get("last_run_at"):
        return True
    return rec["last_run_at"] < since_iso


async def _job_mark_done(job_name: str, payload: dict | None = None):
    await db.scheduler_state.update_one(
        {"job_name": job_name},
        {"$set": {
            "job_name": job_name,
            "last_run_at": datetime.now(timezone.utc).isoformat(),
            "last_result": payload or {},
        }},
        upsert=True,
    )


async def _run_monthly_snapshot_job():
    """Runs the leaderboard snapshot for the previous calendar month.
    Runs on the 1st of each month after 06:00 UTC. Skipped if already done
    this month per scheduler_state.
    """
    now = datetime.now(timezone.utc)
    if now.day != 1 or now.hour < 6:
        return None
    # Window key — won't re-run within the same calendar month
    month_window_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    if not await _job_should_run("monthly_leaderboard_snapshot", month_window_start):
        return None
    window_start, window_end = _previous_month_window()
    month_key = window_start.strftime("%Y-%m")
    rows = await _compute_leaderboard_for_window(window_start.isoformat(), window_end.isoformat())
    if not rows:
        await _job_mark_done("monthly_leaderboard_snapshot", {"month": month_key, "snapshotted": 0, "coupons_created": 0})
        return {"month": month_key, "snapshotted": 0, "coupons_created": 0}
    eligible = rows[:50]
    created = 0
    for r in eligible:
        tier = _tier_for_rank(r["rank"])
        if not tier:
            continue
        doc = await _create_coupon_for_provider(r["user_id"], r["rank"], tier, month_key)
        if doc:
            created += 1
    await _job_mark_done("monthly_leaderboard_snapshot", {"month": month_key, "snapshotted": len(rows), "coupons_created": created})
    logger.info(f"[scheduler] Monthly snapshot complete: month={month_key} snapshotted={len(rows)} coupons_created={created}")
    return {"month": month_key, "snapshotted": len(rows), "coupons_created": created}


async def _run_daily_streak_reminders_job():
    """Runs the streak reminder fan-out once per UTC day after 19:00 UTC."""
    now = datetime.now(timezone.utc)
    if now.hour < 19:
        return None
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    if not await _job_should_run("daily_streak_reminders", today_start):
        return None
    rows_streaks = await db.streaks.find(
        {"current_days": {"$gte": 3}},
        {"_id": 0, "user_id": 1, "provider_id": 1},
    ).to_list(2000)
    queued = 0
    skipped = 0
    for r in rows_streaks:
        try:
            streak = await _compute_streak(r["user_id"], r["provider_id"])
            res = await _enqueue_streak_reminder_for(r["user_id"], r["provider_id"], streak)
            if res:
                queued += 1
            else:
                skipped += 1
        except Exception as e:
            logger.warning(f"[scheduler] streak reminder failed for {r.get('user_id')}: {e}")
            skipped += 1
    await _job_mark_done("daily_streak_reminders", {"queued": queued, "skipped": skipped, "scanned": len(rows_streaks)})
    logger.info(f"[scheduler] Daily streak reminders: queued={queued} skipped={skipped} scanned={len(rows_streaks)}")
    return {"queued": queued, "skipped": skipped, "scanned": len(rows_streaks)}


async def _run_weekly_health_email_job():
    """Fan-out the weekly eCard health email every Monday after 10:00 UTC.
    Skipped if already done this week per scheduler_state."""
    now = datetime.now(timezone.utc)
    if now.weekday() != 0 or now.hour < 10:
        return None
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    if not await _job_should_run("weekly_health_email", week_start):
        return None
    public_url = (os.environ.get("PUBLIC_URL") or "https://getamano.us").rstrip("/")
    eligible = await db.provider_profiles.find(
        {
            "is_active": True,
            "verification_status": "approved",
            "business_name": {"$not": {"$regex": "^TEST_"}},
        },
        {"_id": 0, "user_id": 1},
    ).limit(2000).to_list(2000)
    sent = skipped = errors = 0
    for prof in eligible:
        try:
            res = await _send_health_email_to_provider(prof["user_id"], public_url)
            if res.get("sent"):
                sent += 1
            elif res.get("skipped"):
                skipped += 1
            else:
                errors += 1
        except Exception as e:
            logger.warning(f"[scheduler] weekly health email failed for {prof.get('user_id')}: {e}")
            errors += 1
    await _job_mark_done("weekly_health_email", {
        "sent": sent, "skipped": skipped, "errors": errors, "scanned": len(eligible),
    })
    logger.info(f"[scheduler] Weekly health email: sent={sent} skipped={skipped} errors={errors} scanned={len(eligible)}")
    return {"sent": sent, "skipped": skipped, "errors": errors, "scanned": len(eligible)}


async def _run_client_nudge_job():
    """Send the 'no-limbo' email to clients whose conversations have been
    sitting unanswered >24h. Runs on every scheduler tick — idempotent per
    conversation via `client_nudge_sent_at` flag, so frequent ticks are safe."""
    public_url = (os.environ.get("PUBLIC_URL") or "https://getamano.us").rstrip("/")
    pending = await _find_stale_unanswered_conversations(limit=200)
    if not pending:
        return None
    sent = 0
    errors = 0
    for conv in pending:
        try:
            res = await _send_client_nudge_for_conversation(conv, public_url)
            if res.get("sent"):
                sent += 1
        except Exception as e:
            logger.warning(f"[scheduler] client nudge failed for {conv.get('conversation_id')}: {e}")
            errors += 1
    if sent or errors:
        logger.info(f"[scheduler] client nudge job: sent={sent} errors={errors} scanned={len(pending)}")
    return {"sent": sent, "errors": errors, "scanned": len(pending)}


async def _scheduler_loop():
    """Background task. Loops forever until cancelled at shutdown."""
    logger.info("[scheduler] Background scheduler started")
    while True:
        try:
            await _run_monthly_snapshot_job()
        except Exception:
            logger.exception("[scheduler] monthly snapshot job failed")
        try:
            await _run_daily_streak_reminders_job()
        except Exception:
            logger.exception("[scheduler] daily streak reminders job failed")
        try:
            await _run_weekly_health_email_job()
        except Exception:
            logger.exception("[scheduler] weekly health email job failed")
        try:
            await _run_client_nudge_job()
        except Exception:
            logger.exception("[scheduler] client nudge job failed")
        await asyncio.sleep(SCHEDULER_TICK_SECONDS)


_scheduler_task = None


@app.on_event("startup")
async def _start_scheduler():
    global _scheduler_task
    if _scheduler_task is None:
        _scheduler_task = asyncio.create_task(_scheduler_loop())


@app.on_event("shutdown")
async def _stop_scheduler():
    global _scheduler_task
    if _scheduler_task:
        _scheduler_task.cancel()
        _scheduler_task = None


@api_router.get("/admin/scheduler/status")
async def admin_scheduler_status(_: User = Depends(require_admin)):
    """Inspect the in-process scheduler state."""
    rows = await db.scheduler_state.find({}, {"_id": 0}).to_list(20)
    return {
        "running": _scheduler_task is not None and not _scheduler_task.done() if _scheduler_task else False,
        "tick_seconds": SCHEDULER_TICK_SECONDS,
        "jobs": rows,
    }


@api_router.post("/admin/scheduler/run-now")
async def admin_scheduler_run_now(job: str, admin: User = Depends(require_admin), request: Request = None):
    """Force-run a scheduled job NOW, bypassing the time-of-day checks. Useful
    for E2E testing and demoing automation to the CEO without waiting for the
    1st of the month or 7pm UTC.
    """
    if job == "monthly_leaderboard_snapshot":
        window_start, window_end = _previous_month_window()
        month_key = window_start.strftime("%Y-%m")
        rows = await _compute_leaderboard_for_window(window_start.isoformat(), window_end.isoformat())
        eligible = rows[:50]
        created = 0
        for r in eligible:
            tier = _tier_for_rank(r["rank"])
            if tier:
                doc = await _create_coupon_for_provider(r["user_id"], r["rank"], tier, month_key)
                if doc:
                    created += 1
        await _job_mark_done("monthly_leaderboard_snapshot", {"month": month_key, "snapshotted": len(rows), "coupons_created": created, "forced": True})
        if request:
            await audit_log(admin.user_id, "scheduler.force_run", {"job": job, "month": month_key, "coupons_created": created}, request)
        return {"ok": True, "job": job, "month": month_key, "snapshotted": len(rows), "coupons_created": created}
    elif job == "daily_streak_reminders":
        rows_streaks = await db.streaks.find({"current_days": {"$gte": 3}}, {"_id": 0, "user_id": 1, "provider_id": 1}).to_list(2000)
        queued = 0
        skipped = 0
        for r in rows_streaks:
            try:
                streak = await _compute_streak(r["user_id"], r["provider_id"])
                res = await _enqueue_streak_reminder_for(r["user_id"], r["provider_id"], streak)
                if res:
                    queued += 1
                else:
                    skipped += 1
            except Exception:
                skipped += 1
        await _job_mark_done("daily_streak_reminders", {"queued": queued, "skipped": skipped, "forced": True})
        if request:
            await audit_log(admin.user_id, "scheduler.force_run", {"job": job, "queued": queued}, request)
        return {"ok": True, "job": job, "queued": queued, "skipped": skipped, "scanned": len(rows_streaks)}
    raise HTTPException(status_code=400, detail=f"Unknown job '{job}'. Valid: monthly_leaderboard_snapshot, daily_streak_reminders")


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


# Section 43 — eCard health checklist endpoint.
# Returns the COMPLETE checklist (each rule with status: 'done' | 'missing'),
# decorated with an icon + an impact_message so the frontend can render a
# gamified setup widget. Built on top of _completion_for's rule list to
# stay DRY.

_HEALTH_DECORATIONS = {
    "logo_url":        ("image",      "critical", "Sin logo, pierdes 60% de reconocimiento de marca."),
    "description":     ("text",       "critical", "Una descripción vacía baja un 70% el click-through."),
    "category_id":     ("tag",        "critical", "Sin categoría, no apareces en búsquedas."),
    "service_areas":   ("map",        "high",     "Define tus zonas — clientes filtran por ciudad."),
    "phone":           ("phone",      "critical", "Tu teléfono es el canal de contacto #1 de los latinos."),
    "hours":           ("clock",      "medium",   "Sin horario, clientes no saben cuándo escribirte."),
    "gallery":         ("camera",     "critical", "Una eCard sin fotos pierde 70% de leads."),
    "rates":           ("dollar",     "high",     "Tarifas referenciales aumentan 40% la confianza."),
    "calendar_active": ("calendar",   "medium",   "Calendario activo + 35% más bookings directos."),
    "rating_count":    ("star",       "high",     "Tu primera reseña dispara conversión 3×."),
}


def _build_health_items(profile: dict) -> dict:
    """Pure-function eCard health checklist builder used by both the
    /providers/me/health endpoint and the weekly outbound email.
    Expects `profile["_has_rates"]` already populated by the caller."""
    rules = [
        ("logo_url", "Foto de perfil", 10, "/dashboard/provider?tab=perfil"),
        ("description", "Descripción del negocio", 15, "/dashboard/provider?tab=perfil"),
        ("category_id", "Categoría de servicio", 10, "/dashboard/provider?tab=perfil"),
        ("service_areas", "Zonas de cobertura", 10, "/dashboard/provider?tab=perfil"),
        ("phone", "Número de teléfono", 10, "/dashboard/provider?tab=perfil"),
        ("hours", "Horario de atención", 10, "/dashboard/provider?tab=perfil"),
        ("gallery", "Fotos en la galería", 10, "/dashboard/provider?tab=galeria"),
        ("rates", "Tarifas referenciales", 10, "/dashboard/provider?tab=tarifas"),
        ("calendar_active", "Calendario activo", 10, "/dashboard/provider?tab=calendario"),
        ("rating_count", "Primera reseña", 5, "/dashboard/provider?tab=resenas"),
    ]
    items, score = [], 0
    for field, label, pts, deep in rules:
        v = profile.get(field)
        if field == "gallery":
            done = bool(v and len(v) > 0)
        elif field == "service_areas":
            done = bool(v and len(v) > 0)
        elif field == "rates":
            done = bool(profile.get("_has_rates"))
        elif field == "calendar_active":
            done = bool(profile.get("calendar_active"))
        elif field == "rating_count":
            done = (v or 0) > 0
        else:
            done = bool(v) and (not isinstance(v, str) or v.strip())
        icon, severity, impact = _HEALTH_DECORATIONS.get(field, ("dot", "low", ""))
        if done:
            score += pts
        items.append({
            "key": field, "label": label, "points": pts, "deep_link": deep,
            "status": "done" if done else "missing",
            "icon": icon, "severity": severity,
            "impact": impact if not done else "",
        })
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items.sort(key=lambda it: (
        0 if it["status"] == "missing" else 1,
        severity_order.get(it["severity"], 4),
        -it["points"],
    ))
    return {"score": score, "items": items}


@api_router.get("/providers/me/health")
async def my_ecard_health(user: User = Depends(get_current_user)):
    """Full eCard checklist used by EcardHealth widget on the provider dashboard."""
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    has_rates = await db.provider_rates.count_documents({"provider_id": prof.get("provider_id")}) > 0
    prof["_has_rates"] = has_rates
    return _build_health_items(prof)


# ════════════════════════════════════════════════════════════════════
# Section 43B — Weekly "Tu eCard esta semana" outbound email
# ════════════════════════════════════════════════════════════════════
# Sent every Monday 10am UTC to providers with score < 100 AND a verified
# email. Pulls the same health checklist used by the on-screen widget, plus
# the rolling-7-day delta of profile views, contact_clicks, and reviews.
# Idempotent: scheduler_state job_key "weekly_health_email" tracks last run.

def _build_health_email_html(*, business_name: str, score: int, items: list,
                             week_views: int, week_contacts: int,
                             week_reviews: int, public_url: str,
                             dashboard_url: str) -> str:
    first_name = (business_name or "Proveedor").split(" ")[0]
    missing = [it for it in items if it["status"] == "missing"]
    next_item = missing[0] if missing else None
    next_block = ""
    if next_item:
        next_block = f"""
        <tr><td style="padding: 16px 24px;">
          <div style="background:#F0FAF9;border:1px solid #9FE1CB;border-radius:12px;padding:16px;">
            <p style="margin:0 0 4px 0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;color:#025F67;">Tu próximo paso</p>
            <p style="margin:0 0 6px 0;font-size:16px;font-weight:700;color:#0F172A;">{next_item['label']} <span style="display:inline-block;background:#025F67;color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;margin-left:4px;">+{next_item['points']}</span></p>
            <p style="margin:0 0 12px 0;font-size:13px;line-height:1.45;color:#475569;">{next_item['impact'] or ''}</p>
            <a href="{public_url}{next_item['deep_link']}" style="display:inline-block;background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);color:#fff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 18px;border-radius:999px;">Completar ahora →</a>
          </div>
        </td></tr>
        """
    perfect_block = "" if next_item else """
        <tr><td style="padding:16px 24px;">
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:12px;padding:16px;text-align:center;">
            <p style="margin:0;font-size:16px;font-weight:700;color:#065F46;">🏆 ¡Tu eCard está perfecta!</p>
            <p style="margin:6px 0 0 0;font-size:13px;color:#047857;">Cada reseña nueva sube tu visibilidad en búsqueda.</p>
          </div>
        </td></tr>
    """
    stats_block = f"""
        <tr><td style="padding:0 24px 8px 24px;">
          <p style="margin:0 0 8px 0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;color:#94A3B8;">Tu eCard esta semana</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="33%" style="text-align:center;padding:10px 4px;background:#F8FAFC;border-radius:10px;">
                <div style="font-size:22px;font-weight:800;color:#0F172A;line-height:1;">{week_views}</div>
                <div style="font-size:11px;color:#64748B;margin-top:4px;">vistas</div>
              </td>
              <td width="6"></td>
              <td width="33%" style="text-align:center;padding:10px 4px;background:#F8FAFC;border-radius:10px;">
                <div style="font-size:22px;font-weight:800;color:#0F172A;line-height:1;">{week_contacts}</div>
                <div style="font-size:11px;color:#64748B;margin-top:4px;">contactos</div>
              </td>
              <td width="6"></td>
              <td width="33%" style="text-align:center;padding:10px 4px;background:#F8FAFC;border-radius:10px;">
                <div style="font-size:22px;font-weight:800;color:#0F172A;line-height:1;">{week_reviews}</div>
                <div style="font-size:11px;color:#64748B;margin-top:4px;">reseñas</div>
              </td>
            </tr>
          </table>
        </td></tr>
    """
    ring_pct = max(0, min(100, score))
    ring_color = "#1D9E75" if ring_pct >= 90 else "#2F9D94" if ring_pct >= 70 else "#F59E0B" if ring_pct >= 50 else "#EF4444"

    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:540px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 12px 36px rgba(2,95,103,0.08);">
      <tr><td style="background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);padding:28px 24px;text-align:left;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">getamano</h1>
        <p style="margin:4px 0 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Tu eCard esta semana</p>
      </td></tr>

      <tr><td style="padding:24px 24px 8px 24px;">
        <p style="margin:0 0 4px 0;font-size:15px;color:#475569;">Hola <strong style="color:#0F172A;">{first_name}</strong>,</p>
        <p style="margin:0 0 16px 0;font-size:14px;color:#475569;line-height:1.55;">
          Aquí va tu mini-resumen — los proveedores con perfil completo reciben hasta 2× más solicitudes.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="80" style="vertical-align:top;">
              <div style="width:72px;height:72px;border-radius:50%;background:conic-gradient({ring_color} {ring_pct}%,#F1F5F9 0);display:flex;align-items:center;justify-content:center;position:relative;">
                <div style="background:#fff;border-radius:50%;width:54px;height:54px;text-align:center;line-height:54px;">
                  <span style="font-size:18px;font-weight:800;color:#0F172A;">{score}</span>
                </div>
              </div>
            </td>
            <td style="padding-left:14px;vertical-align:middle;">
              <p style="margin:0;font-size:16px;font-weight:700;color:#0F172A;">Salud de tu eCard: <span style="color:{ring_color};">{score}/100</span></p>
              <p style="margin:4px 0 0 0;font-size:13px;color:#64748B;">
                {len([i for i in items if i['status']=='done'])}/{len(items)} elementos listos.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>

      {stats_block}
      {next_block}
      {perfect_block}

      <tr><td style="padding:16px 24px 24px 24px;text-align:center;">
        <a href="{dashboard_url}" style="display:inline-block;background:#0F172A;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 20px;border-radius:999px;">Abrir mi panel completo</a>
      </td></tr>

      <tr><td style="background:#F8FAFC;padding:18px 24px;text-align:center;border-top:1px solid #E2E8F0;">
        <p style="margin:0 0 4px 0;color:#94A3B8;font-size:11px;">
          Te enviamos este resumen porque eres proveedor verificado en getamano.
        </p>
        <p style="margin:0;color:#CBD5E1;font-size:10px;">
          © getamano 2026 — Latin Ventures LLC
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


async def _gather_health_email_data(user_id: str) -> Optional[dict]:
    """Return the payload needed to render and send a weekly health email, or
    None when the provider is ineligible (no profile / no email / no email_verified)."""
    prof = await db.provider_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not prof:
        return None
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "email_verified": 1})
    if not user or not user.get("email") or not user.get("email_verified"):
        return None
    has_rates = await db.provider_rates.count_documents({"provider_id": prof.get("provider_id")}) > 0
    prof["_has_rates"] = has_rates
    health = _build_health_items(prof)
    return {
        "email": user["email"],
        "business_name": prof.get("business_name") or user.get("name") or "Proveedor",
        "score": health["score"],
        "items": health["items"],
        "week_views": prof.get("views") or 0,
        "week_contacts": prof.get("contact_clicks") or 0,
        "week_reviews": prof.get("reviews_count") or 0,
    }


async def _send_health_email_to_provider(user_id: str, public_url: str) -> dict:
    data = await _gather_health_email_data(user_id)
    if not data:
        return {"user_id": user_id, "sent": False, "skipped": True, "reason": "ineligible"}
    # Skip providers whose eCard is already perfect — no nudge needed.
    if data["score"] >= 100:
        return {"user_id": user_id, "sent": False, "skipped": True, "reason": "score_perfect"}
    dashboard_url = f"{public_url}/dashboard/provider"
    html = _build_health_email_html(
        business_name=data["business_name"],
        score=data["score"],
        items=data["items"],
        week_views=data["week_views"],
        week_contacts=data["week_contacts"],
        week_reviews=data["week_reviews"],
        public_url=public_url,
        dashboard_url=dashboard_url,
    )
    subject = "Tu eCard esta semana · getamano"
    result = await _send_email_via_resend(data["email"], subject, html)
    return {"user_id": user_id, "sent": bool(result.get("sent")),
            "skipped": False, "reason": result.get("reason", "ok")}


@api_router.get("/providers/me/health-email/preview")
async def my_health_email_preview(user: User = Depends(get_current_user)):
    """Provider preview — returns the email payload so the dashboard can show what will be sent."""
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores reciben este resumen.")
    data = await _gather_health_email_data(user.user_id)
    if not data:
        return {"available": False, "reason": "ineligible"}
    return {"available": True, **data}


# ════════════════════════════════════════════════════════════════════
# Section 44 — Admin bulk provider onboarding
# ════════════════════════════════════════════════════════════════════

class BulkProviderRow(BaseModel):
    email: str
    name: str
    business_name: str
    phone: Optional[str] = None
    category_id: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None


class BulkProvidersIn(BaseModel):
    providers: List[BulkProviderRow]
    send_activation_email: bool = True


def _generate_temp_password(length: int = 12) -> str:
    """Readable temporary password (no ambiguous chars) for CEO copy-paste."""
    alphabet = string.ascii_uppercase + string.ascii_lowercase + string.digits
    alphabet = "".join(c for c in alphabet if c not in "0OoIl1")
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def _generate_unique_slug(business_name: str, city: str, state: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (business_name or "negocio").lower()).strip("-")[:40]
    if city:
        base += "-" + re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")[:20]
    if state:
        base += "-" + state.lower()
    base = re.sub(r"-+", "-", base).strip("-") or "negocio"
    slug = base
    n = 1
    while await db.provider_profiles.find_one({"slug": slug}, {"_id": 1}):
        n += 1
        slug = f"{base}-{n}"
    return slug


def _bulk_activation_email_html(*, business_name: str, activation_url: str) -> str:
    safe_name = business_name or "tu negocio"
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:40px 20px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:540px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.06);">
      <tr><td style="background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);padding:32px 28px;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">¡Bienvenido a getamano!</h1>
        <p style="margin:6px 0 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Tu eCard ya está lista para ti</p>
      </td></tr>
      <tr><td style="padding:28px 28px 8px 28px;">
        <p style="margin:0 0 12px 0;font-size:15px;color:#475569;line-height:1.55;">
          Hola, somos el equipo de getamano. Conocimos tu negocio <strong style="color:#025F67;">{safe_name}</strong> y nos encantó —
          tanto que ya te dejamos una eCard creada con tus datos básicos.
        </p>
        <p style="margin:0 0 20px 0;font-size:15px;color:#475569;line-height:1.55;">
          Para tomar el control de tu cuenta, sólo crea tu contraseña. Después podrás cambiar tu correo, completar tu perfil, subir fotos y empezar a recibir clientes.
        </p>
        <div style="text-align:center;margin:18px 0;">
          <a href="{activation_url}" style="display:inline-block;background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:bold;font-size:15px;">Activar mi cuenta →</a>
        </div>
        <p style="margin:18px 0 0 0;color:#94A3B8;font-size:12px;text-align:center;">
          O copia este enlace en tu navegador:<br/>
          <span style="color:#64748B;font-size:11px;word-break:break-all;">{activation_url}</span>
        </p>
        <p style="margin:24px 0 0 0;color:#94A3B8;font-size:12px;line-height:1.5;">
          El enlace es válido por 14 días. Si no fuiste tú, ignora este correo.
        </p>
      </td></tr>
      <tr><td style="background:#F8FAFC;padding:18px 28px;text-align:center;border-top:1px solid #E2E8F0;">
        <p style="margin:0;color:#94A3B8;font-size:11px;">© getamano 2026 — Latin Ventures LLC</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


@api_router.post("/admin/providers/bulk-create")
async def admin_bulk_create_providers(payload: BulkProvidersIn, request: Request, admin: User = Depends(require_admin)):
    """Create multiple provider accounts from business-card-style data."""
    if not payload.providers:
        raise HTTPException(status_code=400, detail="No providers in payload.")
    if len(payload.providers) > 50:
        raise HTTPException(status_code=400, detail="Máximo 50 proveedores por lote.")

    forwarded = request.headers.get("origin") or request.headers.get("referer") or ""
    public_url = forwarded.split("/api", 1)[0] if forwarded else os.environ.get("PUBLIC_URL", "https://getamano.us")

    results = []
    for row in payload.providers:
        try:
            email = (row.email or "").strip().lower()
            if "@" not in email or "." not in email:
                results.append({"email": row.email, "status": "error", "reason": "invalid_email"})
                continue
            existing = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1})
            if existing:
                results.append({"email": email, "status": "skipped", "reason": "already_exists", "user_id": existing["user_id"]})
                continue

            user_id = f"user_{uuid.uuid4().hex[:12]}"
            temp_password = _generate_temp_password()
            phone_norm = normalize_phone(row.phone) if row.phone else None
            await db.users.insert_one({
                "user_id": user_id,
                "email": email,
                "password_hash": hash_password(temp_password),
                "name": row.name,
                "phone": phone_norm,
                "role": "provider",
                "picture": None,
                "language": "es",
                "preferred_language": "es",
                "country": DEFAULT_COUNTRY,
                "email_verified": False,
                "created_by_admin": admin.user_id,
                "needs_activation": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

            provider_id = f"prov_{uuid.uuid4().hex[:12]}"
            slug = await _generate_unique_slug(row.business_name or row.name, row.city or "", row.state or "")
            await db.provider_profiles.insert_one({
                "provider_id": provider_id,
                "user_id": user_id,
                "business_name": row.business_name or row.name,
                "slug": slug,
                "category_id": row.category_id,
                "phone": phone_norm,
                "city": row.city,
                "state": row.state,
                "description": row.description,
                "website": row.website,
                "is_active": True,
                "verification_status": "pending",
                "created_by_admin": admin.user_id,
                "additional_categories": [],
                "languages": [],
                "service_areas": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

            activation_url = None
            if payload.send_activation_email:
                raw_token = secrets.token_urlsafe(32)
                token_hash = hash_password(raw_token)
                expires_at = datetime.now(timezone.utc) + timedelta(days=14)
                await db.password_resets.update_one(
                    {"email": email},
                    {"$set": {
                        "email": email,
                        "user_id": user_id,
                        "token_hash": token_hash,
                        "expires_at": expires_at.isoformat(),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "used_at": None,
                        "is_activation": True,
                    }},
                    upsert=True,
                )
                activation_url = f"{public_url}/reset-password?token={raw_token}&activate=1"
                subject = "Activa tu cuenta · getamano"
                html = _bulk_activation_email_html(business_name=row.business_name or row.name,
                                                   activation_url=activation_url)
                await _send_email_via_resend(email, subject, html)

            results.append({
                "email": email,
                "status": "created",
                "user_id": user_id,
                "provider_id": provider_id,
                "slug": slug,
                "temp_password": temp_password,
                "activation_url": activation_url,
            })
        except Exception as e:
            logger.exception(f"bulk create failed for {row.email}: {e}")
            results.append({"email": row.email, "status": "error", "reason": str(e)[:80]})

    created = sum(1 for r in results if r.get("status") == "created")
    skipped = sum(1 for r in results if r.get("status") == "skipped")
    errors = sum(1 for r in results if r.get("status") == "error")
    await audit_log(admin.user_id, "admin.providers.bulk_created",
                    {"created": created, "skipped": skipped, "errors": errors, "total": len(results)}, request)
    return {"ok": True, "created": created, "skipped": skipped, "errors": errors, "results": results}


# ════════════════════════════════════════════════════════════════════
# Section 44B — Admin Response-Latency Dashboard
# ════════════════════════════════════════════════════════════════════

@api_router.get("/admin/latency-dashboard")
async def admin_latency_dashboard(_: User = Depends(require_admin)):
    """How fast are providers responding? Buckets conversations <2h / <24h / >24h."""
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    convs = await db.conversations.find(
        {
            "created_at": {"$gte": thirty_days_ago},
            "client_name": {"$not": {"$regex": "^TEST", "$options": "i"}},
        },
        {"_id": 0, "conversation_id": 1, "provider_id": 1, "created_at": 1,
         "last_at": 1, "unread_for_provider": 1, "business_name": 1},
    ).limit(5000).to_list(5000)

    fast = mid = slow = pending = 0
    latency_samples: list = []
    per_provider: dict = {}
    for conv in convs:
        cid = conv["conversation_id"]
        msgs = await db.messages.find(
            {"conversation_id": cid},
            {"_id": 0, "sender_role": 1, "created_at": 1, "from_user_id": 1, "to_user_id": 1},
        ).sort("created_at", 1).limit(20).to_list(20)
        if not msgs:
            continue
        first_client_msg = next((m for m in msgs if (m.get("sender_role") or "").lower() == "client"), None)
        if not first_client_msg:
            continue
        first_client_at = first_client_msg.get("created_at")
        first_reply = next((m for m in msgs if m.get("created_at") and m["created_at"] > first_client_at
                            and (m.get("sender_role") or "").lower() == "provider"), None)
        prov_id = conv.get("provider_id") or "unknown"
        bucket = per_provider.setdefault(prov_id, {"provider_id": prov_id,
                                                    "business_name": conv.get("business_name") or "",
                                                    "total": 0, "fast": 0, "mid": 0, "slow": 0, "pending": 0,
                                                    "median_minutes": None, "_lat_samples": []})
        bucket["total"] += 1
        if not first_reply:
            if conv.get("unread_for_provider"):
                slow += 1
                bucket["slow"] += 1
            else:
                pending += 1
                bucket["pending"] += 1
            continue
        try:
            t0 = datetime.fromisoformat(first_client_at.replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(first_reply["created_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        minutes = (t1 - t0).total_seconds() / 60.0
        latency_samples.append(minutes)
        bucket["_lat_samples"].append(minutes)
        if minutes < 120:
            fast += 1
            bucket["fast"] += 1
        elif minutes < 1440:
            mid += 1
            bucket["mid"] += 1
        else:
            slow += 1
            bucket["slow"] += 1

    def _median(arr):
        if not arr:
            return None
        arr = sorted(arr)
        n = len(arr)
        return arr[n // 2] if n % 2 else (arr[n // 2 - 1] + arr[n // 2]) / 2

    for bucket in per_provider.values():
        bucket["median_minutes"] = _median(bucket.pop("_lat_samples"))

    worst = [
        {**b, "slow_rate": round((b["slow"] / b["total"]) * 100, 1)}
        for b in per_provider.values() if b["total"] >= 3
    ]
    worst.sort(key=lambda b: (-b["slow_rate"], -b["total"]))
    worst = worst[:10]

    total = fast + mid + slow + pending
    overall_median = _median(latency_samples)
    return {
        "window_days": 30,
        "total_conversations": total,
        "buckets": {
            "fast_under_2h":   {"count": fast, "pct": round(fast / total * 100, 1) if total else 0},
            "mid_under_24h":   {"count": mid,  "pct": round(mid  / total * 100, 1) if total else 0},
            "slow_over_24h":   {"count": slow, "pct": round(slow / total * 100, 1) if total else 0},
            "no_reply_yet":    {"count": pending, "pct": round(pending / total * 100, 1) if total else 0},
        },
        "overall_median_minutes": overall_median,
        "worst_providers": worst,
        "providers_evaluated": len(per_provider),
    }


# ════════════════════════════════════════════════════════════════════
# Section 44C — Admin Provider Activation Tracking
# ════════════════════════════════════════════════════════════════════
# Visibility on the bulk-onboarding funnel: which providers we created have
# not yet claimed their account? The CEO can resend the activation link with
# one click for stale ones.

@api_router.get("/admin/providers/activation-status")
async def admin_providers_activation_status(_: User = Depends(require_admin)):
    """Return every provider created via the admin pipeline + their current state."""
    users = await db.users.find(
        {"role": "provider", "created_by_admin": {"$exists": True}},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1, "created_at": 1,
         "password_changed_at": 1, "email_verified": 1, "last_login_at": 1,
         "needs_activation": 1},
    ).sort("created_at", -1).limit(500).to_list(500)
    if not users:
        return {"total": 0, "items": [], "summary": {"pending": 0, "activated": 0, "stale": 0}}

    user_ids = [u["user_id"] for u in users]
    emails = [u["email"] for u in users]
    profiles_by_user = {p["user_id"]: p for p in await db.provider_profiles.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "user_id": 1, "provider_id": 1, "business_name": 1, "slug": 1, "city": 1, "state": 1},
    ).to_list(500)}

    # The most recent password_reset row per email tells us whether an
    # activation link is still pending OR was already consumed.
    reset_rows = await db.password_resets.find(
        {"email": {"$in": emails}},
        {"_id": 0, "email": 1, "expires_at": 1, "used_at": 1, "created_at": 1, "is_activation": 1},
    ).to_list(500)
    reset_by_email = {}
    for r in reset_rows:
        prev = reset_by_email.get(r["email"])
        if not prev or (r.get("created_at") or "") > (prev.get("created_at") or ""):
            reset_by_email[r["email"]] = r

    now = datetime.now(timezone.utc)
    items = []
    summary = {"pending": 0, "activated": 0, "stale": 0}
    for u in users:
        prof = profiles_by_user.get(u["user_id"], {})
        reset = reset_by_email.get(u["email"], {})
        try:
            created = datetime.fromisoformat(u.get("created_at", "").replace("Z", "+00:00"))
        except Exception:
            created = now
        days_since = max(0, (now - created).days)

        activated = bool(u.get("password_changed_at") or u.get("last_login_at"))
        token_still_valid = False
        if reset and not reset.get("used_at"):
            try:
                token_still_valid = datetime.fromisoformat(reset["expires_at"]) > now
            except Exception:
                token_still_valid = False

        if activated:
            status = "activated"
            summary["activated"] += 1
        elif days_since >= 3:
            status = "stale"
            summary["stale"] += 1
        else:
            status = "pending"
            summary["pending"] += 1

        items.append({
            "user_id": u["user_id"],
            "email": u["email"],
            "name": u.get("name", ""),
            "business_name": prof.get("business_name", ""),
            "slug": prof.get("slug"),
            "city": prof.get("city"),
            "state": prof.get("state"),
            "created_at": u.get("created_at"),
            "days_since": days_since,
            "status": status,
            "password_changed_at": u.get("password_changed_at"),
            "last_login_at": u.get("last_login_at"),
            "email_verified": bool(u.get("email_verified")),
            "activation_link_pending": token_still_valid,
        })

    return {"total": len(items), "items": items, "summary": summary}


@api_router.post("/admin/providers/{user_id}/resend-activation")
async def admin_resend_activation(user_id: str, request: Request, admin: User = Depends(require_admin)):
    """Regenerate the activation token + re-send the email (or return the URL
    so the CEO can copy it manually if Resend isn't configured)."""
    user_doc = await db.users.find_one(
        {"user_id": user_id, "role": "provider"},
        {"_id": 0, "email": 1, "name": 1, "password_changed_at": 1, "last_login_at": 1},
    )
    if not user_doc:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    if user_doc.get("password_changed_at") or user_doc.get("last_login_at"):
        raise HTTPException(status_code=400, detail="Este proveedor ya activó su cuenta.")

    profile = await db.provider_profiles.find_one({"user_id": user_id}, {"_id": 0, "business_name": 1}) or {}

    forwarded = request.headers.get("origin") or request.headers.get("referer") or ""
    public_url = forwarded.split("/api", 1)[0] if forwarded else os.environ.get("PUBLIC_URL", "https://getamano.us")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_password(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=14)
    await db.password_resets.update_one(
        {"email": user_doc["email"]},
        {"$set": {
            "email": user_doc["email"],
            "user_id": user_id,
            "token_hash": token_hash,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "used_at": None,
            "is_activation": True,
        }},
        upsert=True,
    )
    activation_url = f"{public_url}/reset-password?token={raw_token}&activate=1"
    subject = "Activa tu cuenta · getamano"
    html = _bulk_activation_email_html(
        business_name=profile.get("business_name") or user_doc.get("name") or "tu negocio",
        activation_url=activation_url,
    )
    delivery = await _send_email_via_resend(user_doc["email"], subject, html)
    await audit_log(admin.user_id, "admin.providers.resend_activation",
                    {"user_id": user_id, "email": user_doc["email"], "delivery_sent": bool(delivery.get("sent"))},
                    request)
    return {
        "ok": True,
        "email": user_doc["email"],
        "activation_url": activation_url,
        "delivery": "sent" if delivery.get("sent") else "logged",
    }


@api_router.post("/admin/health-email/send-weekly")
async def admin_send_weekly_health_email(request: Request, admin: User = Depends(require_admin)):
    """Fan-out the weekly eCard health email to every eligible provider.
    Eligible = active + approved + has email_verified user + score < 100."""
    forwarded = request.headers.get("origin") or request.headers.get("referer") or ""
    public_url = forwarded.split("/api", 1)[0] if forwarded else os.environ.get("PUBLIC_URL", "https://getamano.us")
    eligible = await db.provider_profiles.find(
        {
            "is_active": True,
            "verification_status": "approved",
            "business_name": {"$not": {"$regex": "^TEST_"}},
        },
        {"_id": 0, "user_id": 1},
    ).limit(500).to_list(500)
    results = []
    for prof in eligible:
        try:
            results.append(await _send_health_email_to_provider(prof["user_id"], public_url))
        except Exception as e:
            logger.warning(f"health email failed for {prof.get('user_id')}: {e}")
            results.append({"user_id": prof.get("user_id"), "sent": False, "skipped": False, "reason": "exception"})
    sent = sum(1 for r in results if r.get("sent"))
    skipped = sum(1 for r in results if r.get("skipped"))
    await audit_log(admin.user_id, "health_email.weekly_sent", {"sent": sent, "skipped": skipped, "total": len(results)}, request)
    return {"ok": True, "sent": sent, "skipped": skipped, "total": len(results), "results": results[:50]}


# ════════════════════════════════════════════════════════════════════
# Section 43C — Client "no-limbo" nudge email
# ════════════════════════════════════════════════════════════════════
# When a client sends a message and the provider hasn't replied for 24h, we
# send the client a gentle email with 3 similar providers as alternatives.
# Re-engages the lead instead of letting it die in silence.
#
# Tracking: each conversation gets a `client_nudge_sent_at` ISO timestamp so
# we never spam the same lead twice for the same conversation.

CLIENT_NUDGE_MIN_HOURS = 24
CLIENT_NUDGE_MAX_HOURS = 7 * 24  # don't re-engage week-old conversations


async def _find_similar_providers(*, exclude_provider_id: str,
                                   category_id: Optional[str] = None,
                                   city: Optional[str] = None,
                                   limit: int = 3) -> list:
    """Pivot on category + city → fall back to category-only → public-guarded."""
    base = {
        "is_active": True,
        "verification_status": "approved",
        "provider_id": {"$ne": exclude_provider_id},
        "business_name": {"$not": {"$regex": "^TEST_"}},
        **PUBLIC_GUARD,
    }
    queries = []
    if category_id and city:
        queries.append({**base, "category_id": category_id, "city": city})
    if category_id:
        queries.append({**base, "category_id": category_id})
    queries.append(base)
    seen = set()
    out = []
    for q in queries:
        cursor = db.provider_profiles.find(
            q,
            {"_id": 0, "provider_id": 1, "slug": 1, "business_name": 1,
             "logo_url": 1, "photo_url": 1, "city": 1, "rating_avg": 1,
             "reviews_count": 1, "category_id": 1},
        ).sort([("rating_avg", -1), ("reviews_count", -1)]).limit(limit * 2)
        async for p in cursor:
            if p["provider_id"] in seen:
                continue
            seen.add(p["provider_id"])
            out.append(p)
            if len(out) >= limit:
                return out
        if len(out) >= limit:
            return out
    return out


def _build_client_nudge_email_html(*, client_name: str, provider_business: str,
                                    last_message: str, alternatives: list,
                                    public_url: str) -> str:
    first_name = (client_name or "Hola").split(" ")[0] or "Hola"
    alt_rows = ""
    for p in alternatives:
        rating = f"⭐ {p.get('rating_avg', 0):.1f}" if p.get("rating_avg") else "Nuevo"
        reviews = f" ({p['reviews_count']} reseñas)" if (p.get("reviews_count") or 0) > 0 else ""
        city = p.get("city") or ""
        ecard_url = f"{public_url}/p/{p['slug']}"
        logo = p.get("logo_url") or p.get("photo_url") or ""
        logo_html = (
            f'<img src="{logo}" alt="" width="48" height="48" '
            f'style="border-radius:50%;object-fit:cover;display:block;border:1px solid #E2E8F0;" />'
            if logo
            else '<div style="width:48px;height:48px;border-radius:50%;background:#E1F5EE;color:#025F67;'
                 'text-align:center;line-height:48px;font-size:18px;font-weight:700;">🤝</div>'
        )
        alt_rows += f"""
        <tr><td style="padding:8px 0;">
          <a href="{ecard_url}" style="text-decoration:none;color:inherit;display:block;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;">
              <tr>
                <td width="64" style="padding:12px 0 12px 12px;vertical-align:middle;">{logo_html}</td>
                <td style="padding:12px;vertical-align:middle;">
                  <div style="font-size:15px;font-weight:700;color:#0F172A;line-height:1.25;">{p.get('business_name', 'Proveedor')}</div>
                  <div style="font-size:12px;color:#64748B;margin-top:2px;">{rating}{reviews}{(" · " + city) if city else ""}</div>
                </td>
                <td width="60" style="padding-right:12px;text-align:right;vertical-align:middle;">
                  <span style="display:inline-block;background:#025F67;color:#fff;font-size:11px;font-weight:bold;padding:6px 10px;border-radius:999px;">Ver →</span>
                </td>
              </tr>
            </table>
          </a>
        </td></tr>
        """

    safe_last = (last_message or "").replace("<", "&lt;").replace(">", "&gt;")[:200]
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 12px 36px rgba(2,95,103,0.08);">

      <tr><td style="background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);padding:28px 24px;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">getamano</h1>
        <p style="margin:4px 0 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Te ayudamos a no quedarte esperando</p>
      </td></tr>

      <tr><td style="padding:24px 24px 8px 24px;">
        <p style="margin:0 0 6px 0;font-size:15px;color:#475569;">Hola <strong style="color:#0F172A;">{first_name}</strong>,</p>
        <p style="margin:0 0 16px 0;font-size:14px;color:#475569;line-height:1.6;">
          Notamos que <strong>{provider_business}</strong> aún no ha respondido a tu mensaje.
          A veces los proveedores están ocupados — pero <strong>no queremos dejarte esperando</strong>.
        </p>
        <div style="background:#F8FAFC;border-left:3px solid #2F9D94;padding:10px 14px;border-radius:8px;margin-bottom:18px;">
          <p style="margin:0;font-size:12px;color:#94A3B8;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Tu mensaje original</p>
          <p style="margin:4px 0 0 0;font-size:13px;color:#475569;line-height:1.5;font-style:italic;">"{safe_last}"</p>
        </div>
      </td></tr>

      <tr><td style="padding:0 24px 8px 24px;">
        <p style="margin:0;font-size:14px;font-weight:700;color:#0F172A;">Mientras tanto, mira estos {len(alternatives)} proveedores latinos verificados:</p>
      </td></tr>

      <tr><td style="padding:8px 24px 16px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          {alt_rows}
        </table>
      </td></tr>

      <tr><td style="background:#F8FAFC;padding:18px 24px;text-align:center;border-top:1px solid #E2E8F0;">
        <p style="margin:0 0 6px 0;color:#94A3B8;font-size:11px;">
          Cada proveedor en getamano es verificado por nuestro equipo.
        </p>
        <p style="margin:0;color:#CBD5E1;font-size:10px;">© getamano 2026 — Latin Ventures LLC</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>"""


async def _find_stale_unanswered_conversations(limit: int = 100) -> list:
    """Conversations where the client is waiting and the provider hasn't read
    them between 24h and 7 days. Returns at most `limit` candidates."""
    now = datetime.now(timezone.utc)
    upper = (now - timedelta(hours=CLIENT_NUDGE_MIN_HOURS)).isoformat()
    lower = (now - timedelta(hours=CLIENT_NUDGE_MAX_HOURS)).isoformat()
    q = {
        "unread_for_provider": True,
        "last_at": {"$lte": upper, "$gte": lower},
        "client_nudge_sent_at": {"$exists": False},
        "client_name": {"$not": {"$regex": "^TEST", "$options": "i"}},
    }
    return await db.conversations.find(q, {"_id": 0}).sort("last_at", 1).limit(limit).to_list(limit)


async def _send_client_nudge_for_conversation(conv: dict, public_url: str) -> dict:
    """Sends the unanswered nudge email + flags the conversation idempotently."""
    client = await db.users.find_one({"user_id": conv["client_id"]}, {"_id": 0, "email": 1, "name": 1, "email_verified": 1})
    if not client or not client.get("email") or not client.get("email_verified"):
        await db.conversations.update_one(
            {"conversation_id": conv["conversation_id"]},
            {"$set": {"client_nudge_sent_at": datetime.now(timezone.utc).isoformat(), "client_nudge_skipped_reason": "client_email_unverified"}},
        )
        return {"conversation_id": conv["conversation_id"], "sent": False, "reason": "client_email_unverified"}

    provider_profile = await db.provider_profiles.find_one(
        {"provider_id": conv["provider_id"]},
        {"_id": 0, "category_id": 1, "city": 1, "business_name": 1, "slug": 1},
    ) or {}

    alternatives = await _find_similar_providers(
        exclude_provider_id=conv["provider_id"],
        category_id=provider_profile.get("category_id"),
        city=provider_profile.get("city"),
        limit=3,
    )
    if not alternatives:
        # Don't email the client with zero alternatives — surface nothing rather than empty list.
        await db.conversations.update_one(
            {"conversation_id": conv["conversation_id"]},
            {"$set": {"client_nudge_sent_at": datetime.now(timezone.utc).isoformat(), "client_nudge_skipped_reason": "no_alternatives"}},
        )
        return {"conversation_id": conv["conversation_id"], "sent": False, "reason": "no_alternatives"}

    html = _build_client_nudge_email_html(
        client_name=client.get("name") or "Hola",
        provider_business=provider_profile.get("business_name") or conv.get("business_name") or "el proveedor",
        last_message=conv.get("last_message") or conv.get("subject") or "",
        alternatives=alternatives,
        public_url=public_url,
    )
    subject = f"¿Sigues buscando? Mira estos {len(alternatives)} proveedores · getamano"
    result = await _send_email_via_resend(client["email"], subject, html)
    await db.conversations.update_one(
        {"conversation_id": conv["conversation_id"]},
        {"$set": {
            "client_nudge_sent_at": datetime.now(timezone.utc).isoformat(),
            "client_nudge_delivery": "sent" if result.get("sent") else "logged",
            "client_nudge_alternatives_count": len(alternatives),
        }},
    )
    return {
        "conversation_id": conv["conversation_id"],
        "sent": bool(result.get("sent")),
        "alternatives_count": len(alternatives),
        "reason": result.get("reason", "ok"),
    }


@api_router.post("/admin/client-nudge/send-pending")
async def admin_send_client_nudge_pending(request: Request, admin: User = Depends(require_admin)):
    """Fan-out the no-limbo email to every conversation where a client is waiting >24h.
    Runs idempotently via `client_nudge_sent_at` flag on each conversation."""
    forwarded = request.headers.get("origin") or request.headers.get("referer") or ""
    public_url = forwarded.split("/api", 1)[0] if forwarded else os.environ.get("PUBLIC_URL", "https://getamano.us")
    pending = await _find_stale_unanswered_conversations(limit=500)
    results = []
    for conv in pending:
        try:
            results.append(await _send_client_nudge_for_conversation(conv, public_url))
        except Exception as e:
            logger.warning(f"[client_nudge] failed for {conv.get('conversation_id')}: {e}")
            results.append({"conversation_id": conv.get("conversation_id"), "sent": False, "reason": "exception"})
    sent = sum(1 for r in results if r.get("sent"))
    await audit_log(admin.user_id, "client_nudge.fan_out", {"sent": sent, "scanned": len(results)}, request)
    return {"ok": True, "sent": sent, "scanned": len(results), "results": results[:50]}


@api_router.get("/providers/me/clients-waiting")
async def my_clients_waiting(user: User = Depends(get_current_user)):
    """How many clients are waiting for THIS provider beyond 24h?
    Used by the WaitingClientsBadge widget on the provider dashboard."""
    if user.role != "provider":
        return {"count": 0, "items": []}
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "provider_id": 1})
    if not prof:
        return {"count": 0, "items": []}
    upper = (datetime.now(timezone.utc) - timedelta(hours=CLIENT_NUDGE_MIN_HOURS)).isoformat()
    waiting = await db.conversations.find(
        {
            "provider_id": prof["provider_id"],
            "unread_for_provider": True,
            "last_at": {"$lte": upper},
            "client_name": {"$not": {"$regex": "^TEST", "$options": "i"}},
        },
        {"_id": 0, "conversation_id": 1, "client_name": 1, "last_message": 1, "last_at": 1},
    ).sort("last_at", 1).limit(10).to_list(10)
    return {"count": len(waiting), "items": waiting}


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

    # Section 33 — Gamification engagement badges
    # Top Referrer: 3+ referrals that reached "credited" status
    referral_count = await db.referrals.count_documents({"referrer_user_id": user_id, "status": "credited"}) if user_id else 0
    if referral_count >= 3:
        badges.append({"key": "top_referrer", "label": f"Top Referrer · {referral_count}", "icon": "✨"})
    elif referral_count >= 1:
        badges.append({"key": "referrer", "label": f"{referral_count} traíd{'os' if referral_count != 1 else 'o'}", "icon": "✨"})

    # Chambero: 5+ gig applications in the last 30 days
    gig_apps = await db.gig_applications.count_documents({"provider_id": provider_id, "created_at": {"$gte": month_ago}})
    if gig_apps >= 5:
        badges.append({"key": "chambero", "label": "Chamber@ del mes", "icon": "💼"})
    elif gig_apps >= 2:
        badges.append({"key": "active_applicant", "label": f"{gig_apps} chambas", "icon": "💼"})

    # Founding member
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "founding_member": 1}) if user_id else None
    if user_doc and user_doc.get("founding_member"):
        badges.append({"key": "founding_member", "label": "Founding Member", "icon": "🏆"})

    # Section 34 — Bilingual badge (Spanish + English)
    prof_doc = await db.provider_profiles.find_one({"provider_id": provider_id}, {"_id": 0, "languages": 1}) if provider_id else None
    if prof_doc:
        langs = prof_doc.get("languages") or []
        if isinstance(langs, list) and "es" in langs and "en" in langs:
            badges.append({"key": "bilingual", "label": "Bilingüe · Bilingual", "icon": "🗣️"})

    # Section 34 — Activity streak (only surfaces when ≥3 alive days, see
    # _compute_streak's public redaction). We read the cached value from the
    # `streaks` collection to avoid duplicating the heavy aggregate inside
    # this badge helper — it's refreshed every time the dashboard hits
    # /api/providers/me/streak.
    streak_doc = await db.streaks.find_one({"user_id": user_id}, {"_id": 0}) if user_id else None
    if streak_doc:
        sd = streak_doc.get("current_days", 0) or 0
        if sd >= 3 and streak_doc.get("last_active_date") == datetime.now(timezone.utc).date().isoformat():
            badges.append({"key": "streak", "label": f"{sd} días seguidos", "icon": "🔥"})

    return badges


@api_router.get("/providers/{provider_id}/badges")
async def get_provider_badges(provider_id: str):
    prof = await db.provider_profiles.find_one({"provider_id": provider_id}, {"_id": 0, "user_id": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="Provider not found")
    return await _badges_for_provider(provider_id, prof.get("user_id", ""))


# ════════════════════════════════════════════════════════════════════════
# SECTION 34 — Activity Streaks (Duolingo-style retention loop)
# ════════════════════════════════════════════════════════════════════════
# A streak = consecutive UTC days the provider had at least one activity
# signal (login/session OR sent a message OR responded to a quote OR
# applied to a gig). We allow a 1-day grace so logging in *today* OR
# *yesterday* keeps the streak alive (handles late-night users gracefully).
#
# Best streak is persisted in `streaks` collection. Current streak is
# computed on demand from the activity sources (cheap — capped 60 days
# lookback). Updating the best record is idempotent.
# ════════════════════════════════════════════════════════════════════════

STREAK_LOOKBACK_DAYS = 400  # cap is wide enough to cover the 365-day milestone


def _utc_date_str(dt) -> str:
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return ""
    if not isinstance(dt, datetime):
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date().isoformat()  # YYYY-MM-DD


async def _collect_activity_dates(user_id: str, provider_id: str) -> set[str]:
    """Return a set of UTC date strings on which the provider was active
    in the past STREAK_LOOKBACK_DAYS. Combines sessions, sent messages,
    quote responses, gig applications.
    """
    floor = (datetime.now(timezone.utc) - timedelta(days=STREAK_LOOKBACK_DAYS)).isoformat()
    dates: set[str] = set()

    # Sessions — at least one created during the day = active
    async for d in db.sessions.find(
        {"user_id": user_id, "created_at": {"$gte": floor}},
        {"_id": 0, "created_at": 1},
    ):
        ds = _utc_date_str(d.get("created_at"))
        if ds:
            dates.add(ds)

    # Messages sent by the provider
    async for d in db.messages.find(
        {"sender_id": user_id, "created_at": {"$gte": floor}},
        {"_id": 0, "created_at": 1},
    ):
        ds = _utc_date_str(d.get("created_at"))
        if ds:
            dates.add(ds)

    # Quote responses (only count days where the provider actually replied)
    async for d in db.quote_requests.find(
        {"provider_id": provider_id, "response_time_seconds": {"$gt": 0},
         "responded_at": {"$gte": floor}},
        {"_id": 0, "responded_at": 1},
    ):
        ds = _utc_date_str(d.get("responded_at"))
        if ds:
            dates.add(ds)

    # Gig applications sent
    async for d in db.gig_applications.find(
        {"provider_id": provider_id, "created_at": {"$gte": floor}},
        {"_id": 0, "created_at": 1},
    ):
        ds = _utc_date_str(d.get("created_at"))
        if ds:
            dates.add(ds)

    return dates


def _walk_streak(dates: set[str], today: datetime) -> tuple[int, str | None]:
    """Given a set of YYYY-MM-DD strings and today's UTC datetime, return
    (current_streak, last_active_date). Streak counts consecutive days
    ending today or yesterday (1-day grace).
    """
    if not dates:
        return 0, None
    today_iso = today.date()
    # Check anchor: today or yesterday must be present
    anchor = None
    if today_iso.isoformat() in dates:
        anchor = today_iso
    elif (today_iso - timedelta(days=1)).isoformat() in dates:
        anchor = today_iso - timedelta(days=1)
    if not anchor:
        return 0, max(dates)
    streak = 1
    cursor = anchor - timedelta(days=1)
    while cursor.isoformat() in dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak, anchor.isoformat()


async def _compute_streak(user_id: str, provider_id: str) -> dict:
    """Compute current + persisted-best streak for a provider."""
    dates = await _collect_activity_dates(user_id, provider_id)
    now = datetime.now(timezone.utc)
    current, last_active = _walk_streak(dates, now)

    # Pull persisted best, then update if surpassed
    rec = await db.streaks.find_one({"user_id": user_id}, {"_id": 0})
    best = (rec or {}).get("best_days", 0)
    best_updated = False
    if current > best:
        best = current
        best_updated = True
        await db.streaks.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id,
                "provider_id": provider_id,
                "best_days": best,
                "best_set_at": now.isoformat(),
                "current_days": current,
                "last_active_date": last_active,
                "updated_at": now.isoformat(),
            }},
            upsert=True,
        )
    else:
        # Keep current/last_active fresh for analytics
        await db.streaks.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id,
                "provider_id": provider_id,
                "current_days": current,
                "last_active_date": last_active,
                "updated_at": now.isoformat(),
            }},
            upsert=True,
        )

    # Status flag — alive (today), at_risk (yesterday only), cold (older or none)
    today_iso = now.date().isoformat()
    yesterday_iso = (now.date() - timedelta(days=1)).isoformat()
    if last_active == today_iso:
        status = "alive"
    elif last_active == yesterday_iso:
        status = "at_risk"
    else:
        status = "cold"

    # Milestones (Duolingo-style)
    next_milestone = next((m for m in (3, 7, 14, 30, 60, 90, 180, 365) if m > current), None)

    return {
        "current_days": current,
        "best_days": best,
        "best_updated": best_updated,
        "last_active_date": last_active,
        "status": status,
        "next_milestone": next_milestone,
        "is_demo_data": False,
    }


@api_router.get("/providers/me/streak")
async def get_my_streak(user: User = Depends(get_current_user)):
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "provider_id": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="No provider profile")
    streak = await _compute_streak(user.user_id, prof["provider_id"])
    return streak


@api_router.get("/providers/{provider_id}/streak")
async def get_public_streak(provider_id: str):
    """Public — used by eCard. Hides at_risk/cold details and only surfaces
    `current_days` when the streak is alive (today) AND ≥ 3 days so we don't
    spam tiny non-meaningful badges on every public profile.
    """
    prof = await db.provider_profiles.find_one({"provider_id": provider_id}, {"_id": 0, "user_id": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="Provider not found")
    streak = await _compute_streak(prof["user_id"], provider_id)
    # Public-friendly redaction
    show_public = streak["current_days"] >= 3 and streak["status"] == "alive"
    return {
        "current_days": streak["current_days"] if show_public else 0,
        "best_days": streak["best_days"],
        "show_public_badge": show_public,
    }


# ─── Streak reminder fan-out (habit loop / 7pm local push) ─────────────
class StreakReminderPrefIn(BaseModel):
    opt_out: bool


@api_router.post("/providers/me/streak/preferences")
async def set_streak_pref(payload: StreakReminderPrefIn, user: User = Depends(get_current_user)):
    """Lets a provider opt out of streak reminders. Idempotent."""
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores.")
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"streak_reminders_opt_out": bool(payload.opt_out)}},
    )
    return {"ok": True, "opt_out": bool(payload.opt_out)}


@api_router.get("/providers/me/streak/preferences")
async def get_streak_pref(user: User = Depends(get_current_user)):
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores.")
    u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "streak_reminders_opt_out": 1})
    return {"opt_out": bool((u or {}).get("streak_reminders_opt_out", False))}


async def _enqueue_streak_reminder_for(user_id: str, provider_id: str, streak: dict) -> Optional[dict]:
    """Queue an in-app notification + (when push channels are live) an SMS/email
    nudge for a single provider whose streak is in danger. Idempotent per
    user+UTC-date so re-running the fan-out doesn't double-poke.
    """
    days = streak.get("current_days", 0)
    status = streak.get("status", "cold")
    if status not in ("at_risk", "alive") or days < 3:
        return None
    # Skip if already entered today — alive AND last_active is today means
    # they've already shown up, no nudge needed.
    today_iso = datetime.now(timezone.utc).date().isoformat()
    if status == "alive" and streak.get("last_active_date") == today_iso:
        # Only fire 7pm reminder if env is past 7pm UTC; otherwise the user
        # might still come back naturally. Skip when status=alive — they have
        # the win for today.
        return None

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "name": 1, "phone": 1, "streak_reminders_opt_out": 1})
    if not user or user.get("streak_reminders_opt_out"):
        return None

    notification_key = f"{user_id}::streak_reminder::{today_iso}"
    if await db.notifications.find_one({"notification_key": notification_key}, {"_id": 0, "notification_key": 1}):
        return None  # already nudged today

    first = (user.get("name") or "").split(" ")[0] or "Tu racha"
    hours_left = 24 - datetime.now(timezone.utc).hour
    title = f"🔥 Tu racha de {days} días está por expirar"
    body = (
        f"{first}, te quedan ~{hours_left}h para mantener tu récord. "
        f"Entra a getamano, responde un mensaje, o aplica a una chamba."
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "notification_key": notification_key,
        "user_id": user_id,
        "role": "provider",
        "category": "streaks",
        "title": title,
        "body": body,
        "cta_label": "Mantener mi racha",
        "cta_url": "/dashboard/provider#streak",
        "icon": "trophy",
        "priority": "high",
        "is_read": False,
        "dismissed_at": None,
        "created_at": now_iso,
    })

    # Queue SMS + email so when Twilio/Resend are live they ship automatically
    if user.get("phone"):
        await enqueue_notification(
            recipient_phone=user["phone"],
            channel="sms",
            body=f"🔥 getamano — tu racha de {days} días está por expirar. Entra hoy: https://getamano.us",
            trigger_type=f"streak_reminder_{days}d",
        )
    if user.get("email"):
        await enqueue_notification(
            recipient_email=user["email"],
            channel="email",
            subject=title,
            body=body,
            trigger_type=f"streak_reminder_{days}d",
        )

    return {
        "user_id": user_id,
        "provider_id": provider_id,
        "days": days,
        "status": status,
        "queued": True,
    }


@api_router.post("/admin/streaks/send-reminders")
async def admin_send_streak_reminders(request: Request, admin: User = Depends(require_admin)):
    """Daily cron entry point. Fans out streak reminders to all providers
    whose streak is at_risk (alive yesterday only) OR alive but haven't
    checked in today yet. Idempotent per (user, UTC date)."""
    # Scope: providers with a streaks row + current_days >= 3 + not opted out
    rows = await db.streaks.find(
        {"current_days": {"$gte": 3}},
        {"_id": 0, "user_id": 1, "provider_id": 1},
    ).to_list(2000)
    if not rows:
        return {"ok": True, "queued": 0, "skipped": 0, "scanned": 0}
    queued = 0
    skipped = 0
    for r in rows:
        try:
            streak = await _compute_streak(r["user_id"], r["provider_id"])
            res = await _enqueue_streak_reminder_for(r["user_id"], r["provider_id"], streak)
            if res:
                queued += 1
            else:
                skipped += 1
        except Exception as e:
            logger.warning(f"streak reminder failed for {r.get('user_id')}: {e}")
            skipped += 1
    await audit_log(admin.user_id, "streaks.reminders_sent", {"queued": queued, "skipped": skipped, "scanned": len(rows)}, request)
    return {"ok": True, "queued": queued, "skipped": skipped, "scanned": len(rows)}


# ════════════════════════════════════════════════════════════════════════
# SECTION 35 — Monthly Leaderboard (transparent ranking, public)
# ════════════════════════════════════════════════════════════════════════
# Composite score per provider for the current calendar month (UTC).
# Formula is intentionally transparent so providers know what to improve:
#
#   referrals_credited * 25
# + reviews_4plus      * 5
# + gig_applications   * 1    (cap 30)
# + streak_days        * 2    (cap 60)
# + fast_responses     * 3    (cap 30)   ← quote responses < 2h
# + active_pro_bonus   = 5    (if active paid subscription)
# + completion_bonus   = 10   (if profile_completion >= 80)
# ════════════════════════════════════════════════════════════════════════

LEADERBOARD_CACHE = {"data": None, "computed_at": None}
LEADERBOARD_TTL_SECONDS = 300  # 5 minutes


def _current_month_window():
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        next_month = month_start.replace(year=now.year + 1, month=1)
    else:
        next_month = month_start.replace(month=now.month + 1)
    return month_start, next_month


async def _compute_leaderboard() -> list[dict]:
    """Heavy aggregate. Computes the composite score for every eligible
    provider, sorts desc, returns up to 100 rows. Each row has full
    breakdown so the frontend can show the formula clearly.
    """
    month_start, month_end = _current_month_window()
    month_start_iso = month_start.isoformat()
    month_end_iso = month_end.isoformat()

    profs = await db.provider_profiles.find(
        {
            "is_active": True,
            "verification_status": "approved",
            **PUBLIC_GUARD,
        },
        {"_id": 0},
    ).to_list(2000)
    if not profs:
        return []

    user_ids = [p["user_id"] for p in profs]
    provider_ids = [p["provider_id"] for p in profs]

    # Referrals credited this month
    ref_agg = db.referrals.aggregate([
        {"$match": {"status": "credited", "credited_at": {"$gte": month_start_iso, "$lt": month_end_iso}, "referrer_user_id": {"$in": user_ids}}},
        {"$group": {"_id": "$referrer_user_id", "n": {"$sum": 1}}},
    ])
    refs = {row["_id"]: row["n"] async for row in ref_agg}

    # Reviews 4+ stars this month
    rev_agg = db.reviews.aggregate([
        {"$match": {"provider_id": {"$in": provider_ids}, "rating": {"$gte": 4}, "created_at": {"$gte": month_start_iso, "$lt": month_end_iso}, "is_hidden": {"$ne": True}}},
        {"$group": {"_id": "$provider_id", "n": {"$sum": 1}}},
    ])
    revs = {row["_id"]: row["n"] async for row in rev_agg}

    # Gig applications this month (capped at 30)
    app_agg = db.gig_applications.aggregate([
        {"$match": {"provider_id": {"$in": provider_ids}, "created_at": {"$gte": month_start_iso, "$lt": month_end_iso}}},
        {"$group": {"_id": "$provider_id", "n": {"$sum": 1}}},
    ])
    apps = {row["_id"]: row["n"] async for row in app_agg}

    # Fast responses (< 2h) this month
    fast_agg = db.quote_requests.aggregate([
        {"$match": {"provider_id": {"$in": provider_ids}, "response_time_seconds": {"$gt": 0, "$lt": 7200}, "responded_at": {"$gte": month_start_iso, "$lt": month_end_iso}}},
        {"$group": {"_id": "$provider_id", "n": {"$sum": 1}}},
    ])
    fasts = {row["_id"]: row["n"] async for row in fast_agg}

    # Active streaks
    streaks_docs = await db.streaks.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "user_id": 1, "current_days": 1, "last_active_date": 1},
    ).to_list(2000)
    today_iso = datetime.now(timezone.utc).date().isoformat()
    streaks = {}
    for sd in streaks_docs:
        if sd.get("last_active_date") in (today_iso, (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()):
            streaks[sd["user_id"]] = sd.get("current_days", 0)

    # Active paid subscriptions
    subs = await db.subscriptions.find(
        {"user_id": {"$in": user_ids}, "status": "active", "plan": {"$in": ["basic", "pro", "premium"]}},
        {"_id": 0, "user_id": 1, "plan": 1},
    ).to_list(2000)
    paid_users = {s["user_id"]: s["plan"] for s in subs}

    rows = []
    for p in profs:
        uid = p["user_id"]
        pid = p["provider_id"]
        completeness = p.get("profile_completion", 0) or 0
        is_paid = uid in paid_users

        breakdown = {
            "referrals_credited": refs.get(uid, 0),
            "reviews_4plus": revs.get(pid, 0),
            "gig_applications": min(apps.get(pid, 0), 30),
            "streak_days": min(streaks.get(uid, 0), 60),
            "fast_responses": min(fasts.get(pid, 0), 30),
            "active_pro_bonus": 5 if is_paid else 0,
            "completion_bonus": 10 if completeness >= 80 else 0,
        }
        score = (
            breakdown["referrals_credited"] * 25
            + breakdown["reviews_4plus"] * 5
            + breakdown["gig_applications"] * 1
            + breakdown["streak_days"] * 2
            + breakdown["fast_responses"] * 3
            + breakdown["active_pro_bonus"]
            + breakdown["completion_bonus"]
        )
        if score <= 0:
            continue

        rows.append({
            "provider_id": pid,
            "user_id": uid,
            "slug": p.get("slug"),
            "business_name": p.get("business_name") or "",
            "photo_url": p.get("logo_url") or p.get("photo_url"),
            "city": p.get("city"),
            "state": p.get("state"),
            "category_id": p.get("category_id"),
            "rating": round(p.get("rating_avg") or 0, 1),
            "reviews_count": p.get("reviews_count") or 0,
            "plan": paid_users.get(uid, "free"),
            "score": score,
            "breakdown": breakdown,
        })

    rows.sort(key=lambda r: (-r["score"], -(r["rating"] or 0), -(r["reviews_count"] or 0)))
    # Assign rank
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
    return rows[:100]


async def _get_cached_leaderboard() -> list[dict]:
    now = datetime.now(timezone.utc)
    if (
        LEADERBOARD_CACHE["data"] is not None
        and LEADERBOARD_CACHE["computed_at"] is not None
        and (now - LEADERBOARD_CACHE["computed_at"]).total_seconds() < LEADERBOARD_TTL_SECONDS
    ):
        return LEADERBOARD_CACHE["data"]
    data = await _compute_leaderboard()
    LEADERBOARD_CACHE["data"] = data
    LEADERBOARD_CACHE["computed_at"] = now
    return data


@api_router.get("/leaderboard/monthly")
async def get_monthly_leaderboard(limit: int = 10, category_id: Optional[str] = None):
    """Public — top providers for the current calendar month."""
    rows = await _get_cached_leaderboard()
    if category_id:
        rows = [r for r in rows if r.get("category_id") == category_id]
        # Re-assign rank within the filtered view (build fresh dicts so we
        # don't mutate the module-level cache)
        rows = [{**r, "rank": i} for i, r in enumerate(rows, start=1)]
    return {
        "month": _current_month_window()[0].strftime("%Y-%m"),
        "top": rows[: max(1, min(limit, 100))],
        "total_ranked": len(rows),
        "formula": {
            "referrals_credited": 25,
            "reviews_4plus": 5,
            "gig_applications": 1,
            "streak_days": 2,
            "fast_responses": 3,
            "active_pro_bonus": 5,
            "completion_bonus": 10,
        },
        "caps": {"gig_applications": 30, "streak_days": 60, "fast_responses": 30},
    }


@api_router.get("/leaderboard/me")
async def get_my_leaderboard_position(user: User = Depends(get_current_user)):
    """Provider-only — returns own rank, score, breakdown, and gap to the
    next podium slot so the dashboard widget can render a motivating
    'Sube a #10 con 3 chambas más' style nudge.
    """
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores.")
    rows = await _get_cached_leaderboard()
    me = next((r for r in rows if r["user_id"] == user.user_id), None)
    if not me:
        return {
            "ranked": False,
            "reason": "no_score_this_month",
            "month": _current_month_window()[0].strftime("%Y-%m"),
            "top_10": rows[:10],
            "total_ranked": len(rows),
        }
    # Gap calculations
    next_slot = next((r for r in rows if r["rank"] < me["rank"]), None)
    podium_target = next((r for r in rows if r["rank"] <= 10 and r["rank"] < me["rank"]), None)
    return {
        "ranked": True,
        "month": _current_month_window()[0].strftime("%Y-%m"),
        "me": me,
        "next": next_slot,
        "podium_target": podium_target,
        "total_ranked": len(rows),
        "top_10": rows[:10],
    }


# ════════════════════════════════════════════════════════════════════════
# SECTION 35.5 — Redeemable Rewards (Top → coupon)
# ════════════════════════════════════════════════════════════════════════
# Monthly snapshot turns the prior month's top 50 into discount coupons:
#   Top 3   → 50% off next month's subscription
#   Top 10  → 25%
#   Top 50  → 10%
# Snapshots are idempotent per month. Admins can dry-run any month, and
# providers see their available coupons on the dashboard.
# ════════════════════════════════════════════════════════════════════════

REWARD_TIERS = [
    {"max_rank": 3, "discount_pct": 50, "label": "Top 3", "code_prefix": "TOP3"},
    {"max_rank": 10, "discount_pct": 25, "label": "Top 10", "code_prefix": "TOP10"},
    {"max_rank": 50, "discount_pct": 10, "label": "Top 50", "code_prefix": "TOP50"},
]


def _previous_month_window():
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Step back 1 second to land in the previous month
    prev_end = month_start - timedelta(seconds=1)
    prev_start = prev_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return prev_start, month_start


async def _compute_leaderboard_for_window(window_start_iso: str, window_end_iso: str) -> list[dict]:
    """Same as _compute_leaderboard but for an arbitrary window. Used by
    snapshots so a dry-run doesn't depend on current cached state.
    """
    profs = await db.provider_profiles.find(
        {
            "is_active": True,
            "verification_status": "approved",
            **PUBLIC_GUARD,
        },
        {"_id": 0},
    ).to_list(2000)
    if not profs:
        return []

    user_ids = [p["user_id"] for p in profs]
    provider_ids = [p["provider_id"] for p in profs]

    refs = {r["_id"]: r["n"] async for r in db.referrals.aggregate([
        {"$match": {"status": "credited", "credited_at": {"$gte": window_start_iso, "$lt": window_end_iso}, "referrer_user_id": {"$in": user_ids}}},
        {"$group": {"_id": "$referrer_user_id", "n": {"$sum": 1}}},
    ])}
    revs = {r["_id"]: r["n"] async for r in db.reviews.aggregate([
        {"$match": {"provider_id": {"$in": provider_ids}, "rating": {"$gte": 4}, "created_at": {"$gte": window_start_iso, "$lt": window_end_iso}, "is_hidden": {"$ne": True}}},
        {"$group": {"_id": "$provider_id", "n": {"$sum": 1}}},
    ])}
    apps = {r["_id"]: r["n"] async for r in db.gig_applications.aggregate([
        {"$match": {"provider_id": {"$in": provider_ids}, "created_at": {"$gte": window_start_iso, "$lt": window_end_iso}}},
        {"$group": {"_id": "$provider_id", "n": {"$sum": 1}}},
    ])}
    fasts = {r["_id"]: r["n"] async for r in db.quote_requests.aggregate([
        {"$match": {"provider_id": {"$in": provider_ids}, "response_time_seconds": {"$gt": 0, "$lt": 7200}, "responded_at": {"$gte": window_start_iso, "$lt": window_end_iso}}},
        {"$group": {"_id": "$provider_id", "n": {"$sum": 1}}},
    ])}

    subs = await db.subscriptions.find(
        {"user_id": {"$in": user_ids}, "status": "active", "plan": {"$in": ["basic", "pro", "premium"]}},
        {"_id": 0, "user_id": 1, "plan": 1},
    ).to_list(2000)
    paid_users = {s["user_id"]: s["plan"] for s in subs}

    rows = []
    for p in profs:
        uid = p["user_id"]
        pid = p["provider_id"]
        completeness = p.get("profile_completion", 0) or 0
        is_paid = uid in paid_users

        breakdown = {
            "referrals_credited": refs.get(uid, 0),
            "reviews_4plus": revs.get(pid, 0),
            "gig_applications": min(apps.get(pid, 0), 30),
            "streak_days": 0,  # not month-bound; excluded from historical windows
            "fast_responses": min(fasts.get(pid, 0), 30),
            "active_pro_bonus": 5 if is_paid else 0,
            "completion_bonus": 10 if completeness >= 80 else 0,
        }
        score = (
            breakdown["referrals_credited"] * 25
            + breakdown["reviews_4plus"] * 5
            + breakdown["gig_applications"] * 1
            + breakdown["fast_responses"] * 3
            + breakdown["active_pro_bonus"]
            + breakdown["completion_bonus"]
        )
        if score <= 0:
            continue

        rows.append({
            "provider_id": pid,
            "user_id": uid,
            "slug": p.get("slug"),
            "business_name": p.get("business_name") or "",
            "city": p.get("city"),
            "score": score,
            "breakdown": breakdown,
        })
    rows.sort(key=lambda r: -r["score"])
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
    return rows


def _tier_for_rank(rank: int) -> Optional[dict]:
    for tier in REWARD_TIERS:
        if rank <= tier["max_rank"]:
            return tier
    return None


async def _create_coupon_for_provider(user_id: str, rank: int, tier: dict, month_key: str) -> Optional[dict]:
    """Create a coupon. Idempotent on (user_id, month_key). Returns the new
    doc on FIRST insert; returns None when a coupon already existed (so
    callers can count only genuinely-new coupons in their reports).
    """
    existing = await db.coupons.find_one({"user_id": user_id, "month_key": month_key}, {"_id": 0})
    if existing:
        return None
    now = datetime.now(timezone.utc)
    # Valid for the entire NEXT calendar month (the month *after* the snapshot)
    parts = month_key.split("-")
    year, month = int(parts[0]), int(parts[1])
    # Coupon-redemption window starts the snapshot month + 1
    redeem_start = datetime(year, month, 1, tzinfo=timezone.utc) + timedelta(days=31)
    redeem_start = redeem_start.replace(day=1)
    if redeem_start.month == 12:
        redeem_end = redeem_start.replace(year=redeem_start.year + 1, month=1)
    else:
        redeem_end = redeem_start.replace(month=redeem_start.month + 1)

    code = f"{tier['code_prefix']}-{month_key.replace('-', '')}-{uuid.uuid4().hex[:6].upper()}"
    doc = {
        "coupon_id": f"cpn_{uuid.uuid4().hex[:14]}",
        "code": code,
        "user_id": user_id,
        "month_key": month_key,
        "rank": rank,
        "tier_label": tier["label"],
        "discount_pct": tier["discount_pct"],
        "status": "available",  # → "redeemed" → "expired"
        "redeemable_from": redeem_start.isoformat(),
        "redeemable_until": redeem_end.isoformat(),
        "created_at": now.isoformat(),
    }
    await db.coupons.insert_one(doc)

    # Push high-priority in-app notification + queue email/SMS for live channels
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
    if user:
        first = (user.get("name") or "").split(" ")[0] or "compa"
        title = f"🎁 Ganaste {tier['discount_pct']}% off — quedaste {tier['label']} en {month_key}"
        body = (
            f"{first}, fuiste #{rank} en el ranking de {month_key} y desbloqueaste un cupón de {tier['discount_pct']}% "
            f"para tu próxima mensualidad. Código: {code}. Vence el último día del próximo mes."
        )
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "notification_key": f"{user_id}::coupon::{month_key}",
            "user_id": user_id,
            "role": "provider",
            "category": "rewards",
            "title": title,
            "body": body,
            "cta_label": "Ver mi cupón",
            "cta_url": "/dashboard/provider#rewards",
            "icon": "trophy",
            "priority": "high",
            "is_read": False,
            "dismissed_at": None,
            "created_at": now.isoformat(),
        })
        if user.get("email"):
            await enqueue_notification(
                recipient_email=user["email"], channel="email",
                subject=title,
                body=body,
                trigger_type=f"coupon_{tier['code_prefix']}_{month_key}",
            )
        if user.get("phone"):
            await enqueue_notification(
                recipient_phone=user["phone"], channel="sms",
                body=f"🎁 getamano — {tier['discount_pct']}% off por quedar {tier['label']} en {month_key}. Código: {code}",
                trigger_type=f"coupon_{tier['code_prefix']}_{month_key}",
            )
    return doc


@api_router.post("/admin/leaderboard/snapshot")
async def admin_leaderboard_snapshot(
    request: Request,
    admin: User = Depends(require_admin),
    month: Optional[str] = None,
    dry_run: bool = False,
):
    """Snapshot the prior calendar month's leaderboard, mint coupons.

    Idempotent — re-running for the same month yields the same coupons.
    Pass `month=YYYY-MM` to snapshot a specific window. Default = previous
    calendar month. `dry_run=true` returns the would-be ranks/coupons
    without persisting.
    """
    if month:
        try:
            y, m = map(int, month.split("-"))
            window_start = datetime(y, m, 1, tzinfo=timezone.utc)
            if m == 12:
                window_end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
            else:
                window_end = datetime(y, m + 1, 1, tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(status_code=400, detail="Formato de mes inválido (usa YYYY-MM).")
    else:
        window_start, window_end = _previous_month_window()

    month_key = window_start.strftime("%Y-%m")
    rows = await _compute_leaderboard_for_window(window_start.isoformat(), window_end.isoformat())
    if not rows:
        return {"ok": True, "month": month_key, "snapshotted": 0, "coupons_created": 0, "dry_run": dry_run, "results": []}

    # Cap to top 50 — anything below doesn't earn a coupon
    eligible = rows[:50]
    results = []
    created = 0
    for r in eligible:
        tier = _tier_for_rank(r["rank"])
        if not tier:
            continue
        if dry_run:
            results.append({
                "user_id": r["user_id"],
                "rank": r["rank"],
                "score": r["score"],
                "business_name": r["business_name"],
                "tier": tier["label"],
                "discount_pct": tier["discount_pct"],
                "would_create": True,
            })
        else:
            doc = await _create_coupon_for_provider(r["user_id"], r["rank"], tier, month_key)
            if doc:
                created += 1
                results.append({
                    "user_id": r["user_id"],
                    "rank": r["rank"],
                    "score": r["score"],
                    "business_name": r["business_name"],
                    "code": doc["code"],
                    "discount_pct": doc["discount_pct"],
                    "status": doc["status"],
                })

    if not dry_run:
        await audit_log(admin.user_id, "leaderboard.snapshot", {"month": month_key, "coupons_created": created, "eligible": len(eligible)}, request)
    return {
        "ok": True,
        "month": month_key,
        "snapshotted": len(rows),
        "eligible": len(eligible),
        "coupons_created": created if not dry_run else 0,
        "dry_run": dry_run,
        "results": results,
    }


@api_router.get("/me/coupons")
async def get_my_coupons(user: User = Depends(get_current_user)):
    """Provider-facing list of coupons earned via leaderboard rankings."""
    now = datetime.now(timezone.utc).isoformat()
    items = await db.coupons.find(
        {"user_id": user.user_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(24).to_list(24)
    # Auto-mark expired coupons whose window has passed
    for c in items:
        if c.get("status") == "available" and c.get("redeemable_until") and c["redeemable_until"] < now:
            c["status"] = "expired"
            await db.coupons.update_one(
                {"coupon_id": c["coupon_id"]},
                {"$set": {"status": "expired"}},
            )
    active = [c for c in items if c.get("status") == "available"]
    return {"items": items, "active_count": len(active)}


@api_router.post("/me/coupons/{coupon_id}/redeem")
async def redeem_my_coupon(coupon_id: str, user: User = Depends(get_current_user), request: Request = None):
    """Mark a coupon as redeemed. Stripe integration will plug in here once
    keys are live — for now it's a flag flip so the dashboard reflects use.
    """
    c = await db.coupons.find_one({"coupon_id": coupon_id, "user_id": user.user_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cupón no encontrado.")
    if c.get("status") != "available":
        raise HTTPException(status_code=400, detail=f"Cupón {c.get('status', 'no disponible')}.")
    now = datetime.now(timezone.utc)
    if c.get("redeemable_from") and now.isoformat() < c["redeemable_from"]:
        raise HTTPException(status_code=400, detail="El cupón aún no es redimible.")
    if c.get("redeemable_until") and now.isoformat() > c["redeemable_until"]:
        await db.coupons.update_one({"coupon_id": coupon_id}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=400, detail="El cupón ya expiró.")
    await db.coupons.update_one(
        {"coupon_id": coupon_id},
        {"$set": {"status": "redeemed", "redeemed_at": now.isoformat()}},
    )
    if request:
        await audit_log(user.user_id, "coupon.redeemed", {"coupon_id": coupon_id, "code": c.get("code")}, request)
    return {"ok": True, "code": c.get("code"), "redeemed_at": now.isoformat()}


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
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.referrals.insert_one({
        "referral_id": f"ref_{uuid.uuid4().hex[:14]}",
        "referrer_user_id": referrer["user_id"],
        "referred_user_id": referred_user_id,
        "ref_code": ref_code,
        "status": "registered",  # → "paid" when subscription pays → "credited" when month applied
        "created_at": now_iso,
    })
    # Sprint A — Section 84: persist the inviter attribution on the user
    # doc so the AppHome welcome banner + "thank inviter" flow can render
    # without re-querying the referrals collection on every page load.
    try:
        await db.users.update_one(
            {"user_id": referred_user_id},
            {"$set": {
                "invited_by_user_id": referrer["user_id"],
                "invited_via_ref_code": ref_code,
                "invited_at": now_iso,
            }},
        )
    except Exception:
        pass
    # Auto-follow: the referee follows the referrer so the social loop
    # opens with a connection in place. Idempotent on the unique index
    # (follower_user_id, followed_user_id).
    try:
        exists_follow = await db.follows.find_one(
            {"follower_user_id": referred_user_id, "followed_user_id": referrer["user_id"]},
            {"_id": 0, "follow_id": 1},
        )
        if not exists_follow:
            await db.follows.insert_one({
                "follow_id": f"fol_{uuid.uuid4().hex[:14]}",
                "follower_user_id": referred_user_id,
                "followed_user_id": referrer["user_id"],
                "source": "referral_auto",
                "created_at": now_iso,
            })
    except Exception:
        pass
    # Notify the referrer that someone just registered via their link
    # (status = registered, not yet paid). Builds anticipation.
    try:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": referrer["user_id"],
            "category": "referrals",
            "title": "🌱 Alguien se registró con tu link",
            "body": (
                "Cuando active su plan Pro, sumás 1 paso hacia tu próximo "
                "mes gratis. ¡Sigue compartiendo!"
            ),
            "cta_label": "Ver mi red",
            "cta_url": "/dashboard/provider?tab=red",
            "icon": "user-plus",
            "priority": "normal",
            "is_read": False,
            "dismissed_at": None,
            "created_at": now_iso,
        })
    except Exception:
        pass


async def _grant_referral_reward(referred_user_id: str) -> Optional[dict]:
    """Trigger when a provider gets verified. Credits both the referrer and the
    invitee with 30 days of free Pro by extending their `pro_referral_until`
    timestamps. Idempotent: marks the referral as `credited` so it can't fire
    twice for the same invitee.
    """
    referral = await db.referrals.find_one(
        {"referred_user_id": referred_user_id},
        {"_id": 0},
    )
    if not referral:
        return None
    if referral.get("status") == "credited":
        return None  # already rewarded
    now = datetime.now(timezone.utc)
    bonus_until = (now + timedelta(days=30)).isoformat()

    async def _extend(user_id: str) -> str:
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "pro_referral_until": 1, "email": 1, "name": 1})
        if not u:
            return ""
        # If user already has bonus time, stack on top of the latest
        current = u.get("pro_referral_until")
        if current:
            try:
                current_dt = datetime.fromisoformat(current)
                if current_dt > now:
                    new_until = (current_dt + timedelta(days=30)).isoformat()
                else:
                    new_until = bonus_until
            except Exception:
                new_until = bonus_until
        else:
            new_until = bonus_until
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"pro_referral_until": new_until}},
        )
        return new_until

    referrer_until = await _extend(referral["referrer_user_id"])
    invitee_until = await _extend(referred_user_id)

    await db.referrals.update_one(
        {"referral_id": referral["referral_id"]},
        {"$set": {
            "status": "credited",
            "credited_at": now.isoformat(),
            "referrer_pro_until": referrer_until,
            "invitee_pro_until": invitee_until,
        }},
    )

    # In-app notifications for both
    invitee_name = ""
    invitee_user = await db.users.find_one({"user_id": referred_user_id}, {"_id": 0, "name": 1})
    if invitee_user:
        invitee_name = (invitee_user.get("name") or "").split(" ")[0] or "tu referido"
    referrer_name = ""
    referrer_user = await db.users.find_one({"user_id": referral["referrer_user_id"]}, {"_id": 0, "name": 1})
    if referrer_user:
        referrer_name = (referrer_user.get("name") or "").split(" ")[0] or "tu compa"
    now_iso = now.isoformat()
    referral_id = referral["referral_id"]

    for uid, title, body in [
        (referral["referrer_user_id"],
         "🎉 ¡Ganaste 1 mes gratis Pro!",
         f"{invitee_name} se verificó usando tu link de referido. ¡Disfruta tu mes gratis!"),
        (referred_user_id,
         "🎁 Te regalamos 1 mes Pro gratis",
         f"Como llegaste por la invitación de {referrer_name}, ¡tu primer mes Pro va por la casa!"),
    ]:
        key = f"{uid}::referral_reward::{referral_id}"
        existing = await db.notifications.find_one({"notification_key": key}, {"_id": 0})
        if existing:
            continue
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "notification_key": key,
            "user_id": uid,
            "role": "provider",
            "category": "referrals",
            "title": title,
            "body": body,
            "cta_label": "Ver invitaciones",
            "cta_url": "/dashboard/provider#referrals",
            "icon": "trophy",
            "priority": "high",
            "is_read": False,
            "dismissed_at": None,
            "created_at": now_iso,
        })

    return {
        "referral_id": referral_id,
        "referrer_user_id": referral["referrer_user_id"],
        "referred_user_id": referred_user_id,
        "referrer_pro_until": referrer_until,
        "invitee_pro_until": invitee_until,
    }


@api_router.get("/referral/preview/{code}")
async def referral_preview(code: str):
    """Public — used by the landing page when ?ref=CODE is in the URL.

    Returns the referrer's first name + business name so we can render a
    welcome banner. Returns 404 only when the code is malformed; an unknown
    code returns {valid: false} so the landing page can silently hide the
    banner without leaking which codes exist.
    """
    code = (code or "").strip().upper()
    if len(code) != 6 or not code.isalnum():
        raise HTTPException(status_code=400, detail="Código inválido.")
    prof = await db.provider_profiles.find_one(
        {"ref_code": code},
        {"_id": 0, "user_id": 1, "business_name": 1, "city": 1, "slug": 1},
    )
    if not prof:
        return {"valid": False}
    user = await db.users.find_one({"user_id": prof["user_id"]}, {"_id": 0, "name": 1})
    name = ""
    if user:
        name = (user.get("name") or "").split(" ")[0]
    return {
        "valid": True,
        "code": code,
        "referrer_name": name or "Un proveedor",
        "business_name": prof.get("business_name") or "",
        "city": prof.get("city"),
        "slug": prof.get("slug"),
    }


class ReferralInviteIn(BaseModel):
    email: EmailStr
    note: Optional[str] = Field(None, max_length=300)


@api_router.post("/providers/me/referral/invite")
async def referral_invite(payload: ReferralInviteIn, request: Request, user: User = Depends(get_current_user)):
    """Send a personal invitation email to a friend with the referrer's
    unique link pre-attached. Dev-fallback logs to backend stderr until
    RESEND_API_KEY is set. Stores the invite for tracking.
    """
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores pueden invitar.")
    prof = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "ref_code": 1, "business_name": 1})
    if not prof:
        raise HTTPException(status_code=404, detail="Perfil no encontrado.")
    code = prof.get("ref_code")
    if not code:
        # backfill
        for _ in range(8):
            cand = _gen_ref_code()
            ex = await db.provider_profiles.find_one({"ref_code": cand}, {"_id": 0})
            if not ex:
                code = cand
                break
        await db.provider_profiles.update_one({"user_id": user.user_id}, {"$set": {"ref_code": code}})
    target = payload.email.lower().strip()
    if not target:
        raise HTTPException(status_code=400, detail="Email requerido.")
    # Don't allow inviting an already-registered user
    if await db.users.find_one({"email": target}, {"_id": 0, "user_id": 1}):
        raise HTTPException(status_code=400, detail="Esa persona ya tiene cuenta en getamano.")
    # Rate-limit one invite per (referrer, email) per 24h
    one_day_ago = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent = await db.referral_invites.find_one(
        {"referrer_user_id": user.user_id, "invited_email": target, "created_at": {"$gte": one_day_ago}},
        {"_id": 0},
    )
    if recent:
        raise HTTPException(status_code=429, detail="Ya enviaste una invitación a esta persona en las últimas 24 horas.")
    forwarded = request.headers.get("origin") or request.headers.get("referer") or ""
    public_url = forwarded.split("/api", 1)[0] if forwarded else "https://getamano.us"
    invite_url = f"{public_url.rstrip('/')}/registro?ref={code}&intent=provider"
    name_first = (await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1}) or {}).get("name", "").split(" ")[0] or "Tu compa"
    biz = prof.get("business_name") or "su negocio"
    subject = f"💸 {name_first} te invitó a getamano — primer mes Pro gratis"
    body_html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F7F6F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F6F2;padding:24px 12px;"><tr><td align="center">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    <tr><td style="background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);padding:36px 32px 24px;">
      <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">Invitación personal</p>
      <h1 style="margin:8px 0 0 0;color:#FFFFFF;font-size:26px;font-weight:800;line-height:1.2;">{name_first} cree que getamano es para ti.</h1>
    </td></tr>
    <tr><td style="padding:24px 32px;">
      <p style="margin:0 0 12px 0;color:#0F172A;font-size:16px;line-height:1.6;">Hola 👋</p>
      <p style="margin:0 0 12px 0;color:#475569;font-size:15px;line-height:1.6;">
        <strong>{name_first}</strong> ({biz}) te está invitando a unirte a <strong>getamano</strong>, el marketplace donde la comunidad latina en EE.UU. encuentra y contrata proveedores verificados.
      </p>
      <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:14px;padding:14px 18px;margin:18px 0;">
        <p style="margin:0;color:#9A3412;font-size:14px;font-weight:700;">🎁 Bono por usar este link:</p>
        <p style="margin:6px 0 0 0;color:#7C2D12;font-size:13px;line-height:1.5;">Cuando verifiquemos tu perfil, recibes <strong>1 mes gratis Pro</strong> — y {name_first} también lo recibe. Ganan los dos.</p>
      </div>
      <p style="margin:0 0 16px 0;color:#475569;font-size:14px;line-height:1.6;">{(payload.note or '').strip()}</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="{invite_url}" style="display:inline-block;padding:14px 32px;background:#025F67;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;border-radius:9999px;">Crear mi cuenta gratis →</a>
      </div>
      <p style="margin:0;color:#94A3B8;font-size:12px;text-align:center;">O copia este enlace: <span style="color:#025F67;">{invite_url}</span></p>
    </td></tr>
    <tr><td style="background:#F8FAFC;padding:18px 32px;text-align:center;border-top:1px solid #E2E8F0;">
      <p style="margin:0;color:#94A3B8;font-size:11px;">© getamano 2026 · Hecho con cariño para la comunidad latina.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>"""
    result = await _send_email_via_resend(target, subject, body_html)
    # Track the invite
    await db.referral_invites.insert_one({
        "invite_id": f"inv_{uuid.uuid4().hex[:14]}",
        "referrer_user_id": user.user_id,
        "ref_code": code,
        "invited_email": target,
        "note": (payload.note or "")[:300],
        "sent": result.get("sent", False),
        "reason": result.get("reason"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await audit_log(user.user_id, "referral.invite_sent", {"email": target, "code": code, "sent": result.get("sent", False)}, request)
    return {"ok": True, "sent": result.get("sent", False), "reason": result.get("reason"), "share_url": invite_url}


@api_router.get("/me/referral-credit")
async def get_my_referral_credit(user: User = Depends(get_current_user)):
    """Returns how many days of free Pro the user has remaining from referrals."""
    u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "pro_referral_until": 1})
    until = (u or {}).get("pro_referral_until")
    if not until:
        return {"active": False, "until": None, "days_remaining": 0}
    try:
        until_dt = datetime.fromisoformat(until)
    except Exception:
        return {"active": False, "until": None, "days_remaining": 0}
    now = datetime.now(timezone.utc)
    if until_dt <= now:
        return {"active": False, "until": until, "days_remaining": 0}
    days = max(0, int((until_dt - now).total_seconds() // 86400))
    return {"active": True, "until": until, "days_remaining": days}


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


def _diagnose_google_api_error(status_code: int, body_text: str) -> dict:
    """Map Google API error responses to actionable CEO-facing hints.

    Returns: { kind, hint_es, hint_en } so the UI / admin panel knows whether to
    tell the CEO 'enable the API' vs 'check billing' vs 'wait, quota exceeded'.
    """
    body_lower = (body_text or "").lower()
    if "service_disabled" in body_lower or "has not been used" in body_lower:
        return {
            "kind": "api_disabled",
            "hint_es": "El API no está habilitado en tu proyecto de Google Cloud. Ve a console.cloud.google.com → APIs & Services → Library y haz click en 'Enable'.",
            "hint_en": "API not enabled on your Google Cloud project. Go to console.cloud.google.com → APIs & Services → Library and click 'Enable'.",
        }
    if "permission_denied" in body_lower or "api key not valid" in body_lower:
        return {
            "kind": "permission_denied",
            "hint_es": "API key inválida o sin permisos. Verifica GOOGLE_API_KEY en el panel de Emergent y restricciones en Google Cloud.",
            "hint_en": "Invalid or unauthorized API key. Verify GOOGLE_API_KEY in Emergent panel and key restrictions in Google Cloud.",
        }
    if status_code == 429 or "quota" in body_lower or "rate" in body_lower:
        return {
            "kind": "quota_exceeded",
            "hint_es": "Has excedido la cuota gratuita de Google Cloud. Espera unos minutos o sube de tier.",
            "hint_en": "Free Google Cloud quota exceeded. Wait a few minutes or upgrade tier.",
        }
    if status_code == 400 or "invalid" in body_lower:
        return {
            "kind": "bad_request",
            "hint_es": "Petición rechazada por Google. Probablemente el contenido no es válido.",
            "hint_en": "Request rejected by Google. Likely invalid content.",
        }
    return {
        "kind": "unknown",
        "hint_es": f"Error inesperado de Google (HTTP {status_code}).",
        "hint_en": f"Unexpected Google error (HTTP {status_code}).",
    }


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
            if r.status_code >= 400:
                diag = _diagnose_google_api_error(r.status_code, r.text)
                logger.warning("translate API %s: %s", diag["kind"], r.text[:200])
                return {"translated_text": payload.text, "cached": False,
                        "source": "api_error", "error_kind": diag["kind"], "note": diag["hint_es"]}
            translated = r.json()["data"]["translations"][0]["translatedText"]
    except Exception as e:
        logger.warning(f"translate API call failed: {e}")
        return {"translated_text": payload.text, "cached": False, "source": "api_error",
                "error_kind": "network", "note": "El servicio de traducción no respondió."}
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
# SECTION 24 — Email OTP verification
# ════════════════════════════════════════════════════════════════════
# The auth-related OTP endpoints (/auth/send-otp, /auth/verify-otp,
# /auth/me/email-verified) live in routes/auth.py.
# `_send_email_via_resend` remains here because the weekly-gig-digest
# helpers below also rely on it.

import asyncio as _asyncio

async def _send_email_via_resend(to: str, subject: str, html: str) -> dict:
    """Send a transactional email. Falls back to logger when RESEND_API_KEY missing."""
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    sender = (os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev").strip()
    if not api_key:
        # Dev fallback — log the email content so the founder can copy the OTP code.
        logger.warning("[EMAIL DEV-FALLBACK] To=%s | Subject=%s | (set RESEND_API_KEY to send for real)", to, subject)
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

# ════════════════════════════════════════════════════════════════════════
# WEEKLY GIG DIGEST (post-Section 30 follow-up)
# ════════════════════════════════════════════════════════════════════════
# Aggregates the past 7 days of gigs that match each provider's category +
# city and ships a curated email digest. Dev-fallback logs to stderr when
# RESEND_API_KEY is not set (same convention as the OTP flow).
# ════════════════════════════════════════════════════════════════════════

async def _compute_provider_weekly_digest(user_id: str) -> Optional[dict]:
    """Return a dict ready to render in HTML, or None when no gigs match.

    Output shape:
      {
        "provider_name": "Carmen",
        "business_name": "María Cleaning",
        "city": "Sallisaw",
        "state": "OK",
        "category_name": "Limpieza",
        "gigs": [ {gig_id, title, budget_label, city, is_urgent, created_at}, ... up to 5 ],
        "total_count": int,
      }
    """
    profile = await db.provider_profiles.find_one(
        {"user_id": user_id, "is_active": True, "verification_status": "approved"},
        {"_id": 0, "category_id": 1, "city": 1, "state": 1, "business_name": 1, "user_id": 1},
    )
    if not profile or not profile.get("category_id") or not profile.get("city"):
        return None
    cat = await db.categories.find_one({"category_id": profile["category_id"]}, {"_id": 0, "name_es": 1, "name_en": 1})
    if not cat:
        return None
    cat_names = [n for n in (cat.get("name_es"), cat.get("name_en")) if n]
    one_week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    cat_regex = f"^({'|'.join(re.escape(n) for n in cat_names)})$"
    q = {
        "status": "open",
        "city": {"$regex": f"^{re.escape(profile['city'])}$", "$options": "i"},
        "category": {"$regex": cat_regex, "$options": "i"},
        "created_at": {"$gte": one_week_ago},
        "created_by": {"$ne": user_id},
    }
    total = await db.gigs.count_documents(q)
    if total == 0:
        return None
    rows = await db.gigs.find(q, {"_id": 0, "expires_at_native": 0}).sort("created_at", -1).limit(5).to_list(5)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1, "email": 1})
    out_gigs = []
    for g in rows:
        budget_min = g.get("budget_min")
        budget_max = g.get("budget_max")
        if budget_min is not None and budget_max is not None:
            budget_label = f"${int(budget_min)}–${int(budget_max)}"
        elif budget_min is not None:
            budget_label = f"desde ${int(budget_min)}"
        elif budget_max is not None:
            budget_label = f"hasta ${int(budget_max)}"
        else:
            budget_label = "Presupuesto abierto"
        out_gigs.append({
            "gig_id": g.get("gig_id"),
            "title": g.get("title", ""),
            "description": (g.get("description") or "")[:160],
            "budget_label": budget_label,
            "city": g.get("city"),
            "state": g.get("state"),
            "is_urgent": bool(g.get("is_urgent")),
            "created_at": g.get("created_at"),
        })
    return {
        "user_id": user_id,
        "email": (user_doc or {}).get("email"),
        "provider_name": ((user_doc or {}).get("name") or "").split(" ")[0] or "Compañer@",
        "business_name": profile.get("business_name") or "",
        "city": profile.get("city"),
        "state": profile.get("state"),
        "category_name": cat.get("name_es") or cat.get("name_en"),
        "gigs": out_gigs,
        "total_count": total,
    }

def _build_weekly_digest_html(digest: dict, public_url: str) -> tuple[str, str]:
    """Return (subject, html). Branded with getamano gradient + teal CTA."""
    name = digest["provider_name"]
    city = digest["city"] or "tu zona"
    cat = digest["category_name"] or "tu categoría"
    total = digest["total_count"]
    subject = f"💼 {total} nueva{'s' if total != 1 else ''} chamba{'s' if total != 1 else ''} de {cat} esta semana en {city}"
    rows_html = []
    for g in digest["gigs"]:
        urgent_pill = (
            '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#FFEDD5;color:#C2410C;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-left:6px;">URGENTE</span>'
            if g.get("is_urgent") else ""
        )
        loc = f"{g.get('city','')}{', ' + g['state'] if g.get('state') else ''}"
        gig_url = f"{public_url.rstrip('/')}/empleos"
        rows_html.append(f"""
          <tr><td style="padding:14px 0;border-bottom:1px solid #E2E8F0;">
            <a href="{gig_url}" style="text-decoration:none;color:inherit;display:block;">
              <p style="margin:0 0 4px 0;color:#0F172A;font-size:15px;font-weight:700;line-height:1.3;">{g['title']}{urgent_pill}</p>
              <p style="margin:0 0 6px 0;color:#475569;font-size:13px;line-height:1.5;">{g['description']}</p>
              <p style="margin:0;color:#025F67;font-size:13px;font-weight:600;">{g['budget_label']} · {loc}</p>
            </a>
          </td></tr>
        """)
    rows_block = "\n".join(rows_html)
    cta_url = f"{public_url.rstrip('/')}/empleos"
    extra_count = max(total - len(digest["gigs"]), 0)
    extra_html = (
        f'<p style="margin:8px 0 0 0;color:#64748B;font-size:13px;">Y {extra_count} más en el tablero.</p>'
        if extra_count > 0 else ""
    )
    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#F7F6F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F6F2;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
      <tr><td style="background:linear-gradient(135deg,#025F67 0%,#2F9D94 100%);padding:32px 32px 20px;">
        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">getamano · Resumen semanal</p>
        <h1 style="margin:8px 0 0 0;color:#FFFFFF;font-size:24px;font-weight:800;line-height:1.2;">Hola, {name} 👋</h1>
        <p style="margin:6px 0 0 0;color:#FFFFFF;font-size:15px;line-height:1.5;opacity:0.95;">Estas son las chambas de <strong>{cat}</strong> que aparecieron esta semana cerca de ti en <strong>{city}</strong>:</p>
      </td></tr>
      <tr><td style="padding:8px 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          {rows_block}
        </table>
        {extra_html}
        <div style="margin-top:24px;text-align:center;">
          <a href="{cta_url}" style="display:inline-block;padding:14px 32px;background:#025F67;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;border-radius:9999px;">Ver todas las chambas →</a>
        </div>
      </td></tr>
      <tr><td style="background:#F8FAFC;padding:18px 32px;text-align:center;border-top:1px solid #E2E8F0;">
        <p style="margin:0 0 6px 0;color:#475569;font-size:13px;">Aplica a las que te interesen — tu reputación en getamano viaja con cada aplicación.</p>
        <p style="margin:0;color:#94A3B8;font-size:11px;">© getamano 2026 · Recibes este correo porque tu eCard está activa. <a href="{cta_url}" style="color:#94A3B8;text-decoration:underline;">Gestiona preferencias</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""
    return subject, html

async def _send_weekly_digest_to_provider(user_id: str, public_url: str) -> dict:
    """Compute + send digest for a single provider. Returns status dict."""
    digest = await _compute_provider_weekly_digest(user_id)
    if not digest:
        return {"user_id": user_id, "skipped": True, "reason": "no_matching_gigs"}
    if not digest.get("email"):
        return {"user_id": user_id, "skipped": True, "reason": "no_email"}
    subject, html = _build_weekly_digest_html(digest, public_url)
    result = await _send_email_via_resend(digest["email"], subject, html)
    return {
        "user_id": user_id,
        "email": digest["email"],
        "subject": subject,
        "gigs_count": digest["total_count"],
        "sent": result.get("sent", False),
        "reason": result.get("reason"),
    }

# OTP endpoints moved to routes/auth.py.


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


# ── /ai/draft-description — generate a starter description from scratch ──
# Used by the SmartSubcategoryPicker flow: once a provider picks their main
# category and 1–3 specializations, this endpoint produces an 80-100-word
# Spanish (or English) starter so the provider doesn't face a blank textarea.

class DraftDescriptionIn(BaseModel):
    main_category: str
    subcategories: List[str] = []
    business_name: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    locale: Optional[str] = "es"


@api_router.post("/ai/draft-description")
async def draft_description(payload: DraftDescriptionIn, user: User = Depends(get_current_user)):
    """Generate a fresh 2-3 sentence starter description for a provider."""
    main_cat = (payload.main_category or "").strip()
    if not main_cat:
        raise HTTPException(status_code=400, detail="Selecciona una categoría principal primero.")
    subs = [s.strip() for s in (payload.subcategories or []) if s.strip()][:6]

    locale = (payload.locale or "es").lower()
    is_en = locale.startswith("en")
    city_part = f", {payload.city}" if payload.city else ""
    if payload.state and payload.city:
        city_part = f", {payload.city}, {payload.state}"

    if is_en:
        system_msg = (
            "You write starter descriptions for service providers on getamano, a Latino services marketplace in the US. "
            "Tone: warm, human, Latino — never corporate or generic. "
            "Rules:\n"
            "1. 2-3 sentences, ~60-90 words, conversational.\n"
            "2. Mention the main category and weave in the chosen specializations naturally.\n"
            "3. Mention the city ONLY if provided.\n"
            "4. End with a soft call to action.\n"
            "5. Do NOT invent years of experience, prices or claims. Do NOT use \"the best\", \"#1\", \"world-class\".\n"
            "6. Output ONLY the description text. No quotes, no preface, no list."
        )
        user_msg = (
            f"Main category: {main_cat}\n"
            f"Specializations: {', '.join(subs) if subs else '(none chosen)'}\n"
            f"{f'Business name: {payload.business_name}' if payload.business_name else ''}\n"
            f"Location: {payload.city or ''} {payload.state or ''}\n\n"
            "Write the starter description."
        )
    else:
        system_msg = (
            "Escribes descripciones iniciales para proveedores en getamano, un marketplace latino de servicios en USA. "
            "Tono: cercano, humano, latino — jamás corporativo ni genérico. "
            "Reglas:\n"
            "1. Entre 2 y 3 oraciones, ~60-90 palabras, conversacional.\n"
            "2. Menciona la categoría principal e integra las especializaciones elegidas de forma natural.\n"
            "3. Menciona la ciudad SOLO si fue provista.\n"
            "4. Cierra con una llamada a la acción suave.\n"
            "5. NO inventes años de experiencia, precios ni reclamos. NO uses \"el mejor\", \"#1\", \"de clase mundial\".\n"
            "6. Devuelve SOLO la descripción. Sin comillas, sin prefijos, sin listas."
        )
        user_msg = (
            f"Categoría principal: {main_cat}\n"
            f"Especializaciones: {', '.join(subs) if subs else '(ninguna elegida)'}\n"
            f"{f'Nombre del negocio: {payload.business_name}' if payload.business_name else ''}\n"
            f"Ubicación: {payload.city or ''}{city_part if not payload.city else ''}\n\n"
            "Escribe la descripción inicial."
        )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"draft_desc_{user.user_id}_{int(datetime.now(timezone.utc).timestamp())}",
            system_message=system_msg,
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        draft = (await chat.send_message(UserMessage(text=user_msg))).strip()
    except Exception as e:
        logger.exception("AI draft-description failed")
        raise HTTPException(status_code=503, detail="No pudimos generar la descripción. Intenta de nuevo.") from e

    # Strip surrounding quotes Claude occasionally adds
    if draft.startswith(("\"", "'")) and draft.endswith(("\"", "'")):
        draft = draft[1:-1].strip()

    return {"draft": draft, "model": "claude-haiku-4-5"}


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
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
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
    candidates = [ln for ln in lines if not _PHONE_RE.search(ln) and not _EMAIL_RE.search(ln) and not _URL_RE.search(ln) and len(ln) >= 3 and len(ln) <= 60]
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
            if r.status_code >= 400:
                diag = _diagnose_google_api_error(r.status_code, r.text)
                logger.warning("Vision API %s: %s", diag["kind"], r.text[:200])
                return {"source": "api_error", "fields": {}, "raw_text": "",
                        "error_kind": diag["kind"], "note": diag["hint_es"]}
            data = r.json()
    except Exception as e:
        logger.warning(f"Vision OCR call failed: {e}")
        return {"source": "api_error", "fields": {}, "raw_text": "",
                "error_kind": "network",
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


@api_router.get("/admin/google-cloud-status")
async def admin_google_cloud_status(_admin: User = Depends(require_admin)):
    """Diagnostic: ping Translation + Vision and report which are enabled.

    Useful for the CEO to verify GCP setup BEFORE the 'Enable API' click works.
    Lightweight: 1-char translation ping + 1-byte image to Vision.
    """
    api_key = (os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        return {
            "configured": False,
            "translation": {"enabled": False, "error_kind": "no_api_key"},
            "vision": {"enabled": False, "error_kind": "no_api_key"},
            "hint": "GOOGLE_API_KEY no configurada en /app/backend/.env",
        }

    async def _check_translation():
        try:
            async with httpx.AsyncClient(timeout=8.0) as cli:
                r = await cli.post(
                    f"https://translation.googleapis.com/language/translate/v2?key={api_key}",
                    json={"q": "ok", "target": "es", "source": "en", "format": "text"},
                )
                if r.status_code == 200:
                    return {"enabled": True, "sample": r.json()["data"]["translations"][0]["translatedText"]}
                diag = _diagnose_google_api_error(r.status_code, r.text)
                return {"enabled": False, "status_code": r.status_code,
                        "error_kind": diag["kind"], "hint": diag["hint_es"]}
        except Exception as e:
            return {"enabled": False, "error_kind": "network", "hint": str(e)[:120]}

    async def _check_vision():
        # 1x1 transparent PNG as the cheapest possible probe
        tiny_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        try:
            async with httpx.AsyncClient(timeout=8.0) as cli:
                r = await cli.post(
                    f"https://vision.googleapis.com/v1/images:annotate?key={api_key}",
                    json={"requests": [{
                        "image": {"content": tiny_png},
                        "features": [{"type": "LABEL_DETECTION", "maxResults": 1}],
                    }]},
                )
                if r.status_code == 200:
                    return {"enabled": True}
                diag = _diagnose_google_api_error(r.status_code, r.text)
                return {"enabled": False, "status_code": r.status_code,
                        "error_kind": diag["kind"], "hint": diag["hint_es"]}
        except Exception as e:
            return {"enabled": False, "error_kind": "network", "hint": str(e)[:120]}

    # Run both probes in parallel so the CEO sees results fast
    translation_result, vision_result = await asyncio.gather(_check_translation(), _check_vision())
    return {
        "configured": True,
        "key_prefix": api_key[:6] + "…" if len(api_key) > 6 else "set",
        "translation": translation_result,
        "vision": vision_result,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


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
# SECTION 46 — VIRAL SHARE TRACKING (WhatsApp/Email/QR/Native)
# ════════════════════════════════════════════════════════════════════
# Provider clicks "Compartir" → we increment denormalised counters on their
# profile + append an event row. Anonymous visitors who land on an eCard via
# ?ref={slug} count as a "referred view" for the referrer (1 per ip / 24h).
#
# Performance contract:
#   · provider_profiles.share_count + referred_view_count are denormalised so
#     the dashboard GET /me reads them with zero extra queries.
#   · share_events is append-only with one composite index — used only by the
#     stats endpoint, not on hot paths.
#   · share_view_dedup is a TTL collection (24h) that auto-purges itself, so
#     the marketplace can never be flooded by refresh-spam.

class ShareEventIn(BaseModel):
    channel: Literal["whatsapp", "email", "qr", "native", "copy"]


class TrackShareViewIn(BaseModel):
    ref: str = Field(min_length=2, max_length=120)


@api_router.post("/providers/me/share-event")
async def track_provider_share_event(payload: ShareEventIn, request: Request,
                                      user: User = Depends(get_current_user)):
    """Fire-and-forget: provider just shared their eCard. Bumps counters."""
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores pueden registrar shares.")
    profile = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "slug": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Sin perfil de proveedor.")
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    await db.share_events.insert_one({
        "event_id": f"shev_{uuid.uuid4().hex[:12]}",
        "provider_user_id": user.user_id,
        "provider_slug": profile.get("slug"),
        "channel": payload.channel,
        "created_at": now_iso,
    })
    await db.provider_profiles.update_one(
        {"user_id": user.user_id},
        {
            "$inc": {"share_count": 1, f"share_channels.{payload.channel}": 1},
            "$set": {"last_share_at": now_iso},
        },
    )
    return {"ok": True}


# ============ SECTION 49 — AI Banner Generator ============

class BannerGenerateIn(BaseModel):
    color: str = Field(default="#2F9D94", min_length=4, max_length=9)
    style: Literal["modern", "festive", "professional", "minimal", "warm"] = "modern"
    keywords: Optional[str] = Field(default=None, max_length=200)


# ============ SECTION 64 — AI Logo Generator (square, branded) ============
class LogoGenerateIn(BaseModel):
    color: str = Field(default="#2F9D94", min_length=4, max_length=9)
    style: Literal["icon", "monogram", "emblem", "minimal"] = "icon"
    keywords: Optional[str] = Field(default=None, max_length=200)


@api_router.post("/providers/me/generate-logo")
async def generate_logo_ai(payload: LogoGenerateIn, user: User = Depends(get_current_user)):
    """Generate a square brand logo for the provider via gpt-image-1.
    Used by the FirstStepsPanel when the provider does not have a logo yet.

    Style guide:
      · icon     — flat icon mark, single subject, brand color, rounded shapes
      · monogram — initials in a circular badge, elegant typography (but we
                   instruct NO LETTERS so the result is purely visual; the
                   final letters are composed client-side over the badge)
      · emblem   — vintage-style hexagonal emblem, decorative border
      · minimal  — single geometric shape, maximum negative space
    """
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores pueden generar logo.")

    profile = await db.provider_profiles.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "business_name": 1, "category_id": 1, "logo_generations_count": 1, "logo_last_generated_at": 1},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Sin perfil de proveedor.")

    now = datetime.now(timezone.utc)
    today_start_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_count = profile.get("logo_generations_count", 0)
    last_at = profile.get("logo_last_generated_at", "")
    # Rate-limit: 10 logo generations per day
    if last_at and last_at >= today_start_iso and today_count >= 10:
        raise HTTPException(status_code=429, detail="Límite diario alcanzado. Intenta mañana.")

    category_label = ""
    if profile.get("category_id"):
        cat = await db.categories.find_one({"category_id": profile["category_id"]}, {"_id": 0, "name_es": 1, "name_en": 1})
        if cat:
            category_label = cat.get("name_es") or cat.get("name_en") or ""

    style_descriptions = {
        "icon":     "flat vector icon logo, single bold subject centered, friendly rounded shapes, simple silhouette, clean negative space",
        "monogram": "circular badge logo with thick border and central decorative pattern, premium feeling, brand mark composition",
        "emblem":   "vintage hexagonal emblem logo with subtle decorative border, polished modern-classic balance",
        "minimal":  "ultra-minimal geometric logo, single shape on solid background, lots of negative space, calm and balanced",
    }
    style_desc = style_descriptions.get(payload.style, style_descriptions["icon"])

    prompt_parts = [
        f"A {style_desc} for a small business.",
        f"Brand color: {payload.color}. White or neutral solid background.",
        "Square 1:1 composition, centered subject, even padding.",
        "No text, no letters, no numbers, no words anywhere — purely visual symbol/icon.",
        "Crisp, professional, social-media-ready, suitable for use as a circular avatar.",
    ]
    if category_label:
        prompt_parts.append(f"Visual hints relating to: {category_label}.")
    if (payload.keywords or "").strip():
        prompt_parts.append(f"Additional theme: {payload.keywords.strip()}.")
    final_prompt = " ".join(prompt_parts)

    try:
        from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
        image_gen = OpenAIImageGeneration(api_key=os.environ.get("EMERGENT_LLM_KEY"))
        images = await image_gen.generate_images(
            prompt=final_prompt,
            model="gpt-image-1",
            number_of_images=1,
        )
        if not images:
            raise HTTPException(status_code=502, detail="No se pudo generar el logo. Intenta de nuevo.")
        import base64 as _b64
        image_base64 = _b64.b64encode(images[0]).decode("utf-8")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"logo-gen failed: {e}")
        raise HTTPException(status_code=502, detail="Error al generar el logo. Reintenta.")

    update_doc = {
        "logo_last_generated_at": now.isoformat(),
        "logo_last_style": payload.style,
        "logo_last_color": payload.color,
    }
    if not last_at or last_at < today_start_iso:
        update_doc["logo_generations_count"] = 1
        await db.provider_profiles.update_one({"user_id": user.user_id}, {"$set": update_doc})
    else:
        await db.provider_profiles.update_one(
            {"user_id": user.user_id},
            {"$set": update_doc, "$inc": {"logo_generations_count": 1}},
        )

    return {
        "image_base64": image_base64,
        "mime": "image/png",
        "style": payload.style,
        "color": payload.color,
    }


class SaveAiImageIn(BaseModel):
    """Save a base64 AI-generated image (logo or banner) to storage and
    return its persistent URL. Optionally updates the provider profile field.
    """
    image_base64: str = Field(..., min_length=100)
    mime: str = Field(default="image/png")
    target: Literal["logo", "banner"] = "logo"


@api_router.post("/providers/me/save-ai-image")
async def save_ai_image(payload: SaveAiImageIn, user: User = Depends(get_current_user)):
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores.")
    profile = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "provider_id": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Sin perfil de proveedor.")
    import base64 as _b64
    try:
        data = _b64.b64decode(payload.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagen base64 inválida.")
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Imagen supera 10 MB.")
    ext = "png" if payload.mime.endswith("png") else payload.mime.split("/")[-1] or "png"
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{user.user_id}/{file_id}.{ext}"
    try:
        result = put_object(path, data, payload.mime)
    except Exception as e:
        logger.exception("save-ai-image failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
    await db.files.insert_one({
        "file_id": file_id,
        "user_id": user.user_id,
        "storage_path": result["path"],
        "original_filename": f"ai-{payload.target}.png",
        "content_type": payload.mime,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    url = f"/api/files/{result['path']}"
    # Auto-assign to the provider profile
    field = "logo_url" if payload.target == "logo" else "banner_url"
    await db.provider_profiles.update_one(
        {"user_id": user.user_id},
        {"$set": {field: url, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"url": url, "file_id": file_id, "target": payload.target}


@api_router.post("/providers/me/upload-asset")
async def upload_provider_asset(
    file: UploadFile = File(...),
    target: Literal["logo", "banner"] = Form("logo"),
    user: User = Depends(get_current_user),
):
    """Upload a logo or banner image and assign it to the provider profile
    in a single round-trip. Avoids the ProviderProfileIn partial-update issue.
    Used by the FirstSteps MediaChooser when the provider uploads their own
    image instead of generating it with AI.
    """
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores.")
    profile = await db.provider_profiles.find_one({"user_id": user.user_id}, {"_id": 0, "provider_id": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Sin perfil de proveedor.")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Solo imágenes.")
    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Imagen supera 10 MB.")
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacío.")
    ext = (file.filename or "image.png").rsplit(".", 1)[-1].lower()
    if ext not in {"png", "jpg", "jpeg", "webp", "gif"}:
        ext = "png"
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{user.user_id}/{file_id}.{ext}"
    try:
        result = put_object(path, data, file.content_type or "image/png")
    except Exception as e:
        logger.exception("upload-asset failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
    await db.files.insert_one({
        "file_id": file_id,
        "user_id": user.user_id,
        "storage_path": result["path"],
        "original_filename": file.filename or f"{target}.{ext}",
        "content_type": file.content_type or "image/png",
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    url = f"/api/files/{result['path']}"
    field = "logo_url" if target == "logo" else "banner_url"
    await db.provider_profiles.update_one(
        {"user_id": user.user_id},
        {"$set": {field: url, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"url": url, "file_id": file_id, "target": target}


@api_router.post("/providers/me/generate-banner")
async def generate_banner_background(payload: BannerGenerateIn,
                                      user: User = Depends(get_current_user)):
    """Section 49 — Generate an AI-powered banner background image for the
    provider's professional digital banner. Uses gpt-image-1 via Emergent LLM Key.

    Returns: { image_base64, dimensions, style, color }

    The frontend composes this background with the business name, contact, QR
    code, and logo overlay using HTML Canvas / html2canvas.
    """
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores pueden generar banners.")

    profile = await db.provider_profiles.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "business_name": 1, "category_id": 1, "city": 1, "state": 1, "plan": 1, "banner_generations_count": 1, "banner_last_generated_at": 1},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Sin perfil de proveedor.")

    # Rate-limit: max 10 banners per day per provider to control API costs
    now = datetime.now(timezone.utc)
    today_start_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_count = profile.get("banner_generations_count", 0)
    last_at = profile.get("banner_last_generated_at", "")
    if last_at and last_at >= today_start_iso and today_count >= 10:
        raise HTTPException(status_code=429, detail="Límite diario de 10 banners alcanzado. Intenta mañana.")

    # Build category context for richer image
    category_label = ""
    if profile.get("category_id"):
        cat = await db.categories.find_one({"category_id": profile["category_id"]}, {"_id": 0, "name_es": 1, "name_en": 1})
        if cat:
            category_label = cat.get("name_es") or cat.get("name_en") or ""

    style_descriptions = {
        "modern": "modern, clean, minimalist with bold geometric shapes and gradient",
        "festive": "festive, joyful, celebratory with confetti, soft sparkles, warm latin party vibes",
        "professional": "professional, corporate, elegant with subtle textures and refined composition",
        "minimal": "ultra-minimalist, lots of negative space, single accent shape, calm composition",
        "warm": "warm and welcoming, soft sunset gradient, friendly inviting feeling, latin community pride",
    }
    style_desc = style_descriptions.get(payload.style, style_descriptions["modern"])

    # Compose prompt for the image generator
    base_keywords = (payload.keywords or "").strip()
    prompt_parts = [
        f"A {style_desc} abstract background banner image for a small business banner card.",
        f"Predominant brand color: {payload.color}.",
        "No text, no letters, no numbers, no words — purely abstract decorative background.",
        "Composition leaves the LEFT side relatively clean for overlaying text and a logo.",
        "Suitable for a professional business card / social media banner.",
    ]
    if category_label:
        prompt_parts.append(f"Subtle visual hints related to: {category_label}.")
    if base_keywords:
        prompt_parts.append(f"Additional theme: {base_keywords}.")
    prompt_parts.append("High quality, polished, social-media-ready, no people faces.")
    final_prompt = " ".join(prompt_parts)

    try:
        from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
        image_gen = OpenAIImageGeneration(api_key=os.environ.get("EMERGENT_LLM_KEY"))
        images = await image_gen.generate_images(
            prompt=final_prompt,
            model="gpt-image-1",
            number_of_images=1,
        )
        if not images:
            raise HTTPException(status_code=502, detail="No se pudo generar el banner. Intenta de nuevo.")
        import base64 as _b64
        image_base64 = _b64.b64encode(images[0]).decode("utf-8")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"banner-gen failed: {e}")
        raise HTTPException(status_code=502, detail="Error al generar la imagen. Reintenta.")

    # Counter update (idempotent per day)
    update_doc = {
        "banner_last_generated_at": now.isoformat(),
        "banner_last_style": payload.style,
        "banner_last_color": payload.color,
    }
    inc_doc = {"banner_generations_count": 1}
    if not last_at or last_at < today_start_iso:
        # Reset daily counter
        update_doc["banner_generations_count"] = 1
        await db.provider_profiles.update_one(
            {"user_id": user.user_id},
            {"$set": update_doc},
        )
    else:
        await db.provider_profiles.update_one(
            {"user_id": user.user_id},
            {"$set": update_doc, "$inc": inc_doc},
        )

    return {
        "image_base64": image_base64,
        "mime": "image/png",
        "style": payload.style,
        "color": payload.color,
        "business_name": profile.get("business_name", ""),
        "city": profile.get("city", ""),
        "state": profile.get("state", ""),
    }


# ============ MARKETPLACE DE BANNERS (Public gallery + Like voting) ============
# Section 68 — All /api/banners/* endpoints (publish, public, me, delete, like,
# like-state, view, banner-of-the-week) live in routes/banners.py. The
# BannerPublishIn model and supporting logic moved with them. This comment is
# the breadcrumb in server.py to discover the routes.


# ============ SECTION 60 — Provider Stories (24h ephemeral) ============
# All /api/stories/* endpoints moved to routes/stories.py. Kept here as a
# breadcrumb so future contributors can find the implementation. The TTL
# index `stories.expires_at_1` is still configured at backend startup
# alongside the other indices.


@api_router.post("/providers/track-share-view")
async def track_share_view(payload: TrackShareViewIn, request: Request):
    """Public: visitor landed on an eCard via ?ref={referrer_slug}.

    Idempotent per (referrer_slug, ip) for 24h via TTL collection so refresh-spam
    cannot inflate viral KPIs. Returns 200 with `counted: bool`.
    """
    ref_slug = (payload.ref or "").strip().lower()
    if not ref_slug:
        return {"ok": True, "counted": False}
    # Honor X-Forwarded-For (real client IP behind K8s ingress) — fall back to
    # the direct socket address only when the proxy header is absent.
    xff = request.headers.get("x-forwarded-for", "")
    real_ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "anon")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=24)
    try:
        await db.share_view_dedup.insert_one({
            "referrer_slug": ref_slug,
            "ip": real_ip,
            "created_at": now.isoformat(),
            "expires_at_native": expires_at,
        })
    except DuplicateKeyError:
        return {"ok": True, "counted": False, "reason": "deduped_24h"}
    r = await db.provider_profiles.update_one(
        {"slug": ref_slug, "is_active": True},
        {"$inc": {"referred_view_count": 1}, "$set": {"last_referred_view_at": now.isoformat()}},
    )
    return {"ok": True, "counted": r.modified_count == 1}


@api_router.get("/providers/me/share-stats")
async def get_my_share_stats(user: User = Depends(get_current_user)):
    """Provider-facing viral KPI card payload."""
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores.")
    profile = await db.provider_profiles.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "share_count": 1, "referred_view_count": 1, "last_share_at": 1,
         "share_channels": 1, "slug": 1},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Sin perfil.")
    # Last 7 share events for the dashboard timeline
    recent = await db.share_events.find(
        {"provider_user_id": user.user_id},
        {"_id": 0, "channel": 1, "created_at": 1},
    ).sort("created_at", -1).limit(7).to_list(7)
    return {
        "slug": profile.get("slug"),
        "share_count": int(profile.get("share_count") or 0),
        "referred_view_count": int(profile.get("referred_view_count") or 0),
        "last_share_at": profile.get("last_share_at"),
        "share_channels": profile.get("share_channels") or {},
        "recent_events": recent,
    }


# ─── Share Reward tiers (Section 46B) ─────────────────────────────────
# Each tier is unlockable ONCE per provider. The reward extends their plan's
# next_renewal_date by `bonus_days` AND upgrades plan to `min_plan` if they were
# below it. Idempotent via `share_reward_claims` collection.
SHARE_REWARD_TIERS = [
    {
        "tier_id": "embajador_bronze",
        "label_es": "Embajador Bronze",
        "label_en": "Bronze Ambassador",
        "icon": "🥉",
        "min_shares": 10,
        "min_referred_views": 5,
        "bonus_days": 30,
        "min_plan": "pro",
        "description_es": "1 mes de Plan Pro gratis por traer comunidad a getamano.",
        "description_en": "1 month of Pro Plan free for bringing community to getamano.",
    },
]


def _tier_progress(tier: dict, shares: int, views: int) -> dict:
    """Compute progress percentages + locked/eligible flags for a tier."""
    shares_pct = min(100, int(shares * 100 / tier["min_shares"])) if tier["min_shares"] else 100
    views_pct = min(100, int(views * 100 / tier["min_referred_views"])) if tier["min_referred_views"] else 100
    eligible = shares >= tier["min_shares"] and views >= tier["min_referred_views"]
    return {
        "shares_pct": shares_pct,
        "views_pct": views_pct,
        "shares_remaining": max(0, tier["min_shares"] - shares),
        "views_remaining": max(0, tier["min_referred_views"] - views),
        "eligible": eligible,
    }


@api_router.get("/providers/me/share-rewards")
async def get_my_share_rewards(user: User = Depends(get_current_user)):
    """Returns reward tiers with the provider's progress + claim status."""
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores.")
    profile = await db.provider_profiles.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "share_count": 1, "referred_view_count": 1},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Sin perfil.")
    shares = int(profile.get("share_count") or 0)
    views = int(profile.get("referred_view_count") or 0)
    # Fetch all this user's previous claims at once
    claims = await db.share_reward_claims.find(
        {"user_id": user.user_id}, {"_id": 0, "tier_id": 1, "claimed_at": 1, "expires_at": 1},
    ).to_list(50)
    claims_by_tier = {c["tier_id"]: c for c in claims}
    tiers_out = []
    for tier in SHARE_REWARD_TIERS:
        progress = _tier_progress(tier, shares, views)
        claim = claims_by_tier.get(tier["tier_id"])
        status = "claimed" if claim else ("eligible" if progress["eligible"] else "locked")
        tiers_out.append({
            **tier,
            **progress,
            "status": status,
            "claimed_at": (claim or {}).get("claimed_at"),
            "expires_at": (claim or {}).get("expires_at"),
        })
    return {
        "share_count": shares,
        "referred_view_count": views,
        "tiers": tiers_out,
    }


def _plan_rank(plan: str) -> int:
    return {"free": 0, "basic": 1, "pro": 2, "premium": 3}.get(plan or "free", 0)


@api_router.post("/providers/me/share-rewards/claim/{tier_id}")
async def claim_share_reward(tier_id: str, request: Request,
                              user: User = Depends(get_current_user)):
    """Atomic claim: locks the reward + extends next_renewal_date 30 days + bumps plan."""
    if user.role != "provider":
        raise HTTPException(status_code=403, detail="Solo proveedores.")
    tier = next((t for t in SHARE_REWARD_TIERS if t["tier_id"] == tier_id), None)
    if not tier:
        raise HTTPException(status_code=404, detail="Recompensa no existe.")
    # Verify eligibility from the source of truth (denormalised counters).
    profile = await db.provider_profiles.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "share_count": 1, "referred_view_count": 1},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Sin perfil.")
    shares = int(profile.get("share_count") or 0)
    views = int(profile.get("referred_view_count") or 0)
    if shares < tier["min_shares"] or views < tier["min_referred_views"]:
        raise HTTPException(
            status_code=400,
            detail=f"Aún no calificas. Necesitas {tier['min_shares']} shares y {tier['min_referred_views']} visitas referidas.",
        )
    # Idempotency: only allow ONE claim per (user, tier).
    now = datetime.now(timezone.utc)
    new_renewal = now + timedelta(days=tier["bonus_days"])
    claim_doc = {
        "claim_id": f"shrew_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id,
        "tier_id": tier_id,
        "claimed_at": now.isoformat(),
        "expires_at": new_renewal.isoformat(),
        "plan_granted": tier["min_plan"],
        "bonus_days": tier["bonus_days"],
    }
    try:
        await db.share_reward_claims.insert_one(claim_doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Recompensa ya reclamada.")
    # Extend subscription: upgrade plan if below the reward's min_plan AND push
    # next_renewal_date out by bonus_days from whichever is later (now vs current renewal).
    sub = await db.subscriptions.find_one({"user_id": user.user_id}, {"_id": 0})
    base_renewal = now
    if sub and sub.get("next_renewal_date"):
        try:
            current = datetime.fromisoformat(sub["next_renewal_date"])
            if current.tzinfo is None:
                current = current.replace(tzinfo=timezone.utc)
            base_renewal = max(base_renewal, current)
        except (TypeError, ValueError):
            pass
    extended = base_renewal + timedelta(days=tier["bonus_days"])
    current_plan = (sub or {}).get("plan", "free")
    new_plan = tier["min_plan"] if _plan_rank(tier["min_plan"]) > _plan_rank(current_plan) else current_plan
    update_doc = {
        "user_id": user.user_id,
        "plan": new_plan,
        "billing_cycle": (sub or {}).get("billing_cycle") or "monthly",
        "amount": 0,  # this period is a reward, not billed
        "annual_discount_applied": (sub or {}).get("annual_discount_applied", False),
        "status": "active",
        "next_renewal_date": extended.isoformat(),
        "updated_at": now.isoformat(),
        "last_reward_tier": tier_id,
    }
    if sub:
        await db.subscriptions.update_one({"user_id": user.user_id}, {"$set": update_doc})
    else:
        update_doc["created_at"] = now.isoformat()
        await db.subscriptions.insert_one(update_doc)
    await audit_log(user.user_id, "share_reward.claimed", {
        "tier_id": tier_id, "plan": new_plan, "extended_to": extended.isoformat(),
    }, request)
    return {
        "ok": True,
        "tier_id": tier_id,
        "plan": new_plan,
        "extended_to": extended.isoformat(),
        "bonus_days": tier["bonus_days"],
    }


# ════════════════════════════════════════════════════════════════════
# EXIT-INTENT LEAD CAPTURE — SMS + WhatsApp manual outreach
# ════════════════════════════════════════════════════════════════════
# Visitor abandoning the landing → soft modal captures phone + service +
# preferred channel. The CEO opens /admin/leads, clicks "SMS" or "WhatsApp"
# and the native app opens with a pre-filled message. No third-party APIs
# needed for v1 — pure manual outreach with deep links.

class ExitLeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=7, max_length=30)
    city: Optional[str] = Field(default=None, max_length=80)
    state: Optional[str] = Field(default=None, max_length=20)
    service: Optional[str] = Field(default=None, max_length=120)
    preferred_channel: Literal["sms", "whatsapp"] = "whatsapp"
    lang: Optional[Literal["es", "en"]] = "es"
    source: Optional[str] = Field(default="exit_intent", max_length=40)
    notes: Optional[str] = Field(default=None, max_length=400)


class ExitLeadUpdateIn(BaseModel):
    status: Optional[Literal["pending", "contacted", "converted", "lost"]] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


def _is_valid_phone_e164(phone: Optional[str]) -> bool:
    if not phone:
        return False
    digits = re.sub(r"\D", "", phone)
    return 10 <= len(digits) <= 15


@api_router.post("/leads/capture")
async def capture_exit_lead(payload: ExitLeadIn, request: Request):
    """Public: store a lead from the exit-intent modal."""
    phone_e164 = normalize_phone(payload.phone)
    if not _is_valid_phone_e164(phone_e164):
        raise HTTPException(status_code=400, detail="Número de teléfono inválido.")
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Nombre inválido.")
    now = datetime.now(timezone.utc).isoformat()
    ip = (request.client.host if request.client else "")
    ua = request.headers.get("user-agent", "")[:240]
    # Dedupe by phone + 24h window so a refresh doesn't double-insert
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    existing = await db.exit_leads.find_one(
        {"phone": phone_e164, "created_at": {"$gte": cutoff}},
        {"_id": 0, "lead_id": 1},
    )
    if existing:
        # Section 45: merge fresher non-empty fields into the existing doc so the
        # CEO sees the LATEST service/city/notes the lead provided, even if they
        # re-submitted with updated info within the 24h dedupe window.
        merge: dict = {}
        for field in ("city", "state", "service", "notes"):
            new_val = getattr(payload, field, None)
            if new_val and str(new_val).strip():
                merge[field] = str(new_val).strip()
        if (payload.preferred_channel or "").strip():
            merge["preferred_channel"] = payload.preferred_channel
        if merge:
            merge["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.exit_leads.update_one({"lead_id": existing["lead_id"]}, {"$set": merge})
        return {"ok": True, "lead_id": existing["lead_id"], "duplicate": True}
    doc = {
        "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
        "name": name,
        "phone": phone_e164,
        "phone_display": format_phone_display(phone_e164),
        "city": (payload.city or "").strip() or None,
        "state": (payload.state or "").strip().upper() or None,
        "service": (payload.service or "").strip() or None,
        "preferred_channel": payload.preferred_channel,
        "lang": (payload.lang or "es").lower(),
        "source": payload.source or "exit_intent",
        "status": "pending",
        "notes": (payload.notes or "").strip() or None,
        "ip": ip,
        "user_agent": ua,
        "contacted_at": None,
        "converted_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.exit_leads.insert_one(doc)
    # Section 45: observability — capture source/IP/channel for fraud + funnel analytics
    await audit_log(
        None,
        "lead.captured",
        {
            "lead_id": doc["lead_id"],
            "channel": doc["preferred_channel"],
            "lang": doc["lang"],
            "source": doc["source"],
            "city": doc["city"],
            "service": doc["service"],
        },
        request,
    )
    return {"ok": True, "lead_id": doc["lead_id"], "duplicate": False}


def _build_outreach_message(lead: dict) -> dict:
    """Build the pre-filled SMS / WhatsApp message body in the lead's language."""
    name = (lead.get("name") or "").split()[0] or ("amigo" if lead.get("lang") == "es" else "friend")
    service = lead.get("service") or ("servicios" if lead.get("lang") == "es" else "services")
    city = lead.get("city") or ""
    if lead.get("lang") == "es":
        body = (
            f"¡Hola {name}! Soy del equipo de getamano. "
            f"Vi que buscas {service}"
            + (f" en {city}" if city else "")
            + ". Tengo 3 proveedores latinos verificados que te pueden ayudar. "
            "¿Te paso sus contactos? https://getamano.us"
        )
    else:
        body = (
            f"Hi {name}! I'm from the getamano team. "
            f"I saw you're looking for {service}"
            + (f" in {city}" if city else "")
            + ". I have 3 verified Latino providers who can help. "
            "Want me to send their contacts? https://getamano.us"
        )
    return {"body": body, "lang": lead.get("lang", "es")}


def _build_deep_links(lead: dict, body: str) -> dict:
    """Native deep links for iOS/Android SMS app and WhatsApp."""
    from urllib.parse import quote
    encoded = quote(body, safe="")
    phone = lead.get("phone", "")
    # Both iOS 15+ and Android accept `sms:+15551234567?body=...`
    sms_link = f"sms:{phone}?body={encoded}"
    # wa.me drops the leading +
    wa_phone = phone.lstrip("+")
    wa_link = f"https://wa.me/{wa_phone}?text={encoded}"
    return {"sms_link": sms_link, "wa_link": wa_link}


@api_router.get("/admin/leads")
async def admin_list_exit_leads(
    status: Optional[Literal["pending", "contacted", "converted", "lost"]] = None,
    channel: Optional[Literal["sms", "whatsapp"]] = None,
    _user: User = Depends(require_admin),
):
    """Admin inbox: list of exit-intent leads + ready-to-send deep links per row."""
    q: dict = {}
    if status:
        q["status"] = status
    if channel:
        q["preferred_channel"] = channel
    leads = await db.exit_leads.find(q, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    for lead in leads:
        msg = _build_outreach_message(lead)
        links = _build_deep_links(lead, msg["body"])
        lead["message_body"] = msg["body"]
        lead["sms_link"] = links["sms_link"]
        lead["wa_link"] = links["wa_link"]
    # Aggregate counters for the dashboard header
    counts = {
        "pending": await db.exit_leads.count_documents({"status": "pending"}),
        "contacted": await db.exit_leads.count_documents({"status": "contacted"}),
        "converted": await db.exit_leads.count_documents({"status": "converted"}),
        "lost": await db.exit_leads.count_documents({"status": "lost"}),
        "total": await db.exit_leads.count_documents({}),
    }
    return {"items": leads, "total": len(leads), "counts": counts}


@api_router.patch("/admin/leads/{lead_id}")
async def admin_update_exit_lead(lead_id: str, payload: ExitLeadUpdateIn,
                                  admin: User = Depends(require_admin)):
    """Admin: change status / annotate a lead."""
    set_doc: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.status:
        set_doc["status"] = payload.status
        now = datetime.now(timezone.utc).isoformat()
        if payload.status == "contacted":
            set_doc["contacted_at"] = now
        elif payload.status == "converted":
            set_doc["converted_at"] = now
    if payload.notes is not None:
        set_doc["notes"] = payload.notes.strip() or None
    if len(set_doc) == 1:  # only updated_at — nothing to do
        raise HTTPException(status_code=400, detail="Nada que actualizar.")
    r = await db.exit_leads.update_one({"lead_id": lead_id}, {"$set": set_doc})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead no encontrado.")
    updated = await db.exit_leads.find_one({"lead_id": lead_id}, {"_id": 0})
    await audit_log(admin.user_id, "lead.updated", {"lead_id": lead_id, "fields": list(set_doc.keys())})
    return updated


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
    "/api/ai/draft-description": {"limit": 20, "window": 60},
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


# ════════════════════════════════════════════════════════════════════════
# Mount modular routers (refactor in progress)
#   · Section 35+36+42 — community
#   · Section 17/24    — auth (login/register/google/OTP)
#   · Section 27       — search (smart provider search + autocomplete)
# ════════════════════════════════════════════════════════════════════════
from routes.community import make_router as _make_community_router  # noqa: E402
from routes.auth import make_router as _make_auth_router  # noqa: E402
from routes.search import make_router as _make_search_router  # noqa: E402
from routes.jobs import make_router as _make_jobs_router  # noqa: E402
from routes.seo import make_router as _make_seo_router  # noqa: E402
from routes.saved_ecards import make_router as _make_saved_ecards_router  # noqa: E402
from routes.nudges import make_router as _make_nudges_router  # noqa: E402
from routes.follows import make_router as _make_follows_router  # noqa: E402
from routes.referral_jobs import make_router as _make_referral_jobs_router  # noqa: E402
from routes.credits import make_router as _make_credits_router  # noqa: E402
from routes.user_referrals import make_router as _make_user_referrals_router  # noqa: E402
from routes.messaging_admin import make_router as _make_messaging_admin_router  # noqa: E402
from routes.push import make_router as _make_push_router  # noqa: E402
from routes.banners import make_router as _make_banners_router  # noqa: E402
from routes.stories import make_router as _make_stories_router  # noqa: E402

api_router.include_router(
    _make_community_router(
        db=db,
        audit_log=audit_log,
        get_current_user=get_current_user,
        PUBLIC_GUARD=PUBLIC_GUARD,
    )
)

api_router.include_router(
    _make_auth_router(
        db=db,
        User=User,
        RegisterIn=RegisterIn,
        LoginIn=LoginIn,
        get_current_user=get_current_user,
        hash_password=hash_password,
        verify_password=verify_password,
        create_jwt=create_jwt,
        normalize_phone=normalize_phone,
        track_referral_signup=_track_referral_signup,
        send_email_via_resend=_send_email_via_resend,
        EMERGENT_AUTH_URL=EMERGENT_AUTH_URL,
        DEFAULT_COUNTRY=DEFAULT_COUNTRY,
    )
)

api_router.include_router(
    _make_search_router(
        db=db,
        PUBLIC_GUARD=PUBLIC_GUARD,
        DEFAULT_COUNTRY=DEFAULT_COUNTRY,
    )
)

api_router.include_router(
    _make_jobs_router(
        db=db,
        audit_log=audit_log,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_seo_router(
        db=db,
        PUBLIC_GUARD=PUBLIC_GUARD,
        SEO_CITIES=SEO_CITIES,
        SECTOR_LABELS=SECTOR_LABELS,
        SECTOR_COLORS=SECTOR_COLORS,
    )
)

api_router.include_router(
    _make_saved_ecards_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_nudges_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_follows_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_referral_jobs_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_push_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_banners_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_stories_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_credits_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_user_referrals_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)

api_router.include_router(
    _make_messaging_admin_router(
        db=db,
        User=User,
        get_current_user=get_current_user,
    )
)


# Mount api_router AFTER all route definitions so Sections 13–18 are included.
app.include_router(api_router)


# ============ SECTION 56 — Open Graph: Social Media Previews ============
# When a provider shares their eCard URL in Facebook/WhatsApp/Twitter/LinkedIn/
# iMessage, the link bot fetches the page WITHOUT executing JavaScript. Our
# React SPA serves an empty <div id="root">, so no preview ever shows up.
#
# Fix: detect social bots by User-Agent on /p/{slug} requests, and respond with
# a tiny HTML document containing rich OG meta tags + a fallback redirect for
# human visitors. The image is generated dynamically as an SVG (1200×630).
from fastapi.responses import HTMLResponse, Response as _OGResponse  # noqa: E402
from html import escape as _html_escape  # noqa: E402

_SOCIAL_BOT_PATTERNS = (
    "facebookexternalhit", "twitterbot", "linkedinbot", "whatsapp",
    "slackbot", "telegrambot", "pinterest", "discordbot", "vkshare",
    "redditbot", "applebot", "skypeuripreview", "embedly", "quora link preview",
    "showyoubot", "outbrain", "facebot", "ia_archiver",
)


def _is_social_bot(user_agent: str) -> bool:
    if not user_agent:
        return False
    ua = user_agent.lower()
    return any(pat in ua for pat in _SOCIAL_BOT_PATTERNS)


def _request_public_url(request: Request) -> str:
    """Best-effort detection of the public origin (handles proxies + envs)."""
    fwd_proto = request.headers.get("x-forwarded-proto", "https")
    fwd_host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    if fwd_host:
        return f"{fwd_proto}://{fwd_host}".rstrip("/")
    return (os.environ.get("PUBLIC_URL") or "https://getamano.us").rstrip("/")


async def _fetch_logo_data_uri(logo_url: str, timeout: float = 4.0) -> str:
    """Section 65 — Fetch the provider logo and return a base64 data URI.

    Used to embed the avatar *inside* the SVG so that:
      (1) SVG renders correctly when served standalone, and
      (2) Cairosvg can convert SVG→PNG without depending on remote fetch
          (some hosts block cairo's user-agent, some logos are CORS-locked).

    Returns empty string on any failure — the SVG falls back to the initials
    avatar so social previews never render a broken image icon.
    """
    if not logo_url or not logo_url.startswith(("http://", "https://", "data:")):
        return ""
    if logo_url.startswith("data:"):
        return logo_url
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(logo_url)
            if r.status_code != 200:
                return ""
            ctype = (r.headers.get("content-type") or "image/jpeg").split(";")[0].strip().lower()
            if ctype not in ("image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"):
                ctype = "image/jpeg"  # safest default for unknown
            import base64 as _b64
            b64 = _b64.b64encode(r.content).decode("ascii")
            return f"data:{ctype};base64,{b64}"
    except Exception:
        return ""


def _build_og_image_svg(provider: dict, embedded_logo_uri: str = "") -> str:
    """Section 56/65 — Render a 1200×630 SVG card with provider info.

    SVG is intentionally lightweight (no external fonts beyond system stack)
    and includes:
      - Teal getamano gradient background
      - Circular avatar (initials fallback if no logo) — accepts pre-fetched
        data URI for reliable PNG conversion (Section 65)
      - Verified ribbon
      - Business name (truncated)
      - Category · City, State
      - Star rating + review count (if any)
      - Pro badge (if pro/premium plan)
      - "Ver eCard completa →" CTA
      - getamano footer
    """
    name = (provider.get("business_name") or "Negocio").strip()
    name_display = name if len(name) <= 28 else name[:27] + "…"
    cat = (provider.get("category") or {}).get("name_es") or provider.get("category_label") or ""
    city = provider.get("city") or ""
    state = provider.get("state") or ""
    rating = provider.get("rating_avg") or 0
    review_count = provider.get("rating_count") or 0
    plan = (provider.get("plan") or "free").lower()
    is_verified = (provider.get("verification_status") == "approved")
    # Section 65 — prefer pre-fetched data URI (PNG-conversion friendly) over
    # the raw remote URL. When embedded_logo_uri is empty we still allow the
    # raw URL so the SVG endpoint keeps working standalone.
    logo_for_svg = embedded_logo_uri or (provider.get("logo_url") or "")

    # Initials fallback (max 2 chars)
    initials = "".join([w[0] for w in name.split()[:2] if w]).upper() or "G"

    # Star representation
    star_full = "★" * int(round(rating))
    star_empty = "☆" * (5 - int(round(rating)))
    star_line = (star_full + star_empty) if rating > 0 else ""

    # Escape user-provided strings to avoid SVG injection
    e = _html_escape
    name_safe = e(name_display)
    cat_safe = e(cat)
    city_safe = e(", ".join(p for p in [city, state] if p))
    initials_safe = e(initials)
    logo_safe = e(logo_for_svg)

    # Pre-build conditional blocks (use safe values only)
    # Note: emoji glyphs render as boxes in cairo (no emoji font). We use
    # SVG path geometry for the checkmark + bold typography for the badges.
    verified_block = (
        '<g transform="translate(880,80)">'
        '<rect width="180" height="36" rx="18" fill="#10B981"/>'
        '<path d="M18 18 L26 26 L40 12" stroke="white" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        '<text x="105" y="24" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="700" fill="white">Verificado</text>'
        '</g>'
    ) if is_verified else ""

    pro_badge = (
        '<g transform="translate(880,140)">'
        '<rect width="100" height="32" rx="16" fill="#F59E0B"/>'
        '<text x="50" y="22" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="800" letter-spacing="2" fill="white">PRO</text>'
        '</g>'
    ) if plan in ("pro", "premium") else ""

    rating_block = (
        f'<text x="80" y="445" font-family="system-ui,-apple-system,sans-serif" font-size="38" font-weight="700" fill="#FCD34D">{star_line}</text>'
        f'<text x="80" y="490" font-family="system-ui,-apple-system,sans-serif" font-size="22" fill="rgba(255,255,255,0.92)">{rating:.1f} de 5 · {review_count} reseña{"s" if review_count != 1 else ""}</text>'
    ) if rating > 0 else (
        '<text x="80" y="475" font-family="system-ui,-apple-system,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">Sin reseñas todavía</text>'
    )

    # Avatar: either circular image clip or initials
    if logo_for_svg:
        avatar = (
            f'<defs><clipPath id="avatarClip"><circle cx="980" cy="380" r="110"/></clipPath></defs>'
            f'<circle cx="980" cy="380" r="115" fill="white"/>'
            f'<image href="{logo_safe}" xlink:href="{logo_safe}" x="870" y="270" width="220" height="220" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>'
        )
    else:
        avatar = (
            f'<circle cx="980" cy="380" r="115" fill="rgba(255,255,255,0.15)" stroke="white" stroke-width="3"/>'
            f'<text x="980" y="420" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="80" font-weight="800" fill="white">{initials_safe}</text>'
        )

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#063154"/>
      <stop offset="55%" stop-color="#0A4D5E"/>
      <stop offset="100%" stop-color="#025F67"/>
    </linearGradient>
    <pattern id="grain" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
      <circle cx="30" cy="30" r="1.2" fill="rgba(255,255,255,0.03)"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grain)"/>

  <!-- Left accent stripe -->
  <rect x="0" y="0" width="14" height="630" fill="#2F9D94"/>

  <!-- Top label -->
  <text x="80" y="100" font-family="system-ui,-apple-system,sans-serif" font-size="18" font-weight="700" letter-spacing="3" fill="#2F9D94">PROFESIONAL VERIFICADO · GETAMANO</text>

  <!-- Verified badge top-right -->
  {verified_block}
  {pro_badge}

  <!-- Avatar / Logo (right) -->
  {avatar}

  <!-- Business name -->
  <text x="80" y="270" font-family="system-ui,-apple-system,sans-serif" font-size="68" font-weight="800" fill="white">{name_safe}</text>

  <!-- Category · City, State -->
  <text x="80" y="335" font-family="system-ui,-apple-system,sans-serif" font-size="30" font-weight="500" fill="rgba(255,255,255,0.85)">{cat_safe}{' · ' if cat_safe and city_safe else ''}{city_safe}</text>

  <!-- Rating -->
  {rating_block}

  <!-- Footer -->
  <line x1="80" y1="555" x2="1120" y2="555" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  <text x="80" y="595" font-family="system-ui,-apple-system,sans-serif" font-size="24" font-weight="700" fill="#2F9D94">Ver eCard completa →</text>
  <text x="1120" y="595" font-family="system-ui,-apple-system,sans-serif" font-size="22" font-weight="700" text-anchor="end" fill="rgba(255,255,255,0.7)">getamano.us</text>
</svg>'''
    return svg


async def _load_og_provider(slug: str) -> dict:
    """Section 65 — Resolve a slug to the provider dict used by OG renderers.

    Returns a generic fallback so social previews never 404. Enriches the
    category name in Spanish (legacy stored only category_id).
    """
    provider = await db.provider_profiles.find_one({"slug": slug}, {"_id": 0})
    if not provider:
        return {
            "business_name": "getamano",
            "category": {"name_es": "Marketplace latino"},
            "city": "USA",
            "state": "",
            "rating_avg": 0,
            "rating_count": 0,
        }
    if provider.get("category_id"):
        cat = await db.categories.find_one({"category_id": provider["category_id"]}, {"_id": 0, "name_es": 1, "name_en": 1})
        if cat:
            provider["category"] = {"name_es": cat.get("name_es") or cat.get("name_en")}
    return provider


@app.get("/api/og-image/{slug}.svg")
async def og_image(slug: str):
    """Section 56 — Dynamic 1200×630 SVG used as og:image fallback.

    Note: most social crawlers (WhatsApp, iMessage, FB) do not render SVG —
    Section 65 added `/api/og-image/{slug}.png` as the primary asset. SVG is
    kept for browsers, Twitter Cards (which accept SVG), and debug tools.
    """
    provider = await _load_og_provider(slug)
    svg = _build_og_image_svg(provider)
    return _OGResponse(
        content=svg,
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/api/og-image/{slug}.png")
async def og_image_png(slug: str):
    """Section 65 — Dynamic 1200×630 PNG used as og:image for social previews.

    WhatsApp, iMessage, Facebook and most other crawlers expect PNG/JPEG
    (NOT SVG). We render the SVG, embed the provider logo as a base64 data
    URI so the rasteriser doesn't need network fetch, then convert via
    cairosvg.

    Heavy HTTP caching (24h max-age + 7d stale-while-revalidate) keeps the
    cost negligible: identical responses are served by the edge, only
    deep-link first-touches hit cairo.
    """
    import cairosvg as _cairosvg  # local import keeps cold-start lean
    provider = await _load_og_provider(slug)
    logo_uri = await _fetch_logo_data_uri(provider.get("logo_url") or "")
    svg = _build_og_image_svg(provider, embedded_logo_uri=logo_uri)
    try:
        png_bytes = _cairosvg.svg2png(
            bytestring=svg.encode("utf-8"),
            output_width=1200,
            output_height=630,
        )
    except Exception as exc:  # noqa: BLE001
        # If conversion fails (corrupt logo, malformed SVG), fall back to
        # a logo-less render so the social preview still gets the data.
        try:
            fallback_svg = _build_og_image_svg(provider, embedded_logo_uri="")
            png_bytes = _cairosvg.svg2png(
                bytestring=fallback_svg.encode("utf-8"),
                output_width=1200,
                output_height=630,
            )
        except Exception:
            raise HTTPException(status_code=500, detail=f"og-image render failed: {exc}")
    return _OGResponse(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _build_og_html(provider: dict, public_url: str, slug: str) -> str:
    """Section 56 — Render bot-friendly HTML with rich OG meta tags."""
    e = _html_escape
    name = (provider.get("business_name") or "getamano").strip()
    cat = (provider.get("category") or {}).get("name_es") or ""
    city = provider.get("city") or ""
    state = provider.get("state") or ""
    rating = provider.get("rating_avg") or 0
    review_count = provider.get("rating_count") or 0
    is_verified = (provider.get("verification_status") == "approved")
    description_parts = []
    if rating > 0:
        description_parts.append(f"⭐ {rating:.1f} ({review_count} reseña{'s' if review_count != 1 else ''})")
    if cat:
        description_parts.append(cat)
    loc = ", ".join(p for p in [city, state] if p)
    if loc:
        description_parts.append(loc)
    if is_verified:
        description_parts.append("Verificado ✓")
    description_parts.append("Contrátalo directo en Getamano")
    description = " · ".join(description_parts)

    title = f"{name} | getamano"
    profile_url = f"{public_url}/p/{slug}"
    # Section 65 — PNG is the primary OG image. WhatsApp, iMessage and most
    # crawlers refuse SVG. We still expose the SVG variant as a secondary
    # asset for Twitter Cards and debug tools.
    og_image_png = f"{public_url}/api/og-image/{slug}.png"
    og_image_svg = f"{public_url}/api/og-image/{slug}.svg"

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>{e(title)}</title>
  <meta name="description" content="{e(description)}">
  <link rel="canonical" href="{e(profile_url)}">

  <!-- Open Graph -->
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="getamano">
  <meta property="og:locale" content="es_US">
  <meta property="og:locale:alternate" content="en_US">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(description)}">
  <meta property="og:image" content="{e(og_image_png)}">
  <meta property="og:image:secure_url" content="{e(og_image_png)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="{e(name)} en getamano">
  <meta property="og:url" content="{e(profile_url)}">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(title)}">
  <meta name="twitter:description" content="{e(description)}">
  <meta name="twitter:image" content="{e(og_image_png)}">
  <meta name="twitter:image:alt" content="{e(name)} en getamano">

  <!-- Fallback redirect for human visitors -->
  <meta http-equiv="refresh" content="0; url={e(profile_url)}">
  <link rel="alternate" hreflang="es" href="{e(profile_url)}">
  <link rel="alternate" hreflang="en" href="{e(public_url)}/provider/{e(slug)}">
  <!-- Secondary asset for debug tools that prefer SVG -->
  <link rel="image_src" href="{e(og_image_svg)}">
</head>
<body style="font-family:system-ui,sans-serif;background:#063154;color:white;padding:40px;text-align:center;">
  <h1>{e(name)}</h1>
  <p>{e(description)}</p>
  <p><a href="{e(profile_url)}" style="color:#2F9D94;font-weight:700;">Abrir mi eCard en getamano →</a></p>
  <script>window.location.replace({profile_url!r});</script>
</body>
</html>"""


@app.get("/api/og/p/{slug}", response_class=HTMLResponse)
async def og_provider_html(slug: str, request: Request):
    """Section 56 — Serve OG-rich HTML for a provider's eCard.

    Used both as the explicit endpoint AND via the bot middleware below
    (which rewrites /p/{slug} for social-media crawler User-Agents).
    """
    public_url = _request_public_url(request)
    provider = await db.provider_profiles.find_one({"slug": slug}, {"_id": 0})
    if not provider:
        return HTMLResponse(
            content=_build_og_html({"business_name": "Proveedor no encontrado"}, public_url, slug),
            status_code=404,
        )
    if provider.get("category_id"):
        cat = await db.categories.find_one({"category_id": provider["category_id"]}, {"_id": 0, "name_es": 1, "name_en": 1})
        if cat:
            provider["category"] = {"name_es": cat.get("name_es") or cat.get("name_en")}
    html = _build_og_html(provider, public_url, slug)
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
            "X-Robots-Tag": "all",
        },
    )


@app.middleware("http")
async def og_bot_middleware(request, call_next):
    """Section 56 — Intercept social-bot fetches of /p/{slug} and /provider/{slug}
    BEFORE the request reaches the React SPA. Pure pass-through for humans.
    """
    path = request.url.path or ""
    ua = request.headers.get("user-agent", "")
    if _is_social_bot(ua):
        slug = None
        if path.startswith("/p/"):
            slug = path[3:].split("/", 1)[0].split("?", 1)[0]
        elif path.startswith("/provider/"):
            slug = path[10:].split("/", 1)[0].split("?", 1)[0]
        elif path.startswith("/services/") and path.count("/") == 2:
            # English alias /services/{slug} (only the leaf case — category routes
            # have more path segments and are handled elsewhere).
            slug = path[10:].split("/", 1)[0].split("?", 1)[0]
        if slug:
            public_url = _request_public_url(request)
            provider = await db.provider_profiles.find_one({"slug": slug}, {"_id": 0})
            if provider:
                if provider.get("category_id"):
                    cat = await db.categories.find_one({"category_id": provider["category_id"]}, {"_id": 0, "name_es": 1, "name_en": 1})
                    if cat:
                        provider["category"] = {"name_es": cat.get("name_es") or cat.get("name_en")}
                html = _build_og_html(provider, public_url, slug)
                return HTMLResponse(
                    content=html,
                    headers={
                        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
                        "X-Robots-Tag": "all",
                    },
                )
    return await call_next(request)
