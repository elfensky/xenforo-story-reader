<!-- GSD:project-start source:PROJECT.md -->

## Project

**XenForo Story Reader**

A Tampermonkey userscript that turns a threadmarked XenForo story thread (Questionable Questing,
SpaceBattles, Sufficient Velocity) into an AO3/FFN-style reader: a chapter TOC sidebar, the
chapter body as the focus, the forum discussion between chapters shown inline as comments under
each chapter, and a whole-story EPUB export. It is for a reader who likes stories on forum
boards but not the forum format. One file, read-only, no build step.

**Core Value:** A threadmarked story reads like a book — chapters in order, the story as the focus, the
discussion as comments — without the script ever touching the reader's account.

### Constraints

- **Tech stack**: plain browser JavaScript in one file, `@grant none`, no runtime dependencies — the userscript ships as its own source.
- **Read-only**: fetch, parse, render, export only — the script runs with the reader's logged-in session.
- **Politeness**: every request goes through `Net` (capped concurrency, gap, backoff) — the forums are volunteer-run sites.
- **Selectors**: XenForo markup is read only in `Adapter` — one place to change for DOM changes or new forums.
- **Font**: use the site's font stack (`SITE_FONT`), do not change it — CONTEXT.md.
- **Storage**: localStorage keys under `xfReader:`; IndexedDB `xfReaderDB`/`cache`, schema-versioned.
- **Tests**: `npm test` (vitest + happy-dom) must pass; CI runs it on Node 26.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- JavaScript (ES2017+, browser-native, `'use strict'`) - all application code in `xenforo-story-reader.user.js` (about 408 lines)
- JavaScript (ESM, `"type": "module"`) - tests in `test/unit.test.js`, `test/smoke.test.js`, and config in `vitest.config.js`
- Bash - the machine-local e2e driver `e2e/run.sh`
- YAML - CI workflow `.github/workflows/test.yml`
- Markdown - docs `README.md`, `AGENTS.md`, `CONTEXT.md`

## Runtime

- Target runtime: a desktop or mobile browser page on `https://forum.questionablequesting.com`, `https://questionablequesting.com`, `https://forums.spacebattles.com`, and `https://forums.sufficientvelocity.com` (`@match` rules in `xenforo-story-reader.user.js`, header lines 11-14)
- Userscript manager required: Tampermonkey (recommended), Violentmonkey, or Greasemonkey (`README.md`, Install section)
- Browser APIs used: `fetch`, `DOMParser`, `indexedDB`, `localStorage`, `Blob`, `URL.createObjectURL`, `TextEncoder`, Shadow DOM (`attachShadow`), and Custom Elements (`customElements.define`)
- Test/dev runtime: Node.js 26 (`.github/workflows/test.yml` sets `node-version: 26`; `e2e/run.sh` runs `mise x node@26`)
- No `.nvmrc`, `.node-version`, `.tool-versions`, `.mise.toml`, or `engines` field exists. The Node version lives only in CI and in `e2e/run.sh`.
- npm
- Lockfile: present (`package-lock.json`, lockfileVersion 3)

## Frameworks

- None. The userscript uses vanilla DOM APIs, a Custom Element `<qq-reader>` with a shadow root, and no UI library.
- Vitest `^3.2.0` (locked at 3.2.7) - test runner, configured in `vitest.config.js`
- happy-dom `^19.0.0` (locked at 19.0.2) - DOM environment for tests (`environment: 'happy-dom'` in `vitest.config.js`)
- Node built-in `node:fs` and `node:path` URL helpers - used by `test/smoke.test.js` to read the script as text
- None. There is no build step. The file in the repo is the file installed by users.
- Vite 7.x and esbuild are transitive dependencies of Vitest. They are not used directly by the project.

## Key Dependencies

- `vitest` `^3.2.0` (3.2.7 locked) - runs `npm test`, which is `vitest run`
- `happy-dom` `^19.0.0` (19.0.2 locked) - simulates the XenForo DOM for `Adapter` parsing tests
- `@types/node` - present in the lock as a transitive dependency only
- `chrome-devtools` CLI (external, not in `package.json`) - drives the real browser in `e2e/run.sh`. It is installed via `mise` and is machine-local.
- None. The `package.json` has no `dependencies` section. The script uses no libraries and no `@require` URLs.

## Userscript Metadata and Grants

