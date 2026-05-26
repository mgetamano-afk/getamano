# getamano — Changelog

Append-only log of major work shipped per session.

## May 26, 2026 (8th drop) — Sections 62 + 63 (Nav Consolidation + Milestone Confetti)

### Section 62 — Navigation consolidation
**Problem reported by user (screenshot evidence)**: the green ComunidadLayout TabBar stayed permanently fixed AND duplicated BottomNav items (Comunidad↔Community, Chambas↔Gigs).

**Fix**:
- **ComunidadLayout TabBar** redesigned:
  - Visual: changed from solid teal block to slim **white pill bar** (`bg-white/95 backdrop-blur-md border-b border-slate-200/80`)
  - Items: removed "Chambas" (duplicates BottomNav "Gigs"), renamed "Comunidad" → "Feed", removed "HeartHandshake" icon (only in BottomNav now). New set: 📰 Feed · 🧭 Explorar · 🏆 Ranking · 🥇 Hall of Fame
  - Behavior: now uses `useSmartNav` to **auto-hide on scroll-down** + reappear on scroll-up (no longer permanently static)
  - Breakpoint: `lg:hidden` so it only renders on mobile/tablet
- **Desktop LeftNav** moved INTO ComunidadLayout (was previously inside ComunidadPage, but blocked by `embedded=true` prop):
  - 4 sticky-top items with the SAME paths/icons as the mobile TabBar (single source of truth)
  - Active state: `bg-teal-50 text-teal-700` + trailing teal-500 dot
  - Hidden on mobile (`lg:block`)
- **ComunidadPage's old LeftNav** is now dead code (kept for backward compatibility, gated by `embedded=true`).

### Section 63 — MilestoneConfetti (CEO marketing recommendation)
Provider celebrates when they cross a likes/views/reviews/bookmarks threshold for the first time.

- **New `MilestoneConfetti.jsx` component**:
  - **9 thresholds**: 10, 25, 50, 100, 250, 500, 1000, 2500, 5000
  - **4 metrics**: likes, views, reviews, bookmarks (bilingual ES/EN copy)
  - **50 confetti pieces** via pure CSS `gtm-confetti-fall` keyframe — random horizontal start, rotation (--rot-start → --rot-end), color (8-color palette), shape (square/circle), 1.8-3s fall duration
  - **Toast banner**: amber→orange→pink gradient with 🎉 bounce, "MILESTONE UNLOCKED" label, headline (`¡N corazones alcanzados!` / `N hearts reached!`), supportive sub-text
  - **Anti-spam**: localStorage key `gtm:milestone:{providerId}:{metric}` persists last celebrated threshold → no duplicate fires
  - **Auto-dismiss**: 5.5s
  - **Haptic**: `navigator.vibrate([50, 30, 50])`
- **Wired into ProviderECard**: 3 instances (likes / reviews / bookmarks), each gated by `user.user_id === p.user_id` (only the OWNER sees their own celebration).

### Bug fixes from testing agent retest
- **LeftNav non-render on desktop** (iteration 58 HIGH): App.js passed `embedded=true` to ComunidadPage which gated the LeftNav. Fix: moved LeftNav into ComunidadLayout itself, removing dependency on ComunidadPage's `embedded` prop.
- **MilestoneConfetti close button blocked** (iteration 58 MEDIUM): `animate-bounce 🎉` intercepted pointer events. Fix: added `pointer-events-none` to the inner content wrapper + `z-10` on the close button so React `onClick` fires without `force=True`.

### Testing
- `/app/test_reports/iteration_59.json` — **100% pass**. Desktop LeftNav 4/4 testids, mobile TabBar 4/4, milestone confetti close+re-fire+non-owner gating 4/4, SPA navigation 3/3. No bugs.
- Test file: `/app/backend/tests/test_iter58_navigation.py` (no backend changes; mostly frontend verification).

### Code-review notes (deferred backlog)
- **P2**: ComunidadPage.jsx still has a dead `LeftNav` function gated by `embedded=true`. Cleanup recommended.
- **P2**: Hydration warning on ProviderDashboard select (US_STATES) — pre-existing, unrelated.
- **P2**: 401s logged for some user-specific endpoints when owner views own eCard — cosmetic, no impact.


## May 26, 2026 (7th drop) — Section 61: Universal Like Animations + Story Likes/Views

