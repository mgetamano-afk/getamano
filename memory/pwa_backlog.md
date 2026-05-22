# PWA Backlog — getamano

## ✅ Shipped (May 22, 2026 — Iteration 21)
- `manifest.json` con 12 icons + 3 shortcuts (Buscar / Mi panel / Mensajes)
- `service-worker.js` con caching strategies (network-first HTML, cache-first images, never API)
- `InstallPrompt` component bilingüe (ES/EN) con detección Android (auto via beforeinstallprompt) + iOS (manual)
- Apple PWA meta tags completos (apple-touch-icon 120/152/167/180, status-bar-style)
- Open Graph + Twitter card meta tags para shareable previews
- 14-day dismiss cooldown via localStorage
- Hidden en /admin/* (no molestar al admin)
- 20/20 backend pytest passing tras integración

## 📋 Próximos sprints (P2 — sin urgencia)

### Modernización Google Maps Places API
- **Issue**: `google.maps.places.Autocomplete` está deprecated desde Marzo 2025
- **Migration**: usar `PlaceAutocompleteElement` (Web Component nativo)
- **Archivo afectado**: `/app/frontend/src/components/CityAutocomplete.jsx`
- **Tiempo**: ~2 horas
- **Bloqueador**: ninguno (la versión vieja sigue funcionando, sin alarma de Google todavía)

### iOS InstallPrompt — re-check cooldown on visibility change
- **Issue**: si el usuario dismissa, el flag de cooldown solo se lee en mount
- **Fix**: agregar `visibilitychange` listener que re-evalúe `isInCooldown()`
- **Tiempo**: ~10 min
- **Prioridad**: BAJA (caso edge, comportamiento actual aceptable para MVP)

### Push notifications (web) — Phase 2
- **Requiere**: Firebase Cloud Messaging o Web Push API + VAPID keys
- **Costo**: free hasta 1M notifs/mes en FCM
- **Casos de uso**:
  - Cliente recibe confirmación cuando proveedor confirma reserva
  - Proveedor recibe notif cuando entra mensaje nuevo
  - Recordatorio 24h antes de cita
- **Tiempo**: ~3 días de trabajo backend + frontend
- **Bloqueador**: necesita keys VAPID (yo te las genero)

### Offline-first improvements
- **Hoy**: cache-first para imágenes, app shell para HTML
- **Mejoras posibles**:
  - Outbox pattern para mensajes enviados sin red (queue + retry)
  - IndexedDB para conversaciones del Inbox (lectura offline)
  - Background sync para reportes/likes en cola
- **Bloqueador**: usuarios reportando problemas de red (no es problema hoy)

## 🔮 Path 2: Native React Native + Expo (cuando haya tracción)

**Trigger para empezar**: 100+ usuarios activos mensuales en la PWA + revenue >$500/mes

### Pre-requisitos del usuario
- $99 Apple Developer (recurrente)
- $25 Google Play Console (una vez)
- Mac o cuenta EAS Build cloud Mac ($99/año)

### Plan técnico
1. **Semana 1**: setup Expo + autenticación + lib/api migración
2. **Semana 2**: páginas Landing + Search + ProviderECard
3. **Semana 3**: Inbox + Booking + Notifications nativas
4. **Semana 4**: ProviderDashboard + assets stores + submit

### Decisiones críticas para esa fase
- **Stripe in-app**: NO (apple takes 30%) — solo dirigir a web para suscripciones
- **Push**: usar Expo Push (gratis hasta 10K usuarios) en vez de FCM directo
- **Mapas**: react-native-maps en vez de Leaflet
- **Geolocalización**: expo-location (más confiable que browser)

### Reuso de código
- 100% del backend (FastAPI no cambia)
- 95% lógica/state (Zustand/Context idéntico)
- 60% componentes (necesita re-skin con react-native primitives)
- 0% Tailwind classes (no funcionan en RN — usar styled-components o nativewind)
