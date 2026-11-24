# Stack Research

**Domain:** Single-file Tampermonkey userscript, shadow-DOM custom element (`qq-reader`), milestone v0.8 "reading comfort"
**Researched:** 2026-11-02
**Confidence:** HIGH for the API choices. MEDIUM for three shadow-DOM and XenForo details that need one live check (marked below).

Scope: only the platform APIs for the three v0.8 features. The existing system (Net, Adapter, Cache, Store, EPUB) is not re-researched. No new dependency, no build step, `@grant none` stays.

## Recommended Stack

### Core Technologies (one per feature)

| Technology | Support (verified) | Purpose | Why Recommended |
|------------|--------------------|---------|-----------------|
| Passive `scroll` listener on `.main` + `requestAnimationFrame` throttle | Baseline, all browsers | In-chapter scroll progress (#1) | `.main` is already the one scroll container. One listener reads `scrollTop`. No observer setup. Cheap enough at one event per frame. |
| IndexedDB, **second database** `xfReaderState`, store `progress`, one record per chapter | `getAll(query)` Baseline widely available since Jan 2020 | Persist progress and read state (#1) | See "Why a separate database" below. One record per chapter makes writes atomic and the TOC read one `getAll`. |
| `visibilitychange` (state `hidden`) + 800 ms debounce | Baseline widely available since Apr 2021 | Flush progress before the tab goes away | MDN: `hidden` is "the last event that's reliably observable". `beforeunload` and `unload` are not reliable, and they block bfcache. |
| One `keydown` listener on `window`, capture phase, removed by `AbortController` signal | `addEventListener` Baseline widely available since Jul 2015. `composedPath()` since Jan 2020. | Keyboard navigation (#2) | Works wherever focus is on the page. Handles the shadow-DOM retargeting rule. Cleans up when the element is removed. |
| `Event.composedPath()[0]` | Baseline widely available since Jan 2020 | Find the real key target inside the open shadow root | At `window` level `event.target` is the host `<qq-reader>`. Only `composedPath()[0]` shows the `<input>` inside. |
| `<input type="search">` + `input` event + `hidden` attribute on TOC `<a>` | Baseline, all browsers | TOC filter (#3) | Native clear control, native mobile keyboard. Toggling `hidden` on the existing nodes avoids a re-render. |
| `String.prototype.normalize('NFD')` + `/\p{M}/gu` + `toLocaleLowerCase()` | Baseline, ES2018+ | Diacritic and case-insensitive matching | Chapter titles contain names with accents. No library needed. |
| CSS custom properties on `.wrap`, set from JS (`--xfr-fs`, `--xfr-lh`, `--xfr-measure`) | Baseline | Typography controls (#3) | The CSS already uses variables for theme. One `style.setProperty` call per control. No re-render. |
| `ch` unit for measure | Baseline | Line length | `ch` follows the element's font size, so measure in characters stays stable when font size changes. |
| `localStorage` key `xfReader:typo` (one JSON object) | Baseline | Persist typography (#3) | Matches the existing `xfReader:` convention. Synchronous read at `connectedCallback`, so no flash of default type. |

### Supporting APIs

| API | Version / support | Purpose | When to Use |
|-----|-------------------|---------|-------------|
| `shadowRoot.activeElement` | Baseline | Check which inner element has focus | Alternative to `composedPath()[0]` for the "is the user typing" test. Not needed if `composedPath` is used. |
| `element.focus({preventScroll:true})` on `.main` with `tabindex="-1"` | Baseline | Give the scroll container keyboard focus | After each `_openChapter` and after a TOC click, so Space, PageUp and PageDown scroll the chapter. Chrome 132+ also makes scrollers focusable by default, but Firefox and Safari behaviour is not verified. Do not depend on it. |
| `KeyboardEvent.code` | Baseline | Layout-independent J/K | Accept `e.code==='KeyJ'` or `e.key==='j'`. Covers Cyrillic and other non-Latin layouts. |
| `{once:false, passive:true}` on scroll and touch listeners | Baseline | Keep scrolling smooth | Only on `scroll`. The `keydown` listener must be non-passive because it calls `preventDefault`. |
| `IDBKeyRange.bound(prefix, prefix+'￿')` | Baseline | Read all chapters of one thread | Keys are strings `<threadId>:<postId>`. One `getAll(range)` returns the whole thread's state. |
| `db.onversionchange = () => db.close()` | Baseline | Never block another tab's upgrade | Add to the new DB connection. Also add it to the existing `xfReaderDB` connection (see Pitfalls). |
| `scrollend` event | Baseline 2025, "newly available" (since Dec 2025), NOT widely available | Optional exact "scroll finished" signal | Do not use for v0.8. The rAF-throttled `scroll` listener is enough. Revisit about mid-2028. |
| CSS `zoom` | Baseline 2024, "newly available" | Alternative to scale forum inline `px` sizes | Fallback only. See "Font size" below. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| vitest + happy-dom (existing) | Unit-test the pure parts | Pure functions to extract and test: `filterTitles(list, query)`, `clampTypo(obj)`, `progressOf(scrollTop, clientHeight, top, height)`, `keyAction(event-like)`. happy-dom does not do layout, so scroll and focus behaviour stays in the machine-local CDP e2e. |
| `e2e/run.sh` (existing, CDP) | Verify what happy-dom cannot | Check: keydown with focus on the TOC link, keydown with focus in the filter input, Esc order, scroll restore after reopen. |

## Design Decisions per Feature

### 1. Scroll progress and read state (#1)

**Measure the chapter, not the whole scroller.** `.main` holds chapter, discussion bar and discussion. Progress of the chapter is:

```js
// shortcut: assumes .chapter is the first child; fine while the layout is fixed
const p = Math.min(1, Math.max(0,
  (main.scrollTop + main.clientHeight - chap.offsetTop) / chap.offsetHeight));
```

Mark `read` when `p >= 0.95`. Never lower a stored `read` flag. Keep `max(p)` per chapter, so a scroll back up does not erase progress.

**Store a fraction, not pixels.** A typography change (feature #3) alters the chapter height. A fraction survives it. Restore with `main.scrollTop = p * chap.scrollHeight` after the body renders, then once more after images load (`load` event, capture, on `.chapter`) if the user has not scrolled yet.

**Stale-guard.** Every write path must use the existing `_tok` pattern from `_openChapter`. A scroll event that arrives after a chapter switch must not write to the new chapter id. Capture `const id=this._curId` when the listener is scheduled and compare when it fires.

**Why scroll listener, not IntersectionObserver.** IntersectionObserver is Baseline since March 2019 and works for "reached the end" sentinels. Its `root` rule is "descendant of the root in the containing block chain" (W3C spec). The spec text says nothing about shadow DOM. MDN says nothing either. That makes `root: this._q('.main')` an untested path in this project, for no gain: the scroll position is needed anyway for the progress fraction. Use one scroll listener. (Confidence HIGH on the decision, MEDIUM on the IO-in-shadow-DOM unknown.)

**Why a separate IndexedDB database.** Three reasons, all from the existing code:
1. `Cache.get` returns `null` unless `v.schema===CACHE_SCHEMA`. Progress stored in the `cache` store would be wiped by the next schema bump. A reader's progress is user data. A cache entry is disposable. They need different lifetimes.
2. Adding a store to `xfReaderDB` needs a version bump to 2. The current code opens version 1 and has no `onversionchange` handler. Any other open tab that still holds the v1 connection blocks the upgrade (`blocked` event, request waits). With auto-update from `main`, old tabs with the old script exist for every user after a push.
3. A new DB `xfReaderState` at version 1 has no upgrade conflict. The existing `Cache` code stays untouched.

Record shape: key `"<threadId>:<postId>"`, value `{p: 0..1, read: bool, ts: Date.now()}`. No `schema` wrapper. Add a `v:1` field inside the record for future migration.

**Write pattern.** One `readwrite` transaction, one `put`, no `await` across the transaction. Debounce 800 ms during scroll. Flush on `visibilitychange` hidden and on chapter switch. Do not use `durability:'strict'` or `readwriteflush`: progress is low value and a lost write costs a few percent of scroll. Do not add the `durability` option at all: MDN did not give support data for it (not verified).

**Read pattern.** At `_boot` and after TOC render: one `getAll(IDBKeyRange.bound(tid+':', tid+':￿'))`, build a `Map<postId, record>` in memory, mark TOC links with a class (`.read`, and a thin progress bar via CSS `background-size` or a `--p` custom property on the `<a>`). Keep the Map as the source for the UI. Write-through to IndexedDB.

**Failure mode.** IndexedDB can be unavailable (Firefox private windows in older versions, storage blocked). Wrap open in try/catch like `Cache`. On failure keep the in-memory Map only. Progress then works for the session and the reader does not break.

### 2. Keyboard navigation inside the shadow DOM (#2)

**Rule that drives the design.** Keyboard events are composed, so they cross the shadow boundary, but `event.target` is retargeted to the host `<qq-reader>` at any listener outside the shadow tree. A handler that does `e.target.matches('input')` is wrong: it sees the host, never the filter `<input>`. Use `e.composedPath()[0]`. This works because the shadow root is `mode:'open'`. With a closed root `composedPath()[0]` would be the host. Do not change the mode.

**Where to attach.** One listener on `window` in capture phase, added in `connectedCallback`, removed in a new `disconnectedCallback` through `AbortController.abort()`:

```js
connectedCallback(){
  this._ac = new AbortController();
  window.addEventListener('keydown', e => this._onKey(e), {capture:true, signal:this._ac.signal});
  /* ... existing code ... */
}
disconnectedCallback(){ this._ac.abort(); }   // this.remove() in the close button triggers it
```

Why `window` + capture and not a listener on the host or `.wrap`:
- A listener on the host only fires if focus is inside the shadow tree. Clicking a TOC `<a>` without `href` or `tabindex` moves focus to `<body>`. The next key never reaches the host.
- The reader is a full-screen overlay (`position:fixed; inset:0`). While it is mounted, it owns the keyboard. A global listener matches that.
- Capture on `window` runs before any page handler. Calling `stopPropagation()` for handled keys keeps XenForo's own shortcuts (number keys for nav tabs, M for the visitor menu) from also firing. Verified from XenForo community threads only (MEDIUM): J/K are not core defaults. The risk is a forum admin's custom shortcut template.

**Handler contract (order matters):**

```js
_onKey(e){
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.composedPath()[0];
  const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (e.key === 'Escape') {                    // Esc is allowed while typing
    if (typing && t.value) { t.value=''; /* re-run filter */ }
    else if (typing) t.blur();
    else this.remove();
    e.preventDefault(); e.stopPropagation(); return;
  }
  if (typing || e.repeat) return;              // J/K/arrows are text-editing keys in an input
  const k = e.key, c = e.code;
  const d = (k==='ArrowRight'||k==='j'||c==='KeyJ') ? 1
          : (k==='ArrowLeft' ||k==='k'||c==='KeyK') ? -1 : 0;
  if (d) { this._step(d); e.preventDefault(); e.stopPropagation(); }
}
```

Rules behind each guard:
- `e.isComposing`: IME composition must not trigger shortcuts.
- Modifier keys: never steal Ctrl+F, Cmd+K, Alt+Left (browser back) and similar.
- `e.repeat`: a held key must not skip 20 chapters.
- Check `typing` before J/K and arrows, so the filter input works. Esc is the one key handled while typing, and it clears before it closes.
- Reuse `_step`. It already uses the active reading order (`list(this.view)`) and the `_tok` guard.

**`/` to focus the filter** is one extra branch (`k==='/' && !typing` then `filterInput.focus()`, `preventDefault`). Cheap, conventional, recommended.

**Arrow keys and scrolling.** ArrowLeft and ArrowRight do not scroll the vertical `.main`, so using them for chapters costs nothing. Do not bind ArrowUp, ArrowDown, Space, PageUp, PageDown: let the browser scroll the focused scroller. For that to work after a TOC click, `.main` needs `tabindex="-1"` and a `.focus({preventScroll:true})` after each chapter open. Chrome 132 made scrollers focusable by default, but this is a Chrome rule only in the source read. Set it explicitly.

**Accessibility fix that rides along.** TOC `<a>` elements have no `href` and no `tabindex`, so Tab skips them. Add `href="#"` with `preventDefault` in the click handler, or `tabindex="0"` plus `role="link"` plus Enter handling. Without this, keyboard users cannot reach the TOC at all. Use `href` (free Enter support).

**Focus on open.** Move focus into the reader (`.main.focus()`) at the end of `connectedCallback`. Without it the keys still work through the `window` listener, but Space would scroll the page behind the overlay.

### 3. TOC filter and typography (#3)

**TOC filter.**
- Markup: `<input type="search" class="filter" placeholder="Filter chapters" aria-label="Filter chapters">` at the top of `.side`, outside `.toc` (so `_renderTOC` does not wipe it).
- Handler: `input` event. No debounce needed up to a few thousand rows (228 on the live test thread). Add one only if a profile shows jank.
- Match: build a normalized string once per link (`a._k = norm(c.title)`), compare with `includes`. `norm = s => s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase()`.
- Hide with the `hidden` attribute on the `<a>`. In grouped view, hide a `.sec` heading when no link after it, up to the next heading, is visible. Do it in one pass over `toc.children`.
- Keep the filter text across `_renderTOC` calls (view toggle, index rebuild): re-apply the filter at the end of `_renderTOC`. Do not persist the filter text in `localStorage`. A stale filter that hides chapters on the next open is worse than no persistence.
- Do not move the active chapter out of view: when the filter hides the active link, leave it hidden. Clearing the filter restores it, and `_markActive` should call `scrollIntoView({block:'nearest'})` on the active link.

**Typography controls.** State: `{fs:16, lh:1.7, measure:66}`. Defaults must equal today's rendering (16 px inherited, `1.7`, `760px` max width), or v0.8 changes the look for everyone who never touches the controls.

```css
.chapter{max-width:min(100%, calc(var(--xfr-measure,66) * 1ch));font-size:calc(var(--xfr-fs,16) * 1px)}
.chapter :is(p,li){line-height:var(--xfr-lh,1.7)}
```

- Apply: `wrap.style.setProperty('--xfr-fs', v)`. The variable lives on `.wrap` (inside the shadow root, so the site cannot touch it).
- Persist: `localStorage.setItem('xfReader:typo', JSON.stringify(state))`. Read with `try { JSON.parse } catch {}` and **clamp every field** (`fs` 12-32, `lh` 1.2-2.2, `measure` 40-100). Any other tab, old version or manual edit can leave garbage. Clamping is the validation at the trust boundary.
- Controls: `<input type="range" min step>` per setting plus a reset button. Range inputs give keyboard and touch support natively. Put them in a small popover inside `.side`, not in the one-row footer (the footer is already full with six icon buttons).
- Do not scale `.comment` text with the chapter font. The discussion is at 14 px by design. Leave it out unless asked.

**Font size and forum inline styles (the real trap).** XenForo BBCode `[SIZE]` renders inline `style="font-size: …px"` on spans inside the post body (not verified in this repo: no fixture contains it; check one live post). Inline px does not follow an inherited `font-size`. Two options:
1. Follow the house pattern already used for comments: `.chapter [style*="font-size"]{font-size:inherit !important}`. Simple, predictable, loses the author's size emphasis. **Recommended.**
2. `zoom` on `.chapter`. Scales inline px too and keeps emphasis. Baseline 2024 only ("newly available", not widely available), and it scales `max-width` as well, so the measure math changes. Fallback if option 1 hurts readers.
The same applies to inline `line-height`; handle it the same way only if a live post shows it.

**Do not change `SITE_FONT`.** The project constraint says the font family stays. The three controls change size, measure and line-height only.

**Storage scope.** `@grant none` means `localStorage` belongs to the forum origin. Settings do not carry between QQ, SpaceBattles and Sufficient Velocity. This is a known, accepted limit. `GM_setValue` would need a grant and break the constraint.

## Installation

```bash
# Nothing to install. No new dependency, no new file, no build step.
# All changes land in xenforo-story-reader.user.js. Bump @version and package.json together (smoke test enforces it).
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Second DB `xfReaderState` | New store `state` in `xfReaderDB`, DB version 2 | Only if `xfReaderDB` also gets `onversionchange` handling and the `blocked` case is handled. Costs more code and risk. |
| Per-chapter records | One record per thread (`{chapters:{…}}`) | Never for writes: a read-modify-write across two tabs loses updates. Acceptable only in a single readwrite transaction, which is more code. |
| `scroll` + rAF | `IntersectionObserver` sentinel at chapter end | If only the "read" flag mattered and not the fraction. Not the case. |
| `window` capture `keydown` | Listener on the host or `.wrap` | Only if the reader stops being a full-screen overlay. |
| `composedPath()[0]` | `shadowRoot.activeElement` | Equal result. `composedPath` also works for a future second shadow root. |
| One JSON key `xfReader:typo` | Three keys (`xfReader:fs`, …) matching `view` and `theme` | If the existing one-key-per-setting style matters more than a single atomic read. Both work. |
| Strip inline `font-size` | `zoom` | See above. |
| `hidden` toggling | Re-render the filtered list | If virtualised lists ever replace the plain `<a>` list. At 228 rows no. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `beforeunload` / `unload` to save progress | Not reliable on mobile, blocks bfcache | `visibilitychange` (hidden) + debounce |
| `e.target` in a `window` or `document` keydown handler | Retargeted to the `<qq-reader>` host. The filter-input test always fails and J/K fires while typing. | `e.composedPath()[0]` |
| `keyup`, or `keypress` | `keypress` is deprecated. `keyup` fires after the filter already consumed the key. | `keydown` |
| Closed shadow root | `composedPath()` hides inner nodes, so the typing test breaks | Keep `mode:'open'` |
| Storing progress in the `cache` store | Wiped by `CACHE_SCHEMA` bump | Separate DB |
| Bumping `xfReaderDB` to version 2 | Blocked by any tab that holds v1 (no `onversionchange` handler today) | Separate DB |
| `scrollend` event | Baseline 2025, newly available only. Older browsers lack it. | rAF-throttled `scroll` |
| `scroll` listener without `passive` or without throttle | Jank on mobile. Writes IndexedDB per event. | `{passive:true}` + rAF + 800 ms debounce for writes |
| Pixel scroll offsets in storage | Breaks when font size or measure changes | Fraction 0..1 |
| `rem` for font size | In the shadow tree `rem` still follows the forum page's root size | `px` from a variable |
| A `keydown` handler without the `e.repeat`, `isComposing` and modifier guards | Skips chapters, breaks IME, steals browser shortcuts | Guards as shown |
| `GM_*` storage | Needs a grant, breaks `@grant none` | `localStorage`, IndexedDB |
| A library for any of this (hotkeys, fuse.js, idb) | The file ships as its own source. Each feature is under 40 lines. | Platform APIs |

## Stack Patterns by Variant

**If a second browser tab of the same thread is open:**
- Per-chapter records plus `max(p)` merge on write give last-writer-wins per chapter, with no lost chapter.
- Do not add the `storage` or BroadcastChannel sync in v0.8. The TOC state shows the other tab's progress on the next open.

**If IndexedDB is unavailable or throws:**
- Keep the in-memory Map. Skip persistence silently, with one `console.error('[xfReader] …')` like the rest of the file.

**If the forum body has images that load late:**
- Restore the scroll fraction again on the `load` event of the first image, only while the user has not scrolled (`this._userScrolled` false).

## Version Compatibility

| Feature | Min browser behaviour | Notes |
|---------|-----------------------|-------|
| `composedPath()`, `getAll(range)` | Jan 2020 (Baseline widely) | Safe on any browser Tampermonkey runs in today |
| `visibilitychange` | Apr 2021 | |
| `addEventListener` `signal` option | Baseline widely per MDN header (parts vary, `signal` row not shown) | Fallback if a target browser lacks it: keep the handler reference and call `removeEventListener` in `disconnectedCallback` |
| `\p{M}` with `u` flag | ES2018 | |
| `color-mix()` | Already used in the CSS | No new baseline floor from v0.8 |
| `zoom`, `scrollend` | Baseline 2024 / Dec 2025, "newly available" | Not used in the primary path |
| Keyboard-focusable scrollers | Chrome 132 only (source) | Set `tabindex="-1"` + `focus()` explicitly |

## Sources

- [MDN IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4310): Baseline widely available since March 2019. HIGH.
- [W3C IntersectionObserver spec](https://w3c.github.io/IntersectionObserver/#intersection-observer-interface) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4336): root rule is the containing block chain. Silent on shadow DOM. HIGH for the text, so the shadow case is MEDIUM.
- [MDN scrollend](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollend_event) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4309): Baseline 2025 newly available, since Dec 2025. HIGH.
- [MDN Event.composedPath](https://developer.mozilla.org/en-US/docs/Web/API/Event/composedPath) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4324): widely available since Jan 2020. Open-root path includes inner nodes. HIGH.
- [MDN visibilitychange](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4327): last reliable event, widely available since Apr 2021. HIGH.
- [MDN IDBObjectStore.getAll](https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAll) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4326): widely available since Jan 2020, takes `IDBKeyRange`. HIGH.
- [MDN IDBDatabase.transaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4325): `durability` option exists, per-browser support not shown. LOW for support, so not recommended.
- [MDN IDBOpenDBRequest blocked event](https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4337): an open v1 connection blocks the upgrade. Close in `onversionchange`. HIGH.
- [MDN addEventListener](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4329): `signal`, `capture`, `passive`. HIGH.
- [MDN CSS zoom](https://developer.mozilla.org/en-US/docs/Web/CSS/zoom) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4330): Baseline 2024 newly available. Effect on `max-width` is inference. MEDIUM.
- [Chrome: keyboard focusable scrollers](https://developer.chrome.com/blog/keyboard-focusable-scrollers) · [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4328): Chrome 132. Other browsers not stated. HIGH for Chrome only.
- XenForo community search (web search, no page read): no J/K core shortcuts, number keys and M exist. LOW to MEDIUM.
- Project code read: `xenforo-story-reader.user.js` lines 90-100 (Cache), 218-382 (CSS, QQReader). HIGH.

---
*Stack research for: v0.8 reading-comfort features in a single-file XenForo userscript*
*Researched: 2026-11-02*
