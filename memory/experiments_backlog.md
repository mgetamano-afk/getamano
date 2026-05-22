# Quiz Experiments Backlog

Estado actual del flywheel de optimización del PlanRecommender en `/planes`.

---

## ✅ Experimentos completados

### result_cta_v1 (Mayo 22, 2026)
- **Variant A (Control)**: "Elegir este plan" + banner "Enviarme mi resultado"
- **Variant B (Urgencia)**: "Empezar a recibir clientes hoy" + banner "Mándame mis 5 tips"
- **Estado**: Activo en producción — esperando datos reales (≥30 sesiones por variante)
- **Resultado seed**: B ganó con +28.6 pp en conversión end-to-end (validación del framework)

---

## 🚀 Shipping inmediato (sin A/B)

### testimonial_above_email_v1 (Mayo 22, 2026)
- **Acción**: Agregar 1 testimonial real (foto + nombre + ciudad + plan) entre el score pills y el email banner en la vista de resultado del quiz
- **Justificación**: Testimoniales convierten +20% en pricing pages. No requiere A/B porque el lift está bien establecido en literatura UX.
- **Implementado**: SÍ — ver `PlanRecommender.jsx` componente `<ResultTestimonial>`
- **Cuándo iterar**: cuando tengamos 5+ testimoniales reales de Founding Members, rotarlos aleatoriamente por carga

---

## 📋 Próximos experimentos (priorizados)

### 1. question_order_v1 — Orden de preguntas
- **Hipótesis**: Empezar con la pregunta más fácil ("¿Cuántas fotos compartes?") reduce abandono temprano (Q1→Q2). Calificadoras ("¿Inviertes en ads?") al final
- **Variant A**: orden actual (photos → leads → reach → growth)
- **Variant B**: orden invertido (growth → reach → leads → photos)
- **Métrica primaria**: completion_rate_pct
- **Complejidad**: BAJA — solo reordenar el array `QUESTIONS_ES/EN` según variant
- **Cuándo lanzar**: cuando `result_cta_v1` tenga winner declarado

### 2. cta_color_v1 — Color del CTA
- **Hipótesis**: Verde/teal (Blue Lagoon brand) convierte mejor que el color del plan recomendado en países latinoamericanos
- **Variant A**: color del plan (actual — Pro=naranja, Premium=violeta, etc.)
- **Variant B**: Blue Lagoon `#025F67` consistente
- **Variant C**: Verde brillante `#10B981` (asociación con "GO")
- **Métrica primaria**: cta_conversion_pct (click sobre completados)
- **Complejidad**: MEDIA — necesita extender backend para soportar 3-way splits (A/B/C en lugar de A/B)
- **Cuándo lanzar**: post question_order_v1, cuando tengamos arquitectura multi-variant

### 3. urgency_question_v1 — Pregunta de urgencia
- **Hipótesis**: Agregar 5ª pregunta "¿En cuánto tiempo necesitas clientes?" (Esta semana / Este mes / Sin prisa) segmenta intención de compra y aumenta CTA conversion en respondedores "esta semana"
- **Variant A**: 4 preguntas (actual)
- **Variant B**: 5 preguntas con urgencia agregada al final
- **Métrica primaria**: cta_conversion_pct segmentada por respuesta
- **Riesgo**: una 5ª pregunta puede AUMENTAR abandono → necesitas medir trade-off entre completion_rate ↓ vs cta_conversion ↑
- **Complejidad**: BAJA — agregar pregunta + scoring + nuevo bullet en `buildReasons`
- **Cuándo lanzar**: una vez que tengamos 200+ sesiones reales para tener power estadístico

### 4. plan_card_order_v1 — Orden de planes en la tabla
- **Hipótesis**: Mostrar Pro primero (en lugar de Free) ancla el precio
- **Variant A**: Free → Basic → Pro → Premium (orden actual ascendente)
- **Variant B**: Pro → Premium → Basic → Free (anchor en valor)
- **Métrica primaria**: clicks en "Elegir plan" (no del quiz, sino directos)
- **Complejidad**: BAJA — sort en el render de Plans.jsx
- **Cuándo lanzar**: post lanzamiento de question_order_v1

---

## 🎯 Reglas del juego

1. **Solo 1 experimento activo por dimensión** (CTA, preguntas, planes, etc.) para evitar interacciones
2. **Mínimo 30 sesiones por variante** + **diff ≥ 3 pp** para declarar winner
3. **Documentar SIEMPRE** el resultado en este archivo bajo "Completados", incluyendo:
   - Días que corrió
   - Sample size final por variante
   - Métrica primaria + secundarias
   - Decisión (promover B / mantener A / iterar)
4. **No correr 2 experimentos simultáneos en la misma página** hasta que tengamos un framework multi-experimento (~50+ users diarios)
