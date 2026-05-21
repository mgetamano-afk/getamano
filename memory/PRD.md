# getamano — PRD

## Problem Statement
Marketplace digital "getamano" que conecta a comunidad latina en USA con proveedores de productos y servicios verificados. Web app responsive, multi-rol, bilingüe ES/EN, con 4 zonas distintas.

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
- Admin: `admin@getamano.com` / `admin123`
- Provider: `demo.provider@getamano.com` / `provider123`
- Demo eCard: `/services/maria-cleaning-services-sallisaw-ok`

## Test Results
- Iteration 1: 32/32 backend (100%)
- Iteration 2: 14/14 nuevos (100%)
- Iteration 3: 76/81 (94%) — fix aplicado a PUT /users/me decorator faltante, phone agregado a RegisterIn, unique index reviews(user_id, provider_id)
- Iteration 5 (Feb 2026): 31/31 nuevos (100%) — Maestro v1 verificado E2E (promo GETAMANO50, likes toggle, latino_owned filter, 4 tiers). 108/112 overall (96%). Frontend smoke 5/5.
  - Fix aplicado: PUT /providers/me ahora usa model_dump(exclude_unset=True) para evitar wipe silencioso de gallery/photos/services. Verificado vía curl: gallery preservada en updates parciales.
- Iteration 6 (Feb 21, 2026): 13/13 backend + 10/10 frontend (100%). Validado rename getmano→getamano (zero stale strings), paleta nueva (Scooter/Alabaster/Heather/Lagoon/Sapphire), Weekly Market Pulse end-to-end (endpoint + notificación + card). Sin issues críticos.
- Iteration 7 + 8 (Feb 21, 2026): 4 páginas legales (Terms, Privacy, ReviewsPolicy, Cookies) con LegalLayout compartido y banner amarillo de borrador toggleable (SHOW_LEGAL_DRAFT_BANNER constant). Footer actualizado con 4 enlaces legales + email hola@getamano.us. Identidad inclusiva: nuevo campo `owner_identity: Optional[Literal["latino","american"]]` en ProviderProfileIn, endpoint PUT /providers/me/owner-identity, filter ?owner_identity= en search, migración idempotente al startup mapeando legacy latino_owned="yes" → owner_identity="latino". Componente OwnerIdentityBadge reemplaza todas las banderas 🇲🇽 en eCard/Landing/Community/Leaderboard/ECardModal. Selector de 3 opciones (latino/american/prefer-not-say) en ProviderOnboarding step 3 y ProviderDashboard tab Perfil. Logos oficiales getamano integrados en Header/Footer/AdminLayout/ShareLinkCard/Login/Register + favicon + apple-touch-icon. Bug fix iter 8: owner_identity faltaba en modelo Pydantic ProviderProfileIn → re-agregado y retesteado 100%.
- Iteration 15 (Feb 21, 2026) — Sección landing "Conoce a tu próximo proveedor en video": nueva sección en `/` con fondo Alabaster→teal sutil, badge NUEVO, mini-grid de 3 proveedores con video (fetched con `/api/providers?has_video=true&limit=6`), thumbnails sobre cover con play button blanco central que carga el `<video controls autoPlay>` inline al hacer click. CTA superior "Ver todos con video" → `/buscar?has_video=true`. Cada card incluye business_name, rating, badge Verificado, OwnerIdentityBadge y link al perfil completo. Solo se renderiza si hay ≥1 proveedor con video (no rompe landing si la lista está vacía). Testids: `landing-featured-video-section`, `landing-video-see-all`, `landing-video-card-{slug}`, `landing-video-play-{slug}`, `landing-video-player-{slug}`, `landing-video-card-link-{slug}`. Validado con smoke screenshot.
- Iteration 14 (Feb 21, 2026) — Filtro "Con video" + badge en cards: backend acepta `?has_video=true` en `GET /api/providers` Y `GET /api/providers/map` (filtra por `video_url $exists $ne ''`). Frontend `/buscar`: nuevo estado `hasVideo`, chip `filter-has-video` con icono Video que sincroniza con URL (`?has_video=true`), badge "Video" en la portada de cada result-card (`card-video-badge-{slug}`) y en split-view inline (`split-video-badge-{slug}`). `/api/providers/map` ahora retorna `video_url` por item para que el split-view también muestre el badge. Bug fix in-session: split-view inicialmente no respetaba el filtro (testing agent iter 14 detectó que `/providers/map` no aceptaba `has_video` ni devolvía `video_url`) — corregido.
- Iteration 13 (Feb 21, 2026) — Sprint B (Categorías de fotos + Video Pro/Premium): 14/14 backend + 100% frontend. (1) Endpoint público `GET /api/gallery/photo-categories` retorna las 6 categorías (single source of truth). (2) `POST /providers/me/gallery` ya aceptaba category opcional (Sprint A); ahora UI dashboard tiene <select> por foto en `gallery-category-select-{id}` con persistencia vía `PUT /providers/me/gallery/{id}/category`. (3) Endpoints nuevos video: `POST /providers/me/video` (gated por plan Pro/Premium, devuelve 403 con mensaje claro para Free/Basic; valida content-type MP4/MOV/AVI; max 200MB; almacena en `getamano/videos/{user_id}/{uuid}.{ext}`; actualiza `video_url`+`video_content_type`+`video_uploaded_at` en provider_profiles), `DELETE /providers/me/video` (unsets fields). Reemplazo de video soportado (overwrite). (4) Nuevo componente `ProviderVideoUpload.jsx` con 2 estados: candado (Free/Basic) con CTA "Actualizar mi plan" + uploader full (Pro/Premium) con preview, replace, remove. (5) `GalleryGrid` público: si al menos 1 foto tiene categoría, aparece barra de filtros `ecard-gallery-grid-filters` con tab "Todas" + tabs por categoría presente, lightbox muestra chip con label de categoría en caption. (6) `ProviderECard` renderiza sección `ecard-video` ARRIBA de `ecard-gallery` cuando hay video_url. (7) Fix de label drift entre backend y frontend (alineados los 6 labels exactos). Backlog técnico nuevo: streaming size check en video upload (evita buffer 200MB en RAM), magic-byte sniffing del archivo subido, idempotency guard en DELETE video + soft-delete del blob orfano en `db.files`.
- Iteration 12 (Feb 21, 2026) — Sprint A (Galería de fotos v1.0): 11/11 backend + 100% frontend. (1) Nueva política: Free=20, Basic/Pro/Premium=ilimitadas; Pro/Premium incluyen "+1 video de presentación" en textos de `/api/plans`. (2) Modelos nuevos: `GalleryReorderIn`, `GalleryCategoryIn`; `GalleryItemIn` recibe `category` opcional (6 valores literales). (3) Constantes: `PLAN_PHOTO_LIMITS`, `PHOTO_CATEGORY_LABELS`, `GALLERY_COMPRESS_MAX_WIDTH=1200`, `GALLERY_COMPRESS_QUALITY=85`, `MAX_UPLOAD_SIZE` bumped 8→10MB. (4) Endpoints nuevos: `GET /api/providers/me/gallery/limit` ({plan, used, max, can_upload, remaining}), `PUT /providers/me/gallery/reorder` (dedupe + tolera ids inválidos + conserva leftovers), `PUT /providers/me/gallery/{id}/category`. (5) `POST /upload` ahora comprime server-side con Pillow (+ pillow-heif para HEIC/HEIF): >1200px se redimensiona, JPEG q=85, alfa→PNG, GIF passthrough; verificado: 2000x1500 47KB → 1200x900 10KB. (6) `POST /providers/me/gallery` enforce límite por plan con 403 + sort_order auto-increment + category persisted. (7) Frontend: `ImageUpload.jsx` reescrito con `GalleryUpload` multi-file (max 20/batch), per-file progress rows con onUploadProgress, mensajes de error específicos, accept HEIC/HEIF. (8) Nuevo `GalleryGrid.jsx` para eCard público: 3 cols × 9 visibles + overflow "Ver N fotos más" + lightbox con flechas mouse/teclado + Esc para cerrar. (9) Nuevo `DashboardGallery.jsx` con drag&drop HTML5 nativo, badge "📌 Foto principal" en la primera (sort_order=0), banner amarillo `gallery-limit-banner` cuando Free al 100% del límite con CTA a `/plans`. (10) Backlog técnico: HttpUrl validation en gallery URL, length cap en caption, reorder con concurrency control, mobile drag&drop (sin touch en HTML5 nativo).
- Iteration 11 (Feb 21, 2026) — Sprint 2 (Reportes bidireccionales + AI SEO content) CIERRE: 23/23 backend + 3/3 frontend = 100%. (1) Endpoints `/api/reports/reasons`, `POST /api/reports`, `GET /api/reports/mine`, `GET /api/admin/reports` (stats: pending/total_90d/flagged_users + filtros status/target_role), `PUT /api/admin/reports/{id}` (dismiss/warn/suspend/delete) — todos validados. (2) `GET /api/seo/content/{cat}/{city}` con Claude Sonnet 4.5 vía Emergent LLM Key + fallback templated cuando falla LLM. Cacheado en `seo_content_cache`. (3) `ReportModal.jsx` colgado en `ProviderECard.jsx` (botón "Reportar este proveedor" visible solo a otros usuarios autenticados). (4) `AdminReportsBidirectional.jsx` en /admin/reportes con sidebar link "Reportes" en `AdminLayout.jsx` (icono Flag) + ruta en `App.js`. (5) `SeoPage.jsx` renderiza párrafo AI en card blanco con `data-testid='seo-ai-content'`. E2E validado: cliente nuevo registrado → reporta proveedor → admin filtra pending → dismiss → row desaparece de pending. Backlog (no bloqueante): backend min_length validation en ReportIn.description, cross-check payload target_role vs DB role, reset flagged_by_reports al dismiss, pre-warm queue para SEO content.
- Iteration 9 (Feb 21, 2026) — Sprint 1 (Catálogo + SEO local): 18/18 backend + 5/5 frontend = 100%. (1) `/app/backend/catalog.py` con 173 categorías en 14 sectores con license_flag (red/yellow/green) + 23 ciudades USA. Seed idempotente al startup que solo agrega slugs nuevos sobre legacy. (2) 5 endpoints SEO: `/api/seo/sectors`, `/api/seo/cities`, `/api/seo/city/{slug}`, `/api/seo/category/{slug}`, `/api/seo/page/{cat}/{city}`. (3) `/api/sitemap.xml` dinámico con ~4413 URLs (hub + 184 categorías + 184×23 ciudad×categoría + providers) + `/api/robots.txt`. (4) 5 rutas frontend con react-helmet-async para meta tags + JSON-LD: `/servicios`, `/servicios/:cat`, `/servicios/:cat/:city` (página crítica con FAQ + breadcrumbs + ItemList + LocalBusiness schema), `/ciudades`, `/ciudades/:city`. (5) Footer actualizado con enlaces /servicios y /ciudades. (6) Bug fix encontrado por testing agent: /api/categories estaba capeado en to_list(100), bumpeado a 500.
- Feb 2026 (post iter 5): Compañerismo & social proof
  - `FoundingCounter` con avatares de últimos 3 founders + ciudad + time-ago + polling 20s + tiers de urgencia.
  - `ProviderGreeting` cálido en dashboard: saludo time-of-day, frase del día rotativa, píldoras de actividad empáticas (mensajes, vistas, requests).
  - Nuevo campo `recent` en GET /api/promo-codes/founding-status (top 3 founders, first_name/initial/city, fallback a business_name).
  - **Hitos celebratorios**: 19 milestones (vistas, contactos, reseñas, planes, founding, latino_owned, primer mensaje/request, etc.) con tier silver/gold/platinum. Endpoint `GET /providers/me/milestones` detecta automáticamente, `POST /providers/me/milestones/{id}/dismiss` los cierra. Colección `provider_milestones` persiste vistos. Componente `MilestoneCelebration` con confetti CSS, emoji animado, mensaje personalizado con nombre, cola secuencial. Verificado: María logueada ve "¡Tu primera vista! 👀" → dismiss → "10 personas te han visto 🌱" con confetti.
  - **Diario de logros** (`/dashboard/provider` → tab "Mi diario"): timeline visual completa de la historia del proveedor en getamano. Componente `AchievementJournal`. Hero con stats pills (vistas/contactos/reseñas/likes/rating) y barra de progreso global X/19. Tabs "Mi línea de tiempo" (entradas ordenadas DESC con fecha, time-ago, emoji, tier color, share button) y "Próximos hitos" (locked en grayscale con candado, barras de progreso current/target, tier badge). Entrada synthetic "Te uniste a getamano 🚪" como ancla de origen. Endpoint nuevo `GET /providers/me/journal` con journey_start, entries, locked, stats. Compartir copia texto formateado al clipboard (o Web Share API si está disponible).
  - **Sharing & social** (Feb 2026):
    - **Ruta corta `/p/:slug`** alias amigable para compartir en redes (mantiene `/services/:slug` y `/proveedor/:slug` para SEO).
    - Componente `ShareLinkCard` en dashboard del proveedor con URL corta, copy, WhatsApp, Email, QR generator (api.qrserver.com), Web Share API.
    - **Redes sociales en eCard público**: nuevo componente `SocialLinks` (Instagram, Facebook, TikTok, YouTube, LinkedIn, Website) con normalización auto de username → URL. Sección "SÍGUELO EN REDES" en sidebar. Editor en dashboard Perfil tab (5 inputs con placeholders).
    - **`AchievementImageGenerator`** (canvas HTML5 puro, sin libs externas): genera PNG 1080×1080 (post) o 1080×1920 (story) con branding getamano, badge tier, emoji XL, título/mensaje, logo del proveedor + business name footer. Botón "Crear imagen" en cada entry del diario. Tip de marketing incluido para incentivar etiquetar @getamano.
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
    - **Frontend**: Nueva tab "Mis Tarifas" en dashboard provider con 6 price_types, max 10 tarifas. Sección "Tarifas referenciales" pública en eCard con CTA "Pedir cotización exacta". `QuoteRequestModal` 3 pasos. Campo opcional "¿Cuánto pagaste?" en reseña. Sub-página admin `/admin/pricing` con stats ops, tabla tarifas por categoría, demanda por ciudad, export CSV. Comparativa de mercado Premium-only.
  - **EVOLUCIÓN FLYWHEEL** Feb 2026:
    - **Endpoint `GET /market-range`** público que devuelve avg_min/avg_max y hint formateado SOLO si n>=10 datos combinados (rates + reviews.paid_amount_range) por categoría+ciudad+país. Devuelve `not_enough_data, needed: 10` debajo del threshold (silencio elegante = privacidad).
    - Banner verde-ámbar "Referencia de mercado: Otros clientes en {ciudad} pagaron entre $X y $Y por servicios similares" en el paso 2 del `QuoteRequestModal` (educar al cliente + filtrar presupuestos irreales).
  - **ESCALABILIDAD GLOBAL (Sec 11)** Feb 2026:
    - **Campos i18n**: `country` (default "US") en users/provider_profiles/quote_requests/provider_rates; `currency` (default "USD") en provider_rates/quote_responses.
    - **Helpers**: `normalize_phone()` convierte cualquier formato a E.164 (`555-123-4567` → `+15551234567`, soporta + ya presente, 10 dígitos US, 11 dígitos con +1). `format_phone_display()` para UI.
    - **Migración idempotente al startup**: backfilling country/currency en docs legacy + normalización de phones en users + provider_profiles. Logs "Sec 11 migrations applied".
    - **Índices nuevos**: provider_profiles (country+category+city, country+state, users country), quote_requests (provider+date, country+category+city), provider_rates (category+city+country, provider+active).
    - **Filtros**: `GET /api/providers?country=US` por default. Compatible con expansión multi-país.
    - **Modelo User** ampliado con `country: str = "US"` para que aparezca en `/auth/login` response y context del front.
  - **REBRAND + PALETA (Feb 21, 2026)**:
    - Rename global "getmano" → "getamano" (case-sensitive: GETMANO/Getmano/getmano + dominios @getmano.com → @getamano.com + promo GETMANO50 → GETAMANO50). 28 archivos modificados (frontend src + backend + memory). Logos en Header/Footer arreglados (texto partido HTML).
    - **Nueva paleta de 5 colores** aplicada:
      - `#2F9D94` Scooter (primario, reemplaza el naranja)
      - `#F7F6F2` Alabaster (fondo principal)
      - `#BCC5CC` Heather (bordes, secundarios)
      - `#025F67` Blue Lagoon (títulos, acentos fuertes)
      - `#063154` Sapphire (footer)
    - Implementado vía override del palette Tailwind `orange-*` y `amber-*` apuntando a escalas Scooter/Lagoon (cero refactor masivo de clases), CSS variables `--primary/--accent/--background/--border` actualizadas, hex hardcoded reemplazados en App.css/Landing/Footer/Header/Leaderboard/FoundingCounter/MilestoneCelebration. Brand tokens nuevos: `brand.scooter/alabaster/heather/lagoon/sapphire`. Selection color y meta theme-color actualizados.
  - **WEEKLY MARKET PULSE (Feb 21, 2026)** — Evolución del Data Flywheel:
    - **Backend**: helpers `_compute_market_pulse(category_id, city, country)` (5 agregaciones: quotes esta semana vs prior, top budget, top size, avg rates actuales vs históricas) y `_build_market_pulse_note()`. Endpoint nuevo `GET /api/providers/me/market-pulse` retorna payload con `weekly_quotes/delta_quotes_pct/avg_min/avg_max/delta_price_pct/top_budget_range/top_project_size/has_signal/category_name`. Privacy: `has_signal = (weekly_quotes + rate_sample_size) >= 3`. Cuando no hay datos suficientes: `available:false, reason:"not_enough_data"`. Constante `BUDGET_LABEL` agregada al módulo.
    - **Notificación inteligente**: integrado a `_compute_notifications_for_user` — cada proveedor recibe automáticamente la notificación "📊 Pulso semanal de {Categoría} en {Ciudad}" cuando hay señal (category=`market_pulse`, key=`weekly_market_pulse`, CTA → /dashboard/provider?tab=tarifas). Visible en NotificationBell.
    - **Frontend**: nuevo componente `MarketPulseCard.jsx` (3 estados: loading skeleton, empty/educational, full card) renderizado en ProviderDashboard arriba de los stats. 3 stat blocks (Cotizaciones con delta % vs semana anterior, Precio promedio con delta histórico, Lo más pedido con budget+tamaño) + insight accionable inteligente que cambia según delta. Diseño glass-morphism con gradiente Alabaster→Scooter sutil.
    - **Testing**: iteration 6 — 13/13 backend + 10/10 frontend (100%).
  - **LOGO OFICIAL (Feb 21, 2026)**: Integrados los logos v1 que envió el usuario (g icon con curva tipo mano + wordmark "getamano" en Blue Lagoon). Assets: `/getamano-logo-mark.png` (512×512 PNG transparente, 70KB), `/getamano-logo-full.png` (800×800, 122KB), `/favicon.ico` (multi-size cropped, 11KB), `/apple-touch-icon.png` (512×512, 86KB). Componente `Logo.jsx` reutilizable. Reemplazados todos los placeholders "g" en gradiente naranja-azul por el logo oficial en: Header (10×10), Footer (12×12 sobre card Alabaster), AdminLayout sidebar (10×10), ShareLinkCard URL preview (7×7), Login/Register (16×16 centrado encima del welcome). Favicon y apple-touch-icon agregados a public/index.html.

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
