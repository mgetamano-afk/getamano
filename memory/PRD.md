# getmano — PRD

## Problem Statement (original, condensed)
Marketplace digital "getmano" (antes TiangixeCard) que conecta a la comunidad latina en USA con proveedores de productos y servicios reales, verificados y confiables. Web app responsive, multi-rol (cliente/proveedor/admin), bilingüe ES/EN.

## Architecture
- **Frontend**: React 19 + React Router + Tailwind + Shadcn UI + Poppins + Sonner
- **Backend**: FastAPI + Motor (MongoDB async) + PyJWT + bcrypt + httpx + requests
- **Storage**: Emergent Object Storage (vía EMERGENT_LLM_KEY) para logos/portadas/galería
- **Auth**: JWT email/password + Emergent Google Auth (cookie httpOnly secure)
- **DB collections**: `users`, `user_sessions`, `provider_profiles`, `categories`, `reviews`, `favorites`, `audit_logs`, `messages`, `conversations`, `files`
- **i18n**: ES/EN dictionary en React context + localStorage

## User Personas
1. Cliente latino — busca, guarda favoritos, deja reseñas, envía mensajes a proveedores.
2. Proveedor latino — completa onboarding wizard, gestiona eCard, sube galería, recibe/responde mensajes, cambia plan.
3. Admin getmano — aprueba/rechaza/suspende proveedores, ve métricas.

## What's Been Implemented

### Iteration 1 (2026-02-20)
- Landing pública (Hero + buscador + 12 categorías + featured + how-it-works + benefits + testimonios + community + FAQ + footer)
- Auth dual JWT + Emergent Google
- Búsqueda con filtros (categoría, ciudad, idioma, verificados)
- eCard pública con URL única `/services/{slug}`
- Provider dashboard (single-page)
- Client dashboard (favoritos)
- Admin dashboard (verify + stats + audit logs)
- Plans page (Gratis/Pro/Premium) — UI mockup
- Bilingüe ES/EN
- Seed automático: 12 categorías + admin + demo provider

### Iteration 2 (2026-02-20)
- **Galería de trabajos** de proveedores con upload vía Emergent Object Storage
- **Compartir social** en eCard: WhatsApp, Facebook, SMS, Email, Copy link (modal nativo + fallback)
- **Edición de perfil de usuario** (`/profile`): nombre, teléfono, idioma (email read-only)
- **Botones UI Apple + Facebook login** (disabled "próximamente") junto a Google y Email
- **Provider onboarding wizard** (6 pasos): Plan → Info → Location → Services → Media → Review
- **Provider dashboard rediseñado** con 4 tabs: Perfil, Galería, Mensajes, Suscripción
- **Local físico vs Desde casa / móvil** toggle (is_home_based)
- **Autocompletado de direcciones** con OpenStreetMap Nominatim (sin API key)
- **Mensajería interna** cliente ↔ proveedor (`/messages`) con conversaciones, unread, reply
- **Cambio de plan** (mock, sin Stripe): provider puede cambiar tier desde dashboard
- **Lat/lng** persistidos para futuros mapas
- **Unique indexes** en provider_profiles.slug, .user_id, users.email, user_sessions.session_token, conversations(client_id, provider_id)
- **Seed self-healing** del demo provider (refresca galería/cover/logo en cada startup)

## Test Credentials (`/app/memory/test_credentials.md`)
- Admin: `admin@getmano.com` / `admin123`
- Provider: `demo.provider@getmano.com` / `provider123` (3 gallery items seeded)
- Demo eCard: `/services/maria-cleaning-services-sallisaw-ok`

## Test Results
- Iteration 1: 32/32 backend (100%) + ~95% frontend
- Iteration 2: 14/14 backend nuevos + regresión 32/32 OK
- Iteration 3: 52/53 (98%) — falla seed gallery resuelta tras self-healing

## Prioritized Backlog

### P0 (next)
- **Stripe Connect + Billing** real para cobrar Pro $19 / Premium $49
- **Apple Sign In real** (requiere Apple Developer $99/año)
- **Facebook Login real** (requiere FB App ID/Secret)
- Validación de URL en gallery + user picture (whitelist http(s)://, /api/files/)
- Per-plan gallery cap server-side (free=3, pro=15, premium=∞)
- Rate-limit en `/providers/{id}/contact-click` (actualmente abierto)

### P1
- App móvil iOS/Android (Expo + React Native)
- Push notifications + email transaccional (Resend/SendGrid)
- Verificación Twilio (teléfono) + Google Places (validar dirección)
- SEO técnico: sitemap dinámico, schema.org LocalBusiness/Review/FAQ
- Pagination en /providers, /admin/providers, /conversations/{id}/messages
- Auditoría de cambios de plan (audit_logs)
- WebSockets para mensajería en tiempo real

### P2
- IA matching y ranking por reputación + plan
- WhatsApp Business API
- Marketplace de leads pagados (cobrar al proveedor por solicitud entrante)
- Programa de embajadores
- CRM interno

## Known Notes / Tech Debt
- `server.py` ~880 líneas — recomendado split en módulos
- JWT logout es stateless (cookie se borra; token sigue válido hasta expirar)
- Storage `_storage_key` global no es safe en multi-worker
- POST /providers auto-upgrade silencioso de client→provider
- No CDN cache headers en `/api/files/{path}` (cada request reproxy)