### Universal Like Animations
- **New `LikeButton.jsx`** — reusable heart-based component with celebration animation:
  - `gtm-heart-pulse` keyframe (scale 1→1.55→1.1→1.35→1.05→1 over 700ms) with `gtm-heart-color` color burst (gray→pink→red with drop-shadow)
  - **6 floating heart particles** burst radially outward via `gtm-heart-particle` (CSS custom props `--dx`, `--dy`, `--scale`, `animationDelay`)
  - **"+1" floating text** rising + fading via `gtm-plus-one`
  - **Subtle haptic** (15ms vibrate on supported devices)
  - Variants: `pill` (default), `ghost`, `floating`
  - Sizes: `sm` (28px), `md` (40px), `lg` (48px)
  - Props: `liked, count, onClick, disabled, size, showCount, variant, testid, ariaLabel, disabledTitle`
- **Applied across 5 surfaces** of the app:
  - **Banner Gallery** card likes (`gallery-like-{share_id}`)
  - **Banner Gallery** lightbox modal like (`gallery-modal-like`)
  - **SaveECardButtons** on every public eCard (`save-ecard-like-btn`)
  - **Community feed** post likes (`comunidad-post-like-{id}`, variant=ghost)
  - **Story Viewer** (non-owner) floating like at bottom-left (`story-viewer-like`, variant=floating)

### Story Views Counter + Story Likes
- **Backend**: 2 new endpoints:
  - `POST /api/stories/{id}/like` — toggle. Self-like → 400. Expired → 410. Idempotent via unique index `(story_id, user_id)` on new `story_likes` collection.
  - `GET /api/stories/{id}/like-state` — `{liked: bool}` for hydration on viewer open.
- **Story counters**: `views_count` (existing) + `likes_count` (new) auto-maintained via `$inc` on toggle.
- **Frontend StoryViewer**:
  - **Owner sees**: Eye icon + views count + Heart icon + likes count + Delete button at bottom of viewer
  - **Non-owner sees**: floating LikeButton with animation at bottom-left
  - Auto-hydrates like state for each story on mount
  - Optimistic UI with revert on error
  - Caption moved up to `bottom-20` to make space for counters at `bottom-4`

### Bug fixes
- **Datetime tzinfo bug** in `toggle_story_like`: MongoDB strips tzinfo on read. Added defensive `if exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)` before comparing to `datetime.now(timezone.utc)`.
- **StoryViewer modal sizing bug**: parent container in ComunidadLayout created a containing block, breaking `position: fixed`. Fixed by wrapping the modal JSX in `createPortal(..., document.body)`. Modal now correctly fills `100vh × 100vw` (verified rect 1440×900).
- **StoryCreator modal** also moved to `createPortal` for the same reason.

### Renaming
- `LikeButton.jsx` (old, thumbs-up "Recomiendo este negocio") renamed to **`RecommendButton.jsx`** to free up the name for the universal heart-based one. Single import in ProviderECard.jsx updated.

### Testing
- `/app/test_reports/iteration_57.json` — backend **7/7 pass (100%)**, frontend **95% pass**. No critical bugs. Two LOW-priority observations (story image `/api/files/` auth quirk in Playwright + recommend reading count after 1.2s wait).
- Test file: `/app/backend/tests/test_iter57_story_likes.py`.

