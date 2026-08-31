# XenForo Story Reader — Handoff Context (v0.7.4)

## What this is
A Tampermonkey **userscript** that turns a threadmarked XenForo forum story thread into an
AO3/FFN-style reader: a chapter table-of-contents sidebar, the chapter body as the focus,
and the forum discussion between chapters shown inline as "comments" under each chapter.
Tested primarily on Questionable Questing; adapters are generic across XenForo
(SpaceBattles, SufficientVelocity share identical DOM).

Original user goal (verbatim): "I like reading stories on forum boards like
questionablequesting.com (xenforo?) but I dont enjoy the forum format. I always use
'reader mode' that only shows threadmarks. ... re-organises the forum into an
ao3/fanfiction.net like structure (shows chapters and keeps the story as a focus) but adds
the forum discussion as comments under each chapter."

## Constraints (keep these)
- **Read-only.** Fetch + parse + render + export only. No posting, liking, or account changes.
- **User installs the script themselves** in Tampermonkey. Do not attempt to install it.
- **No reproducing story prose** in chat — validate via structural signals (IDs, counts, titles).
- **Confirm before downloads.** The EPUB export writes a .epub to the Downloads folder.

## File
- \`xenforo-story-reader.user.js\` — the complete v0.7.2 userscript (single file, ~26KB).
- @match covers: forum.questionablequesting.com, questionablequesting.com,
  forums.spacebattles.com, forums.sufficientvelocity.com (all /threads/*).
- NOTE: repeated downloads to the same name may produce \`...(1).user.js\`, \`...(2).user.js\`.
  The correct file is the one whose header says \`@version 0.7.2\`.

## !! INSTALL STATE (IMPORTANT) !!
- The user has v0.7.2 **downloaded** but confirmed (via live inspection) that the version
  actually **running in Tampermonkey is still v0.7.0** — the new UI (icon footer, EPUB in
  footer, sticky discussion) will NOT appear until they reinstall/replace the script in the
  Tampermonkey editor with the v0.7.2 file and reload the forum tab.
- If a live check shows the old full-width "Export EPUB" bar at the TOP of the sidebar and
  wrapping text buttons in the footer => the old version is still installed.

## Architecture (v0.7.x refactor)
- **Net** — polite fetch queue. MAX_CONC=4, MIN_GAP=120ms, RETRIES=3 with exponential
  backoff+jitter; retries on HTTP 429/503. All requests credentialed (logged-in session).
- **Adapter** — ALL XenForo selectors isolated here (the only place to touch for DOM changes
  or new forums). Key methods: threadBase/threadId/threadTitle/threadmarksUrl/pageUrl,
  categoryTabs, categoryIdFromHref, tmUrl(catId,page), threadmarkRows, tmMaxPage, posts,
  hasThreadmarks (threadmark gate).
- **Cache** — IndexedDB ('xfReaderDB'/'cache') + in-memory Map, schema-versioned
  (CACHE_SCHEMA=2 invalidates stale entries). ~10GB quota, persists across restarts.
- **Store** — data orchestration: buildIndex (walks all categories + all pages),
  cachedIndex (instant), getChapterBody, getPagePosts, collectDiscussion, prefetchDiscussion.
- **EPUB** — hand-rolled STORE-mode ZIP (CRC32, correct local/central/EOCD records, mimetype
  first & uncompressed) + bodyToXhtml sanitizer (DOMParser/XMLSerializer, strips
  script/iframe/style/on*/class/id, promotes lazy img data-src) + buildEpub (EPUB2:
  mimetype, container.xml, chapN.xhtml, content.opf, toc.ncx).
- **QQReader** — Web Component (shadow DOM). Instant open from cache, TOC (grouped vs
  chronological), icon footer nav, sticky discussion bar, auto-loaded discussion with a
  stale-guard token, skeletons, aggressive background prefetch, EPUB export.
- **Bootstrap** — mounts a floating "Reader" launcher button, gated on hasThreadmarks().
  Launcher lives fixed bottom-LEFT by default (v0.7.3 — bottom-right blocked cookie-banner close buttons) and is draggable; position persists in localStorage (xfReader:launch). NOTE: the site also has
  NATIVE XenForo "Reader mode" links; don't confuse them with our .xfr-launch button.

## UI DETAILS (current, v0.7.2)
- **Footer** = one non-wrapping row of compact ICON buttons, each with a CSS tooltip on hover
  and long-press (touchstart 400ms -> .tip-show) on touch:
    [green download EPUB] [prev \u2039] [next \u203a] [order toggle] [theme \u25D0] [close \u2715]
  Reading-order toggle icon: \u2630 = story-first (grouped), \u21C5 = chronological.
- **Export EPUB** = the GREEN button in the footer (was previously a full-width bar at the
  TOP of the sidebar; that top block is REMOVED). CSS class .foot .expbtn, color #3aa66f.
  While exporting: shows a spinner glyph + progress via its data-tip tooltip
  (Preparing N/total -> Building % -> Downloaded), disabled during the run. Exports WHOLE
  story (index.allChapters()), fetched in background first.
- **Sticky discussion bar** (v0.7.2 fix): DOM order is chapter -> discbar -> disc (bar sits
  BELOW the story, ABOVE the comments). position:sticky;top:0 gives the desired behavior:
  scrolls up with content, STICKS at top once reached, releases when scrolling back up.
  (The v0.7.0 bug was the bar placed ABOVE the chapter, so it pinned immediately.)
  discbar has margin-top:24px + border-top as a section divider.

## Two view modes (user requirement)
- **grouped / "Story first"** — story section first, then Index/Extras/Omake/etc. in section order.
- **chronological / "Chronological"** — every threadmark merged, sorted ascending by postId
  (interleaves omake/extras into created order).

## Discussion model
For a chapter, discussion = posts AFTER that chapter's post and BEFORE the next chapter's
post (chronological neighbor), walked across forward pages, capped at PREFETCH_DISC_MAX=10.

## LIVE-VALIDATED (on QQ "Governor's Gambit", thread 30813)
- Data layer via the REAL buildIndex code path: **228 threadmarks** = 124 story chapters
  (5 pages) + 3 Index + 101 Extras (5 pages). Build ~3.7s (11 fetches). chrono sorted OK.
- Instant cached rebuild: **0ms**.
- Discussion auto-collect: **18 comments** correctly bounded under Chp-1 (~300ms).
- EPUB pipeline: valid 33KB EPUB2 from 3 real chapters; mimetype stored/uncompressed &
  first; EOCD valid; XHTML well-formed on re-parse.
- v0.7.2 UI changes verified live in the shadow DOM: icon footer fits one row, tooltips work
  on hover, view-toggle swaps icon + re-renders TOC, green EPUB button in footer with tooltip,
  sticky discussion bar sticks/releases correctly at the story/comments boundary.
- Full-file syntax: passes new Function() (~26,103 chars).

## BUGS FIXED (history)
1. **Category URL**: \`threadmarks?threadmark_category=N\` (query param, N read from the tab's
   own href), NOT \`/category-N\` (path). Earlier code silently returned 0 rows for non-default
   categories.
2. **Threadmarks pagination**: \`threadmarks?page=N\` (query param), NOT \`/threadmarks/page-N\`
   (404s). Page count read from \`.block--threadmarkList\` pageNav (thread-footer pageNav is a
   false positive).
3. **Footer overflow** (v0.7.1): text buttons wrapped in the 320px sidebar -> replaced with
   icon buttons + tooltips.
4. **Export placement** (v0.7.1): moved from a top full-width bar into the footer as a green
   download icon.
5. **Sticky discussion** (v0.7.2): reordered DOM so the bar sits below the story; now
   scroll-up-then-pin-then-release works natively.

## STATUS / RISK
- Data layer + EPUB pipeline: **live-tested, proven**.
- QQReader UI: individual features verified live in the shadow DOM, and the assembled file
  passes syntax + content checks. The assembled v0.7.2 file was rebuilt from verified pieces
  rather than reloaded-and-clicked as a whole. On first (re)install, sanity-check: reader
  opens, icon footer on one row, green EPUB button present, export runs to a download, and
  the discussion bar sticks/releases at the story/comments boundary.

## KEY SELECTORS / FORMATS (for the Adapter)
- Thread base: /threads/{slug}.{id}/  ; threadId regex \`\.(\d+)\/\`
- Threadmarks index: {base}threadmarks ; category: ?threadmark_category=N ; page: ?page=N
- Category tabs: .block-tabHeader--threadmarkCategoryTabs .tabs-tab (labels are generic:
  Threadmarks/Index/Extras/Apocrypha/Omake/Sidestory/Media/Informational...)
- Threadmark rows: .structItem--threadmark -> .structItem-title a ; href has post-{id}
  and optional page-{n} (defaults page 1).
- Threadmark-list pagination: .block--threadmarkList .pageNav a
- Posts on a thread page: .message--post / article.message -> data-content="post-{id}",
  data-author, .message-body .bbWrapper
- Title: h1.p-title-value
- Font stack (use the site's, do NOT change): see SITE_FONT in the script.

## CONSTANTS
LS_PREFIX='xfReader:', DB_NAME='xfReaderDB', DB_STORE='cache', CACHE_SCHEMA=2,
MIN_GAP=120, MAX_CONC=4, RETRIES=3, PREFETCH_DISC_MAX=10.

## Version history
v0.3.0 threadmark gate + site font. v0.4.0 precompute/skeletons/bg-reload. v0.5.0 superseded.
v0.6.0 two view modes + footer nav + light-mode fix + sticky full-width discbar. v0.6.1
always-auto-load discussion. v0.7.0 refactor (Net/Adapter/Cache/Store) + whole-story EPUB
export. v0.7.1 icon footer + tooltips + green EPUB button moved into footer. v0.7.2 sticky
discussion bar repositioned below story (scroll-up/pin/release). v0.7.3 launcher moved to
bottom-left + drag-to-move with persisted position. v0.7.4 test harness (vitest unit+smoke,
CDP e2e, CI) + inert test hook exposing internals.

## ROADMAP (agreed next)
1. In-chapter scroll progress + read/unread state.
2. Keyboard nav (J/K, arrows, Esc).
3. TOC search/filter; typography controls (font size / width / line-height).
Recommended NOT to do: nested comment threading, any account-touching features.
