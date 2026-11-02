---
last_mapped_commit: 447ebf2f10ee7bb2a3652eee8ab505d6464356d7
last_mapped_at: 2026-11-02
---
# Coding Conventions

**Analysis Date:** 2026-11-02

## Naming Patterns

**Files:**
- The userscript is one file: `xenforo-story-reader.user.js` (repo root). Do not split it. The `@downloadURL` and `@updateURL` metadata point at this exact path.
- Test files use `<name>.test.js` in `test/`: `test/unit.test.js`, `test/smoke.test.js`.
- Config files use the tool default name: `vitest.config.js`, `package.json`.
- Shell scripts use lowercase with a `.sh` suffix: `e2e/run.sh`.
- Documentation files use UPPERCASE: `AGENTS.md`, `CONTEXT.md`, `README.md`.

**Functions:**
- Use camelCase for functions: `threadmarkRows`, `collectDiscussion`, `makeZip`, `bodyToXhtml`, `buildEpub`, `crc32`, `esc`.
- Top-level helpers in the EPUB section are plain `function` declarations: `crc32` and `makeZip` in `xenforo-story-reader.user.js`.
- Object methods and arrow functions are common inside module objects: `threadId: () => ...`, `tmUrl: (catId,page) => ...`.
- Methods that are private to a Web Component use a leading underscore: `_wire`, `_boot`, `_renderTOC`, `_openChapter`, `_export`, `_step`, `_q`.

**Variables:**
- Use `const` by default. Use `let` only when the value changes.
- Single-letter names are common in tight callbacks: `r` (response), `t` (transaction or timer), `p` (post), `c` (chapter or cache entry), `h` (html). Keep this style only in one-line callbacks.
- Module-level constants use UPPER_SNAKE_CASE: `LS_PREFIX`, `DB_NAME`, `DB_STORE`, `CACHE_SCHEMA`, `MIN_GAP`, `MAX_CONC`, `RETRIES`, `PREFETCH_DISC_MAX`, `SITE_FONT`, `CSS`.
- Mutable module state uses `let` in a closure: `let active=0; const q=[]; let last=0;` in `Net`.

**Types and Namespaces:**
- The script has no classes except the Web Component `QQReader` in `xenforo-story-reader.user.js`.
- Modules are PascalCase IIFE singletons: `Net`, `Adapter`, `Cache`, `Store`. Each one returns a plain object with its public API.
- Plain data objects are literals. There are no type annotations (JavaScript only, no TypeScript).
- Custom element tag names must contain a hyphen: `qq-reader`.

**CSS class names and DOM hooks:**
- Use short lowercase class names inside the shadow DOM: `.wrap`, `.side`, `.toc`, `.foot`, `.discbar`, `.comment`.
- Use the `xfr-` prefix for classes that live in the host page DOM. The launcher is `.xfr-launch`.
- Keyframe names have no fixed prefix. Existing names are `xfspin` (EPUB spinner) and `sk` (skeleton shimmer). Use a short, unique name.

**localStorage keys:**
- Prefix every key with `LS_PREFIX` (`'xfReader:'`): `xfReader:view`, `xfReader:theme`, `xfReader:launch`, and `xfReader:last:<threadId>`.
- Build keys with the constant, never with a bare string: `localStorage.getItem(LS_PREFIX+'view')`.

**Cache keys:**
- Use a `<kind>:<id>` format: `index:<threadId>`, `body:<postId>`, `posts:<threadId>:<page>`.

## Code Style

**Formatting:**
- No formatter config is committed. No Prettier file exists in the repo root.
- Indentation is two spaces in `test/*.js` and in the multi-line blocks of the userscript.
- The userscript packs many statements on one line, with no spaces around `=`, `:`, and operators in most places: `const LS_PREFIX='xfReader:', DB_NAME='xfReaderDB';`. Keep this density in the existing code. Do not reformat the whole file in an unrelated change, because it creates a large diff.
- Use single quotes for strings in JavaScript: `'xfReader:'`, `'cache'`. Use double quotes only inside HTML and CSS strings that need attribute quotes: `'<div class="wrap">'`.
- Use semicolons at the end of statements. Some one-line expressions omit them at the end of a block.
- Use template literals rarely. Build HTML by string concatenation with `+`: `'<h1>'+esc(ch.title)+'</h1>'`.
- The userscript is wrapped in one IIFE with `'use strict';`: `(function(){ 'use strict'; ... })();`.

**Linting:**
- No ESLint, Biome, or other linter config is committed.
- Do not add a linter as a side effect of a feature change. Propose it as a separate change.
- The only static check is the smoke test in `test/smoke.test.js`. It runs `new Function(src)` to confirm the file compiles.

**Language:**
- Use modern browser JavaScript: `Array.prototype.flatMap`, object spread, `async`/`await`, class syntax for the Web Component, and `requestIdleCallback` with a `setTimeout` fallback.
- Prefer `||` for defaults, as the file does throughout. The file uses `?.` once, in `Adapter.threadTitle`. Do not add more `?.` or `??` without a reason.

## Import Organization

**Userscript:**
- The userscript has no imports. Every dependency is a browser global (`fetch`, `DOMParser`, `indexedDB`, `localStorage`, `customElements`).
- The `@grant none` metadata line means the script cannot use Tampermonkey APIs such as `GM_xmlhttpRequest`. Keep it that way unless the metadata changes.

**Tests:**
- Import from `vitest` at the top: `import { describe, it, expect } from 'vitest';`.
- Import Node built-ins with the `node:` prefix: `import { readFileSync } from 'node:fs';`.
- Load the userscript with a top-level dynamic import after the test flag is set. See `TESTING.md`.

