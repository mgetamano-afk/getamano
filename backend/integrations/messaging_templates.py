"""
Messaging Templates — Section 73.

Centralized registry of all SMS + WhatsApp templates used by getamano.

WhatsApp messages **must** match a pre-approved template registered in the
sent.dm dashboard. The `template_id` field below is the identifier you'll
configure once you submit templates via sent.dm → WhatsApp Business →
"Submit template for approval". Until then, sandbox mode renders the body
inline (the `body_*` strings here) so the rest of the app works.

Naming convention:
  - keys are lowercase snake_case event names that match notification.category
  - bilingual `body_es` + `body_en` strings use Python str.format() placeholders
  - SMS variants are shorter (compatibility with 160-char SMS segments)
"""
from typing import Any, Optional


TEMPLATES = {
    # === Provider events ===
    "welcome_provider": {
        "category": "transactional",
        "template_id_wa": "welcome_provider_v1",  # placeholder — update after sent.dm approval
        "wa": {
            "es": "¡Bienvenido a getamano, {name}! 🌟 Tu perfil ya está activo. Comparte tu eCard y empieza a recibir clientes: {profile_url}",
            "en": "Welcome to getamano, {name}! 🌟 Your profile is now live. Share your eCard and start getting clients: {profile_url}",
        },
        "sms": {
            "es": "Bienvenido a getamano {name}! Tu perfil ya está activo: {profile_url}",
            "en": "Welcome to getamano {name}! Your profile is live: {profile_url}",
        },
    },
    # === Referral events ===
    "referral_milestone_unlocked": {
        "category": "rewards",
        "template_id_wa": "referral_milestone_v1",
        "wa": {
            "es": "🎉 ¡Hola {name}! Ganaste 1 mes gratis Pro en getamano — {paid_count} amigos se suscribieron gracias a ti. Refiere 2 más y gana otro mes. Esta app es tuya.",
            "en": "🎉 Hi {name}! You earned 1 free Pro month on getamano — {paid_count} friends subscribed thanks to you. Refer 2 more for another free month. This app is yours.",
        },
        "sms": {
            "es": "🎉 Ganaste 1 mes gratis Pro en getamano! {paid_count} amigos se suscribieron por ti. Ver detalles: {url}",
            "en": "🎉 You earned 1 free Pro month! {paid_count} friends subscribed via you. See details: {url}",
        },
    },
    "referral_first_month_free": {
        "category": "rewards",
        "template_id_wa": "referral_welcome_referee_v1",
        "wa": {
            "es": "🎁 ¡Hola {name}! Como llegaste por {referrer_name}, tu primer mes Pro en getamano va GRATIS. Activa tu plan aquí: {url}",
            "en": "🎁 Hi {name}! Since you came from {referrer_name}, your first Pro month on getamano is FREE. Activate here: {url}",
        },
        "sms": {
            "es": "🎁 Tu primer mes Pro getamano es GRATIS (referido por {referrer_name}): {url}",
            "en": "🎁 Your first Pro month is FREE (referred by {referrer_name}): {url}",
        },
    },
    # === Commissions (job referrals - 5%) ===
    "commission_earned": {
        "category": "rewards",
        "template_id_wa": "commission_earned_v1",
        "wa": {
            "es": "💰 ¡Ganaste ${amount} en getamano! {completer_name} cerró el trabajo de {client_name}. Tu comisión se aplicará a tu próxima factura.",
            "en": "💰 You earned ${amount} on getamano! {completer_name} closed the job for {client_name}. Your commission applies to your next invoice.",
        },
        "sms": {
            "es": "💰 Ganaste ${amount} en getamano! Trabajo cerrado: {client_name}",
            "en": "💰 You earned ${amount} on getamano! Job closed: {client_name}",
        },
    },
    "credit_applied_to_invoice": {
        "category": "billing",
        "template_id_wa": "credit_applied_v1",
        "wa": {
            "es": "🎉 ¡Te ahorramos ${amount} este mes en getamano! Tu crédito por {credits_count} referidos se aplicó como descuento en tu factura. Gracias por construir la comunidad.",
            "en": "🎉 We saved you ${amount} this month on getamano! Your credit from {credits_count} referrals was applied to your invoice. Thanks for building the community.",
        },
        "sms": {
            "es": "🎉 Te ahorramos ${amount} este mes en getamano por tus {credits_count} referidos.",
            "en": "🎉 We saved you ${amount} this month on getamano via {credits_count} referrals.",
        },
    },
    # === Client/Provider conversation events ===
    "new_message_received": {
        "category": "messaging",
        "template_id_wa": "new_message_v1",
        "wa": {
            "es": "💬 Nuevo mensaje en getamano de {sender_name}: \"{preview}\". Responde aquí: {url}",
            "en": "💬 New message on getamano from {sender_name}: \"{preview}\". Reply here: {url}",
        },
        "sms": {
            "es": "💬 Nuevo mensaje en getamano de {sender_name}: {url}",
            "en": "💬 New getamano message from {sender_name}: {url}",
        },
    },
    "new_quote_request": {
        "category": "leads",
        "template_id_wa": "new_quote_v1",
        "wa": {
            "es": "📩 ¡Nueva solicitud de cotización! {client_name} pide: \"{service}\". Responde rápido en: {url}",
            "en": "📩 New quote request! {client_name} needs: \"{service}\". Reply quickly at: {url}",
        },
        "sms": {
            "es": "📩 Nueva cotización en getamano de {client_name}: {url}",
            "en": "📩 New quote request from {client_name}: {url}",
        },
    },
    # === OTP / 2FA (SMS-only) ===
    "otp_code": {
        "category": "auth",
        "template_id_wa": None,  # not used via WhatsApp
        "sms": {
            "es": "Tu código getamano es: {code}. Expira en 5 min. No lo compartas.",
            "en": "Your getamano code: {code}. Expires in 5 min. Do not share.",
        },
    },
    # === Booking events ===
    "booking_confirmed": {
        "category": "bookings",
        "template_id_wa": "booking_confirmed_v1",
        "wa": {
            "es": "✅ Reserva confirmada en getamano: {service} con {provider_name} el {date_time}. Detalles: {url}",
            "en": "✅ Booking confirmed on getamano: {service} with {provider_name} on {date_time}. Details: {url}",
        },
        "sms": {
            "es": "✅ Reserva confirmada {date_time} con {provider_name}: {url}",
            "en": "✅ Booking confirmed {date_time} with {provider_name}: {url}",
        },
    },
    # === Sprint A — Section 84: Thank-inviter close-the-loop ===
    "thank_received": {
        "category": "rewards",
        "template_id_wa": "thank_received_v1",
        "wa": {
            "es": "💚 ¡{name} te agradeció por invitarlo a getamano! Activó su plan Pro y te tomaste el tiempo de reconocerte. Estás construyendo la red latina: {url}",
            "en": "💚 {name} thanked you for inviting them to getamano! They activated Pro and took time to recognize you. You're building the Latino network: {url}",
        },
        "sms": {
            "es": "💚 {name} te agradeció por invitarlo a getamano. ¡Sigue construyendo la red!: {url}",
            "en": "💚 {name} thanked you for inviting them to getamano. Keep building!: {url}",
        },
    },
}


