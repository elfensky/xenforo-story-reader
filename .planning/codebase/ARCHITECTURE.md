---
last_mapped_commit: 447ebf2f10ee7bb2a3652eee8ab505d6464356d7
last_mapped_at: 2026-11-02
---
<!-- refreshed: 2026-11-02 -->
# Architecture

**Analysis Date:** 2026-11-02

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                 Tampermonkey host page (XenForo thread)               │
│  `xenforo-story-reader.user.js` (IIFE, `@grant none`, one file)       │
├───────────────────────┬──────────────────────┬───────────────────────┤
│  Bootstrap / Launcher │   QQReader (custom   │   EPUB builder        │
│  `mountLauncher()`    │   element, shadow    │   `buildEpub()`,      │
│  lines 385-405        │   DOM) lines 255-382 │   `makeZip()` lines   │
│                       │                      │   165-216             │
└─────────┬─────────────┴──────────┬───────────┴──────────┬────────────┘
          │                        │                      │
          ▼                        ▼                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Store (orchestration) `const Store` lines 103-162                    │
│  buildIndex · cachedIndex · getChapterBody · getPagePosts ·           │
│  collectDiscussion · prefetchDiscussion                               │
└─────────┬────────────────────────────┬────────────────────────────────┘
          │                            │
          ▼                            ▼
┌──────────────────────────┐   ┌───────────────────────────────────────┐
│  Cache `const Cache`     │   │  Net `const Net` lines 25-50          │
│  lines 90-100            │   │  queue, concurrency 4, 120ms gap,     │
│  IndexedDB + Map memory  │   │  retry on 429/503/errors              │
└──────────────────────────┘   └──────────────────┬────────────────────┘
                                                   │ fetch(credentials:'include')
                                                   ▼
                              ┌───────────────────────────────────────┐
                              │  XenForo forum HTML (same origin)     │
                              │  parsed by `Adapter` lines 52-88      │
                              └───────────────────────────────────────┘
