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
  - **Hitos celebratorios**: 19 milestones (vistas, contactos, reseñas, planes, founding, latino_owned, primer mensaje/request, etc.) con tier silver/gold/platinum. Endpoint `GET /providers/me/milestones` detecta automáticamente, `POST /providers/me/milestones/{id}/dismiss` los cierra. Colección `provider_milestones` persiste vistos. Componente `MilestoneCelebration` con confetti CSS, emoji animado, mensaje personalizado con nombre, cola secuencial. Verificado: María logueada ve "¡Tu primera vista! 👀" → dismiss → "10 personas te han visto 🌱" con confetti.
  - **Diario de logros** (`/dashboard/provider` → tab "Mi diario"): timeline visual completa de la historia del proveedor en getmano. Componente `AchievementJournal`. Hero con stats pills (vistas/contactos/reseñas/likes/rating) y barra de progreso global X/19. Tabs "Mi línea de tiempo" (entradas ordenadas DESC con fecha, time-ago, emoji, tier color, share button) y "Próximos hitos" (locked en grayscale con candado, barras de progreso current/target, tier badge). Entrada synthetic "Te uniste a getmano 🚪" como ancla de origen. Endpoint nuevo `GET /providers/me/journal` con journey_start, entries, locked, stats. Compartir copia texto formateado al clipboard (o Web Share API si está disponible).
  - **Sharing & social** (Feb 2026):
    - **Ruta corta `/p/:slug`** alias amigable para compartir en redes (mantiene `/services/:slug` y `/proveedor/:slug` para SEO).
    - Componente `ShareLinkCard` en dashboard del proveedor con URL corta, copy, WhatsApp, Email, QR generator (api.qrserver.com), Web Share API.
    - **Redes sociales en eCard público**: nuevo componente `SocialLinks` (Instagram, Facebook, TikTok, YouTube, LinkedIn, Website) con normalización auto de username → URL. Sección "SÍGUELO EN REDES" en sidebar. Editor en dashboard Perfil tab (5 inputs con placeholders).
    - **`AchievementImageGenerator`** (canvas HTML5 puro, sin libs externas): genera PNG 1080×1080 (post) o 1080×1920 (story) con branding getmano, badge tier, emoji XL, título/mensaje, logo del proveedor + business name footer. Botón "Crear imagen" en cada entry del diario. Tip de marketing incluido para incentivar etiquetar @getmano.
  - **Wall of Fame público** (`/comunidad` o `/community`): feed live anonimizado de los últimos 60 logros desbloqueados por proveedores. Endpoint `GET /api/community/wall-of-fame?limit=N` devuelve items con first_name, ciudad/estado, slug, emoji, título, tier, unlocked_at + stats globales (total_unlocked, total_providers, by_tier). Página con hero oscuro ("La comunidad latina, en movimiento"), 3 stat cards (Logros / Negocios / En vivo refresca 30s), filtros por tier, grid responsive 1-4 columnas con tiles clickeables al eCard, animación de entrada staggered, polling cada 30s. CTAs "Abre tu eCard y aparece aquí" arriba y abajo. Link "Comunidad 🔴" en Header con dot pulsante en vivo.
  - **Ranking del mes** (`/comunidad` arriba del wall): endpoint `GET /api/community/leaderboard?period=month&limit=5` agrega milestones por user_id en el mes actual y devuelve top N con rank, first_name, business_name, ciudad, slug, logo, latino_owned, milestones_count. Componente `Leaderboard.jsx`: featured card grande naranja-ámbar para el #1 ("🥇 Líder del mes") con logo, business_name, ciudad, count grande, CTA al eCard; rows compactas para 2-5 con rank circle gradient. Filtra perfiles TEST_ e inactivos.
  - **Panel CEO** (`/admin/ceo`, admin-only, ítem destacado en sidebar con gradiente ámbar): endpoint `GET /api/admin/ceo-metrics` devuelve volumen (users/clients/providers/aprobados/pending), acquisition (signups today/yesterday/week/month + delta%), engagement (msgs/requests/reviews/likes/milestones hoy y semana), revenue (MRR/ARR calculado con precios $0/$19/$49/$99, distribución por plan, founding usage), geography (top 10 estados), categorías top, top 5 performers por vistas, activity feed mixto (signups + milestones) ordenado por fecha. Página con hero gradiente púrpura-naranja, 3 big numbers (MRR/Founding/Hitos hoy), 4 KPIs con delta arrows, 3 secciones (Ingresos por plan con bars, Estados top, Categorías top), Top 5 performers clickeables a sus eCards, Actividad en vivo con dot pulsante LIVE. Auto-refresh cada 60s.
  - **Daily Brief con IA** (`/admin/ceo` arriba): endpoint `GET /api/admin/daily-brief` agrega métricas del día y llama a Claude Sonnet 4.5 vía Emergent LLM Key + emergentintegrations library. Devuelve narrative (1 párrafo CEO-friendly en español, tono confidente cálido) + highlights[] estructurados (users, trophy, shield-urgent, crown, dollar) + **recommendations[] estratégicas de tracción** (3-5 acciones priorizadas high/medium/low con title, why, action, icon, impact_estimate). Doble llamada LLM: narrative + recommendations JSON. Datos adicionales analizados: providers sin galería, zero-views, pending stale >3 días, distribución por estado, ratio provider/client, free count. Cacheado por día en colección `daily_briefs`. Componente `DailyBrief` con greeting que cambia por hora ("Tu café matutino ☕"), narrative en glass-morphism, 5 highlight pills, **sección "Acciones para esta semana" con 5 cards de recomendaciones IA** (badge prioridad, impact estimate verde, why amarillo + action naranja), botones copy/regenerate + placeholders email/WhatsApp.
  - **Sistema de notificaciones inteligentes** (ambos roles): colección `notifications` con dedup por `notification_key` único por usuario. Endpoint `GET /api/notifications` computa on-demand y upserta. POST `/notifications/{id}/read`, `/notifications/read-all`, `/notifications/{id}/dismiss`. 
    - **Proveedor**: detecta eCard incompleta (sin galería/pocas fotos/sin servicios/sin descripción/sin logo), engagement (mensajes sin leer, solicitudes pendientes), growth (compartir eCard si <10 vistas), monetization (upgrade Pro si free), first review nudge (>30 vistas y 0 reviews), community tip Wall of Fame.
    - **Cliente**: bienvenida onboarding (días <=1 sin favoritos), **"¿Tienes algo en que {Nombre del proveedor} pueda ayudarte?"** por cada favorito (categoría dinámica), sugerencia geográfica (top rated en su ciudad), re-engagement (>14 días sin login), wall of fame teaser.
    - Componente `NotificationBell` en Header con icono BellRing cuando hay sin leer, badge rojo con count, dropdown con animación pop, items con icono por tier color, dot priority (red/amber/slate), CTA por notificación, mark-as-read on click + dismiss on X hover. Auto-polling cada 60s. 13 iconos: image/list/edit/message/inbox/share/crown/star/heart/map/sparkle/search/trophy.
  - **DATA FLYWHEEL (Sec 10)** Feb 2026:
    - **Colecciones nuevas**: `provider_rates` (tarifas auto-declaradas), `quote_requests` (cotizaciones estructuradas), `quote_responses` (respuestas con precio). Campo `paid_amount_range` en `reviews` (privado, nunca expuesto al público).
    - **Endpoints (8)**: GET/PUT `/providers/me/rates`, GET `/providers/{id}/rates` (público), POST `/quote-requests` (auth opcional / guest), GET `/providers/me/quote-requests`, POST `/quote-requests/{id}/respond`, GET `/admin/pricing-intelligence` (agregados por categoría/ciudad + ops), GET `/admin/pricing-intelligence/export.csv`, GET `/providers/me/benchmark` (solo Premium).
    - **Privacidad GOLDEN**: precios individuales NUNCA cross-user, agregados requieren n>=5, `paid_amount_range` excluido por projection en eCard público.
    - **Frontend**: Nueva tab "Mis Tarifas" en dashboard provider con 6 price_types (por_hora/proyecto/visita/pie_cuadrado/precio_fijo/a_consultar), max 10 tarifas. Sección "Tarifas referenciales" pública en eCard con CTA "Pedir cotización exacta". `QuoteRequestModal` 3 pasos (Describe → Tamaño S/M/L + presupuesto + fecha → Contacto WhatsApp/Call/Email). Campo opcional "¿Cuánto pagaste?" en reseña con disclaimer 🔒. Sub-página admin `/admin/pricing` con stats ops (tasa de respuesta, tiempo promedio, % con precio), tabla tarifas por categoría, demanda por ciudad, export CSV anonimizado. Comparativa de mercado Premium-only con peer avg vs own avg + posición below/aligned/above + mensaje accionable.

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