- `@version 0.7.4` (matches `package.json` version; the smoke test enforces this)
- `@grant none` - the script uses no `GM_*` APIs. It runs in the page context with the page's own `localStorage`, `indexedDB`, and cookies.
- `@run-at document-idle`
- `@downloadURL` and `@updateURL` - both point to `https://raw.githubusercontent.com/elfensky/xenforo-story-reader/main/xenforo-story-reader.user.js`

## Configuration

- No environment variables are read by the script or the tests.
- No `.env` files are present in the tracked tree.
- Runtime tuning constants live at the top of `xenforo-story-reader.user.js` (lines 20-23):
- `vitest.config.js` - `happy-dom` environment, URL `https://forums.spacebattles.com/threads/test-story.853195/`, excludes `**/.worktrees/**`
- `package.json` scripts: `test` (`vitest run`), `test:watch` (`vitest`), `e2e` (`./e2e/run.sh`)
- `.gitignore` - ignores `node_modules/` and `.worktrees/`

## Export Format

- Hand-rolled ZIP writer `makeZip` and `crc32` in the userscript
- EPUB2 structure: `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/toc.ncx`, and XHTML chapters
- Output is a `Blob` of type `application/epub+zip`, downloaded through a temporary `<a download>` element

## Platform Requirements

- Node.js 26 and npm (matches CI)
- `npm ci` then `npm test` for unit and smoke tests
- `npm run e2e` additionally requires a logged-in Chrome with a CDP-capable `chrome-devtools` CLI, described in `e2e/run.sh` header and `meta/SETUP.md` (vault reference)
- A userscript manager to load the file into a browser for manual testing
- Distributed as a single file through GitHub raw URLs (`https://raw.githubusercontent.com/elfensky/xenforo-story-reader/main/xenforo-story-reader.user.js`)
- Runs client-side only. There is no server, no hosting, and no deployment pipeline beyond merging to `main`.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- The userscript is one file: `xenforo-story-reader.user.js` (repo root). Do not split it. The `@downloadURL` and `@updateURL` metadata point at this exact path.
- Test files use `<name>.test.js` in `test/`: `test/unit.test.js`, `test/smoke.test.js`.
- Config files use the tool default name: `vitest.config.js`, `package.json`.
- Shell scripts use lowercase with a `.sh` suffix: `e2e/run.sh`.
- Documentation files use UPPERCASE: `AGENTS.md`, `CONTEXT.md`, `README.md`.
- Use camelCase for functions: `threadmarkRows`, `collectDiscussion`, `makeZip`, `bodyToXhtml`, `buildEpub`, `crc32`, `esc`.
- Top-level helpers in the EPUB section are plain `function` declarations: `crc32` and `makeZip` in `xenforo-story-reader.user.js`.
- Object methods and arrow functions are common inside module objects: `threadId: () => ...`, `tmUrl: (catId,page) => ...`.
- Methods that are private to a Web Component use a leading underscore: `_wire`, `_boot`, `_renderTOC`, `_openChapter`, `_export`, `_step`, `_q`.
- Use `const` by default. Use `let` only when the value changes.
- Single-letter names are common in tight callbacks: `r` (response), `t` (transaction or timer), `p` (post), `c` (chapter or cache entry), `h` (html). Keep this style only in one-line callbacks.
- Module-level constants use UPPER_SNAKE_CASE: `LS_PREFIX`, `DB_NAME`, `DB_STORE`, `CACHE_SCHEMA`, `MIN_GAP`, `MAX_CONC`, `RETRIES`, `PREFETCH_DISC_MAX`, `SITE_FONT`, `CSS`.
- Mutable module state uses `let` in a closure: `let active=0; const q=[]; let last=0;` in `Net`.
- The script has no classes except the Web Component `QQReader` in `xenforo-story-reader.user.js`.
- Modules are PascalCase IIFE singletons: `Net`, `Adapter`, `Cache`, `Store`. Each one returns a plain object with its public API.
- Plain data objects are literals. There are no type annotations (JavaScript only, no TypeScript).
- Custom element tag names must contain a hyphen: `qq-reader`.
- Use short lowercase class names inside the shadow DOM: `.wrap`, `.side`, `.toc`, `.foot`, `.discbar`, `.comment`.
- Use the `xfr-` prefix for classes that live in the host page DOM. The launcher is `.xfr-launch`.
- Keyframe names have no fixed prefix. Existing names are `xfspin` (EPUB spinner) and `sk` (skeleton shimmer). Use a short, unique name.
- Prefix every key with `LS_PREFIX` (`'xfReader:'`): `xfReader:view`, `xfReader:theme`, `xfReader:launch`, and `xfReader:last:<threadId>`.
- Build keys with the constant, never with a bare string: `localStorage.getItem(LS_PREFIX+'view')`.
- Use a `<kind>:<id>` format: `index:<threadId>`, `body:<postId>`, `posts:<threadId>:<page>`.

