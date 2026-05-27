"""
Smart Action Hub — Nudges module (Section 64).

Single endpoint `GET /api/me/nudges` that returns a prioritized list of
contextual suggestions ("next-best-action" nudges) tailored to the user.

Categories of nudges:
  · Provider: incomplete profile, missing media, plan upgrade,
    unanswered messages, calendar inactive, no reviews yet.
  · Client:  incomplete profile, unread messages, pending requests,
    saved providers to review.

Each nudge is dismissible client-side via localStorage by `id`.
The endpoint is stateless — it just reads current user state and emits the
nudges that apply right now. Dismissal is a UI concern only.
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends


def make_router(*, db, User, get_current_user) -> APIRouter:
    router = APIRouter()

    @router.get("/me/nudges")
    async def get_my_nudges(user: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
        """Return contextual next-best-action suggestions for the current user.

        Output schema (each item):
          { id: str,            # stable key for localStorage dismissal
            type: str,          # "profile" | "media" | "plan" | "messages" | "calendar" | "reviews" | "engagement"
            priority: int,      # 1=urgent, 2=high, 3=normal, 4=low
            title: str,         # short headline (Spanish)
            message: str,       # one-line explainer (Spanish)
            cta_label: str,     # CTA button text
            cta_url: str,       # destination
            icon: str           # lucide icon name (frontend maps it)
          }
        """
        nudges: List[Dict[str, Any]] = []

        # ---------- Common (any role) ----------
        try:
            # Support both legacy and new conversation schemas. We count
            # threads where this user has unread, on either side.
            unread_convs = await db.conversations.count_documents(
                {"$or": [
                    {"client_id": user.user_id, "unread_for_client": True},
                    {"participant_user_id": user.user_id, "unread_count_participant": {"$gt": 0}},
                    {"provider_user_id": user.user_id, "unread_for_provider": True},
                    {"provider_user_id": user.user_id, "unread_count_provider": {"$gt": 0}},
                ]}
            )
        except Exception:
            unread_convs = 0
        if unread_convs > 0:
            nudges.append({
                "id": "unread-messages",
                "type": "messages",
                "priority": 1,
                "title": f"Tienes {unread_convs} mensaje{'s' if unread_convs != 1 else ''} sin leer",
                "message": "Responde rápido — los clientes contratan al primero que contesta.",
                "cta_label": "Ver mensajes",
                "cta_url": "/messages",
                "icon": "MessageCircle",
            })

        # ---------- Provider-specific ----------
        if user.role == "provider":
            profile = await db.provider_profiles.find_one(
                {"user_id": user.user_id}, {"_id": 0}
            )
            if profile:
                # Profile completion sub-checks
                missing = []
                if not profile.get("logo_url"):
                    missing.append("logo")
                if not profile.get("cover_url") and not profile.get("banner_url"):
                    missing.append("portada")
                if not profile.get("description") or len(profile.get("description", "")) < 40:
                    missing.append("descripción")
                if not profile.get("services") or len(profile.get("services", [])) == 0:
                    missing.append("servicios")
                if not profile.get("service_areas") or len(profile.get("service_areas", [])) == 0:
                    missing.append("zonas de atención")

                if missing:
                    nudges.append({
                        "id": f"complete-profile-{'-'.join(missing[:2])}",
                        "type": "profile",
                        "priority": 2,
                        "title": "Completa tu perfil para aparecer mejor",
                        "message": f"Te falta: {', '.join(missing[:3])}{' y más' if len(missing) > 3 else ''}.",
                        "cta_label": "Editar perfil",
                        "cta_url": "/dashboard/provider",
                        "icon": "UserCog",
                    })

                # Gallery photos
                gallery_count = len(profile.get("gallery", []) or [])
                if gallery_count < 3:
                    nudges.append({
                        "id": "add-gallery-photos",
                        "type": "media",
                        "priority": 3,
                        "title": "Sube fotos de tu trabajo",
                        "message": f"Tienes {gallery_count}/3 fotos. Los perfiles con galería reciben 4x más contactos.",
                        "cta_label": "Agregar fotos",
                        "cta_url": "/dashboard/provider?tab=galeria",
                        "icon": "Image",
                    })

                # Plan-based nudge
                plan = (profile.get("plan") or "free").lower()
                if plan == "free":
                    nudges.append({
                        "id": "upgrade-plan-free",
                        "type": "plan",
                        "priority": 3,
                        "title": "Sube tu visibilidad con Pro",
                        "message": "Más fotos, video de presentación, posición destacada en búsquedas.",
                        "cta_label": "Ver planes",
                        "cta_url": "/plans",
                        "icon": "Crown",
                    })

                # Calendar inactive
                if profile.get("calendar_active") is not True:
                    nudges.append({
                        "id": "activate-calendar",
                        "type": "calendar",
                        "priority": 3,
                        "title": "Activa tu calendario de citas",
                        "message": "Los clientes pueden reservar contigo sin esperar respuesta.",
                        "cta_label": "Configurar",
                        "cta_url": "/dashboard/provider?tab=citas",
                        "icon": "Calendar",
                    })

                # Reviews count
                try:
                    review_count = await db.reviews.count_documents(
                        {"provider_id": profile.get("provider_id"), "is_hidden": {"$ne": True}}
                    )
                except Exception:
                    review_count = 0
                if review_count == 0:
                    nudges.append({
                        "id": "request-first-review",
                        "type": "reviews",
                        "priority": 2,
                        "title": "Pide tu primera reseña",
                        "message": "Una reseña sube tu eCard arriba en los resultados. Pídela por WhatsApp.",
                        "cta_label": "Pedir reseña",
                        "cta_url": "/dashboard/provider?tab=referidos",
                        "icon": "Star",
                    })

            # New pending service requests
            try:
                pending_requests = await db.service_requests.count_documents(
                    {"provider_user_id": user.user_id, "status": "pending"}
                )
            except Exception:
                pending_requests = 0
            if pending_requests > 0:
                nudges.append({
                    "id": "pending-requests",
                    "type": "engagement",
                    "priority": 1,
                    "title": f"{pending_requests} solicitud{'es' if pending_requests != 1 else ''} pendiente{'s' if pending_requests != 1 else ''}",
                    "message": "Cotizaciones esperando tu respuesta.",
                    "cta_label": "Ver solicitudes",
                    "cta_url": "/requests",
                    "icon": "Inbox",
                })

        # ---------- Client-specific ----------
        else:
            try:
                client_pending = await db.service_requests.count_documents(
                    {"client_id": user.user_id, "status": "pending"}
                )
            except Exception:
                client_pending = 0
            if client_pending > 0:
                nudges.append({
                    "id": "my-pending-requests",
                    "type": "engagement",
                    "priority": 2,
                    "title": f"Tienes {client_pending} cotización pendiente",
                    "message": "Mientras esperas, descubre más proveedores cerca de ti.",
                    "cta_label": "Explorar",
                    "cta_url": "/search",
                    "icon": "Search",
                })

            # Saved providers — invite to act on them
            try:
                saved_count = await db.saved_ecards.count_documents({"user_id": user.user_id})
            except Exception:
                saved_count = 0
            if saved_count >= 3:
                nudges.append({
                    "id": "review-saved",
                    "type": "engagement",
                    "priority": 4,
                    "title": f"Guardaste {saved_count} eCards",
                    "message": "Contacta al que más te interese y agenda una cita.",
                    "cta_label": "Ver guardadas",
                    "cta_url": "/mis-guardadas",
                    "icon": "Bookmark",
                })

            # Onboarding nudge for fresh clients
            if not (user.name or "").strip() or not (user.phone or "").strip():
                nudges.append({
                    "id": "complete-client-profile",
                    "type": "profile",
                    "priority": 3,
                    "title": "Completa tu perfil",
                    "message": "Agrega tu nombre y teléfono para una mejor experiencia.",
                    "cta_label": "Editar perfil",
                    "cta_url": "/profile",
                    "icon": "UserCog",
                })

        # Sort by priority ascending (1=urgent first)
        nudges.sort(key=lambda n: n["priority"])
        return nudges

    return router
