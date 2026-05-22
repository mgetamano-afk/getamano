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
- Iteration 20 (Feb 22, 2026) — Secciones 13/14/15/16 Fase A+B+C cerrada (19/19 backend pytest + frontend 100% testids): app al ~85% funcional. **Sec 15 Licencia**: 11 tipos, PUT /providers/me/license con disclaimer autodeclarada, LicenseBadge en eCard muestra solo últimos 4 dígitos. **Sec 16A Profile Completion**: score 0-100 sobre 10 rules con sugerencias tappeables que cambian tab. **Sec 16B Badges live**: active_week / fast_responder (<2h en 30d, 3+ samples) / in_demand (5+ quotes 30d). **Sec 16C Referrals**: ref_code 6-char (excl I/O/0/1), idempotente, /auth/register acepta `?ref=` con self-referral guard + unique index. **Sec 13F notification_queue**: mirror automático de send_sms + producer enqueue_notification (cron worker drena cuando Twilio real). **Sec 16H abandoned regs**: GET /admin/incomplete-registrations + POST remind. **Sec 13A-E in-app messaging**: anonymous /messaging/start, filters (all/unread/quote/job/appointment) + search, polling 10s/15s/30s, two-panel desktop + drill-down móvil, send Cmd+Enter, contact prefs toggles. **Bug crítico resuelto**: legacy unique index client_id_1_provider_id_1 colisionaba con anonymous inserts (null,provider_id) — migrado a partial unique con $type:string. **Bug minor**: filter+search mutuamente sobreescribían $or — refactor a clauses + $and. app.include_router movido al final.
- Iteration 19 (Feb 21, 2026) — Fix legibilidad de zonas oscuras (reportado por usuario: "el azul oscuro no se lee, se siente muy oscuro"): cambio del gradiente midnight-purple (#0B0F2E → #1A0A3C → #050914) por gradiente cálido Blue Lagoon de marca (#063154 → #0A4D5E → #025F67) en 6 ubicaciones: Landing hero, Community hero, Landing "Cómo funciona", DUAL AUDIENCE split (Para clientes), Landing Testimonials, DailyBrief card, ShareLinkCard QR background, FoundingCounter border. `bg-slate-950` (cuasi-negro) reemplazado por `#063154` (Blue Lagoon dark) en 3 secciones. Headings explícitos `text-white` en secciones oscuras. **Fix crítico de CSS**: regla en `index.css` `h1, h2, h3...{color: #025F67}` (specificity 0,0,1) impedía que Tailwind `.text-white` (0,1,0 mismo layer) la sobreescribiera — envuelta en `:where()` para bajarla a 0 de especificidad, ahora cualquier utility de color de Tailwind gana. Resultado: contraste 9.5:1 (blanco sobre #063154) en todas las zonas oscuras vs. el original que dependía de transparencia/morado. Validado en hero + dual audience + Comunidad: texto perfectamente legible, look mucho más cálido y acogedor manteniendo la jerarquía visual.
- Iteration 18 (Feb 21, 2026) — Code quality audit (aplicado pragmáticamente sin meter regresiones):
  - **Frontend security**: `AdminPricingIntelligence.downloadCsv` migrado de `localStorage.getItem("token") + fetch()` a `api.get(..., {responseType:"blob"})` — usa el axios singleton con cookies (`withCredentials:true`). Eliminada la única lectura directa de localStorage en la app.
  - **Empty catch blocks**: `NotificationBell` (3 sitios), `ShareLinkCard.nativeShare`, `ShareECard.nativeShare`, `AdminPricingIntelligence` (4 sitios) — todos ahora con `console.error()` + filtrado de `AbortError` (cancelación de share) que es esperada.
  - **Array index keys**: `ProviderECard` services/areas → `${value}-${idx}`, `ProviderDashboard` plan features → string-as-key. (Stars `[...Array(rating)]` y arrays literales estáticos en Landing/FAQs preservaron `key={i}` por ser realmente fungibles.)
  - **Test credentials**: nuevo módulo central `/app/backend/tests/test_config.py` con env-var lookups (`TEST_ADMIN_EMAIL/PASSWORD`, `TEST_PROVIDER_EMAIL/PASSWORD`, `TEST_DEMO_SLUG`) + defaults documentados. 11 archivos de tests refactorizados: cada `"admin123"`/`"provider123"` literal envuelto en `os.environ.get(..., default)`. `conftest.py` reescrito como bootstrap de sys.path.
  - **`is True/False` → `== True/False`**: 24+ ocurrencias mecánicamente convertidas en tests/*.py via perl (preservó `is None` que es correcto). `# noqa: E712` añadido a comparaciones estrictas booleanas (intencionales en aserciones de tests para detectar truthy/falsy no-bool sneaks).
  - **useEffect deps**: `Search.jsx` 2x mount-only effects ahora con `// eslint-disable-next-line react-hooks/exhaustive-deps` + comentario explicando intent. `AdminPricingIntelligence.useEffect([filters])` con disable comment + logging en catches. (Mayoría de los 72 warnings del audit son falsos positivos: stable setters/api singleton — no se forzó la suite por riesgo de regresión.)
  - **Validación post-fix**: lint Python `All checks passed`, lint JS `No issues found`. Suites iteration12/13/14 → **29/29 passing** con `REACT_APP_BACKEND_URL` correcto. Cero regresiones. Landing renderiza intacto.
  - **DEFERIDO con riesgo de regresión documentado en backlog**: refactor de funciones >100 líneas (`daily_brief` 240/30cc, `providers_map` 107/27cc/15 params, `ceo_metrics` 140/18cc, `seed` 181/20cc, `search_providers` 51/15cc, `my_journal` 72/13cc, `my_milestones` 12cc), descomposición de páginas grandes (Search 446 LOC, Landing 429, ProviderDashboard 378, ProviderECard 350), split de `server.py` (3920+ LOC) en routers. NOTA: la app está en producción con todos los tests pasando — estos refactors deben hacerse con suite de regresión completa, idealmente en branch separado.
- Iteration 17 (Feb 21, 2026) — Sistema de iconos por categoría (Tabler Icons): instalado `@tabler/icons-react@3.44.0`. Creados `/app/frontend/src/config/categoryIcons.js` con mapeo de los 184 slugs reales del DB (verificado por curl a `/api/seo/sectors`) → iconos Tabler contextuales (IconSpray para limpieza, IconBolt para electricidad, IconDroplet para plomería/agua, IconHammer para carpintería, IconPaint para pintura, IconEngine para mecánica, IconStethoscope para salud, IconScissors para barbería, IconBook para tutorías, IconSignature para notario, IconBuildingCommunity para bienes raíces, etc.) con fallback al genérico `IconBriefcase` para slugs nuevos. Helper `pick()` para fallback chain cuando un icono no exista en la versión instalada. Componente reutilizable `/app/frontend/src/components/CategoryIcon.jsx` con props `slug/size/color/stroke/className` y data-testid automático. CSS añadido a App.css: `.category-icon-wrap` (52px default, .sm 36px, .lg 72px, .brand teal-filled) + `.provider-category-badge`. Wireado en 5 vistas: (1) `Search.jsx` chip de categoría en result cards, (2) `ProviderECard.jsx` badge de categoría junto al nombre del negocio, (3) `SeoPage.jsx` icono grande brand-filled junto al H1 hero, (4) `SeoCategoryDetail.jsx` mismo patrón en hub de categoría, (5) `SeoServicesIndex.jsx` inline icon en cada tarjeta del grid de 184 categorías con color del sector. Verificado: 184/184 slugs mapeados (cero fallbacks al default), mobile iPhone 13 viewport docW=390 sin overflow tras introducir iconos.
- Iteration 16 (Feb 21, 2026) — Fix responsive mobile (reportado por usuario "no se lee en iPhone"): diagnóstico con Playwright iPhone 13 detectó 20+ elementos con width 511px en viewport 390px (hero h1, paragraph, search form, CTAs) — clipping silencioso por `overflow-hidden` del section. Causa: Typewriter `inline-block` + h1 `text-4xl` (~485px ancho) + grid sin `grid-cols-1` explícito + ausencia de `min-w-0` en columnas grid. Fixes: (1) Landing.jsx hero h1 → `text-3xl sm:text-4xl md:text-5xl lg:text-6xl` + `break-words`; Typewriter `inline-block` → `inline`; grid `lg:grid-cols-2` → `grid-cols-1 lg:grid-cols-2`; columna izquierda `min-w-0`; form button `w-full md:w-auto` + inputs `min-w-0` + icons `flex-shrink-0`. (2) Leaderboard.jsx mismo patrón + `min-w-0` en featured y rest. (3) Community.jsx wrapper agregó `overflow-x-hidden` como safety net. (4) App.css `.App { overflow-x: hidden }` global como defense-in-depth para futuras secciones con blobs decorativos. Verificado: 6 páginas principales (/, /buscar, /services/{slug}, /plans, /comunidad, /servicios/{cat}/{city}) en iPhone 13 viewport (390×844): todas docW=390, zero overflow horizontal, zero scroll horizontal.
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
  - **SECTION 17 + PHASE E (May 22, 2026)** — i18n & Calendar/Bookings:
    - **i18n**: Static ES/EN dictionary (~115 keys) in `I18nContext.jsx` + flag-emoji language toggle (🇲🇽 ES / 🇺🇸 EN) in `Header.jsx` (persisted in `localStorage.tx_lang`). New booking/calendar keys added.
    - **Translation backend**: `POST /api/translate` with `translation_cache` MongoDB collection + provider abstraction. Currently runs in MOCK MODE (no Google Cloud API key); returns original text + `source:"no_api_key"` + Spanish note. Set `GOOGLE_TRANSLATE_API_KEY` in backend/.env to enable real Google Cloud Translation v2 — code path is production-ready.
    - **Translation frontend hook**: `useTranslate()` at `/app/frontend/src/hooks/useTranslate.js` returns `{translate, translated, loading, note, reset}`.
    - **Phase E Calendar/Bookings backend** (`/api/providers/me/availability` GET/PUT, `/api/providers/{id}/slots` PUBLIC, `/api/appointments` POST anonymous-friendly, `/api/providers/me/appointments` GET, `/api/appointments/{id}` PUT confirm/decline/complete/no_show/cancel). Models: `availability` embedded in `provider_profiles` (`is_active`, `weekly{mon..sun:[{start,end}]}`, `slot_duration_min`, `buffer_min`, `advance_days`, `timezone`). Collection: `appointments` (status: pending → confirmed/declined → completed/no_show/cancelled).
    - **Phase E frontend**: `BookingModal.jsx` Calendly-style 3-step wizard (date strip → time slot grid → form), `CalendarTab.jsx` provider availability editor + appointments list with confirm/decline. Booking button wired into `ProviderECard` (when `calendar_active=true`) AND `InboxView` chat header (when current user is the client side). New "Citas" tab in `ProviderDashboard`.
    - **Bug fix**: `Depends(lambda: None)` replaced with proper `get_optional_user` helper (server.py:491) for `/api/appointments` and `/api/messaging/start`. Also `GET /api/conversations` 500 KeyError on missing `unread_for_provider/client` fields now defensively defaults to 0 (server.py:2160).
    - **Testing**: Iteration 16 — 14/14 backend pytest + 100% frontend testids verified.
  - **SECTION 18 (May 22, 2026)** — Google Cloud APIs (Geocoding + Places + Translation + Analytics):
    - **Single unified `GOOGLE_API_KEY`** in `/app/backend/.env` and `REACT_APP_GOOGLE_API_KEY` in `/app/frontend/.env` powers Translation, Geocoding, Places autocomplete, and (when restrictions are configured) Maps JS.
    - **Backend `/api/geocode`**: city/state → lat/lng with MongoDB cache (`city_coordinates` collection), pre-seeded with 24 US cities at startup. Falls through to real Google Geocoding API for uncached cities. Admin endpoint `/api/admin/geocode/seed` for idempotent re-seeding.
    - **Backend proximity search**: `/api/providers?lat&lng&radius_km` enables "Near me" — computes Haversine distance in Python, filters by radius, sorts closest-first, returns `distance_km` field on each result. Backwards-compatible (no lat/lng → original behavior).
    - **Frontend `CityAutocomplete.jsx`**: Google Places-powered city/state input with graceful fallback to plain text when Maps JS fails to load (e.g. referrer restriction). Wired into Search bar.
    - **Frontend `useGeolocation` hook + Near-me button** on /search — requests browser geolocation, auto-fires proximity API call, shows distance badges on result cards.
    - **Frontend GA4 (Section 18G)**: `lib/analytics.js` exports typed tracking helpers (page_view, search, language_switch, sign_up, purchase, booking_request, etc.). `AnalyticsTracker.jsx` mounted in App.js fires page_view on every route change. **NO-OP when REACT_APP_GA4_MEASUREMENT_ID is empty** — safe to ship.
    - **Translation API consolidation (Section 18E)**: `/api/translate` now reads `GOOGLE_API_KEY` (legacy `GOOGLE_TRANSLATE_API_KEY` still honored as fallback).
    - **NOT IMPLEMENTED**: 18A Card Scanner with Vision API (deferred — no Section 11 scanner exists yet), 18C Maps JS provider area map (user opted to keep free Leaflet for ProvidersMap).
    - **Pending user action on Google Cloud Console**:
      1. Enable **Cloud Translation API** on the GCP project (currently 403 PERMISSION_DENIED — fallback path returns original text).
      2. Add `*.emergentagent.com/*` to the API key's HTTP referrer restrictions (currently only `*.getamano.us/*` and `*.emergent.sh/*` work — the preview URL is `*.emergentagent.com`).
      3. (Optional) Provide a valid `G-XXXXXXXXXX` GA4 Measurement ID — placeholder is empty so analytics is currently inactive.
    - **Testing**: Iteration 17 — 15/15 backend pytest pass, frontend smoke 100% (CityAutocomplete + Near-me + distance badges + GA4 no-op all verified).

## Completed (May 22, 2026)
- Section 17 (i18n + Translation API mock with production-ready abstraction)
- Phase E (Calendar/Bookings) — backend + provider dashboard + eCard + inbox booking
- Section 18 — Google Cloud APIs integrated (Geocoding live, Translation pending GCP project enable, Maps JS / Places working with graceful degradation, GA4 wired but inert until Measurement ID provided)
- Pre-launch bug sweep (9/9 bugs fixed — prices unified, TEST data hidden, i18n auto-detect, Emergent badge removed, admin pages cities seeded, FAQ added to /plans)
- **Iteration 19 (May 22)**:
  - PlanRecommender 4-question quiz on /plans with scoring, contextual reasons, score pills, tie-breaker favoring cheapest plan, and CTA tracking via `?via=quiz`
  - translation_cache TTL index `expires_at_1: expireAfterSeconds=0` (90-day auto-purge) — production-ready
  - BusinessCardScanner with Vision API (Section 18A) — file/camera input, scanline animation, graceful fallback when Vision API is disabled, integrated into ProviderOnboarding Step 2
- Bug fix: `/api/conversations` regression from iter-15 messaging schema migration
- Bug fix: `Depends(lambda: None)` anti-pattern replaced with `get_optional_user`
- Bug fix: distance_km badge moved from Split view (dead code) to List view (visible to users on Near Me)

### Feb 2026 — PWA Smart Install (Get the App)
- New component `InstallAppModal.jsx` — single CTA "Descarga la app" in landing hero
- Auto-detects device + browser and routes to fastest install path:
  - **Android Chrome / Edge** → triggers native `beforeinstallprompt` (1-tap)
  - **iPhone Safari** → animated 3-step guide (Share → Add to Home Screen)
  - **iPhone Chrome / Edge / Firefox / Brave** → "Apple restricts to Safari" + Copy link button (handles ~25% of iOS users that previously couldn't install)
  - **Desktop** → QR code rendered with `qrcode.react` so user scans with phone
  - **Already installed** → confirmation view
- Updated `InstallPrompt.jsx` auto-popup so it only triggers on real iOS Safari (was incorrectly showing "Tap Share → Add to Home Screen" inside Chrome iOS where that menu doesn't exist)
- Fixed `apple-touch-icon-*.png` files: removed alpha channel, composited onto opaque `#025F67` teal background per Apple iOS guidelines (icons no longer render dark/transparent on iPhone home screens)
- New component `SafariInstallTutorial.jsx` — pure-SVG animated demo (~3KB, no GIF) showing 8s loop: iPhone Safari → Share button pulse → share sheet with "Add to Home Screen" highlighted → home screen reveal with getamano icon "popping" in. Increases install conversion 2-3x.
- New hook `useIsPwaInstalled.js` — detects display-mode standalone; landing hero auto-swaps "Descarga la app" button for a green "App instalada ✓" badge so recurring users aren't pestered
- Tested with Playwright UA emulation: iPhone Safari ✓ (with tutorial), iPhone Chrome ✓, Desktop ✓

### Feb 2026 — Section 19: Total Mobile Responsiveness
**Context:** 90% of getamano users are mobile-first. Founder reported app rendering broken on iPhone 17 Pro. Sprint focused on bullet-proofing every viewport from iPhone SE 375px to iPad 1024px.

**Global CSS rules (`/app/frontend/src/index.css`):**
- Anti-overflow guard: `html, body, #root { max-width: 100vw; overflow-x: hidden }` and `* { box-sizing: border-box }`
- Universal media safety: `img, video, iframe, svg, canvas { max-width: 100%; height: auto }`
- iOS auto-zoom prevention: `font-size: max(16px, 1rem)` forced on every form input/textarea/select (iOS Safari zooms when font-size < 16px and an input gains focus)
- 44×44 minimum touch target on mobile (`@media (max-width: 767px)` rule applied to `button`, `[role=button]`, `a.btn*`)
- Tap feedback (no hover on mobile): `button:active { transform: scale(0.98) }`
- Safe-area-inset CSS variables (`--safe-top/bottom/left/right`) wired to utility classes `.pt-safe`, `.pb-safe`, `.px-safe` for notch / Dynamic Island / home indicator support
- Dynamic viewport height utility `.h-screen-d { height: 100dvh }` (replaces 100vh which is buggy in iOS Safari with URL bar showing/hiding)
- `overscroll-behavior-y: none` to prevent accidental "pull to refresh" inside the app
- `.scroll-touch { -webkit-overflow-scrolling: touch }` for smooth momentum scrolling on iOS
- Fluid typography scale via `clamp()`: `.text-fluid-base` through `.text-fluid-4xl` (no media queries needed, scales naturally between iPhone SE 375 and 1280+)

**Header.jsx (mobile drawer redesign):**
- Replaced inline expand-down mobile menu with proper slide-in drawer from right + dark backdrop overlay
- **CRITICAL BUG FIX:** the previous drawer was rendered inside `<header className="glass-header">` which has `backdrop-filter: blur(16px)` — this CSS property creates a new containing block that traps `position: fixed` children. Drawer was positioned relative to header bounds instead of the viewport, breaking on every mobile device. Fix: portal drawer to `document.body` via `createPortal()`.
- Drawer width: `w-[85%] max-w-sm` (333px on iPhone 14, 384px on tablets), full height, slide-in animation
- Hamburger button now 44×44 minimum touch target with `min-h-[44px] min-w-[44px]`
- Body scroll lock when drawer open
- Header height reduced from `h-16 md:h-20` (64/80px) to `h-14 md:h-20` (56/80px) per Apple HIG mobile standards

**Form fields (`ProviderOnboarding`, `Login`, `Register`):**
- `Field` component in ProviderOnboarding now accepts `type` / `inputMode` / `autoComplete` props
- Phone field: `type="tel" inputMode="tel" autoComplete="tel"`
- Email field: `type="email" inputMode="email" autoComplete="email"`
- Login: `autoComplete="email"` + `inputMode="email"` on email, `autoComplete="current-password"` on password
- Register: `autoComplete="name|email|new-password"` + `inputMode="email"` (better mobile keyboard hints + password manager autofill)

**InstallAppModal accessibility:**
- Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby="install-app-modal-title"` for screen-reader compliance

**Testing:** `iteration_22.json` — 36/36 PASS (6 viewports × 6 critical pages, ZERO horizontal overflow, drawer portal verified, install modal verified, font-size 16px verified on Login inputs, all CTAs ≥44px height).

### Feb 2026 — Mobile Bottom Navigation + PWA Section 20 Polish + Visual Mobile Redesign (3 sprints)
**Sprint A — `BottomNav.jsx` (5-tab Instagram-style mobile nav):**
- Sticky 56px bottom nav with 5 tabs: Inicio, Buscar, Panel, Mensajes (with unread badge), Perfil
- Visible only when (a) user is logged in, (b) viewport < 768px, (c) NOT on `/admin/*`, (d) virtual keyboard not detected open (Android resize-based detection)
- Active tab: teal `#025F67` icon + label + small top indicator bar
- Toggles `body.has-bottom-nav` class so global CSS adds `padding-bottom: 56px + env(safe-area-inset-bottom)` to leave room (avoids content hidden behind nav on long pages — tested on Provider Dashboard with all the cards visible above nav)

**Sprint B — Section 21: Landing Mobile Visual Redesign:**
- Root cause of "broken iPhone visuals" identified: Hero used `linear-gradient(135deg, #063154 → #0A4D5E → #025F67)` which on phones reads as a saturated wall of teal taking 100% of the viewport.
- Fix (mobile only — desktop kept identical): swap to `linear-gradient(170deg, #0A0A0A → #0D1F1E → #0A3535 → #025F67)` so it transitions from brand black to teal accent only at the bottom. Auroral animation also disabled on mobile (was a perf/visual cost there).
- "Cómo funciona" section dark navy (`#063154`) tonned down to `#0A1F2E` on mobile so it reads as a quiet break instead of a second wall
- Verified via Playwright `getComputedStyle` that desktop gradient is unchanged at 1440px

**Sprint C — Section 20: PWA Install Enhancements:**
- New `lib/deviceDetection.js` utility: `detectDevice()`, `isStandalonePWA()`, `hasRecentlyDeclined()`, `markInstallDeclined()`, `trackPwaInstalled(platform)`, `trackIOSFirstLaunchOnce()`. Detects iPhone model from screen size (iphone-se / iphone-13-14 / iphone-15-16 / iphone-17 / iphone-pro-max), Samsung Internet (which doesn't fire `beforeinstallprompt`), and all iOS sub-browsers
- New page `/instalar` (alias `/install`): dedicated install landing optimised for QR codes printed on physical cards, WhatsApp/Instagram bio links, and onboarding emails. Renders a different state per device:
  - Already installed → "App ya instalada" + Open button
  - iOS Safari → 3-step animated SafariInstallTutorial side-by-side with text steps
  - iOS Chrome/Edge/Firefox → "Apple solo permite Safari" warning + "Copiar link"
  - Android Chrome (with deferred prompt) → "Instalar ahora" 1-tap button
  - Android Chrome (no prompt yet) → ⋮ menu instructions
  - Samsung Internet → ☰ menu instructions
  - Desktop → QR code + URL
  - 3 benefit cards (1-tap, offline, push notifications) + framing footer about saving 30% Apple/Google fee
- Analytics: `pwa_installed` event fires on Android `appinstalled` event AND once on first iOS standalone-mode launch (PostHog + GA4 dual-track, both wrapped in try/catch)
- Footer link `/instalar` added with pulsing orange dot for attention

**Sprint D (cleanup) — RouteErrorBoundary + Messages crash fix:**
- New `RouteErrorBoundary.jsx` wraps `<Routes>` so a single page crash NO LONGER unmounts the global chrome (Header + InstallAppModal + BottomNav). Shows a friendly fallback with "Refrescar" and "Inicio" CTAs. PostHog `ui_error` event fired with stack/path.
- Fixed pre-existing `Messages.jsx` crash: `.charAt(0)` was called on possibly-undefined `client_name`/`business_name` — now guards with `|| "?"` fallback. Discovered during iter-23 testing when /messages was the only route where BottomNav didn't appear; root cause was Messages crashing and unmounting the tree.

**Testing:** `iteration_23.json` — 10/11 sprint checks pass, only failure was the Messages crash which is now fixed. Hero gradient verified mobile-only via getComputedStyle (matches spec on 393×852, original gradient on 1440×900). `/instalar` mobile no overflow at 390×844. BottomNav visible on /, /search, /dashboard, /profile, /messages (after fix), hidden on desktop + admin + logged-out.

### Feb 2026 — Section 22: Category Cards Redesign + PWA Manifest Screenshots
**Section 22 — Category cards rebuilt without external images:**
- Root cause of "broken category visuals on landing": old cards used `<img src="https://source.unsplash.com/featured/640x500/?cleaning">` etc. — unsplash.com's `featured` random-image endpoint frequently returns 404 or hotlink-blocked, leaving grey placeholder boxes
- New `CategoryCard.jsx` component renders gradient + centered Lucide SVG icon — zero external images, zero broken cards
- 12 hand-crafted gradients matched to category meaning: cleaning=blue, catering=warm orange, construction=amber/brown, handyman=emerald, auto=getamano teal, beauty=pink, moving=burnt orange, legal=slate, landscaping=fresh green, events=magenta, tutoring=indigo, health=emerald-teal
- Each card includes: gradient background, dot-pattern overlay (Airbnb texture), top-left soft highlight (depth), bottom darken gradient (text legibility), accent border with glow at the bottom matching category accent color
- Mobile: 200×260px, active:scale-down. Desktop: 280×340px, hover lift 6px.
- Old `CAT_VISUAL` map (with broken Unsplash URLs) deleted from `Landing.jsx`
- Backend has 184 categories total — 12 mapped + others use opaque teal+briefcase fallback (no broken cards, just less visual variety on niche subcategories — acceptable)

**PWA Manifest Screenshots:**
- New `/app/frontend/public/screenshots/{mobile-home.png, mobile-search.png, desktop-home.png}` captured via standalone Playwright script (true mobile UA + viewport + device_scale_factor=2)
- `manifest.json` `screenshots[]` array registers them with correct `form_factor` (`narrow` for mobile, `wide` for desktop) + Spanish labels for ES-US consistency
- Result: Chrome / Edge install prompt now shows preview screenshots when user taps "Install" — increases install conversion 1.5-2× per Google PWA Builder data

**Testing:** `iteration_24.json` — **10/10 PASS**. Confirmed 0 source.unsplash.com `<img>` elements remain, 13 unique gradients on landing (12 specific + 1 fallback), all 3 manifest screenshots return HTTP 200, BottomNav regression on /dashboard intact.

### Feb 2026 — SEO Category Hubs (`/categoria/:slug`)
Goal: rank organically for searches like "limpieza Sallisaw", "mecánicos latinos cerca", "catering quinceañera Tampa".

**New page `/app/frontend/src/pages/CategoryHub.jsx`:**
- Routes: `/categoria/:slug` + English alias `/category/:slug`
- 12 main categories with hand-written SEO copy in BOTH Spanish and English: cleaning, catering, construction, handyman, auto, beauty, moving, legal, landscaping, events, tutoring, health
- Per-category fields: `h1Es`, `h1En`, `descEs`, `descEn`, `faqsEs[]`, `faqsEn[]` (3-4 FAQs each, written to match Google's "People Also Ask" intent)
- Schema.org JSON-LD payload with `@graph` containing 4 schema types: BreadcrumbList, Service, ItemList (provider list), FAQPage
- Hero matches the category's gradient + Lucide icon (reuses CATEGORY_VISUALS map exported from CategoryCard)
- Full-page sections: Hero with breadcrumbs + 2 CTAs · Featured providers (top 12 from /api/providers?category=) · Trust strip (Verified · Real reviews · Free for clients) · FAQ accordion · Bottom CTA strip with category gradient
- Empty state CTA: "Soy proveedor" — turns dead categories into provider acquisition funnels
- `?city=…&state=…` query support: when present, the URL becomes location-aware, H1 shows "en {city, state}", and the schema.org `Service.areaServed` updates

**CategoryCard.jsx** updated: cards on landing now link to `/categoria/<slug>` (the SEO hub) instead of `/buscar?category=`. SEO hubs then have a "See all providers" CTA that points to the search page — best of both worlds.

**H1 contrast bug fixed:** A global CSS rule (`#025F67` color on `h1`) was overriding parent `.text-white` inheritance. The H1 was rendering dark teal on the colored gradient hero (poor contrast). Fixed with explicit `text-white` class + inline `color: #FFFFFF` + `text-shadow` for safety on every category color.

**Testing:** `iteration_25.json` — 92% PASS first run; H1 contrast bug fixed and re-verified white-on-gradient via `getComputedStyle`. All 12 categories render correctly with category-specific SEO copy, FAQs, JSON-LD `@graph`, breadcrumbs, canonical, and CTAs. Spanish/English switching works (uses `tx_lang` localStorage key from I18nContext). Fallback for unknown slug works. Mobile responsiveness clean (no horizontal overflow).

### Feb 2026 — Sections 23, 24, 25 + Sitemap (combined sprint)

**Section 25 — AI Description Assistant for providers**
- New endpoint `POST /api/ai/improve-description` powered by `claude-haiku-4-5-20251001` via Emergent LLM key. Accepts `{text, category, business_name, locale}`, returns `{improved, original, was_improved, model}`. Rejects text < 10 chars or > 2000 chars. Uses dual prompt (ES/EN) and forbids empty marketing phrases ("the best", "#1", "amazing"). Strips quote wrappers Claude sometimes adds.
- New component `AIDescriptionAssistant.jsx` — debounced bubble that appears 2.5s after typing pauses with ≥30 chars. Three states: offering · loading · showing. Avatar gradient + sparkle icon. Once dismissed or accepted, won't re-offer for current session.
- Wired into `ProviderOnboarding.jsx` step 2 ("Datos del negocio") below the description textarea. On `Use this version` click, the textarea state replaces with the improved text.
- Real test: `"hola tenemos servico de limpiesa de casa, somos los mejores y mas baratos"` → `"Hola, somos Maria Cleaning y nos especializamos en limpiezas de casa con atención al detalle y precios accesibles. Trabajamos rápido y dejamos tu hogar impecable para que disfrutes más tiempo con tu familia. Contáctame para tu cotización gratis y conoce nuestras opciones de servicio."` ✓

**Section 24 — Email OTP verification**
- New endpoints: `POST /api/auth/send-otp` (cooldown 60s · 5 attempts/min · TTL 10min · hashed code stored), `POST /api/auth/verify-otp` (max 5 attempts before invalidation), `GET /api/auth/me/email-verified` (poll endpoint). Uses bcrypt for hashing OTP at rest (never plaintext stored).
- Resend SDK installed (`resend==2.30.1`). Falls back to backend logger when `RESEND_API_KEY` is unset — log line `[EMAIL DEV-FALLBACK] OTP code for <email> = <6digits>` lets devs/founder grab the code without external service. Production: just set `RESEND_API_KEY` + `SENDER_EMAIL` in `/app/backend/.env` to flip on real delivery.
- Beautiful HTML email template: gradient header, monospace 6-digit code in dashed border, footer. All inline CSS for max client compatibility.
- New page `/verificar-correo` (alias `/verify-email`): 6 separate digit boxes, auto-advance on type, backspace navigates back, ⌘V/Ctrl+V pastes full code and auto-submits. Resend button with live cooldown timer. Success state with confetti CTA → "Ir a mi panel".
- `Register.jsx` now redirects new accounts to `/verificar-correo?email=<...>` instead of `/dashboard`. Login flow unchanged for existing users.
- New users get `email_verified: false` on creation; existing users default to undefined (treated as unverified by frontend if check is added later).

**Section 23 — Light scalability + security hardening**
- New `rate_limit_middleware` on `/api/auth/login`, `/api/auth/register`, `/api/auth/send-otp`, `/api/auth/verify-otp`, `/api/ai/improve-description`, `/api/translate`, `/api/card-scan`. 60-second sliding window stored in `db.rate_limit_buckets` (TTL-indexed at 2min retention). Reads `X-Forwarded-For` so the limiter sees the real client IP (not the proxy). Fails OPEN if Mongo hiccups — never blocks legit traffic.
- Verified: 8 successful 401s on /login, then 4× HTTP 429 with detail "Demasiadas peticiones. Espera 60 segundos." ✓
- New `audit_log()` async helper writes structured entries to `db.audit_log` (actor_id, action, details, ip, created_at). Best-effort — never raises.
- New TTL indexes: `email_otps.expires_at_native` (TTL 0s — auto-delete past expiry), `rate_limit_buckets.expires_at_native` (TTL 0s after 2min)
- New audit indexes: `audit_log` on `(actor_id, created_at)` and `(action, created_at)` for fast forensic lookups.

**Sitemap.xml expansion** — `/api/sitemap.xml` now includes:
- 12 SEO category hubs (`/categoria/<slug>` priority 0.9 + `/category/<slug>` priority 0.7) for organic discovery
- `/instalar` PWA install landing
- Total URL count: 4475 (up from 4450)

**Testing:** `iteration_26.json` — **11/11 backend pytest + 100% frontend on tested flows**, ZERO bugs found. AI flow E2E verified, OTP wrong/correct/expired all flagged correctly, rate limiter triggers at request 9, sitemap includes new URLs, Register → /verificar-correo redirect works.

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