## Code Style

- No formatter config is committed. No Prettier file exists in the repo root.
- Indentation is two spaces in `test/*.js` and in the multi-line blocks of the userscript.
- The userscript packs many statements on one line, with no spaces around `=`, `:`, and operators in most places: `const LS_PREFIX='xfReader:', DB_NAME='xfReaderDB';`. Keep this density in the existing code. Do not reformat the whole file in an unrelated change, because it creates a large diff.
- Use single quotes for strings in JavaScript: `'xfReader:'`, `'cache'`. Use double quotes only inside HTML and CSS strings that need attribute quotes: `'<div class="wrap">'`.
- Use semicolons at the end of statements. Some one-line expressions omit them at the end of a block.
- Use template literals rarely. Build HTML by string concatenation with `+`: `'<h1>'+esc(ch.title)+'</h1>'`.
- The userscript is wrapped in one IIFE with `'use strict';`: `(function(){ 'use strict'; ... })();`.
- No ESLint, Biome, or other linter config is committed.
- Do not add a linter as a side effect of a feature change. Propose it as a separate change.
- The only static check is the smoke test in `test/smoke.test.js`. It runs `new Function(src)` to confirm the file compiles.
- Use modern browser JavaScript: `Array.prototype.flatMap`, object spread, `async`/`await`, class syntax for the Web Component, and `requestIdleCallback` with a `setTimeout` fallback.
- Prefer `||` for defaults, as the file does throughout. The file uses `?.` once, in `Adapter.threadTitle`. Do not add more `?.` or `??` without a reason.

## Import Organization

- The userscript has no imports. Every dependency is a browser global (`fetch`, `DOMParser`, `indexedDB`, `localStorage`, `customElements`).
- The `@grant none` metadata line means the script cannot use Tampermonkey APIs such as `GM_xmlhttpRequest`. Keep it that way unless the metadata changes.
- Import from `vitest` at the top: `import { describe, it, expect } from 'vitest';`.
- Import Node built-ins with the `node:` prefix: `import { readFileSync } from 'node:fs';`.
- Load the userscript with a top-level dynamic import after the test flag is set. See `TESTING.md`.
- Not used. Relative paths only: `'../xenforo-story-reader.user.js'`.

## Module Layout Inside the Userscript

- All XenForo DOM selectors belong in `Adapter`. Do not add `querySelector` calls for site markup to `Store` or `QQReader`. The `Adapter` header in `CONTEXT.md` is the reference for this rule.
- Network calls go through `Net.text`. Do not call `fetch` directly from other sections.
- Persistence goes through `Cache.get` and `Cache.set`. Do not open IndexedDB directly.
- The test hook at the bottom (`globalThis.__xfr = {...}`) lists the internals that tests need. Add a name there only when a test needs it.

## Error Handling

- `Net` retries HTTP 429 and 503 responses, and network exceptions, up to `RETRIES` (3) times. It uses exponential backoff with jitter: `Math.min(8000,(2**tries)*300)+Math.random()*200`.
- Reject with `new Error('HTTP '+r.status)` for other non-OK responses.
- Callers that fetch several pages use `try`/`catch` and keep going. See `fetchCategoryAll` and `buildIndex` in `xenforo-story-reader.user.js`. A failed category logs with `console.error('[xfReader] category failed', c, e)` and the build continues.
- Cache reads and writes swallow errors and return `null` or do nothing: `catch(e){ return null; }`. The cache is an optimization. A failed cache read falls back to the network.
- Entries with a different `schema` value are treated as missing. Bump `CACHE_SCHEMA` when the stored shape changes.
- Parsing helpers return empty values, not exceptions. `threadmarkRows` filters out rows without a link. `posts` filters out articles without an id. `tmMaxPage` returns `1` when no page links exist.
- `getChapterBody` returns `''` when the post body is not found.
- `collectDiscussion` stops at the first failed page with `break` and returns what it collected.
- Show failures in the UI, not in the console alone. The EPUB export button shows a warning glyph and the tooltip `Export failed` for three seconds. See `_export` in `xenforo-story-reader.user.js`.
- Log to the console with the `[xfReader]` prefix for all diagnostics: `console.error('[xfReader] EPUB export failed', e);`.
- Stale async work is cancelled with a token. `_openChapter` increments `this._tok` and checks `tok!==this._tok` after each `await`. Follow this pattern for any new async render step.
- Some `catch` blocks swallow errors on purpose: `Cache.get`, `Cache.set`, the `localStorage` JSON read in `mountLauncher`, and the `setPointerCapture` call in the launcher. Do not add new silent catches for network or render errors. Log or handle them.

