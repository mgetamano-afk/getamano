# getamano — Changelog

Append-only log of major work shipped per session.

## May 26, 2026 — Sections 49-53 (AI Banner + Verified Reviews + UX Chips + Smart Autocomplete + Gallery +tile)

### Section 49 — AI Professional Banner Generator
- Backend `POST /api/providers/me/generate-banner` using `OpenAIImageGeneration` (gpt-image-1 via Emergent LLM Key).
- Daily rate limit 10/day per provider via `banner_generations_count` + `banner_last_generated_at` fields on `provider_profiles`.
- Prompt builder injects category context + chosen color + style (modern/festive/professional/minimal/warm) + optional keywords; explicitly forbids text in the AI image so overlays stay clean.
- Returns base64-encoded PNG (~2 MB) + style/color/business_name/city echo.
- New `BannerGenerator.jsx` component (~370 lines) renders:
  - Color palette (9 brand colors + custom HTML5 color picker)
  - 5 style cards with emoji + description
  - Optional keywords input
  - Generate / Regenerate / Download buttons
  - Hidden working canvas (1200×630) composes: AI background (cover-fit) + left-side dark gradient overlay + brand accent stripe + business name (auto-shrink) + city + phone + website + tagline + QR code (api.qrserver.com → /p/{slug}) + getamano footer
  - Final PNG via `canvas.toDataURL("image/png")`
- New tab "Banner Pro" in `ProviderDashboard` (Sparkles icon).
- E2E verified: 15s gen time, banner downloads cleanly, QR scans to public eCard.

### Section 50 — Verified Reviews + Multi-channel eCard Sharing
- `POST /api/reviews` now auto-detects prior interaction and sets `verified: bool` + `verification_source: "messaging"|"service_request"|"appointment"`. Checks three collections:
  1. `conversations` (in-app messaging with that provider)
  2. `service_requests` (quote requested)
  3. `appointments` (booking made)
- `ProviderECard.jsx`:438 renders a small green "Verificada" badge with `ShieldCheck` icon + tooltip explaining the verification source.
- `ShareLinkCard.jsx` (provider dashboard) expanded from 4 to **8 channels** in a 4×2 grid:
  - WhatsApp · SMS · Email · Facebook · X/Twitter · Instagram · QR · Más (native share)
  - Each channel tracked via `_trackShare(channel)` for viral KPIs.
  - Instagram channel copies text+link to clipboard then deep-links to `instagram://camera` on mobile.
  - SMS uses platform-aware separator (`sms:&body=` on iOS, `sms:?body=` on Android).
- `ShareECard.jsx` (public eCard) added X/Twitter + Instagram options (now 6 channels).
- E2E verified: created service_request → posted review → returned `verified=True, source=service_request`.

### Section 51 — UX Fix: Services Offered (ChipInput)
- `ProviderOnboarding.jsx` step 3: replaced free-text comma-separated input with existing `ChipInput` component. Max 20 services. Press Enter or comma to add a chip.
- `ProviderDashboard.jsx` Perfil tab: same migration for services field. Visual chips with X to remove.

### Section 52 — PWA Icon (already set) + Gallery '+' Tile
- `manifest.json` already had 12 icon sizes + maskable + apple-touch-icon (no changes needed; previous sessions covered this).
- `ImageUpload.jsx` `GalleryUpload` now accepts `variant="tile"` prop. When set, renders a 1:1 dashed-border tile with a teal "+" circle and "Añadir más fotos" label that matches the gallery grid aesthetic.
- `DashboardGallery.jsx` renders this tile as the last element in the grid (when limit allows), so the upload affordance is always visually in-context — no more hunting for the "Subir fotos" button above the grid.

### Section 53 — Smart Autocomplete for Service Areas
- New `ServiceAreasInput.jsx` (~180 lines) component:
  - Wraps `useCitySearch` hook (Google Places + static fallback).
  - Selected zones render as chips (MapPin icon + city/state + X to remove).
  - Type 2+ chars → dropdown shows real city/state suggestions filtered by US Places.
  - Manual "Añadir" button for off-list zones (fallback when Places doesn't match).
  - Enter key submits the first result.
  - Backspace on empty input removes the last chip (keyboard ergonomics).
  - Max 15 zones, deduped, "Ciudad, ST" format.
- Wired into ProviderOnboarding step 2 (`onboarding-service-areas`) + ProviderDashboard Perfil tab (`form-service-areas`).

### Testing
- `/app/test_reports/iteration_52.json` — **100% pass**, backend 7/7 pytest, frontend testid validation 100% on testable flows. No bugs found.
- Test file: `/app/backend/tests/test_iter52_sections_49_53.py`.

### Code-review notes from testing agent (deferred backlog)
- **P1**: server.py is 9188 lines — continue extraction into `/app/backend/routes/` (auth ✓, search ✓, jobs ✓, seo ✓ already done; next: providers, reviews, payments, banner, scheduler).
- **P2**: Two coexisting share UIs — ShareLinkCard (8 channels, dashboard) vs ShareECard (6 channels, public eCard modal). Consider unifying.
- **P2**: Banner endpoint has hard upstream timeout — could switch to job-queue pattern if OpenAI gets slow.
- **P2**: ProviderOnboarding inputs (onboarding-service-areas, onboarding-services) weren't exercised live in E2E because demo.provider is already onboarded; rendering chips in that scenario would help QA.
