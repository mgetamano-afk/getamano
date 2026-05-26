# Getamano — Agente de Adquisición IA: Plan Técnico Completo
**Co-founder Jah — Latin Ventures LLC**
**Fecha:** 24 de mayo 2026
**Estado:** 📋 ROADMAP — Implementación diferida (P2, requiere stack externo)

> **Decisión arquitectónica:** Este sistema es de muy alto valor (160 proveedores/mes, $1.6K MRR) pero requiere stack externo (Apify + n8n + Claude API directa + Instantly.ai) que NO está dentro del scope del backend FastAPI actual. Se implementará como microservicio paralelo cuando se decida.

---

## RESUMEN EJECUTIVO

**Meta:** 2,000 leads procesados/semana → 160+ nuevos proveedores activos/mes → $1,600–$4,000 MRR incremental solo de este agente.

**Principio fundamental:** El agente prepara, el humano aprueba, el sistema envía. No es un bot. Es un asistente de ventas IA que trabaja 24/7.

---

## ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────┐
│ GETAMANO ACQUISITION AGENT                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ MÓDULO 1     │  │ MÓDULO 2     │  │ MÓDULO 3         │    │
│  │ Lead Finder  │─▶│ Message Gen  │─▶│ Content Creator  │    │
│  │ Google Maps  │  │ Claude API   │  │ TikTok/IG posts  │    │
│  └──────────────┘  └──────────────┘  └──────────────────┘    │
│         │                  │                  │                │
│         ▼                  ▼                  ▼                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ MONGODB (getamano) — CRM CENTRAL                         │ │
│  │ collection: leads | outreach_log | provider_content_queue │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ORQUESTADOR: n8n (self-hosted en Railway $5/mes)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## MÓDULO 1 — BUSCADOR DE LEADS

### Fuentes (todas legales y públicas)
- **Google Maps Places API**: $0.017/request → $34/mes para 2000 búsquedas
- **Apify Google Maps Scraper** ($49/mes): incluye emails que Maps no da

### Categorías prioritarias (Top 10)
1. Limpieza de hogares (200–500 negocios/ciudad)
2. Plomería (100–300)
3. Pintura (150–400)
4. Jardinería (200–600)
5. Electricidad (80–200)
6. Cuidado de niños (100–250)
7. Mudanzas (50–150)
8. Carpintería (60–150)
9. Pastelería/Catering (150–400)
10. Belleza/Estilismo (300–800)

### Ciudades objetivo (orden de prioridad)
1. **Houston, TX** — 2.3M latinos (44%) — LAUNCH CITY
2. **Dallas/Fort Worth, TX** — 1.4M latinos — LAUNCH CITY
3. **Miami, FL** — 1.1M latinos — LAUNCH CITY
4. **San Antonio, TX** — 1.4M latinos (65%)
5. **Los Angeles, CA** — 4.9M latinos
6. **Chicago, IL** — 800K latinos
7. **Phoenix, AZ** — 700K latinos
8. **New York, NY** — 2.4M latinos

### Schema Mongo `leads` (adaptado de Supabase)
```python
{
  "lead_id": "lead_xxxxx",
  "business_name": str,
  "owner_name": str | None,
  "phone": str | None,
  "email": str | None,
  "website": str | None,
  "address": str,
  "city": str,  # indexed
  "state": str,
  "zip_code": str | None,
  "category": str,  # indexed
  "google_rating": float | None,
  "google_reviews_count": int,
  "google_maps_url": str,
  "has_website": bool,
  "has_facebook": bool,
  "has_instagram": bool,
  # Pipeline state
  "status": "new" | "message_generated" | "sent" | "replied"
            | "interested" | "registered" | "not_interested"
            | "bounced" | "do_not_contact",
  "outreach_channel": "email" | "whatsapp" | "manual" | None,
  "message_generated": str | None,
  "message_sent_at": datetime | None,
  "reply_received_at": datetime | None,
  "reply_content": str | None,
  # Scoring (0-100 by Claude)
  "score": int,
  "score_reasons": str,
  # Conversion
  "provider_id": str | None,  # user_id when converted
  "converted_at": datetime | None,
  # Meta
  "source": "google_maps" | "yelp" | "apify" | "manual",
  "created_at": datetime,
  "updated_at": datetime,
}
```

---

## MÓDULO 2 — GENERADOR DE MENSAJES (Claude API)

### System prompt (tono latino, no corporativo)
```
Eres el agente de ventas de Getamano, marketplace de servicios latinos en USA.

REGLAS:
1. Tono cálido, latino, paisano a paisano — no corporativo
2. Menciona el nombre del negocio y algo específico (calificación, ciudad)
3. Beneficio principal en 1-2 líneas, sin lista de features
4. CTA claro: "¿Te mando más info?"
5. Máximo 150 palabras
6. Español con algunas frases en inglés si es natural
7. Firma: "Eloy de Getamano"
8. NO menciones precios en el primer mensaje
9. Máximo 2 emojis

OUTPUT: JSON con {subject, message, channel_recommendation, score, score_reason}
```

### Lógica de priorización
- score ≥ 70 → contactar en 24h (high_priority)
- score 40–70 → contactar en 72h (normal)
- score < 40 → contactar en 2 semanas (low_priority)

---

## MÓDULO 3 — CONTENIDO SEMANAL PARA PROVEEDORES

Cada lunes 8am, el agente genera para cada proveedor activo:
- **TikTok script** (hook + body + CTA + hashtags + duración)
- **Instagram caption** (texto + hashtags + best time to post)
- **WhatsApp status** (700 chars max)
- **Facebook post** (largo)

Tema rotativo por semana (primavera limpieza, otoño preparación invierno, etc.)

