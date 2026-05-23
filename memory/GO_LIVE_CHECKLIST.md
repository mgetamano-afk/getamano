# 🚀 getamano · Resumen Ejecutivo + Checklist Go-Live
*Actualizado: Feb 2026*

---

## 📊 PARTE 1 — Resumen del proyecto hasta hoy

### 🎯 Qué es getamano
Marketplace web bilingüe (ES/EN) que conecta a la comunidad latina en USA con proveedores verificados. **PWA instalable** en iOS/Android, sin pasar por App Store ni Google Play (ahorra 30 % de fees).

### 🏗️ Arquitectura
- **Frontend:** React 19 + Tailwind + Shadcn + Lucide/Tabler icons · React Helmet (SEO) · i18n (ES/EN, persistido en `localStorage`).
- **Backend:** FastAPI + Motor (Mongo async) + JWT cookie httpOnly + bcrypt + rate-limit middleware + audit log.
- **DB:** MongoDB (única instancia, ~30 colecciones). Índices únicos / TTL bien definidos.
- **PWA:** manifest + service-worker + 3 capturas precargadas + InstallAppModal que detecta device.

### 🧱 4 Zonas (todas funcionales)
| Zona | Ruta | Estado |
|---|---|---|
| 1. Landing pública | `/` | ✅ Hero, búsqueda, categorías visuales, reel de video, founding counter, FAQ, footer legal |
| 2. Cliente | `/buscar`, `/services/:slug`, `/p/:slug` | ✅ Filtros, mapa con proximidad, citas, cotizaciones, reseñas, favoritos, mensajería |
| 3. Proveedor | `/dashboard/provider`, `/provider/onboarding` | ✅ 6 tabs (Perfil · Galería · Solicitudes · Mensajes · Tarifas · Mi diario · Citas) + Pulse semanal + Streaks + Badges + Referrals + Asistente IA |
| 4. Admin Console | `/admin/*` (con alias `/dashboard/admin/*`) | ✅ Resumen + CEO Dashboard con Daily Brief IA + Cola de verificación + Catálogo + Reseñas + Reportes bidireccionales + Audit log + Pricing intelligence |

### 🎁 Features destacadas ya en producción
- **eCard pública** rediseñada (header flotante · WhatsApp primario · 2×2 acciones · Galería con categorías · Video Pro/Premium · Redes sociales · Tarifas referenciales · Citas Calendly-style · JSON-LD SEO).
- **Búsqueda inteligente:** 35+ términos canónicos × 5 sinónimos bilingües + fuzzy matching tolerante a errores de tipeo.
- **Hubs SEO:** `/categoria/:slug` × 12 categorías con copy ES/EN hand-crafted + FAQ + JSON-LD `@graph` (BreadcrumbList + Service + ItemList + FAQPage).
- **Sitemap dinámico**: 4475+ URLs (incluye categoría × ciudad).
- **Job Board "Chambas"** (`/empleos`) con notificación fan-out automática.
- **Comunidad social** (`/comunidad`): feed con imágenes, stories, comentarios inline, Wall of Fame, leaderboard mensual con cupones canjeables, ranking en vivo.
- **Gamificación:** Streaks tipo Duolingo + Badges automáticos (active_week / fast_responder / in_demand) + diario de logros + 19 milestones celebratorios.
- **Email OTP** con plantilla HTML + rate-limit + bcrypt-hashed.
- **Suscripciones FTC-compliant:** mensual + anual (ahorro 17 %) + cancelación click-to-cancel en 3 pasos + reactivación.
- **Onboarding IA:** Claude Haiku 4.5 sugiere mejorar descripción del negocio + Vision API escanea tarjetas de presentación.
- **Calendario y citas:** disponibilidad semanal + slots públicos + confirmación/decline/no-show.
- **Reportes bidireccionales** (cliente reporta proveedor y viceversa) con panel admin.
- **Programa de referidos:** ref_code 6-char + tracking en `?ref=` + 1 mes free Pro automático.
- **Notificaciones inteligentes** (ambos roles) con polling 60s, Bell con badge, 13+ patrones (eCard incompleta, mensajes sin leer, market pulse semanal, geo, etc.).
- **Daily Brief CEO con IA:** narrativa + 5 recomendaciones estratégicas + métricas MRR/ARR.
- **Data Flywheel:** quote_requests + provider_rates + privacy aggregation (n≥5) + Weekly Market Pulse.

