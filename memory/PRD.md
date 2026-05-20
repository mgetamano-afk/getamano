# getmano — PRD

## Problem Statement (original, condensed)
Construir un marketplace digital ("Tiangix Services / TiangixeCard", luego rebranded a **getmano**) que conecte a la comunidad latina en USA con proveedores de productos y servicios reales, verificados y confiables. Web app responsive, multi-rol (cliente/proveedor/admin), bilingüe ES/EN. Slogan: "Productos y servicios latinos, a la mano."

## Architecture
- **Frontend**: React 19 + React Router + Tailwind + Shadcn UI + Poppins font + Sonner toasts
- **Backend**: FastAPI + Motor (MongoDB async) + PyJWT + bcrypt + httpx
- **Auth**: Dual — JWT email/password cookie OR Emergent Google Auth session token (both stored in `session_token` httpOnly cookie)
- **DB**: MongoDB. Collections: `users`, `user_sessions`, `provider_profiles`, `categories`, `reviews`, `favorites`, `audit_logs`
- **i18n**: ES/EN dictionary in React context, persisted in localStorage

## User Personas
1. **Cliente latino** — busca servicios verificados en su ciudad, deja reseñas, guarda favoritos.
2. **Proveedor latino** — crea su eCard digital, gestiona perfil, ve analytics, recibe verificación.
3. **Admin getmano** — aprueba/rechaza/suspende proveedores, ve métricas globales.

## What's Been Implemented (2026-02-20)
- ✅ Landing pública (Hero + buscador + 12 categorías + featured + how-it-works + benefits + testimonios + community + FAQ + footer)
- ✅ Auth dual JWT + Emergent Google (con role-select por intención)
- ✅ Búsqueda con filtros (categoría, ciudad, idioma, solo verificados)
- ✅ eCard pública con URL única `/services/{slug}` (tracking de views + contact-clicks, reviews, share)
- ✅ Provider dashboard (formulario completo: info negocio + ubicación + servicios + horarios + media + analytics)
- ✅ Client dashboard (favoritos)
- ✅ Admin dashboard (stats + filtro por status + acciones aprobar/rechazar/suspender + audit logs)
- ✅ Plans page (Gratis $0 / Pro $19 / Premium $49) — UI únicamente, Stripe diferido
- ✅ Bilingüe ES/EN con toggle en header (persistido)
- ✅ Seed automático: 12 categorías, admin demo, proveedor demo

## Test Credentials (`/app/memory/test_credentials.md`)
- Admin: `admin@getmano.com` / `admin123`
- Provider: `demo.provider@getmano.com` / `provider123`
- Demo public eCard: `/services/maria-cleaning-services-sallisaw-ok`

## Test Results (iteration_1.json)
- Backend: 31/32 (96.9%)
- Frontend: ~95% (all critical pages load; cosmetic items fixed post-test)

## Prioritized Backlog

### P0 (next iteration)
- Stripe Connect + Billing integration (Gratis/Pro/Premium subscriptions, hosted onboarding for KYC)
- Upload de imágenes real (logo/cover/photos via object storage)
- Verificación más robusta (Twilio para teléfono, Google Places API para dirección)
- Mensajería interna proveedor ↔ cliente

### P1
- App móvil iOS/Android (Expo + React Native sharing types with web)
- Push notifications + email transaccional (Resend/SendGrid)
- SEO técnico: sitemap dinámico, schema.org LocalBusiness/Review/FAQ, OG images por ciudad/categoría
- Solicitudes de cotización (workflow con estados)
- QR personalizado por eCard
- Pagination en /providers y /admin/providers

### P2
- Matching IA y ranking por reputación + plan
- WhatsApp Business API
- Marketplace de leads pagados
- Programa de embajadores
- CRM interno + automatización de onboarding

## Known Notes / Tech Debt
- `server.py` ~580 líneas — recomendado split en módulos (auth/providers/admin/models/db)
- `POST /api/providers/{id}/contact-click` no requiere auth (rate limit pendiente)
- `POST /api/providers` auto-upgrade silencioso de client→provider (considerar consent explícito)
- JWT logout es stateless (cookie se borra, token sigue válido hasta expirar) — aceptable, documentar