Collection nueva: `provider_content_queue` con `provider_id`, `week_of`, los 4 contenidos JSON.

---

## MÓDULO 4 — MONITOR GRUPOS FACEBOOK

Cada 2h, Apify scrapea grupos PÚBLICOS latinos y Claude Haiku clasifica posts:

```
Post detectado → "Busco plomero confiable Houston" →
  Claude: { is_service_request: true, category: "plomería", urgency: "alta" } →
  Match con proveedor activo en Houston/plomería →
  Push WhatsApp/email al proveedor:
  "🔔 Oportunidad nueva en Houston — alguien busca plomero ahora"
```

**SOLO grupos públicos**. Grupos privados requieren membership + permiso.

Collection: `community_opportunities` con `source_group`, `post_text`, `service_category`, `notified_provider_id`.

---

## STACK Y COSTOS

| Servicio | Función | Costo/mes |
|---|---|---|
| Claude Sonnet 4.5 | Generación mensajes | $40–80 |
| Claude Haiku 4.5 | Clasificación FB posts | $5–10 |
| Google Maps Places API | Búsqueda negocios | $30–50 |
| Apify | Scraping Maps + FB | $49 |
| n8n self-hosted (Railway) | Orquestador | $5 |
| Instantly.ai | Secuencias email | $37 |
| WhatsApp Business API | Mensajes opt-in | $30 |
| MongoDB | Ya tienes | $0 |

**Total: $196–261/mes** · **ROI**: 21 conversiones (plan $10/mes) ya paga el agente.

### Stack mínimo viable: ~$70/mes
- n8n self-hosted en Railway $5
- Claude API con batching (–60% costo)
- Apify $49 incluye Maps (omitir Google Maps API directa)
- Resend.com en lugar de Instantly (gratis hasta 3000 emails/mes)

---

## CUMPLIMIENTO LEGAL

### ✅ Lo que SÍ es legal y seguro
- Scraping datos públicos Google Maps con API
- Emails CAN-SPAM compliant (nombre real, dirección física, unsubscribe link)
- WhatsApp Business API con opt-in
- Monitoreo grupos PÚBLICOS Facebook
- Generación contenido IA para uso del proveedor

### ❌ Lo que NO se debe hacer
- Bots que envíen DMs automáticos Instagram/TikTok/Facebook
- Emails masivos sin unsubscribe
- Scraping grupos privados sin membership
- Compra de listas de emails (spam)

### Texto legal en cada email
```
Este email fue enviado porque tu negocio aparece en Google Maps
como empresa establecida en [ciudad]. Si no deseas recibir más
información de Getamano, haz clic aquí para darte de baja.

Latin Ventures LLC | Houston, TX
getamano.com | e.tiangix@gmail.com
```

---

## ROADMAP DE IMPLEMENTACIÓN (8 semanas)

### Fase 1 — MVP (Semanas 1-2)
- Crear collection `leads` en MongoDB
- Configurar Apify + primer scrape Houston (limpieza + plomería)
- Integrar Claude API en n8n
- Configurar Resend.com (gratis hasta 3000/mes)
- Primer lote 100 emails manual, medir respuestas

### Fase 2 — Automatización (Semanas 3-4)
- Flujo n8n completo automatizado (búsqueda → mensaje → envío → log)
- Follow-up automático días 3 y 7
- Dashboard métricas en /admin
- Landing /unete con tracking lead_id

### Fase 3 — Contenido (Semana 5)
- Collection `provider_content_queue`
- Generación lunes 8am
- Panel "Mi Contenido" en dashboard proveedor

### Fase 4 — Monitor FB (Semana 6)
- Lista grupos públicos por ciudad
- Apify actor cada 2h
- Notificaciones push al proveedor
- Collection `community_opportunities`

### Fase 5 — Optimización (Semanas 7-8)
- A/B testing mensajes
- Ampliar Dallas + Miami
- WhatsApp Business API
- Scoring dinámico basado en resultados

---

## KPIs

| KPI | Meta semana 4 | Meta mes 3 |
|---|---|---|
| Leads/semana | 500 | 2,000 |
| Mensajes/semana | 200 | 800 |
| Tasa respuesta | 8% | 15% |
| Conversión a proveedor | 5% | 10% |
| Proveedores nuevos/mes | 40 | 160 |
| MRR incremental | $400 | $1,600 |
| Costo por proveedor adquirido | $7 | $1.75 |

---

## INTEGRACIÓN CON GETAMANO EXISTENTE

Cuando se implemente:
1. **Tres collections nuevas en MongoDB**: `leads`, `outreach_log`, `provider_content_queue`, `community_opportunities`
2. **Dashboard de métricas en `/admin/ops` → nuevo tab "Agente de Adquisición"**:
   - Leads encontrados / mensajes enviados / replies / proveedores nuevos / MRR / top ciudades + categorías
3. **Endpoint en backend FastAPI** `/api/admin/leads-acquired` (público para n8n con API key)
4. **Landing `/unete?ref=agente&lead_id=xxx`** con registro simplificado de 3 campos + 30 días gratis sin tarjeta

## PRÓXIMOS PASOS INMEDIATOS (cuando se decida arrancar)

1. **Día 1**: Crear cuenta Apify ($49) + cuenta Anthropic Claude API
2. **Día 2-3**: Crear collection `leads` en MongoDB + endpoints CRUD
3. **Día 4**: Instalar n8n en Railway ($5) + primer workflow
4. **Día 5-7**: Primer lote de 100 leads Houston manual, medir
5. **Semana 2**: Automatización completa + dashboard métricas

---

*Plan técnico Agente de Adquisición Getamano*
*Co-founder Jah — Latin Ventures LLC · 24 mayo 2026*
*Stored as roadmap reference — implementation deferred to P2*