**Path Aliases:**
- Not used. Relative paths only: `'../xenforo-story-reader.user.js'`.

## Module Layout Inside the Userscript

The file has these sections, marked with block comments. Keep the order and the markers:

```javascript
/* ===== CONSTANTS ===== */
/* ===== NET ===== */
/* ===== ADAPTER ===== */
/* ===== CACHE ===== */
/* ===== STORE ===== */
/* ===== EPUB ===== */
/* ===== CSS ===== */
/* ===== WEB COMPONENT ===== */
/* ===== BOOTSTRAP / LAUNCHER (threadmark-gated) ===== */
```

Rules that follow from this layout:
- All XenForo DOM selectors belong in `Adapter`. Do not add `querySelector` calls for site markup to `Store` or `QQReader`. The `Adapter` header in `CONTEXT.md` is the reference for this rule.
- Network calls go through `Net.text`. Do not call `fetch` directly from other sections.
- Persistence goes through `Cache.get` and `Cache.set`. Do not open IndexedDB directly.
- The test hook at the bottom (`globalThis.__xfr = {...}`) lists the internals that tests need. Add a name there only when a test needs it.

## Error Handling

**Network:**
- `Net` retries HTTP 429 and 503 responses, and network exceptions, up to `RETRIES` (3) times. It uses exponential backoff with jitter: `Math.min(8000,(2**tries)*300)+Math.random()*200`.
- Reject with `new Error('HTTP '+r.status)` for other non-OK responses.
- Callers that fetch several pages use `try`/`catch` and keep going. See `fetchCategoryAll` and `buildIndex` in `xenforo-story-reader.user.js`. A failed category logs with `console.error('[xfReader] category failed', c, e)` and the build continues.

**Cache:**
- Cache reads and writes swallow errors and return `null` or do nothing: `catch(e){ return null; }`. The cache is an optimization. A failed cache read falls back to the network.
- Entries with a different `schema` value are treated as missing. Bump `CACHE_SCHEMA` when the stored shape changes.

**Parsing:**
- Parsing helpers return empty values, not exceptions. `threadmarkRows` filters out rows without a link. `posts` filters out articles without an id. `tmMaxPage` returns `1` when no page links exist.
- `getChapterBody` returns `''` when the post body is not found.
- `collectDiscussion` stops at the first failed page with `break` and returns what it collected.

**UI:**
- Show failures in the UI, not in the console alone. The EPUB export button shows a warning glyph and the tooltip `Export failed` for three seconds. See `_export` in `xenforo-story-reader.user.js`.
- Log to the console with the `[xfReader]` prefix for all diagnostics: `console.error('[xfReader] EPUB export failed', e);`.
- Stale async work is cancelled with a token. `_openChapter` increments `this._tok` and checks `tok!==this._tok` after each `await`. Follow this pattern for any new async render step.

**Empty catches:**
- Some `catch` blocks swallow errors on purpose: `Cache.get`, `Cache.set`, the `localStorage` JSON read in `mountLauncher`, and the `setPointerCapture` call in the launcher. Do not add new silent catches for network or render errors. Log or handle them.

## Logging

**Framework:** Browser `console` only.

**Patterns:**
- Prefix every message with `[xfReader]`.
- Use `console.error` for failures that change behavior. Do not use `console.log` in committed code.

## Comments

**When to Comment:**
- Comment the reason for a non-obvious choice. The file has comments for past failures and fixes. Example: `/* bottom-left by default (bottom-right sat on cookie-banner close buttons); drag to move, position persisted */`.
- Mark regressions in tests with the bug number: `// regression: categories are query params, NOT /category-N paths (bug #1)`.
- Do not comment what the code plainly does.

**JSDoc/TSDoc:**
- Not used. Do not add JSDoc blocks.

**Section markers:**
- Use the `/* ===== NAME ===== */` form for the section headers in the userscript. Use `/* test hook: ... */` for the test hook.

## Function Design

**Size:**
- Most functions are one to ten lines. Long functions exist in `QQReader._export` and `buildEpub`. Do not grow them further. Extract a helper in the same section.

**Parameters:**
- Use positional parameters. Options objects appear only for `Net.text(url, opts)`.
- Pass `index` objects, not separate arrays, between `Store` and `QQReader`.

**Return Values:**
- Return plain objects and arrays. Return `null` for "not found" in cache and index lookups: `cachedIndex` returns `null`.
- Return `Promise`s from async functions. Do not mix callbacks and promises in new code.

## Data Shapes

These shapes are used across sections. Keep them stable, or bump `CACHE_SCHEMA`:

- Chapter: `{ title: string, postId: string|null, page: number }`. Created by `Adapter.threadmarkRows`.
- Section: `{ label: string, chapters: Chapter[] }`. Created by `Store.buildIndex`.
- Index: `{ threadId, title, sections, allChapters(), grouped(), list(view), firstChapterId() }`. Created by `Store.makeIndex`.
- Post: `{ id: string, author: string, bodyHtml: string }`. Created by `Adapter.posts`.
- Ids are strings in the DOM model and numbers when compared: use `+post.id` for numeric comparison, and `String(id)` before a `dataset` or `localStorage` write.

## Module Design

**Exports:**
- The userscript exports nothing to the page. It runs in an IIFE.
- The test hook `globalThis.__xfr` exposes internals only when `globalThis.__XFR_TEST__` is set. Do not expose internals another way.

**Barrel Files:**
- Not used.

**Web Components:**
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

---

*Convention analysis: 2026-11-02*
