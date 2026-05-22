# Quiz Experiments Backlog

Estado actual del flywheel de optimización del PlanRecommender en `/planes`.

---

## ✅ Experimentos shipped y activos (recolectando datos reales)

### result_cta_v1 (Mayo 22, 2026)
- **Variant A (Control)**: "Elegir este plan" + banner "Enviarme mi resultado"
- **Variant B (Urgencia)**: "Empezar a recibir clientes hoy" + banner "Mándame mis 5 tips"
- **KPI primario**: `overall_conversion_pct` (started → cta_clicked)
- **Estado**: Activo en producción

### question_order_v1 (Mayo 22, 2026)
- **Variant A (Control)**: Orden actual (photos → leads → reach → growth) — fácil → calificadora
- **Variant B (Reverse)**: Orden invertido (growth → reach → leads → photos) — calificadora → fácil
- **KPI primario**: `completion_rate_pct` (started → completed)
- **Hipótesis**: ¿reduce abandono temprano poner las difíciles al final, o al inicio para filtrar mejor?
- **Estado**: Activo en producción

### plan_card_order_v1 (Mayo 22, 2026)
- **Variant A (Control)**: Free → Basic → Pro → Premium (ascendente)
- **Variant B (Anchor)**: Pro → Premium → Basic → Free (anchor en valor)
- **KPI primario**: `overall_conversion_pct` (page open → CTA click)
- **Hipótesis**: ¿anclar en planes pagados primero aumenta CTR?
- **Estado**: Activo en producción

### testimonial_above_email (Mayo 22, 2026)
- **Sin A/B** — shipped para todos
- Testimonial relevante al plan recomendado (María/Carlos/Lucía/Roberto)
- Lift +20% es consenso UX
- Iterar cuando tengamos 5+ testimonios reales: rotación + tracking de cuál convierte

---

## 📋 Backlog priorizado (próximos)

### 5. cta_color_v1 — Color del CTA
- **Hipótesis**: Verde `#10B981` (asociación "GO") convierte mejor que el color del plan recomendado
- **Variant A**: color del plan (actual)
- **Variant B**: Verde brillante `#10B981`
- **Complejidad**: BAJA
- **Bloqueador**: esperar a que `result_cta_v1` declare ganador para no contaminar la dimensión CTA

### 6. urgency_question_v1 — Pregunta 5 timeline
- **Hipótesis**: Una 5ª pregunta "¿En cuánto tiempo necesitas clientes?" segmenta urgencia
- **Variant A**: 4 preguntas (actual)
- **Variant B**: 5 preguntas con timeline al final
- **Riesgo**: aumenta abandono, hay que medir trade-off
- **Complejidad**: BAJA
- **Bloqueador**: esperar a que `question_order_v1` declare ganador

### 7. founding_urgency_v1 — Contador founding visible
- **Hipótesis**: Mostrar "Solo quedan 48 cupos Founding hasta XX/XX/26" arriba del quiz aumenta urgencia y conversión
- **Variant A**: sin banner (actual)
- **Variant B**: banner urgencia arriba de la cabecera del quiz
- **Complejidad**: BAJA-MEDIA
- **Cuándo**: cuando lleguemos a 25+ Founding signups (más creíble)

### 8. recommendation_explanation_v1 — Razones del por qué
- **Hipótesis**: Mostrar 2 razones vs 4 razones — ¿menos cognitive load aumenta conversion?
- **Variant A**: 4 razones (actual)
- **Variant B**: 2 razones (las más fuertes)
- **Complejidad**: BAJA

---

## 🎯 Reglas del juego

1. **Solo 1 experimento activo por dimensión** (CTA, preguntas, planes, etc.) para evitar interacciones
2. **Mínimo 30 sesiones por variante** + **diff ≥ 3 pp** para declarar winner
3. **Documentar SIEMPRE** el resultado en este archivo bajo "Completados", incluyendo:
   - Días que corrió
   - Sample size final por variante
   - Métrica primaria + secundarias
   - Decisión (promover B / mantener A / iterar)
4. Cuando un experimento gana, **promover el winner a default** y abrir el siguiente experimento en esa dimensión
5. **No correr 2 experimentos simultáneos en la misma dimensión** hasta que tengamos un framework multi-experimento (~50+ users diarios)

---

## 🛠️ Implementación técnica

- Backend: `/api/quiz/track` + `/api/quiz/recover` + `/api/admin/quiz-funnel`
- Frontend: `getVariant(sessionId, experimentName)` con salted hash → A/B independiente por dimensión
- Cada session puede participar en N experimentos simultáneamente sin contaminación cruzada
- Admin UI: tabs por experimento en `/admin/quiz-funnel`
- KPI primario configurado por experimento en el backend (PRIMARY_KPI dict)
