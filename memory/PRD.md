# getmano — PRD

## Problem Statement
Marketplace digital "getmano" que conecta a comunidad latina en USA con proveedores de productos y servicios verificados. Web app responsive, multi-rol, bilingüe ES/EN, con 4 zonas distintas.

## Architecture
- **Frontend**: React 19 + React Router + Tailwind + Shadcn UI + Poppins + Sonner
- **Backend**: FastAPI + Motor (MongoDB async) + PyJWT + bcrypt + httpx + requests + twilio
- **Storage**: Emergent Object Storage para logos/portadas/galería
- **SMS**: Twilio (modo log-only hasta tener credenciales)
- **Auth**: JWT email/password + Emergent Google Auth (cookie httpOnly secure)
- **i18n**: ES/EN en React context + localStorage

## 4 Zonas
1. **Zone 1 — Landing pública** (`/`): hero, búsqueda, categorías, featured, FAQ
2. **Zone 2 — Cliente** (`/buscar`, `/proveedor/:slug`): búsqueda con filtros, eCard pública con galería, share social, mensaje, cotización
3. **Zone 3 — Proveedor** (`/dashboard/provider` con tabs, `/provider/onboarding`, `/requests`, `/messages`, `/profile`): onboarding 6 pasos, dashboard con Perfil/Galería/Solicitudes/Mensajes/Suscripción
4. **Zone 4 — Admin Console** (`/admin/*` con DARK SIDEBAR layout): Resumen, Cola de verificación, Proveedores (search/edit/pause), Reseñas (flag/delete), Categorías y ciudades CRUD, Audit log

## DB Collections
- `users`, `user_sessions`, `provider_profiles`, `categories`, `cities`, `reviews`, `favorites`, `audit_logs`, `messages`, `conversations`, `service_requests`, `files`, `sms_log`

## Backend Endpoints (resumen)
- Auth: register, login, logout, me, google/session
- Users: PUT /users/me
- Categories: GET / + admin POST/PUT/DELETE
- Cities: GET (featured), admin GET/POST/DELETE
- Providers: search, featured, by-slug, me (GET/POST/PUT), contact-click, gallery (POST/DELETE), plan, admin verify/PATCH
- Reviews: POST + admin GET/flag/delete (recompute rating)
- Favorites: GET/POST/DELETE
- Service Requests: POST/GET, PUT status (provider only)
- Messages: POST, reply, conversations GET, messages GET (mark read)
- Upload: POST /upload + GET /files/{path}
- Admin: stats, providers list/PATCH/verify, audit-log

## SMS Events (log-only hasta poner Twilio keys)
- ✅ Nuevo mensaje al proveedor
- ✅ Respuesta de cualquier lado
- ✅ Nueva solicitud de cotización
- ✅ Cambio de estado de verificación
- ✅ Cambio de estado de solicitud

## Test Credentials (`/app/memory/test_credentials.md`)
- Admin: `admin@getmano.com` / `admin123`
- Provider: `demo.provider@getmano.com` / `provider123`
- Demo eCard: `/services/maria-cleaning-services-sallisaw-ok`

## Test Results
- Iteration 1: 32/32 backend (100%)
- Iteration 2: 14/14 nuevos (100%)
- Iteration 3: 76/81 (94%) — fix aplicado a PUT /users/me decorator faltante, phone agregado a RegisterIn, unique index reviews(user_id, provider_id)
- Iteration 5 (Feb 2026): 31/31 nuevos (100%) — Maestro v1 verificado E2E (promo GETMANO50, likes toggle, latino_owned filter, 4 tiers). 108/112 overall (96%). Frontend smoke 5/5.
  - Fix aplicado: PUT /providers/me ahora usa model_dump(exclude_unset=True) para evitar wipe silencioso de gallery/photos/services. Verificado vía curl: gallery preservada en updates parciales.
- Feb 2026 (post iter 5): Compañerismo & social proof
  - `FoundingCounter` con avatares de últimos 3 founders + ciudad + time-ago + polling 20s + tiers de urgencia.
  - `ProviderGreeting` cálido en dashboard: saludo time-of-day, frase del día rotativa, píldoras de actividad empáticas (mensajes, vistas, requests).
  - Nuevo campo `recent` en GET /api/promo-codes/founding-status (top 3 founders, first_name/initial/city, fallback a business_name).

## Prioritized Backlog

### P0 (siguiente)
- Activar **Twilio real** (cuando el usuario provea ACCOUNT_SID, AUTH_TOKEN, PHONE_NUMBER)
- **Stripe Connect + Billing** (cuando usuario tenga LLC + bank)
- Verificación OTP de teléfono al onboarding del proveedor con Twilio Verify
- Subida real de documentos en onboarding (provider_documents collection)

### P1
- App móvil iOS/Android (Expo + React Native)
- Email transaccional (Resend) — alternativa/complemento a SMS
- Verificación Google Places de dirección
- SEO técnico: sitemap dinámico, schema.org
- Pagination en /providers, /admin/providers, /conversations, /service-requests
- Rate limiting en /messages y /service-requests
- Apple Sign In + Facebook Login reales

### P2
- IA matching y ranking
- WhatsApp Business API
- Marketplace de leads pagados
- Programa de embajadores
- CRM interno
- Split `server.py` en módulos