## Logging

- Prefix every message with `[xfReader]`.
- Use `console.error` for failures that change behavior. Do not use `console.log` in committed code.

## Comments

- Comment the reason for a non-obvious choice. The file has comments for past failures and fixes. Example: `/* bottom-left by default (bottom-right sat on cookie-banner close buttons); drag to move, position persisted */`.
- Mark regressions in tests with the bug number: `// regression: categories are query params, NOT /category-N paths (bug #1)`.
- Do not comment what the code plainly does.
- Not used. Do not add JSDoc blocks.
- Use the `/* ===== NAME ===== */` form for the section headers in the userscript. Use `/* test hook: ... */` for the test hook.

## Function Design

- Most functions are one to ten lines. Long functions exist in `QQReader._export` and `buildEpub`. Do not grow them further. Extract a helper in the same section.
- Use positional parameters. Options objects appear only for `Net.text(url, opts)`.
- Pass `index` objects, not separate arrays, between `Store` and `QQReader`.
- Return plain objects and arrays. Return `null` for "not found" in cache and index lookups: `cachedIndex` returns `null`.
- Return `Promise`s from async functions. Do not mix callbacks and promises in new code.

## Data Shapes

- Chapter: `{ title: string, postId: string|null, page: number }`. Created by `Adapter.threadmarkRows`.
- Section: `{ label: string, chapters: Chapter[] }`. Created by `Store.buildIndex`.
- Index: `{ threadId, title, sections, allChapters(), grouped(), list(view), firstChapterId() }`. Created by `Store.makeIndex`.
- Post: `{ id: string, author: string, bodyHtml: string }`. Created by `Adapter.posts`.
- Ids are strings in the DOM model and numbers when compared: use `+post.id` for numeric comparison, and `String(id)` before a `dataset` or `localStorage` write.

## Module Design

- The userscript exports nothing to the page. It runs in an IIFE.
- The test hook `globalThis.__xfr` exposes internals only when `globalThis.__XFR_TEST__` is set. Do not expose internals another way.
- Not used.
- Define with `customElements.define` behind a guard: `if(!customElements.get('qq-reader')) customElements.define('qq-reader',QQReader);`. Keep the guard.
- Use shadow DOM (`attachShadow({mode:'open'})`) for all reader UI. Put styles in the `CSS` constant and inject them as one `<style>` element.
- Theme is a host class: `:host(.light)` in `CSS` toggles light mode.

## Security Conventions

- Escape every value that goes into HTML with `esc()`: titles, authors, and labels. Example: `'<h1>'+esc(ch.title)+'</h1>'`.
- Chapter and comment bodies come from the forum as HTML. Insert them as `innerHTML` only after the forum's own markup. Do not add new sources of HTML.
- `bodyToXhtml` strips `script`, `iframe`, `style`, `noscript`, all `on*` attributes, `class`, `id`, and `data-xf-init` before writing an EPUB. Keep this sanitizer for every EPUB output path.
- Do not add a credential or token to any request, URL, or stored value. `Net` sends credentials only through `fetch`'s `credentials:'include'`.

## Versioning

- The version lives in two places and must match: the `@version` line in `xenforo-story-reader.user.js` and `"version"` in `package.json`. The smoke test checks this.
- Use semantic versions in `@version` (`MAJOR.MINOR.PATCH`). The smoke test rejects other formats.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Pattern Overview