class TemplateNotFoundError(ValueError):
    """Raised when caller requests an unknown template / channel / language combo."""


def render(
    template_name: str,
    channel: str,
    language: str,
    variables: Optional[dict] = None,
) -> str:
    """Look up the template body and substitute variables.

    Args:
        template_name: key in `TEMPLATES`.
        channel: 'wa' (WhatsApp) or 'sms'.
        language: 'es' or 'en'. Falls back to 'es' if not found.
        variables: dict for str.format substitution.

    Returns:
        The fully-rendered body string.

    Raises:
        TemplateNotFoundError: if the (template, channel, language) combo is missing.
    """
    vars_dict = variables or {}
    if template_name not in TEMPLATES:
        raise TemplateNotFoundError(f"Unknown template: {template_name}")
    tpl = TEMPLATES[template_name]
    if channel not in tpl:
        raise TemplateNotFoundError(f"Template {template_name} has no {channel} variant")
    bodies = tpl[channel]
    body_template = bodies.get(language) or bodies.get("es") or bodies.get("en")
    if not body_template:
        raise TemplateNotFoundError(f"Template {template_name}/{channel} has no language variant")
    try:
        return body_template.format(**vars_dict)
    except KeyError as exc:
        raise TemplateNotFoundError(
            f"Missing variable {exc!s} for template {template_name}/{channel}/{language}"
        ) from exc


def get_template_id_wa(template_name: str) -> Optional[str]:
    """Return the WhatsApp template_id registered in sent.dm (if any)."""
    return TEMPLATES.get(template_name, {}).get("template_id_wa")


def get_category(template_name: str) -> str:
    """Return notification category for the template (transactional, rewards, etc.)."""
    return TEMPLATES.get(template_name, {}).get("category", "transactional")


def list_templates() -> list:
    """Useful for admin dashboards — list every template with metadata."""
    out = []
    for name, t in TEMPLATES.items():
        out.append({
            "template_name": name,
            "category": t.get("category"),
            "template_id_wa": t.get("template_id_wa"),
            "has_wa": "wa" in t,
            "has_sms": "sms" in t,
            "languages": sorted(set((t.get("wa") or {}).keys()) | set((t.get("sms") or {}).keys())),
        })
    return out


# Convenience type for callers
__all__: Any = [
    "TEMPLATES",
    "render",
    "get_template_id_wa",
    "get_category",
    "list_templates",
    "TemplateNotFoundError",
]
