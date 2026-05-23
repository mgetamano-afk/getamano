# 🚀 getamano · Resumen Ejecutivo + Checklist Go-Live
*Actualizado: Feb 24, 2026 · Tras iteraciones 44–46*

---

## 📊 PARTE 1 — Resumen del proyecto hasta hoy

### 🎯 Qué es getamano
Marketplace web bilingüe (ES/EN) que conecta a la comunidad latina en USA con proveedores verificados. **PWA instalable** en iOS/Android, sin pasar por App Store ni Google Play (ahorra 30 % de fees).

### 🏗️ Arquitectura
- **Frontend:** React 19 + Tailwind + Shadcn + Lucide/Tabler icons · React Helmet (SEO) · i18n (ES/EN, persistido en `localStorage`).
- **Backend:** FastAPI + Motor (Mongo async) + JWT cookie httpOnly + bcrypt + rate-limit middleware + audit log.
- **DB:** MongoDB (única instancia, ~35 colecciones). Índices únicos / TTL bien definidos.
- **PWA:** manifest + service-worker + 3 capturas precargadas + InstallAppModal que detecta device.
- **Refactor backend (iter 44):** monolito `server.py` reducido 22 % extrayendo `routes/auth.py`, `routes/community.py`, `routes/search.py`, `routes/jobs.py`, `routes/seo.py`. Más mantenible, más rápido de iterar.

### 🧱 4 Zonas (todas funcionales)
| Zona | Ruta | Estado |
|---|---|---|
| 1. Landing pública | `/` | ✅ Hero, búsqueda, categorías visuales, reel de video, founding counter, FAQ, footer legal · **Ticker en vivo** + **Exit-intent popup** |
| 2. Cliente | `/buscar`, `/services/:slug`, `/p/:slug` | ✅ Filtros, mapa con proximidad, citas, cotizaciones, reseñas, favoritos, mensajería |
| 3. Proveedor | `/dashboard/provider`, `/provider/onboarding` | ✅ 6 tabs (Perfil · Galería · Solicitudes · Mensajes · Tarifas · Mi diario · Citas) + Pulse semanal + Streaks + Badges + Referrals + Asistente IA · **Share Stats viral** |
| 4. Admin Console | `/admin/*` | ✅ Resumen + CEO Dashboard + **Leads Inbox** + Cola de verificación + Catálogo + Reseñas + Reportes bidireccionales + Audit log + Pricing intelligence |

### 🆕 Features añadidas en las últimas iteraciones

#### Iter 44 — Refactor + Code quality
- Backend modularizado en 5 routers separados (search, jobs, seo, auth, community).
- `search_providers` refactorizada de complejidad 27 a ≤5 por helper.
- `get_current_user` partida en 3 helpers (jwt vs session token).
- Coverage de type hints subió ~3× en los módulos nuevos.

#### Iter 44b — LiveActivityTicker
- Strip "EN VIVO" debajo del hero con texto bilingüe rotando cada 60s.
- Lee `/api/activity-feed` (nuevos proveedores + reseñas recientes).
- Cada item es link clickeable a la eCard correspondiente.
- Fallback evergreen para que nunca se vea vacío.

#### Iter 44c — Browser Push Opt-In
- Card sutil abajo-derecha que pide permiso de notificaciones tras 20s + scroll > 600px.
- Polling client-side a `/activity-feed` cada 90s; dispara `Notification` nativa cuando hay novedad.
- Click en notificación abre la eCard nueva.
- Dismiss persistido 30 días.
- **Limitación**: solo funciona con la pestaña abierta. Service Worker + Web Push para tab-closed = ~3h adicionales cuando lo decidamos.

#### Iter 45 — Lead Inbox (Exit-Intent → SMS/WhatsApp)
- **Popup exit-intent** en landing: dispara con mouseleave-top (desktop) o 60s idle (mobile).
- Captura: nombre + teléfono + ciudad + servicio + **canal preferido** (SMS o WhatsApp) + idioma.
- **`/admin/leads`** Inbox con KPIs (Pendientes / Contactados / Convertidos / Perdidos).
- Cada lead trae **2 botones**: WhatsApp (`wa.me`) y SMS (deep link `sms:` que abre app nativa iOS/Android).
- **Mensaje pre-llenado** server-side en el idioma del lead.
- Click en cualquier botón → auto-marca como "contactado" + abre la app nativa.
- 24h dedupe con merge: si el lead reenvía con info actualizada, se conserva la nueva.
- **No requiere Twilio**. Funciona 100 % manual con deep links. Cuando llegue Twilio → flip switch para automatizar.

