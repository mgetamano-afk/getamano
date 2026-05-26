# getamano — Changelog

Append-only log of major work shipped per session.

## May 26, 2026 (latest) — Marketplace de Banners (Section 57 / CEO recommendation)

The viral loop: provider creates banner with AI → opts-in to publish → public gallery showcases real businesses → visitors browse + like → "yo quiero uno así" → more providers adopt Banner Pro → more eCards look professional → conversion up.

### Backend (server.py, 7 endpoints)
- `POST /api/banners/publish` — provider-only. Takes {image_url, style, color, keywords?}. Auto-rotation: max 5 published per provider; oldest non-pinned is deleted on 6th publish (with its likes).
- `GET /api/banners/public` — public listing. Params: `style?` (modern|festive|professional|minimal|warm), `sort=popular|recent` (popular = pinned-first → likes desc → recent), `limit` (1–60, default 24), `offset`. Returns `{items, limit, offset, next_offset}`.
- `GET /api/banners/me` — provider's own published banners (max 20).
- `DELETE /api/banners/{share_id}` — owner or admin. Cascades `banner_likes` for that share.
- `POST /api/banners/{share_id}/like` — auth required. Idempotent toggle via unique index `(share_id, user_id)`. Self-like → 400. Returns `{liked, likes}`.
- `GET /api/banners/{share_id}/like-state` — auth required. `{liked: bool}`.
- `POST /api/banners/{share_id}/view` — public fire-and-forget view counter.
- 4 new MongoDB indexes on `banner_shares` + `banner_likes`.

### Frontend
- **New page `BannerGalleryPage.jsx`** at `/galeria-banners` (ES) and `/banner-gallery` (EN):
  - Hero with "Banner Showcase" badge + bilingual H1 + descriptive sub.
  - Filter pills (All + 5 styles) with emoji + colored brand-color dot per card.
  - Sort segmented control (Popular / Recent).
  - Responsive masonry grid (1 / 2 / 3 cols).
  - Optimistic-UI like button with rose-fill state, disabled+tooltip on own banner, requires auth.
  - "Featured" amber badge for pinned banners.
  - Lightbox modal: full image + business name + verified shield + Like + "View eCard" → links to `/p/{slug}` (ES) or `/provider/{slug}` (EN).
  - CTA banner inside modal for providers: "Create your own banner in 30 seconds with AI" → `/dashboard/provider`.
  - Empty state with "Be the first to publish" copy.
  - Pagination via `Load more banners` button.
  - **URL→Language pin** on mount so deep-links display correct locale.
- **BannerGenerator.jsx** — added "Publicar en galería" / "Publish to gallery" pink-gradient button next to Download. Flow: composedUrl (dataURL) → Blob → File → POST /api/upload → POST /api/banners/publish → emerald "Publicado" badge with link to gallery.
- **Header.jsx** — desktop + mobile nav links to Banner Gallery (`nav-banner-gallery` + `mobile-nav-banner-gallery`) with locale-aware href.

### Testing
- `/app/test_reports/iteration_54.json` — **100% pass**, 20/20 backend pytest + 9/9 critical UI flows. No bugs.
- Test file: `/app/backend/tests/test_iter54_banner_marketplace.py`.

### Code-review notes from testing agent (deferred backlog)
- **P0**: server.py now 9849 lines — STRONGLY extract banner endpoints (Sec 49 + 57) into `routes/banners.py`.
- **P1**: publish auto-rotation does 4 sequential round-trips — collapse with `find_one_and_delete`.
- **P2**: Add IP+share TTL dedup to `/banners/{share_id}/view` to prevent counter inflation.
- **P2**: Add `{likes: {$gt: 0}}` guard on like-decrement to prevent drift below zero in concurrent edge cases.
- **P2**: Project away `keywords` on public listing if/when keywords get large.


## May 26, 2026 (later) — Sections 54-56 (Full EN i18n + Saved eCards + Open Graph Previews)

### Section 56 — Open Graph Dynamic Previews
- New endpoint `GET /api/og-image/{slug}.svg` — returns a hand-rolled **1200×630 SVG** with provider business name, category, city/state, star rating, "Verified" badge, "Pro" badge (if applicable), circular avatar (logo or initials), getamano gradient background + grain texture, and CTA. Aggressively cached (24h max-age, 7d stale-while-revalidate).
- New endpoint `GET /api/og/p/{slug}` — returns a bot-friendly HTML document with **17 OG/Twitter meta tags** (og:type, og:site_name, og:locale + alternate, og:title, og:description, og:image + secure_url + type + dimensions + alt, og:url, twitter:card=summary_large_image, etc.) + meta-refresh + JS redirect for humans.
- New middleware `og_bot_middleware` — intercepts `/p/{slug}` and `/provider/{slug}` requests for **18 social-bot User-Agents** (facebookexternalhit, twitterbot, linkedinbot, whatsapp, slackbot, telegrambot, pinterest, discordbot, vkshare, redditbot, applebot, skypeuripreview, embedly, quora link preview, showyoubot, outbrain, facebot, ia_archiver) and serves OG-rich HTML. Pure pass-through for humans.
- Share components updated:
  - `ShareLinkCard.jsx` `shortUrl` now points at `${REACT_APP_BACKEND_URL}/api/og/p/${slug}?ref=...` so every channel triggers rich previews.
  - `ShareECard.jsx` likewise.
  - `BannerGenerator.jsx` QR code encodes the OG URL; printed text on the banner stays clean as `/p/{slug}`.
