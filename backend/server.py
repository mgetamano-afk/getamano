from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
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
    description: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    zip_code: Optional[str] = ""
    languages: List[str] = ["es", "en"]
    services: List[str] = []
    service_areas: List[str] = []
    hours: dict = {}
    logo_url: Optional[str] = ""
    cover_url: Optional[str] = ""
    photos: List[str] = []
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

    # Seed a demo provider
    if not await db.users.find_one({"email": "demo.provider@getmano.com"}):
        prov_user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": prov_user_id, "email": "demo.provider@getmano.com",
            "password_hash": hash_password("provider123"),
            "name": "María González", "role": "provider", "picture": None,
            "language": "es", "created_at": datetime.now(timezone.utc).isoformat()
        })
        cleaning_cat = await db.categories.find_one({"slug": "cleaning"}, {"_id": 0})
        slug = "maria-cleaning-services-sallisaw-ok"
        await db.provider_profiles.insert_one({
            "provider_id": f"prov_{uuid.uuid4().hex[:12]}",
            "user_id": prov_user_id, "slug": slug,
            "business_name": "María's Cleaning Services",
            "legal_name": "Maria Gonzalez LLC",
            "category_id": cleaning_cat["category_id"],
            "description": "Limpieza profesional residencial y comercial. Más de 8 años de experiencia sirviendo a familias latinas en Oklahoma.",
            "phone": "+1 (918) 555-0123",
            "email": "maria@example.com",
            "website": "",
            "address": "123 Main St",
            "city": "Sallisaw", "state": "OK", "zip_code": "74955",
            "languages": ["es", "en"],
            "services": ["Limpieza profunda", "Limpieza regular", "Post-construcción", "Mudanzas"],
            "service_areas": ["Sallisaw, OK", "Muldrow, OK", "Fort Smith, AR"],
            "hours": {"mon": "8:00-18:00", "tue": "8:00-18:00", "wed": "8:00-18:00", "thu": "8:00-18:00", "fri": "8:00-18:00", "sat": "9:00-15:00", "sun": "Cerrado"},
            "logo_url": "https://images.unsplash.com/photo-1775178120132-f0ff7fd5cb40?w=200",
            "cover_url": "https://images.unsplash.com/photo-1775178120132-f0ff7fd5cb40?w=1200",
            "photos": ["https://images.unsplash.com/photo-1775178120132-f0ff7fd5cb40?w=800"],
            "social": {"facebook": "", "instagram": ""},
            "price_range": "$$",
            "verification_status": "approved",
            "is_active": True, "plan": "pro",
            "rating_avg": 4.8, "rating_count": 24,
            "views": 0, "contact_clicks": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded demo provider")

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