- One file, no build step, no bundler, no module system. `xenforo-story-reader.user.js` is the whole product.
- The whole script runs inside one `(function(){ 'use strict'; ... })();` wrapper (line 18 and line 408). Nothing leaks to `window` except the custom element registration and, under test only, `globalThis.__xfr`.
- Layers are ordered by convention, not enforced: Adapter, Cache, Net feed Store; Store feeds UI and EPUB. The UI does not call Net, Cache or Adapter directly except `Adapter.threadId()` and `Adapter.threadTitle()`, which the UI reads for the storage key and title.
- Read-only by design. The script issues only GET-style `fetch` calls through `Net.text`. It never posts, likes or changes account state (`CONTEXT.md` Constraints).
- The UI renders inside a shadow DOM (`attachShadow({mode:'open'})`, line 257). Site CSS does not leak in, and the reader CSS does not leak out.

## Layers

- Purpose: Rate-limit and retry every outbound request.
- Location: `xenforo-story-reader.user.js` lines 25-50
- Contains: one FIFO queue `q`, a pump function, and `text(url, opts)` as the only public method.
- Depends on: browser `fetch`, constants `MAX_CONC` (4), `MIN_GAP` (120 ms), `RETRIES` (3) on lines 22.
- Used by: `Store` only (`fetchCategoryAll`, `buildIndex`, `getChapterBody`, `getPagePosts`).
- Purpose: Isolate every selector, URL pattern and page-structure assumption about XenForo.
- Location: `xenforo-story-reader.user.js` lines 52-88
- Contains: URL builders (`threadBase`, `threadmarksUrl`, `pageUrl`, `tmUrl`), readers (`threadId`, `threadTitle`, `categoryTabs`, `threadmarkRows`, `tmMaxPage`, `posts`), and the threadmark gate `hasThreadmarks`.
- Depends on: `DOMParser`, `location.href`, `document`.
- Used by: `Store`, `Bootstrap`, `QQReader._boot` and `QQReader._openChapter` (via `Adapter.threadId()`).
- Rule: DOM or URL changes on a forum belong here. See `CONTEXT.md` section "KEY SELECTORS / FORMATS".
- Purpose: Keep index, chapter bodies and post pages across page loads.
- Location: `xenforo-story-reader.user.js` lines 90-100
- Contains: `mem` (a `Map`) and an IndexedDB store `xfReaderDB` / `cache` (object store `cache`, key-value, values wrapped as `{schema, data, ts}`).
- Depends on: `indexedDB`, constants `DB_NAME`, `DB_STORE`, `CACHE_SCHEMA` (2).
- Used by: `Store` only.
- Invalidation: a read returns `null` when the stored `schema` differs from `CACHE_SCHEMA`. Bumping that constant invalidates all entries. There is no TTL and no size cap in code.
- Purpose: Build the chapter index, fetch chapter bodies and discussion posts, and decide which pages to fetch.
- Location: `xenforo-story-reader.user.js` lines 103-162
- Contains: `makeIndex` (index object with `allChapters`, `grouped`, `list(view)`, `firstChapterId`), `fetchCategoryAll`, `buildIndex`, `cachedIndex`, `getChapterBody`, `getPagePosts`, `collectDiscussion`, `prefetchDiscussion`.
- Depends on: `Net`, `Cache`, `Adapter`, `PREFETCH_DISC_MAX` (10).
- Used by: `QQReader` (all data access), `buildEpub` (via `Store.getChapterBody`).
- Purpose: Turn the index and cached bodies into an EPUB 2 `Blob`.
- Location: `xenforo-story-reader.user.js` lines 164-216
- Contains: `crcTable` and `crc32` (lines 165-166), `makeZip` (STORE mode, no compression, lines 167-186), `esc` (line 187), `bodyToXhtml` sanitizer (lines 188-198), `buildEpub` (lines 199-216).
- Depends on: `Store.getChapterBody`, `DOMParser`, `XMLSerializer`, `TextEncoder`, `Blob`.
- Used by: `QQReader._export` only.
- Purpose: One string constant with all reader and launcher styles.
- Location: `xenforo-story-reader.user.js` lines 218-253 (`const CSS`). The launcher style is inline in `mountLauncher` (line 392).
- Theme: CSS custom properties on `:host`. Light theme is the class `light` on the host element (`:host(.light)`).
- Purpose: Render the chapter list, the chapter body, the discussion, the footer controls and the export button.
- Location: `xenforo-story-reader.user.js` lines 255-382. Registered as `qq-reader` on line 383.
- Contains: lifecycle (`connectedCallback`), wiring (`_wire`), boot (`_boot`), TOC rendering (`_renderTOC`, `_tocLink`, `_markActive`), navigation (`_step`, `_neighbors`), chapter display (`_openChapter`), background prefetch (`_prefetch`), export (`_export`).
- Depends on: `Store`, `Adapter`, `buildEpub`, `esc`, `CSS`, `SITE_FONT`, `localStorage`.
- Purpose: Add the floating "Reader" button to threadmark pages and open the `qq-reader` element on click.
- Location: `xenforo-story-reader.user.js` lines 385-405 (`mountLauncher`), plus the trigger on lines 404-405.
- Gate: `Adapter.hasThreadmarks()` must return true, or nothing mounts (line 388).
- Depends on: `Adapter`, `SITE_FONT`, `localStorage` key `xfReader:launch` for the saved position.