#### Iter 46 — Viral Share Tracking
- `ShareLinkCard` ya genera enlaces con `?ref={slug}`.
- **Cada click** (WhatsApp/Email/QR/Native/Copy) registra evento en `share_events`.
- Cuando alguien abre `/p/{slug}?ref=X` → suma a `referred_view_count` del referrer X. Dedupe IP+24h via TTL collection.
- **Nuevo card en dashboard del proveedor:** "Tu impacto al compartir" muestra:
  - Veces que compartiste
  - Visitas vía tus shares
  - Multiplicador viral (1.5x significa que cada share te trajo 1.5 visitas)
  - Breakdown por canal
- Performance contract cumplido: 0 queries adicionales en GET /me (counters denormalizados).

### 🎁 Features destacadas (carryover de iteraciones previas)
- eCard pública rediseñada · Búsqueda inteligente con 35+ sinónimos · Hubs SEO con copy ES/EN · Sitemap dinámico 4500+ URLs · Job Board "Chambas" · Comunidad social con leaderboards mensuales · Gamificación Duolingo-style · Email OTP · Suscripciones FTC-compliant · Onboarding IA (Claude Haiku 4.5) · Calendario y citas · Reportes bidireccionales · Programa referidos · Notificaciones inteligentes · Daily Brief CEO · Data Flywheel.

### 📈 Estado de testing
- **Iter 44** (refactor): 38/38 pytest PASS
- **Iter 45** (Lead Inbox): 20/20 pytest PASS · Frontend 100 %
- **Iter 46** (Viral Share): 17/17 pytest PASS · Frontend 100 %
- **Cero regresiones críticas conocidas.**

### 🧰 Stack & costos fijos actuales
| Servicio | Estado actual | Costo |
|---|---|---|
| MongoDB | Local en pod / Atlas en prod | Atlas M0 free → M10 ~$57/mes en escala |
| FastAPI + React | Hospedaje Emergent | Incluido en suscripción Emergent |
| Emergent LLM Key (Claude Haiku 4.5) | Activo, dev | Pay-as-you-go |
| Google Cloud (Geocoding + Maps + Places) | Activo con `GOOGLE_API_KEY` | Tier gratis cubre <$200/mes hasta MVP |

---

## 🎯 PARTE 2 — Tu lista de tareas como CEO (acción inmediata)

### ✅ Lo que YA puedes hacer SIN esperar nada externo

#### A. Probar el sistema completo (15 min — esta semana)
1. **Verificar Lead Inbox**
   - Abre `/` en una pestaña incógnito → espera 60s o mueve mouse al borde superior → completa el popup → ve a `/admin/leads` → debe aparecer tu lead.
   - Haz click en "WhatsApp" → verifica que abre WhatsApp con mensaje pre-llenado.
   - Haz click en "SMS" → verifica que abre la app de Mensajes nativa con el mensaje listo.

2. **Verificar tu Share Tracking** (con María, tu primera proveedora)
   - Login como María (`demo.provider@getamano.com / provider123`).
   - Dashboard → card "Comparte tu eCard" → click "WhatsApp" → te abre WhatsApp con el link `?ref=maria-...`.
   - Comparte tú mismo el link a un amigo (o ábrelo en incógnito).
   - Vuelve al dashboard → el card "Tu impacto al compartir" debe mostrar +1 visita.

3. **Verificar el Push Opt-In** (en navegador real, no incógnito)
   - Espera 20s en `/` + scroll → debe aparecer el card abajo-derecha.
   - Click "Activar" → acepta el permiso del navegador → ya estás recibiendo pings cuando hay novedad.

4. **Verificar el Ticker en Vivo**
   - En `/`, debajo del hero, hay un strip oscuro con badge "EN VIVO" + items rotando.
   - Click en cualquier item te lleva a la eCard correspondiente.

#### B. Generar movimiento real desde el día 1 (esta semana)
1. **Onboarding manual de los 15 proveedores del bulk upload**
   - Ve a `/admin/ops` → ya están todos creados como cuentas.
   - **TU tarea**: contactarlos uno por uno (WhatsApp/llamada) y guiarlos a completar su perfil. El backend ya les mandó credenciales de invitación; verifica en `/admin/latency` cuántos no han logueado todavía.
   - **Meta inicial**: convertir 7/15 a "activos con perfil 80 %+ completo" en 2 semanas.

2. **Hacer 10 shares manuales con María (el primer caso viral)**
   - Como María, abre el dashboard → comparte por WhatsApp a 10 grupos/contactos relevantes (vecindario, asociación latina, iglesia, etc.).
   - Mira el card "Tu impacto al compartir" subir.
   - **Esto es tu primera evidencia de tracción** que puedes mostrarle a otros proveedores: "María consiguió X visitas en una semana solo compartiendo".