### Code-review notes (deferred backlog)
- **P2**: Cascade-delete `story_likes` rows when a story is manually deleted (currently orphans accumulate until TTL).
- **P2**: Investigate `/api/files/getamano/uploads/...` auth — story images render black in some Playwright sessions while UI controls work.
- **P2**: Add `gtm-like-btn` hover effect to BannerOfTheWeek likes badge (rendered but not verified visually because banner wasn't currently the weekly winner).


## May 26, 2026 (6th drop) — Sections 58 + 59 + Stories (24h)

### Section 58 — Infrastructure for 60M users (scale-ready foundations)
Practical wins implemented without external APIs (Sentry/Cloudflare/Upstash deferred):
- **MongoDB indexes audit**: added ~12 new indexes across high-traffic collections:
  - `reviews` (provider+created, provider+rating)
  - `service_requests` (provider+created, client+created)
  - `messages` (conversation+status)
  - `share_events` (provider_user+created)
  - `exit_leads` (status+created)
  - `favorites` (user+provider)
  - `notification_queue` (user+created)
  - `audit_log` (user+created)
  - `provider_profiles` compound (verification_status+rating_avg, plan+rating_avg)
  - `quote_requests` (provider+created)
- **Code splitting**: converted 18 secondary pages to `React.lazy()`:
  - SavedECardsPage, BannerGalleryPage, RankingPage, AdminOpsPage
  - All Admin/* (AdminOverview, AdminCEO, AdminQuizFunnel, AdminLeadsInbox, AdminPricingIntelligence, AdminQueue, AdminProviders, AdminReviews, AdminCatalog, AdminAudit, AdminReportsBidirectional)
  - All Legal/* (Terms, Privacy, ReviewsPolicy, Cookies)
  - All SEO/* (SeoServicesIndex, SeoCitiesIndex, SeoCityDetail, SeoCategoryDetail, SeoPage)
  - Wrapped `<Routes>` in `<Suspense fallback={ChunkFallback}>` with branded teal bouncing-dots loader.
- **Production console silencer**: `silenceConsoleInProd()` in new `/lib/imageHelpers.js`; called from `index.js` before mounting. Silences log/info/debug in prod, keeps warn/error for crash diagnostics.
- **Lazy image helper** `lazyImg(url, { priority })` — returns `{ src, loading, decoding, fetchPriority }` props for native browser lazy-loading. Used in StoriesCarousel.

### Section 59 — Empty States + Elegant 404
- **NotFoundPage.jsx** at catch-all `<Route path="*">`:
  - Animated SVG countdown ring (5s, stroke-dashoffset trick)
  - Teal "G" gradient logo + numeric seconds inside
  - Bilingual title/sub
  - "Ir ahora / Go now" CTA that respects same-origin history (back) or routes to `/dashboard` (logged in) / `/` (anon)
  - 4 quick-link pills: Home / Search / Community / Gigs
  - Soft footer: "Cuéntanos en Comunidad"
- **EmptyState.jsx** reusable: icon + title + subtitle + primaryAction + secondaryAction + tags + tip. Applied to:
  - `SavedECardsPage` (no saved eCards)
  - `BannerGalleryPage` (no banners in filter)
  - `ComunidadPage` (no posts yet)

### Section 60 — Stories (24h ephemeral, my CEO recommendation)
- **Backend**: new `stories` collection with MongoDB **TTL index** on `expires_at` (auto-deletes 24h after creation). 5 endpoints:
  - `POST /api/stories` (provider only) — body `{image_url, caption?}`. Throttle: max 5 active stories per provider → 429.
  - `GET /api/stories/active` (public) — returns aggregated-by-provider with `stories_count` per provider tile.
  - `GET /api/stories/by-provider/{provider_user_id}` (public) — chronological list of one provider's active stories for carousel playback.
  - `POST /api/stories/{story_id}/view` (auth) — increments `views_count`; idempotent via unique `(story_id, viewer_user_id)` index.
  - `DELETE /api/stories/{story_id}` — owner or admin only.
- **Frontend**: `StoriesCarousel.jsx` — single file containing:
  - `<StoriesCarousel>` — horizontal scroll of avatar tiles with **Instagram-style gradient rings** (pink → orange → rose). Provider sees a "+ Tu historia" tile.
  - `<StoryViewer>` — fullscreen modal with top progress bars (5s auto-advance per story), provider header, image, caption overlay, touch+arrow navigation, **Escape key + arrow keys** to close/navigate.
  - `<StoryCreator>` — modal with image picker (8MB max, JPG/PNG/WebP), caption (140 chars), pink gradient submit button + reminder "⏱️ Tu historia se borra sola en 24h".
- Wired into `ComunidadPage` above the NewPostBox so it's the first thing users see when entering Comunidad.
- Backend curl tests: creating 3 stories, listing aggregated returns 1 group with stories_count=3. View counter idempotent.

### Testing
- `/app/test_reports/iteration_56.json` — backend **9/9 pass** (100%). Frontend partial pass due to Playwright/form submission edge case (not a real bug — auth flow validated via curl + earlier screenshots). Fixed defensively: added `type="button"` to Header lang-toggle, mobile-menu-toggle, Login OAuth buttons (Google/Apple/Facebook).

### Code-review notes (deferred backlog)
- **P0**: server.py now ~10,100 lines. URGENT to split: extract banners, stories, providers, payments to `routes/`.
- **P1 (deferred Sec 58 external infra)**: Sentry (frontend+backend), Cloudflare CDN, Upstash Redis caching layer — all need API keys.
- **P1 (deferred Sec 57.E)**: PWA Update Banner with service worker postMessage trigger.
- **P2**: Story TTL test in CI (24h fast-forward via test fixture).
- **P2**: StoriesCarousel should auto-refresh on tab visibility change (like the feed).
- **P2**: Add lazyImg to all <img> in BannerGalleryPage, SavedECardsPage, BannerOfTheWeekCard, ProviderCards.


## May 26, 2026 (5th drop) — Section 57 + Banner of the Week

### Section 57.A — Community Feed Auto-Refresh (2 layers + pull-to-refresh)
Adapted from the prompt's Supabase Realtime version to our MongoDB + FastAPI stack using pure HTTP polling:
- **Layer 1 — Visibility API**: when the user returns to the tab/PWA after 2+ minutes away, the feed silently refreshes (no spinner, no jumps).
- **Layer 2 — 60s polling** while the tab is visible (skipped during first 5s after mount). Checks the most recent post's `created_at` vs ours; if fresher posts exist, count them and surface a sticky banner.
- **"Hay N posts nuevos — toca para ver"** floating banner ([data-testid="comunidad-new-posts-banner"]) appears centered at the top of the feed; tapping triggers a smooth scroll-to-top after the silent refresh.
- **Pull-to-refresh** for mobile via Touch events on `window.scrollY=0`: dragging down past 80px shows a rotating refresh indicator ([data-testid="comunidad-pull-indicator"]) that fires `silentRefresh()` on release.

### Section 57.B — HeartHandshake Icon for Comunidad
Replaced 3 instances of the previous Comunidad icons across the app:
- `BottomNav.jsx` — `MessageCircle` (mensajes) → REMOVED entirely. The Comunidad slot now uses **`HeartHandshake`** from lucide-react.
- `ComunidadLayout.jsx` first tab — `Globe` → **`HeartHandshake`**.
- `ComunidadPage.jsx` internal nav — `Home as HomeIcon` → **`HeartHandshake`** for /comunidad route.

### Section 57.C — Bottom Nav Reorder
Updated to the prompt-specified order: **Inicio · Buscar · Comunidad · Chambas · Mi cuenta**. The old "Mensajes" slot was removed from the bottom nav — messages now live in the Header bell (with unread badge) where they belong on mobile.

### Section 57.D — Heartbeat Tap Animation
New CSS keyframes in `App.css`:
- `gtm-heartbeat` — scale 1 → 1.45 → 1.15 → 1.35 → 1.08 → 1 over 550ms (cubic-bezier 0.36, 0.07, 0.19, 0.97)
- `gtm-color-burst` — gray → orange → red → teal over 550ms (sync'd to scale)
- `gtm-label-pop` — text scale + color punch on the "Comunidad" label

JS controller in BottomNav: `tappingPath` state + `setTimeout(600)` cleanup. Only applies to items declared with `animate: "heartbeat"` (currently just Community).

### Section 57.E — PWA Update Banner (DEFERRED)
Defer to next session — needs Service Worker overhaul. Approved by user.

### Banner of the Week (CEO marketing idea)
- New backend `GET /api/banners/banner-of-the-week` (public, no auth) — MongoDB aggregation pipeline that selects the highest-liked public banner from the last 7 days. Falls back to all-time most-liked if no banner has likes this week. Returns `null` only when there are zero published banners.
- New `BannerOfTheWeekCard.jsx` component on the public Landing page (right after `FeaturedProvidersReel`, before the category slider). Renders:
  - Pink-orange gradient "BANNER OF THE WEEK" badge
  - Bilingual H2 + sub
  - "See full gallery" link → `/galeria-banners`
  - Hero banner image with hover scale + likes badge + style ribbon (brand color)
  - Provider card: logo/initials, business name + verified shield, city/state
  - Two CTAs: "View [business]'s eCard" (dark) + "Create my banner with AI" (pink) → drives Banner Pro adoption
- **Viral loop**: featured provider gets free traffic → other providers see it → "yo quiero salir aquí" → adopt Banner Pro → more eCards look professional → more liking → more virality.

### Testing
- `/app/test_reports/iteration_55.json` — **100% pass**, 5/5 backend pytest + all UI testids verified. No bugs.
- Test file: `/app/backend/tests/test_banner_of_the_week.py`.

### Code-review notes (deferred backlog)
- **P1**: `ComunidadPage.jsx` is 870+ lines — split PostFeed, NewPostBox, internal nav into separate files.
- **P2**: 401 console noise on public Landing — gate `/me`/`/conversations` probes on user presence (not blocking).
- **P2**: BannerOfTheWeek fetches on every mount — add SWR cache or 5-minute stale window.


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