## Data Flow

### Primary Request Path (open reader on a threadmarked thread)

### Chapter Open Path

### Whole-story Export Path

### Background Prefetch Path

- Persistent: IndexedDB `xfReaderDB`/`cache` for index, bodies and page posts. `localStorage` keys `xfReader:view`, `xfReader:theme`, `xfReader:last:<threadId>`, `xfReader:launch`.
- In-memory: `Cache.mem` (a `Map`), `Net` queue state, and per-component fields on `QQReader` (`index`, `view`, `_curId`, `_tok`, `_tokRef`).
- Cache keys: `index:<threadId>`, `body:<postId>`, `posts:<threadId>:<page>`. Post ids are global, so body keys do not include the thread id.

## Key Abstractions

- Purpose: Uniform view of a thread's chapters.
- Shape: `{ threadId, title, sections:[{label, chapters:[{title, postId, page}]}], allChapters(), grouped(), list(view), firstChapterId() }`
- Location: `xenforo-story-reader.user.js` line 104.
- Two orders: `grouped()` keeps category order (story first). `allChapters()` sorts by numeric `postId` (chronological). `list(view)` chooses between them.
- Purpose: One threadmark row.
- Shape: `{ title, postId, page }`. `postId` is a string from the `post-(\d+)` href. `page` comes from `page-(\d+)` in the href, default 1.
- Created by: `Adapter.threadmarkRows` (line 75).
- Purpose: One forum reply.
- Shape: `{ id, author, bodyHtml }`.
- Created by: `Adapter.posts` (line 82). Cached per page under `posts:<threadId>:<page>`.
- Purpose: One queued fetch with retry state.
- Shape: `{ url, opts, resolve, reject, tries }`.
- Retry: `tries < RETRIES` triggers exponential backoff, `min(8000, 2^tries * 300) + jitter`, on HTTP 429/503 and on thrown errors (lines 36-45).
- Purpose: One mounted reader instance. Only one is created by the launcher (line 400 checks for an existing element).
- Pattern: Light-DOM host with a shadow root. Every query goes through `_q(selector)` (line 275), which reads the shadow root.

## Entry Points

- Location: `xenforo-story-reader.user.js` line 18 (IIFE start), line 404-405 (mount).
- Triggers: Tampermonkey runs the file on matched `https://*/threads/*` URLs (`@match` lines 11-14) at `document-idle`.
- Responsibilities: Define all modules, register `qq-reader`, mount the launcher.
- Location: `xenforo-story-reader.user.js` line 401.
- Triggers: user click on `.xfr-launch`.
- Responsibilities: Create and attach `<qq-reader>`.
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

### Duplicated retry logic in `Net`

### Cache writes not awaited

### Shared index record across layers

## Error Handling

- `Net` retries up to `RETRIES` (3) times on 429, 503 and thrown errors, then rejects (lines 36-46).
- `Cache` reads return `null` on any IndexedDB error (line 96). Writes are wrapped in `try` and ignored (line 98).
- `buildIndex` skips a failed category and logs `[xfReader] category failed` (line 124). The other categories still load.
- `collectDiscussion` and `prefetchDiscussion` stop on the first failed page (lines 150, 159).
- `_boot` logs `[xfReader] index build failed` on rejection (line 306). `_openChapter` returns early on a missing chapter (line 334).
- `_export` catches errors, shows `⚠` on the button for 3 seconds, and logs `[xfReader] EPUB export failed` (lines 375-378).
- `bodyToXhtml` removes `script`, `iframe`, `style`, `noscript` and attributes beginning with `on`, plus `class`, `id` and `data-xf-init` (lines 191-193). This is the sanitizer for EPUB output. The reader view relies on the site's own HTML and CSS scoping for chapter bodies, and the shadow DOM for isolation.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