```

Only `Adapter` knows XenForo markup. `Store` returns plain objects to the UI.

## Pattern Overview

**Overall:** Single-file userscript with layered modules. Each module is an IIFE that returns a plain object of functions. A custom element (`qq-reader`) acts as the UI shell.

**Key Characteristics:**
- One file, no build step, no bundler, no module system. `xenforo-story-reader.user.js` is the whole product.
- The whole script runs inside one `(function(){ 'use strict'; ... })();` wrapper (line 18 and line 408). Nothing leaks to `window` except the custom element registration and, under test only, `globalThis.__xfr`.
- Layers are ordered by convention, not enforced: Adapter, Cache, Net feed Store; Store feeds UI and EPUB. The UI does not call Net, Cache or Adapter directly except `Adapter.threadId()` and `Adapter.threadTitle()`, which the UI reads for the storage key and title.
- Read-only by design. The script issues only GET-style `fetch` calls through `Net.text`. It never posts, likes or changes account state (`CONTEXT.md` Constraints).
- The UI renders inside a shadow DOM (`attachShadow({mode:'open'})`, line 257). Site CSS does not leak in, and the reader CSS does not leak out.

## Layers

**Net (polite fetch queue):**
- Purpose: Rate-limit and retry every outbound request.
- Location: `xenforo-story-reader.user.js` lines 25-50
- Contains: one FIFO queue `q`, a pump function, and `text(url, opts)` as the only public method.
- Depends on: browser `fetch`, constants `MAX_CONC` (4), `MIN_GAP` (120 ms), `RETRIES` (3) on lines 22.
- Used by: `Store` only (`fetchCategoryAll`, `buildIndex`, `getChapterBody`, `getPagePosts`).

**Adapter (XenForo DOM contract):**
- Purpose: Isolate every selector, URL pattern and page-structure assumption about XenForo.
- Location: `xenforo-story-reader.user.js` lines 52-88
- Contains: URL builders (`threadBase`, `threadmarksUrl`, `pageUrl`, `tmUrl`), readers (`threadId`, `threadTitle`, `categoryTabs`, `threadmarkRows`, `tmMaxPage`, `posts`), and the threadmark gate `hasThreadmarks`.
- Depends on: `DOMParser`, `location.href`, `document`.
- Used by: `Store`, `Bootstrap`, `QQReader._boot` and `QQReader._openChapter` (via `Adapter.threadId()`).
- Rule: DOM or URL changes on a forum belong here. See `CONTEXT.md` section "KEY SELECTORS / FORMATS".

**Cache (two-tier persistence):**
- Purpose: Keep index, chapter bodies and post pages across page loads.
- Location: `xenforo-story-reader.user.js` lines 90-100
- Contains: `mem` (a `Map`) and an IndexedDB store `xfReaderDB` / `cache` (object store `cache`, key-value, values wrapped as `{schema, data, ts}`).
- Depends on: `indexedDB`, constants `DB_NAME`, `DB_STORE`, `CACHE_SCHEMA` (2).
- Used by: `Store` only.
- Invalidation: a read returns `null` when the stored `schema` differs from `CACHE_SCHEMA`. Bumping that constant invalidates all entries. There is no TTL and no size cap in code.

**Store (data orchestration):**
- Purpose: Build the chapter index, fetch chapter bodies and discussion posts, and decide which pages to fetch.
- Location: `xenforo-story-reader.user.js` lines 103-162
- Contains: `makeIndex` (index object with `allChapters`, `grouped`, `list(view)`, `firstChapterId`), `fetchCategoryAll`, `buildIndex`, `cachedIndex`, `getChapterBody`, `getPagePosts`, `collectDiscussion`, `prefetchDiscussion`.
- Depends on: `Net`, `Cache`, `Adapter`, `PREFETCH_DISC_MAX` (10).
- Used by: `QQReader` (all data access), `buildEpub` (via `Store.getChapterBody`).

**EPUB builder (pure transform plus ZIP writer):**
- Purpose: Turn the index and cached bodies into an EPUB 2 `Blob`.
- Location: `xenforo-story-reader.user.js` lines 164-216
- Contains: `crcTable` and `crc32` (lines 165-166), `makeZip` (STORE mode, no compression, lines 167-186), `esc` (line 187), `bodyToXhtml` sanitizer (lines 188-198), `buildEpub` (lines 199-216).
- Depends on: `Store.getChapterBody`, `DOMParser`, `XMLSerializer`, `TextEncoder`, `Blob`.
- Used by: `QQReader._export` only.

**CSS:**
- Purpose: One string constant with all reader and launcher styles.
- Location: `xenforo-story-reader.user.js` lines 218-253 (`const CSS`). The launcher style is inline in `mountLauncher` (line 392).
- Theme: CSS custom properties on `:host`. Light theme is the class `light` on the host element (`:host(.light)`).

**QQReader (UI shell, custom element):**
- Purpose: Render the chapter list, the chapter body, the discussion, the footer controls and the export button.
- Location: `xenforo-story-reader.user.js` lines 255-382. Registered as `qq-reader` on line 383.
- Contains: lifecycle (`connectedCallback`), wiring (`_wire`), boot (`_boot`), TOC rendering (`_renderTOC`, `_tocLink`, `_markActive`), navigation (`_step`, `_neighbors`), chapter display (`_openChapter`), background prefetch (`_prefetch`), export (`_export`).
- Depends on: `Store`, `Adapter`, `buildEpub`, `esc`, `CSS`, `SITE_FONT`, `localStorage`.

**Bootstrap / Launcher:**
- Purpose: Add the floating "Reader" button to threadmark pages and open the `qq-reader` element on click.
- Location: `xenforo-story-reader.user.js` lines 385-405 (`mountLauncher`), plus the trigger on lines 404-405.
- Gate: `Adapter.hasThreadmarks()` must return true, or nothing mounts (line 388).
- Depends on: `Adapter`, `SITE_FONT`, `localStorage` key `xfReader:launch` for the saved position.

## Data Flow

### Primary Request Path (open reader on a threadmarked thread)

1. Script runs at `document-idle` on a matched `/threads/*` URL. `mountLauncher()` runs (line 405). It checks `Adapter.hasThreadmarks()` (line 388) and appends the `.xfr-launch` button (line 402).
2. The user clicks the button. The click handler appends `<qq-reader>` to `document.body` (line 401).
3. `connectedCallback` (line 258) reads the saved theme, builds the shadow DOM, and calls `_wire()` then `_boot()` (line 273).
4. `_boot` (line 298) calls `Store.cachedIndex()`. If a cached index exists, it renders the TOC and opens the last chapter at once. If not, it shows skeletons (line 301).
5. In parallel, `Store.buildIndex()` (line 302) fetches `threadmarks`, reads the category tabs, then fetches every category page through `Net.text`. The result goes to `Cache.set` (line 126).
6. When the index is ready, `_renderTOC` runs again. If there was no cache, `_openChapter` runs for the first time. `_prefetch` starts (line 305).

### Chapter Open Path

1. `_openChapter(id)` (line 328) bumps `_tok` and cancels the previous `tokRef` (lines 332-333). This is the stale-request guard.
2. It writes the last-read id to `localStorage` key `xfReader:last:<threadId>` (line 331).
3. `Store.getChapterBody(ch)` (line 133) checks the cache under `body:<postId>`. On a miss it fetches the page at `ch.page` with the `#post-<id>` anchor, takes `.bbWrapper`, and caches the HTML.
4. The chapter HTML renders into `.chapter` (line 341). The discussion bar shows `Discussion …`.
5. `Store.collectDiscussion(ch, next, tokRef)` (line 144) walks pages from `ch.page` forward. It keeps posts whose id is between this chapter and the next. It stops when a page contains a post at or past the next chapter, or after `PREFETCH_DISC_MAX` pages when there is no next chapter.
6. The comments render into `.disc`, and the bar shows the count (lines 345-346). A later `_openChapter` call discards the result if `tok` changed (line 344).

### Whole-story Export Path

1. `_export(btn)` (line 359) calls `Store.getChapterBody` for every chapter in `index.allChapters()`, with concurrency limited by `Net` (lines 365-367).
2. `buildEpub(index, onProgress)` (line 199) reads each body from `Store` (cache hits after step 1), sanitizes it with `bodyToXhtml` (line 188), and collects the files.
3. `makeZip` (line 167) writes the EPUB bytes. `_export` creates an object URL and clicks a temporary `<a download>` (lines 370-372).

### Background Prefetch Path

1. `_prefetch(index)` (line 348) starts `MAX_CONC` workers over the chronological chapter list.
2. Each worker calls `getChapterBody` then `prefetchDiscussion`, then schedules the next item with `requestIdleCallback` (fallback `setTimeout`, line 355).
3. All fetches go through `Net`, so the queue limits still apply.

**State Management:**
- Persistent: IndexedDB `xfReaderDB`/`cache` for index, bodies and page posts. `localStorage` keys `xfReader:view`, `xfReader:theme`, `xfReader:last:<threadId>`, `xfReader:launch`.
- In-memory: `Cache.mem` (a `Map`), `Net` queue state, and per-component fields on `QQReader` (`index`, `view`, `_curId`, `_tok`, `_tokRef`).
- Cache keys: `index:<threadId>`, `body:<postId>`, `posts:<threadId>:<page>`. Post ids are global, so body keys do not include the thread id.

## Key Abstractions

**Index object (`makeIndex`):**
- Purpose: Uniform view of a thread's chapters.
- Shape: `{ threadId, title, sections:[{label, chapters:[{title, postId, page}]}], allChapters(), grouped(), list(view), firstChapterId() }`
- Location: `xenforo-story-reader.user.js` line 104.
- Two orders: `grouped()` keeps category order (story first). `allChapters()` sorts by numeric `postId` (chronological). `list(view)` chooses between them.

**Chapter record:**
- Purpose: One threadmark row.
- Shape: `{ title, postId, page }`. `postId` is a string from the `post-(\d+)` href. `page` comes from `page-(\d+)` in the href, default 1.
- Created by: `Adapter.threadmarkRows` (line 75).

**Post record:**
- Purpose: One forum reply.
- Shape: `{ id, author, bodyHtml }`.
- Created by: `Adapter.posts` (line 82). Cached per page under `posts:<threadId>:<page>`.

**Net request record:**
- Purpose: One queued fetch with retry state.
- Shape: `{ url, opts, resolve, reject, tries }`.
- Retry: `tries < RETRIES` triggers exponential backoff, `min(8000, 2^tries * 300) + jitter`, on HTTP 429/503 and on thrown errors (lines 36-45).

**Web component (`qq-reader`):**
- Purpose: One mounted reader instance. Only one is created by the launcher (line 400 checks for an existing element).
- Pattern: Light-DOM host with a shadow root. Every query goes through `_q(selector)` (line 275), which reads the shadow root.

## Entry Points

**Userscript load:**
- Location: `xenforo-story-reader.user.js` line 18 (IIFE start), line 404-405 (mount).
- Triggers: Tampermonkey runs the file on matched `https://*/threads/*` URLs (`@match` lines 11-14) at `document-idle`.
- Responsibilities: Define all modules, register `qq-reader`, mount the launcher.

**Launcher click:**
- Location: `xenforo-story-reader.user.js` line 401.
- Triggers: user click on `.xfr-launch`.
- Responsibilities: Create and attach `<qq-reader>`.

**Test hook (test runs only):**
- Location: `xenforo-story-reader.user.js` lines 406-407.
- Triggers: `globalThis.__XFR_TEST__` set before import. Used by `test/unit.test.js` and `test/smoke.test.js`.
- Responsibilities: Expose `Net, Adapter, Cache, Store, crc32, makeZip, esc, bodyToXhtml, buildEpub, mountLauncher` on `globalThis.__xfr`. In a browser the flag is unset, so the object is not created.

## Architectural Constraints

- **Threading:** Single-threaded browser event loop. No workers. Concurrency comes only from `Net` (`MAX_CONC` = 4 in-flight fetches) and from the `Promise.all` in `_export`, which is still bounded by `Net`.
- **Global state:** Module-level singletons inside the IIFE: `Net` (queue, `active`, `last`), `Cache` (`mem`, `dbp`), `crcTable`. No `window` globals except `customElements` registration and the test-only `globalThis.__xfr`.
- **Circular imports:** Not applicable. There are no imports. Dependency order inside the file is strict: constants, Net, Adapter, Cache, Store, EPUB, CSS, QQReader, launcher. `Store` depends on `Net`, `Cache` and `Adapter`. `buildEpub` depends on `Store`. `QQReader` depends on everything above it.
- **Single instance per page:** `mountLauncher` returns early if `.xfr-launch` exists (line 387). `_export` has a busy flag on the button (line 360).
- **Page-load model:** XenForo uses full page loads. There is no router. `mountLauncher` runs once. The `Adapter` reads `location.href` at call time, so a navigation to another thread needs a new page load to re-run the script.
- **Stale async results:** `_openChapter` uses `_tok` and `tokRef.cancelled` to discard results from superseded chapter loads (lines 332-344, 149). Any new async call in the UI must follow this pattern.
- **Cache schema:** Any change to the shape stored in `Cache` must bump `CACHE_SCHEMA` (line 21), or old entries will be read as valid.
- **Site font:** `SITE_FONT` (line 23) is used in the reader and launcher. Changing it changes all UI text.

## Anti-Patterns

### Selectors outside `Adapter`

**What happens:** Some code reads XenForo markup directly, for example `document.querySelector('h1.p-title-value')` in `Adapter.threadTitle` (line 59) is correct, but `Store.getChapterBody` builds `'#post-'+ch.postId+' .bbWrapper'` inline (line 136), and `QQReader` reads only its own shadow DOM.
**Why it's wrong:** A forum markup change then needs edits in more than one place. `CONTEXT.md` says all selectors belong in one Adapter.
**Do this instead:** Add a method to `Adapter` (for example `Adapter.chapterBodyHtml(doc, postId)`) and call it from `Store`. The same applies to the `#post-` selector in `getChapterBody`.

### Duplicated retry logic in `Net`

**What happens:** The 429/503 branch (lines 36-38) and the error branch (lines 43-45) each build the same backoff and re-queue the request.
**Why it's wrong:** Two copies can drift. A fix to one branch misses the other.
**Do this instead:** Move the retry-and-requeue step into a single helper inside the `Net` IIFE and call it from both branches.

### Cache writes not awaited

**What happens:** `Cache.set` updates `mem` synchronously, then writes to IndexedDB inside a `try` that ignores errors (line 98). Callers do not await the IndexedDB transaction.
**Why it's wrong:** A failed write is silent. A page reload right after a write can lose the entry.
**Do this instead:** Keep the in-memory update. Log the error with `console.error('[xfReader] cache write failed', e)` in the `catch`, so write failures show in the console.

### Shared index record across layers

**What happens:** `buildIndex` caches `{sections, title}` (line 126) and `cachedIndex` rebuilds the index with `makeIndex` (line 131). The `threadId` comes from `Adapter.threadId()` at read time, not from the cached record.
**Why it's wrong:** If the stored key and the current URL ever disagree, the wrong thread id is attached to the data.
**Do this instead:** Store `threadId` in the cached record and read it back from there.

## Error Handling

**Strategy:** Fail soft. Each layer catches its own failures and lets the UI keep working with what it has.

**Patterns:**
- `Net` retries up to `RETRIES` (3) times on 429, 503 and thrown errors, then rejects (lines 36-46).
- `Cache` reads return `null` on any IndexedDB error (line 96). Writes are wrapped in `try` and ignored (line 98).
- `buildIndex` skips a failed category and logs `[xfReader] category failed` (line 124). The other categories still load.
- `collectDiscussion` and `prefetchDiscussion` stop on the first failed page (lines 150, 159).
- `_boot` logs `[xfReader] index build failed` on rejection (line 306). `_openChapter` returns early on a missing chapter (line 334).
- `_export` catches errors, shows `⚠` on the button for 3 seconds, and logs `[xfReader] EPUB export failed` (lines 375-378).
- `bodyToXhtml` removes `script`, `iframe`, `style`, `noscript` and attributes beginning with `on`, plus `class`, `id` and `data-xf-init` (lines 191-193). This is the sanitizer for EPUB output. The reader view relies on the site's own HTML and CSS scoping for chapter bodies, and the shadow DOM for isolation.

## Cross-Cutting Concerns

**Logging:** `console.error` with the `[xfReader]` prefix. No log levels or log sink.

**Validation:** Input from the forum is parsed by `DOMParser` and read through `Adapter` with fallbacks (for example `tmMaxPage` defaults to 1, `threadTitle` defaults to `Story`). Chapter body HTML from the forum is inserted into the shadow DOM as-is (line 341). It is not sanitized for display. Only the EPUB path sanitizes.

**Authentication:** None in the script. `Net` sends `credentials: 'include'` (line 34), so requests use the user's own browser session. The script does not read or store cookies or tokens.

**Persistence keys:** All `localStorage` keys use the `xfReader:` prefix (`LS_PREFIX`, line 21). IndexedDB name `xfReaderDB`.

---

*Architecture analysis: 2026-11-02*