3. **Trabajar los leads del Inbox**
   - Cada lead que entre al `/admin/leads` debes contactarlo idealmente en <2h (mejor open-rate). Usa los botones nativos para no perder tiempo en escribir.
   - **Cierra el ciclo**: marca cada uno como `Contactado → Convertido / Perdido` para tener métrica real de conversión.

#### C. Marketing / SEO inmediato
1. **Conectar Google Search Console** con `getamano.us` (gratis) → submit sitemap `https://getamano.us/sitemap.xml`.
2. **Subir a Google My Business** una ficha de getamano (gratis) — aparece en búsquedas locales.
3. **Crear cuenta en Instagram + TikTok** del marketplace y empezar a publicar las eCards de proveedores como contenido.

---

## 🚨 PARTE 3 — Checklist de APIs/Servicios para el Go-Live

> Organizado por **prioridad de bloqueo**. Lo rojo es necesario para cobrar y notificar a clientes reales. Amarillo es nice-to-have antes del lanzamiento. Verde puede ir después.

---

### 🔴 P0 — Bloqueadores reales para lanzar

#### 1. 💳 **Stripe (cobros de suscripciones)**
- **Por qué:** los proveedores ya pueden elegir plan en `/plans`, pero no se les cobra. Sin Stripe, el negocio no factura.
- **Tu tarea:**
  - Cuenta Stripe en modo **live** (https://dashboard.stripe.com → activar).
  - Verificar entidad legal (LLC / EIN). Stripe pide W-9 si es US.
  - Crear 4 productos con precios:
    - Free $0 · Basic $9/mes · $90/año · Pro $19/mes · $190/año · Premium $49/mes · $490/año
- **Lo que me das:** `STRIPE_SECRET_KEY` (sk_live_…) + `STRIPE_WEBHOOK_SECRET` (whsec_…) + IDs de los 4 productos.
- **Costo:** 2.9 % + $0.30 por transacción (sin mensualidad).
- **Tiempo de activación:** 1–2 días (Stripe revisa la cuenta).

#### 2. 📧 **Resend (emails transaccionales)**
- **Por qué:** El OTP de registro hoy **NO se envía**, sólo queda en logs. Sin Resend, los usuarios reales no pueden verificar correo.
- **Tu tarea:**
  - Registro en https://resend.com
  - **Verificar el dominio `getamano.us`** (3 registros DNS: SPF + DKIM + DMARC).
  - Crear API key.
- **Lo que me das:** `RESEND_API_KEY` (re_…) + `SENDER_EMAIL` (ej. `onboarding@getamano.us`).
- **Costo:** **gratis hasta 3 000 emails/mes**, $20/mes hasta 50 000.
- **Tiempo:** ~30 min si tienes acceso al DNS.

#### 3. 📱 **Twilio (SMS automatizado)**
- **Por qué:** Por ahora el Lead Inbox usa deep links nativos (tú mandas el SMS manualmente). Cuando tengas volumen (>30 leads/día) querrás automatizar.
- **Tu tarea:**
  - Cuenta Twilio (https://twilio.com).
  - Comprar un número con capacidad SMS US (~$1/mes).
  - **Registrar un brand 10DLC** (obligatorio en USA — Twilio te lleva por wizard, 3–7 días).
- **Lo que me das:** `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` (+1xxx).
- **Costo:** $0.0079 por SMS US + $1/mes número + $4 registro 10DLC.
- **Tiempo:** 3–7 días (por el 10DLC).
- **NOTA**: El Lead Inbox funciona perfecto sin esto. Twilio es para escalar.

#### 4. ☁️ **Google Cloud — habilitar 2 APIs (URGENTE: 2 minutos)**
- **Por qué:** Ya tienes `GOOGLE_API_KEY`, pero **Cloud Translation API y Cloud Vision API devuelven 403**.
- **Tu tarea:** Ve a https://console.cloud.google.com/apis/library y **Enable**:
  1. **Cloud Translation API**
  2. **Cloud Vision API**
  (Usas la misma key que ya tienes — no necesitas crear nueva.)
- **Costo:** Translation $20 por 1M caracteres · Vision $1.50 por 1k imágenes. Free tier cubre el MVP.
- **Tiempo:** 2 minutos.

---

### 🟡 P1 — Importantes pero no bloquean lanzamiento

#### 5. 🌐 **DNS / Dominio `getamano.us`**
- Apuntar el A record / CNAME al deployment de Emergent.
- Configurar SSL (Emergent lo gestiona automático).
- Registrar `www.getamano.us` + redirect a apex.

#### 6. 📊 **GA4 (Google Analytics)**
- Crear propiedad GA4 en https://analytics.google.com
- Copiarme el **Measurement ID** (`G-XXXXXXXXXX`).
- Lo pongo en `REACT_APP_GA4_MEASUREMENT_ID` y se activan automáticamente los 8 eventos ya implementados.
- **Costo:** gratis.

#### 7. 📈 **PostHog (opcional, product analytics)**
- Heatmaps + funnels + session replays.
- Plan gratis hasta 1M eventos/mes.
- `REACT_APP_POSTHOG_KEY` + `REACT_APP_POSTHOG_HOST`.

#### 8. 🔔 **Web Push real (Service Worker + VAPID)**
- El opt-in que ya construimos solo trabaja con pestaña abierta. Para notificaciones con pestaña cerrada (estilo Twitter/Instagram) necesita Service Worker + VAPID + endpoint de subscription en backend.
- Si me lo pides, ~3h de trabajo.

---

### 🟢 P2 — Después del lanzamiento

| # | Servicio | Cuándo |
|---|---|---|
| 9 | Mapbox / Google Maps JS embebido (visual más pulido) | Si la tracción lo justifica |
| 10 | Cloudinary CDN para imágenes | Cuando el tráfico crezca |
| 11 | WhatsApp Business API oficial (plantillas, 1-2 sem aprobación Meta) | Para outreach masivo |
| 12 | Slack/Discord webhook para alertas internas | Cuando tengas equipo |

---

## 📋 Resumen accionable

| # | Servicio | Bloqueador? | Tiempo activación | Costo MVP |
|---|---|---|---|---|
| 1 | Stripe | 🔴 Sí | 1-2 días | 2.9 % + $0.30 / tx |
| 2 | Resend | 🔴 Sí | 30 min | Free |
| 3 | Twilio | 🟡 No urgente (deep links cubren v1) | 3-7 días (10DLC) | ~$5/mes |
| 4 | GCP Translation+Vision | 🔴 Sí | 2 min | Free tier |
| 5 | DNS getamano.us | 🟡 | 1 hora | Ya tienes dominio |
| 6 | GA4 | 🟡 | 10 min | Free |

**Orden recomendado:**
1. **Hoy (2 min)**: Habilita las 2 APIs de Google Cloud → desbloquea traducción + OCR.
2. **Esta semana**: Empieza activación Stripe + Resend en paralelo + arregla DNS.
3. **Mientras tanto**: Trabaja el Lead Inbox manualmente, onboardea a tus 15 proveedores del bulk upload, mide tracción real.
4. **Próximas 2 semanas**: Cuando Stripe + Resend estén live → primer mes de facturación real.

### 🔐 Cuando tengas las llaves, mándamelas así:
```
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
RESEND_API_KEY=re_xxxxx
SENDER_EMAIL=onboarding@getamano.us
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_FROM_NUMBER=+1xxxxx
REACT_APP_GA4_MEASUREMENT_ID=G-xxxxx
```

Las pongo en `/app/backend/.env` y `/app/frontend/.env`, reinicio servicios y todas las integraciones quedan **live** sin tocar más código.

---

## 🔥 PARTE 4 — Roadmap producto pendiente (cuando me lo digas)

### P0 técnico (deuda de código)
- Continuar refactor de `server.py` (sigue en ~8700 líneas) → extraer `routes/admin.py`, `routes/notifications.py`, `routes/messaging.py`, `routes/subscriptions.py`.
- Aumentar type-hint coverage en el server.py legacy.

### P1 features de crecimiento (sugerencias)
1. **Reward redemption sobre el share tracking** — "10 shares con 5 visitas referidas = 1 mes Pro gratis". Counters ya existen, son ~50 líneas.
2. **Service Worker + Web Push real** — notificaciones con pestaña cerrada (3h).
3. **Quiz funnel mejorado** — el `/api/quiz/recover` existe pero el funnel UI está subexplotado.
4. **WhatsApp Business API** vía Twilio (cuando aprueben 10DLC) — automatización del Lead Inbox.
5. **Páginas legales públicas** — Términos, Privacidad, Cookies (probablemente ya parciales, revisar).
6. **Email digest semanal a clientes** — "5 nuevos proveedores en tu ciudad" cuando Resend esté live.

### P2 features de retención
1. **Provider achievements + rewards expansion** — más badges, más milestones celebratorios.
2. **Sistema de recomendaciones cliente-a-cliente** — "Mi vecina te recomienda este plomero".
3. **Verificación premium con video selfie** — sello "Verificado Plus".

---

*Documento generado para el CEO de getamano. Cualquier duda, pídelo y lo expando.*