- Caveat: in the Kubernetes preview ingress, `/p/*` routes directly to the React SPA so the middleware never fires for browser requests — the strategy is to share OG URLs explicitly, which gives bots full meta + auto-redirects humans.
- E2E verified: 17 meta tags present in WhatsApp UA fetch; SVG renders correctly.

### Section 55 — Mis eCards Guardadas (Bookmark + Like + Personal Note)
- New MongoDB collection `saved_ecards` with composite index `(user_id, provider_id)` unique.
- 5 backend endpoints:
  - `PUT /api/saved-ecards` — upsert with save_type ∈ {bookmark, like, both} + personal_note (max 500 chars). Rejects self-save with HTTP 400.
  - `DELETE /api/saved-ecards/{provider_id}` — full removal.
  - `PUT /api/saved-ecards/{provider_id}/note` — note-only update (404 if not saved).
  - `GET /api/saved-ecards/me/state/{provider_id}` — current state.
  - `GET /api/saved-ecards/me?filter=all|bookmark|like` — full list joined with provider profile.
- Provider profile auto-maintains `like_count` + `bookmark_count` via `_recompute_provider_save_counts()` on every change.
- New `SaveECardButtons.jsx` component renders Like + Bookmark + Note-modal directly on the public eCard, replacing the old "addFavorite" link. Hidden when `isOwn=true`.
- New `SavedECardsPage.jsx` at `/mis-guardadas` (ES) and `/my-saved` (EN):
  - Stats cards: bookmarks total, likes total, pro tip.
  - Filter pills: All / Bookmarked / Liked.
  - List items with logo, name, verified ribbon, rating + count, inline note editor, call/open-eCard/remove actions.
- Header navigation gets a new `Bookmark` icon link → `/mis-guardadas`.

### Section 54 — Full EN i18n Coverage (Pragmatic)
- Expanded `I18nContext.jsx` with **~120 new translation keys** in both `es` and `en`:
  - `common.*` (add/remove/edit/delete/confirm/close/send/update/loading_more/required/optional/try_again/coming_soon/read_more/read_less/next/previous/finish/signin_required)
  - `tabs.*` (profile/rates/gallery/banner/appointments/requests/messages/referrals/journal/subscription)
  - `nav.saved`, `nav.messages`
  - `saved.*` (~25 keys — page title/subtitle, filters, stats, tip, empty state, note flow, action buttons, modal labels)
  - `banner.*` (~25 keys — title, color/style/keywords labels, 5 styles + descriptions, CTA states, empty/loading/preview/tips)
  - `review.*` (verified + 3 verification-source tooltips + empty state)
  - `share.*` (title, copy, copied, qr, more, instagram clipboard message)
  - `chip.*` + `areas.*` (placeholder helpers, max-reached, autocomplete dropdown labels)
- Refactored to use `t()`:
  - `SavedECardsPage.jsx` — all visible strings
  - `SaveECardButtons.jsx` — button labels, modal copy, toasts (with EN/ES fallback)
  - `ProviderECard.jsx` verified-review badge — `t('review.verified')` + `t('review.verified_tooltip.${source}')`
  - `ProviderDashboard.jsx` — TAB_KEYS uses `labelKey` resolved via `t(tt.labelKey)` so all 10 tabs translate

### Testing
- `/app/test_reports/iteration_53.json` — **100% pass**, 15/15 backend pytest + 6/6 critical UI flows + self-save guard + EN translation verification. No bugs.
- Test file: `/app/backend/tests/test_iter53_sections_55_56.py`.

### Code-review notes from testing agent (deferred backlog)
- **P1**: server.py now 9686 lines. The OG bot middleware runs on EVERY request — should be promoted to a Starlette Route or gated earlier by path prefix.
- **P1**: `og_provider_html` 404 fallback returns no cache headers (inconsistency with the 200 path).
- **P2**: `_recompute_provider_save_counts` does 2 count_documents + 1 update — switch to aggregation `$facet` when scale demands.
- **P2**: Saved list sorts by `saved_at` (immutable) — consider `last_updated_at` for "recently active" UX.
- **P2**: `bookmark_count` is publicly exposed via `/by-slug/{slug}` — confirm intentional vs private.
- **P2**: OG SVG fallback always 200 + the SPA renders 404 for invalid slugs → social bot sees happy preview, human sees 404. Minor UX dissonance.
- **P2**: Add a `// noindex-safe` comment near `X-Robots-Tag: all` so future engineers don't flip it.

### Backlog moved forward
- **Marketplace de Banners** (CEO recommendation from previous finish) — deferred. Ready to ship: new collection `banner_shares`, public gallery `/galeria-banners` with like voting, opt-in toggle in BannerGenerator. ~2-3h next session.


## May 26, 2026 (earlier) — Sections 49-53 (AI Banner + Verified Reviews + UX Chips + Smart Autocomplete + Gallery +tile)

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