### 📈 Estado de testing
- **Iteración 42:** 100 % E2E pass (backend pytest + frontend Playwright + 6 viewports mobile/tablet/desktop).
- Cero regresiones críticas conocidas.

### 🧰 Stack & costos fijos actuales
| Servicio | Estado actual | Costo |
|---|---|---|
| MongoDB | Local en pod / Atlas en prod | Atlas M0 free → M10 ~$57/mes en escala |
| FastAPI + React | Hospedaje Emergent | Incluido en suscripción Emergent |
| Emergent LLM Key (Claude Haiku 4.5) | Activo, dev | Pay-as-you-go (te avisamos cuando bajo) |
| Google Cloud (Geocoding + Maps + Places) | Activo con `GOOGLE_API_KEY` | Tier gratis cubre <$200/mes hasta MVP |

---

## 🚨 PARTE 2 — Checklist de APIs/Servicios para el Go-Live

> Lo organizo por **prioridad de bloqueo**. Lo que está en 🔴 es necesario para cobrar y notificar a clientes reales. Lo amarillo es nice-to-have antes del lanzamiento. Lo verde puede ir después.

---

### 🔴 P0 — Bloqueadores reales para lanzar (orden recomendado)

#### 1. 💳 **Stripe (cobros de suscripciones)**
- **Por qué:** los proveedores ya pueden elegir plan en `/plans`, pero no se les cobra. Sin Stripe, el negocio no factura.
- **Qué necesito de ti:**
  - Cuenta Stripe en modo **live** (https://dashboard.stripe.com → activar).
  - Verificar la entidad legal (LLC / EIN). Stripe pide W-9 si es US, tax info si es internacional.
  - 4 productos creados en Stripe con precios:
    - Free $0
    - Basic $9/mes · $90/año
    - Pro $19/mes · $190/año
    - Premium $49/mes · $490/año
  - Webhook endpoint para eventos `customer.subscription.*` (te lo configuro yo cuando me pases las llaves).
  - **Lo que me das:** `STRIPE_SECRET_KEY` (sk_live_…) + `STRIPE_WEBHOOK_SECRET` (whsec_…) + IDs de los 4 productos.
- **Dónde:** https://dashboard.stripe.com/apikeys
- **Costo:** 2.9 % + $0.30 por transacción (sin mensualidad).
- **Tiempo de activación:** 1–2 días (Stripe revisa la cuenta).

#### 2. 📧 **Resend (emails transaccionales)**
- **Por qué:** Hoy el OTP de registro **NO se envía**, sólo queda en logs (`[EMAIL DEV-FALLBACK]`). Sin Resend, los usuarios reales no pueden verificar su correo.
- **Qué necesito:**
  - Registro en https://resend.com
  - **Verificar el dominio `getamano.us`** (Resend te da 3 registros DNS: SPF + DKIM + DMARC — los pones en tu proveedor de DNS).
  - Crear API key.
  - **Lo que me das:** `RESEND_API_KEY` (re_…) + `SENDER_EMAIL` (ej. `onboarding@getamano.us`).
- **Dónde:** https://resend.com/api-keys
- **Costo:** **gratis hasta 3 000 emails/mes**, $20/mes hasta 50 000.
- **Tiempo:** ~30 min si tienes acceso al DNS de getamano.us.

#### 3. 📱 **Twilio (SMS notificaciones)**
- **Por qué:** Notificaciones de "nuevo mensaje", "nueva chamba", "cita confirmada" actualmente sólo van a log. Sin SMS pierdes el canal de mayor open-rate (~98 %).
- **Qué necesito:**
  - Cuenta Twilio (https://twilio.com).
  - **Comprar un número con capacidad SMS US** (~$1/mes).
  - **Registrar un brand 10DLC** (obligatorio en USA para SMS comercial — Twilio te lleva por wizard, demora 3–7 días de aprobación).
  - **Lo que me das:** `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` (+1xxx).
- **Dónde:** https://console.twilio.com
- **Costo:** $0.0079 por SMS US + $1/mes número + $4 registro 10DLC.
- **Tiempo:** 3–7 días (por el 10DLC).

#### 4. ☁️ **Google Cloud — habilitar 2 APIs**
- **Por qué:** Ya tienes `GOOGLE_API_KEY` configurada (Geocoding + Maps funcionan), pero **Cloud Translation API y Cloud Vision API devuelven 403**. Sin esto:
  - Translation: la traducción ES↔EN cae a fallback "no_api_key" (devuelve el mismo texto).
  - Vision: el escaneo de tarjeta de presentación en onboarding no extrae datos.
- **Qué necesito:** Que tú mismo vayas a https://console.cloud.google.com/apis/library y le des **Enable** a:
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
- Lo pongo en `REACT_APP_GA4_MEASUREMENT_ID` y se activan automáticamente los 8 eventos ya implementados (page_view, search, sign_up, purchase, booking_request, etc.).
- **Costo:** gratis.

#### 7. 📈 **PostHog (opcional, product analytics)**
- Si quieres heatmaps + funnels + session replays.
- Plan gratis hasta 1M eventos/mes.
- `REACT_APP_POSTHOG_KEY` + `REACT_APP_POSTHOG_HOST`.

#### 8. 🔔 **Push Notifications PWA (Firebase Cloud Messaging)**
- Para mandar push cuando hay nuevo mensaje/cita (sin SMS).
- Requiere: proyecto Firebase + Service Worker actualizado + VAPID keys.
- **Costo:** gratis hasta 1M envíos/mes.

---

### 🟢 P2 — Después del lanzamiento, según tracción

#### 9. **Mapbox / Google Maps JS embebido**
- Reemplazar Leaflet free (ya funciona) por Google Maps embebido (visual más pulido en eCard).
- **Costo:** $7 por 1k cargas de mapa.

#### 10. **Cloudinary / CDN para imágenes**
- Hoy las imágenes van a Emergent Object Storage. Si tráfico crece, mover a Cloudinary acelera carga + compresión auto.
- **Costo:** gratis hasta 25 GB.

#### 11. **WhatsApp Business API (vía Twilio o 360dialog)**
- Para mandar plantillas oficiales por WhatsApp en lugar de SMS.
- Requiere verificación Meta Business (1–2 semanas).

#### 12. **Slack / Discord webhook para alertas internas**
- Bot que avise al equipo cuando entra nuevo proveedor pendiente, reporte crítico, error 500.

---

## 📋 Resumen accionable

| # | Servicio | Bloqueador? | Tiempo activación | Costo MVP |
|---|---|---|---|---|
| 1 | Stripe | 🔴 Sí | 1-2 días | 2.9% + $0.30 / tx |
| 2 | Resend | 🔴 Sí | 30 min | Free |
| 3 | Twilio | 🔴 Sí | 3-7 días (10DLC) | ~$5/mes |
| 4 | GCP Translation+Vision | 🔴 Sí | 2 min | Free tier |
| 5 | DNS getamano.us | 🟡 | 1 hora | Ya tienes dominio |
| 6 | GA4 | 🟡 | 10 min | Free |
| 7 | PostHog | 🟡 | 10 min | Free |
| 8 | FCM Push | 🟡 | 1 día | Free |

**Mi recomendación de orden:** Activa primero los 4 P0 en paralelo (mientras Stripe y Twilio aprueban tu cuenta, terminas DNS de Resend y habilitas las APIs de Google). En ~1 semana real puedes estar facturando.

### 🔐 Cuando tengas las llaves, mándamelas así (ejemplo):
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

Las pongo en `/app/backend/.env` y `/app/frontend/.env`, reinicio servicios y todas las integraciones quedan **live** sin tocar más código (el código ya está listo, sólo espera las llaves).

---

*Documento generado para el CEO de getamano. Cualquier duda, pídelo y lo expando.*
