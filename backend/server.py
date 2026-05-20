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

JWT_SECRET = os.environ.get('JWT_SECRET', 'getmano-dev-secret-change-me')
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 7
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# Emergent Object Storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "getmano"
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

app = FastAPI(title="getmano API")
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
    created_at: datetime

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

class Review(BaseModel):
    review_id: str
    provider_id: str
    user_id: str
    user_name: str
    rating: int
    comment: str
    created_at: datetime

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
    plan: Literal["free", "pro", "premium"]

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
        await db.users.create_index("email", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.conversations.create_index([("client_id", 1), ("provider_id", 1)], unique=True)
        await db.reviews.create_index([("user_id", 1), ("provider_id", 1)], unique=True)
    except Exception as e:
        logger.warning(f"Index creation: {e}")

    if await db.categories.count_documents({}) == 0:
        docs = []
        for c in DEFAULT_CATEGORIES:
            docs.append({"category_id": f"cat_{uuid.uuid4().hex[:10]}", **c})
        await db.categories.insert_many(docs)
        logger.info(f"Seeded {len(docs)} categories")

    # Seed an admin
    if not await db.users.find_one({"email": "admin@getmano.com"}):
        admin_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": admin_id, "email": "admin@getmano.com",
            "password_hash": hash_password("admin123"),
            "name": "getmano Admin", "role": "admin", "picture": None,
            "language": "es", "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info("Seeded admin user")

    # Demo provider — fully idempotent (ensures user + profile + showcase gallery)
    DEMO_EMAIL = "demo.provider@getmano.com"
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
        "social": {"facebook": "", "instagram": ""},
        "price_range": "$$",
        "verification_status": "approved",
        "is_active": True, "plan": "pro",
        "rating_avg": 0.0, "rating_count": 0,
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
        "phone": payload.phone or None,
        "role": payload.role if payload.role in ("client", "provider") else "client",
        "picture": None, "language": "es",
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
    limit: int = 24,
):
    query = {"is_active": True}
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
    providers = await db.provider_profiles.find(query, {"_id": 0}).limit(limit).to_list(limit)
    # attach category info
    cats = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(100)}
    for p in providers:
        p["category"] = cats.get(p.get("category_id"))
    return providers

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
    reviews = await db.reviews.find({"provider_id": p["provider_id"]}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
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
    doc = {
        "provider_id": f"prov_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id, "slug": slug,
        **payload.model_dump(),
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
    update = payload.model_dump()
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
            label = {"approved": "¡Felicidades! Tu perfil fue verificado por getmano.",
                     "rejected": "Tu solicitud de verificación fue rechazada. Revisa los requisitos.",
                     "needs_info": "Necesitamos más información para verificar tu perfil.",
                     "suspended": "Tu perfil fue suspendido. Contacta soporte.",
                     "in_review": "Tu perfil está siendo revisado por nuestro equipo.",
                     "pending": "Tu perfil está pendiente de revisión."}.get(payload.status, f"Estado actualizado: {payload.status}")
            send_sms(prov_user["phone"], f"[getmano] {label}", event=f"verify_{payload.status}")

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
        {"id": "free", "name": "Gratis", "name_en": "Free", "price_monthly": 0, "features_es": ["eCard básica", "Perfil visible limitado", "Analytics básicos", "Hasta 3 fotos"], "features_en": ["Basic eCard", "Limited profile visibility", "Basic analytics", "Up to 3 photos"], "highlight": False},
        {"id": "pro", "name": "Pro", "name_en": "Pro", "price_monthly": 19, "features_es": ["eCard completa", "Badge destacado", "Hasta 15 fotos", "Analytics avanzados", "Mejor posición en búsquedas", "Botón de cotización", "Soporte prioritario"], "features_en": ["Full eCard", "Featured badge", "Up to 15 photos", "Advanced analytics", "Better search ranking", "Quote button", "Priority support"], "highlight": True},
        {"id": "premium", "name": "Premium", "name_en": "Premium", "price_monthly": 49, "features_es": ["Proveedor destacado", "Aparece en homepage", "Campañas promocionales", "Mayor visibilidad por ciudad", "QR personalizado", "Reportes avanzados"], "features_en": ["Featured provider", "Homepage placement", "Promo campaigns", "City-wide visibility", "Custom QR", "Advanced reports"], "highlight": False},
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
        send_sms(prov_user["phone"], f"[getmano] Nueva solicitud de cotización de {user.name}: {payload.message[:120]}", event="new_quote_request")

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
        send_sms(client_user["phone"], f"[getmano] {req['business_name']} {label} tu solicitud.", event=f"request_{payload.status}")
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
        send_sms(prov_user["phone"], f"[getmano] Nuevo mensaje de {user.name}: {payload.body[:120]}", event="new_message_to_provider")

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
        send_sms(other_user["phone"], f"[getmano] {sender_label}: {payload.body[:140]}", event="message_reply")

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
