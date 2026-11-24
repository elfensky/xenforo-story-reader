# Architecture Research — v0.8 "Reading Comfort"

**Domain:** Single-file Tampermonkey userscript, XenForo story reader (Net → Adapter → Cache → Store → shadow-DOM `qq-reader`)
**Researched:** 2026-11-02
**Confidence:** HIGH for layer placement and state (read from source at `57b9aea`); MEDIUM for browser focus/scroll behaviour and the XenForo document-level key handler (verify in the live e2e run)

**eli14 summary.** The reader is a house with a plumbing floor (fetch, parse, store) and a living room (the screen). The three new features are living-room changes: a bookmark that remembers where you stopped, keys that turn the page, and a reading-glasses panel plus a search box. Only the bookmark needs a new drawer on the plumbing floor. Put the bookmark in a drawer that "spring cleaning" (a `CACHE_SCHEMA` bump) never empties. Today the risk is small (a lost bookmark). In future the risk grows if the bookmark shares a drawer with throw-away items.

## Verdict

- No new layer. No change to `Net` or `Adapter`. v0.8 touches `Cache` (one parameter), adds one small data module (`Progress`) beside `Store`, and puts everything else in `QQReader` plus `CSS`.
- The progress record is user data, not cache data. It must survive a `CACHE_SCHEMA` bump. This is the one real architectural decision.
- Build order: keyboard (#2), then progress (#1), then typography and TOC filter (#3). All three edit the same ~6 methods of `QQReader`, so phases run one after another, never in parallel branches.
- Size budget: file is 27,797 characters. `test/smoke.test.js` line 44 fails at 40,000. Estimated v0.8 growth is 5–7 KB. This fits. Do not raise the limit.

## System Overview (v0.8 additions marked `+`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ QQReader (custom element, shadow DOM)                                      │
│ ┌──────────────┐ ┌───────────────┐ ┌────────────────┐ ┌──────────────────┐ │
│ │ + Keys       │ │ _renderTOC    │ │ _openChapter   │ │ + Typo panel     │ │
│ │ keyAction(e) │ │ + filter      │ │ + restore pos  │ │ + CSS variables  │ │
│ │ on shadowRoot│ │ + state mark  │ │ + flush on leave│ │ on host element  │ │
│ └──────┬───────┘ └───────┬───────┘ └───────┬────────┘ └────────┬─────────┘ │
│        │ _step/close     │ reads           │ reads/writes      │ localStorage
│        │                 │ + .main scroll listener → Progress   │ xfReader:typo
├────────┴─────────────────┴─────────────────┴───────────────────┴───────────┤
│ Store (unchanged)                       + Progress (new module, IIFE)       │
│ buildIndex, getChapterBody, …           load / get / set / flush             │
├─────────────────────────────────────────┴───────────────────────────────────┤
│ Cache  (+ optional `schema` argument on get/set)                            │
│ mem Map  ·  IndexedDB xfReaderDB/cache  (no DB version bump)                │
│ keys: index:, body:, posts: (CACHE_SCHEMA)   + progress:<threadId> (PROGRESS_SCHEMA)
├─────────────────────────────────────────────────────────────────────────────┤
│ Net (unchanged)  ·  Adapter (unchanged, no new selectors)                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility in v0.8 | Talks to | Change |
|-----------|------------------------|----------|--------|
| `Adapter` | None. v0.8 reads no new XenForo markup. | — | None |
| `Net` | None. Progress is local. | — | None |
| `Cache` | Carries the progress record. `get(k, schema=CACHE_SCHEMA)` and `set(k, data, schema=CACHE_SCHEMA)`. | IndexedDB, `mem` | +2 default parameters; existing callers unchanged |
| `Progress` (new, ~25 lines, between `Store` and EPUB) | Owns the per-thread record `{v:1, ch:{<postId>:{p, r}}}`. Debounced flush. Page-hide flush. Pure rules (`READ_AT`). | `Cache`, `Adapter.threadId()` | New; add to `__xfr` test hook |
| `Store` | Unchanged. Content only. | `Net`, `Cache`, `Adapter` | None |
| `QQReader` | All UI: key map, scroll tracker, restore, TOC decoration, filter, typography panel. | `Store`, `Progress`, `Adapter.threadId/title`, `localStorage` | Most of the change |
| `CSS` | Variables for typography, TOC state styles, filter input, popover. | — | Edited |
| Launcher | None. | — | None |

Rule kept: the UI never calls `Cache` directly. The UI calls `Store` (content) and `Progress` (user state). Both sit on `Cache`.

### Data Flow

```
SCROLL / KEY (user)
   │
   ▼
QQReader  .main 'scroll' (passive, rAF-throttled)
   │  p = clamp(scrollTop / (chapter.offsetHeight − main.clientHeight), 0..1)
   │  gate: only when this._bodyReady && tok current
   ▼
Progress.set(postId, {p, r?})  ──► in-memory record (same object Cache.mem holds)
   │                                  │ debounce 1 s, and on:
   │                                  │  · _openChapter (leaving a chapter)
   │                                  │  · visibilitychange→hidden, pagehide
   │                                  │  · disconnectedCallback (reader closed)
   ▼                                  ▼
QQReader._markState(postId)       Cache.set('progress:<threadId>', rec, PROGRESS_SCHEMA) ──► IndexedDB

BOOT:   await Promise.all([Store.cachedIndex(), Progress.load()])  → _renderTOC (links decorated in _tocLink)
OPEN:   _openChapter → body rendered → restore scrollTop from Progress.get(id).p → _bodyReady = true
KEYS:   keydown on shadowRoot → keyAction(e) → _step(±1) | close | focus filter
TYPO:   click stepper → clamp → host.style.setProperty('--xfr-fs'…) → localStorage 'xfReader:typo'
FILTER: input (debounce ~100 ms) → this._filter → _renderTOC() (predicate) → _markActive
```

## Feature 1 — Scroll progress and read/unread (#1)

### Placement

| Concern | Where | Why |
|---------|-------|-----|
| Persistence | `Progress` module → `Cache` key `progress:<threadId>` | Same IndexedDB as the issue asks. One key per thread, not per chapter: one read at boot, no 228 async gets. Record is ~7 KB at 228 chapters. |
| Scroll measure | `QQReader._wire`: `this._q('.main').addEventListener('scroll', …, {passive:true})` | The scroll container is `.main` (CSS line 240), not `window`. |
| Restore | `QQReader._openChapter`, directly after `chap.innerHTML = …` and after the `tok !== this._tok` check | Restore after the body exists. The discussion loads later and sits below the chapter, so it cannot move the restore target. |
| TOC mark | `QQReader._tocLink(c)` sets `a.dataset.state = 'read' \| 'part'`; `_markState(id)` updates one link live | `_renderTOC` rebuilds every link three times per open (cached index, fresh index, view toggle). Decoration must live in `_tocLink`, not in a one-time pass. |
| Styling | `.toc a[data-state=read]{opacity:.55}`, `[data-state=part]` gets a thin left bar | CSS only. |

### State added

| State | Scope | Lifetime | Store |
|-------|-------|----------|-------|
| `progress:<threadId>` = `{v:1, ch:{<postId>:{p:0..1, r:0\|1}}}` | per thread, per origin | permanent | IndexedDB, own schema constant `PROGRESS_SCHEMA = 1` |
| `QQReader._bodyReady` (bool) | per open chapter | until next `_openChapter` | memory |
| `QQReader._prog` (the loaded record) | per reader instance | reader open | memory |

`p` is the resume position. `r` is sticky "reached the end". They are separate on purpose: reopening a finished chapter (p ≥ 0.98) starts at the top, while `r` stays 1. Resume only when `0.02 < p < 0.98`.

`READ_AT = 0.95` marks `r = 1`. A chapter that fits the viewport (`offsetHeight <= clientHeight`) gets `r = 1` after a dwell of about 2 s, cancelled on the next `_openChapter`. Without the dwell, holding J through short chapters marks them all read.

### Critical decision: do not store progress under `CACHE_SCHEMA`

`Cache.get` returns `null` when `schema !== CACHE_SCHEMA` (line 96). Bumping `CACHE_SCHEMA` is the documented way to throw away stale content. If progress used that constant, the next content-shape change would silently erase every reader's place in every story. Progress is user data. Content is disposable. Give them separate schema constants.

Do not bump the IndexedDB version to add a second object store. `db()` has no `onblocked` / `onversionchange` handler (CONCERNS: "Open can hang"), so a version bump with a second tab open can freeze every `Cache.get`. A new key prefix in the existing store needs no upgrade.

Sketch (shape only):

```js
// Cache: backward-compatible
async function get(k, schema = CACHE_SCHEMA) { /* … v.schema === schema … */ }
async function set(k, data, schema = CACHE_SCHEMA) { /* … put({schema, data, ts}, k) … */ }

// Progress: never rejects; empty record on any failure
const Progress = (() => {
  let rec = null, key = null, timer = null;
  const load = async () => { key = 'progress:' + Adapter.threadId();
    rec = (await Cache.get(key, PROGRESS_SCHEMA)) || { v: 1, ch: {} }; return rec; };
  const get = id => (rec && rec.ch[id]) || { p: 0, r: 0 };
  const set = (id, patch) => { /* merge, never lower r; schedule flush */ };
  const flush = () => rec && Cache.set(key, rec, PROGRESS_SCHEMA);
  return { load, get, set, flush };
})();
```

### Gotchas that shape the design

1. **Skeleton false positive.** During the skeleton the chapter is short, so `p` computes as 1. `scrollTop = 0` at the top of `_openChapter` also fires a scroll event. Set `_bodyReady = false` first thing in `_openChapter`; the scroll handler ignores events until the body is rendered and the restore is done.
2. **Flush order.** `_openChapter` must call `Progress.set(oldId, …)` / `flush()` before it overwrites `_curId` and before `scrollTop = 0`. Otherwise the leaving chapter records p = 0.
3. **Writes are not awaited** (`Cache.set` does not wait for `oncomplete`, CONCERNS "Writes are not awaited"). Page-hide flush is best effort. Register `visibilitychange` and `pagehide` listeners once, lazily, inside `Progress.load` (module level, not per element), so reopening the reader does not stack listeners.
4. **Fraction, not pixels.** Pixels break when typography or image loads change layout. A fraction of the chapter height survives. Late image loads still shift it. Accept one re-apply on image `load` (capture listener on `.chapter`) only while the user has not scrolled yet. Keep this optional; ship the simple restore first.
5. **Multi-tab, multi-origin.** Two tabs on one thread: last flush wins (whole-record write). Acceptable for a read-only bookmark. `questionablequesting.com` and `forum.questionablequesting.com` keep separate records, as they already keep separate caches.
6. **Boot ordering.** Await `Progress.load()` together with `Store.cachedIndex()` in `_boot` so the first `_renderTOC` is already decorated. `Progress.load` must resolve to an empty record on IndexedDB failure, as `Cache.get` already does.
7. **`last:<threadId>` stays in `localStorage`.** It is read synchronously before first paint. Do not migrate it into the progress record.

## Feature 2 — Keyboard navigation (#2)

### Placement

- One `keydown` listener on `this.shadowRoot` (or `.wrap`), added in `_wire`. No `document` or `window` listener. When the reader is closed, nothing is bound, so forum shortcuts are untouched by construction.
- A pure top-level `keyAction(e)` returns `'next' | 'prev' | 'close' | 'filter' | null`. It is testable without a DOM and goes into the test hook. The listener maps the action to `_step(±1)`, `this.remove()` or filter focus.
- Keys: `j`, `ArrowRight` → next. `k`, `ArrowLeft` → prev. `Escape` → close. Leave `ArrowUp/Down`, `Space`, `PageUp/Down`, `Home/End` to native scrolling.

### Rules

| Rule | Reason |
|------|--------|
| Ignore events with `ctrlKey`, `metaKey` or `altKey` | Browser and OS shortcuts stay intact. |
| Ignore when `e.target` matches `input, textarea, select, [contenteditable]` | The TOC filter and any form in forum HTML. Inside the shadow listener `e.target` is the real inner element; on `document` it would be retargeted to the host and the guard would fail. This is the reason to bind inside. |
| Ignore `e.repeat` for next/prev | Holding J would queue a chapter fetch per repeat through `Net`. The `_tok` guard drops the render but not the request. |
| Call `e.preventDefault()` and `e.stopPropagation()` only for handled keys | `keydown` is composed and bubbles out of the shadow root to `document`. XenForo registers shortcuts through `data-xf-key` attributes and a document-level handler (MEDIUM confidence; not read from XF source). While the overlay is open, a swallowed J/K/Esc cannot trigger a forum action underneath. Unhandled keys pass through. |
| `Escape` with a non-empty filter clears the filter first; a second `Escape` closes | Needs Feature 3. Define the order in the keyboard phase; wire the filter branch in phase 3. |
| `_step` keeps using the full `list(view)`, not the filtered list | Predictable. A filter narrows the sidebar, not the reading order. |

### Focus plumbing (the part that is easy to miss)

A shadow-root `keydown` listener only fires when focus is inside the shadow tree. After a click on the dark overlay, focus can sit on `body`. Add:

- `tabindex="-1"` on `.wrap`, `outline:none`. Any click inside then keeps focus inside the tree.
- `this._q('.main').tabindex = -1` and `.focus()` after boot and after each chapter render, so native `Space` / `PageDown` scroll `.main` (the scroll container) and not the page behind. MEDIUM confidence on exact browser behaviour; check in the e2e run.
- TOC links are `<a>` without `href`, so they are not in the tab order (CONCERNS, Accessibility, Medium). Set `tabindex="0"` and `role="link"` in `_tocLink`, and treat `Enter` on a focused link as a click inside the same listener. This closes that concern in the same phase.
- `_markActive` gains `scrollIntoView({block:'nearest'})` on the active link. With 228 rows, J/K otherwise moves the highlight out of sight.

### State added

None persistent. No new `localStorage` key. One instance field is optional (`_keyBound`) and unneeded if binding stays in `_wire`.

## Feature 3a — Typography controls (#3)

### Placement

- CSS custom properties on the host element: `--xfr-fs`, `--xfr-measure`, `--xfr-lh`. Set with `this.style.setProperty(...)`. `:host{all:initial}` does not reset custom properties, and inline style on the host wins over `:host` rules.
- `CSS` edits: `.chapter{max-width:var(--xfr-measure,760px);font-size:var(--xfr-fs,16px)}`, `.chapter h1{font-size:1.5em}` (was `24px`, so the title scales), `.chapter :is(p,li){line-height:var(--xfr-lh,1.7)}`. Defaults equal today's values: no visual change until the user acts. Comments stay at `14px`.
- Font family is not a control. `SITE_FONT` is a project constraint.
- UI: one `Aa` button in the footer opens a popover (`.typo`) inside `.side` with three stepper rows. Do not add three footer buttons: the footer is one flex row of six buttons in a 320 px sidebar (`flex:1 1 0`). A seventh to ninth button breaks the one-row rule. The popover must not reuse the `.foot button[data-tip]::after` tooltip rule without checking overlap.
- Steps, not sliders: font size 14–24 px in 1 px steps, measure 560–960 px in 40 px steps, line-height 1.4–2.0 in 0.1 steps. A reset button restores defaults.

### State added

| State | Where | Shape |
|-------|-------|-------|
| `xfReader:typo` | `localStorage` (new key, `LS_PREFIX`) | JSON `{fs, w, lh}`; global per origin, not per thread |
| `QQReader._typo` | memory | same object |

Parse with `try/catch` as `xfReader:launch` does (line 395). Clamp every value to its range on read. `localStorage` is a trust boundary: another script or an older version may have written junk.

On a size change, capture the scroll fraction before applying the variable and restore it after layout (one `requestAnimationFrame`). Without this the reader jumps. This is the only coupling to Feature 1.

## Feature 3b — TOC search / filter (#3)

### Placement

- Markup: one `<input class="find" type="search" placeholder="Filter chapters">` above `.toc` in `.side`. `.side` is already a flex column; `.toc` keeps `flex:1`.
- Logic: `QQReader._filter` (string). `_renderTOC` applies a predicate while building: lowercase substring match on `c.title`. In grouped view, skip a `.sec` header when none of its chapters match. One code path, no hide/show second pass. 228 anchors rebuild in well under a frame budget; debounce input by ~100 ms.
- `_renderTOC` already ends with `_markActive(this._curId)`. Keep that, so the active chapter stays highlighted when visible.
- Optional, cheap once Feature 1 exists: an "Unread only" toggle that adds `!Progress.get(id).r` to the same predicate. Mark it as a stretch item; it is the only link between #1 and #3.

### State added

`QQReader._filter` is session-only. Do not persist the query: reopening the reader with a stale filter hides most of the TOC and looks like a bug. The issue text says "persisted under `xfReader:`"; read that as typography only, and confirm in requirements. The filter is not a new `localStorage` key.

## Recommended Build Order

Constraint that forces sequence: all three features edit `connectedCallback` markup, `_wire`, `_renderTOC`, `_tocLink`, `_markActive`, `_openChapter` and the `CSS` array. Parallel branches would conflict on the same lines.

| # | Phase | Contains | Hard dependency | Why here |
|---|-------|----------|-----------------|----------|
| 1 | **Keyboard navigation** (#2) | `keyAction`, shadow-root listener, `.wrap`/`.main` focus anchors, `tabindex` on TOC links, `scrollIntoView` in `_markActive`, `e.repeat` guard | none | Smallest, no data, no schema. Proves the in-shadow event pattern and the focus anchor that later phases reuse. Closes the TOC a11y concern. |
| 2 | **Progress and read state** (#1) | `Cache` schema parameter, `Progress`, scroll tracker, `_bodyReady` gate, restore, flush hooks, `_tocLink` decoration, dwell rule | none (soft: phase 1 focus anchor) | Highest risk (persistent data, async timing, schema). Do it early so the live QQ thread 30813 test covers it. Defining progress as a fraction means later typography work needs no rework. |
| 3 | **Typography + TOC filter** (#3) | CSS variables, `Aa` popover, `xfReader:typo`, `.find` input, `_renderTOC` predicate, Esc-clears-filter branch, optional unread-only toggle | filter's unread toggle needs phase 2; Esc branch needs phase 1; typography scroll re-anchor needs phase 2 | UI-only, `localStorage` only, lowest risk. Last, so it can use the finished progress and key map. If the roadmap wants smaller phases, split into 3a typography and 3b filter; 3b first if the unread toggle is wanted. |

Per-phase closing work (not optional, per repo rules): bump `@version` and `package.json` `version` together (smoke test), update `CONTEXT.md` and `README.md` in the same change (CONCERNS: documentation drift), run the CDP e2e on a real thread.

Suggested prerequisite, can ride in phase 1: wrap the body of `_openChapter` in `try/catch` that shows an error row and keeps `_bodyReady = false`. Every v0.8 feature edits this method, and Known Bug 1 (hung skeleton) interacts with the new gate.

## Patterns to Follow

### Pattern 1: Stale-result token for every new async step

`_openChapter` uses `_tok` and `tokRef.cancelled`. The restore step and the dwell timer must check `tok === this._tok` before touching the DOM or `Progress`. A dwell timer that fires after a chapter switch would mark the wrong chapter read.

### Pattern 2: User state and content cache are separate classes of data

Content (index, bodies, pages) can be wiped by `CACHE_SCHEMA`. User state (progress) cannot. Typography preferences go to `localStorage` because they are tiny, synchronous and per origin, matching `view`, `theme` and `launch`.

### Pattern 3: Pure rule functions at module level, DOM glue in the element

`keyAction(e)`, the read threshold and the typography clamp are pure. They go into the test hook and get unit tests. The element methods stay thin.

### Pattern 4: Decoration belongs in the element factory

State marks, filter results and the active class are applied inside `_tocLink` / `_renderTOC` because `_renderTOC` replaces all links on every call.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Progress under `CACHE_SCHEMA`
**What people do:** `Cache.set('progress:…', rec)` with the default schema.
**Why it's wrong:** The next content-shape bump erases all reading progress, silently.
**Do this instead:** Separate `PROGRESS_SCHEMA` through the new `Cache` parameter.

### Anti-Pattern 2: Key listener on `document` or `window`
**What people do:** `document.addEventListener('keydown', …)` and a manual "is the reader open" check.
**Why it's wrong:** `e.target` is retargeted to the host, so the input guard fails. The listener outlives the element unless removed. It competes with forum shortcuts when the reader is closed.
**Do this instead:** Listener on `shadowRoot`; it dies with the element.

### Anti-Pattern 3: One IndexedDB write per scroll event
**What people do:** `Cache.set` inside the scroll handler.
**Why it's wrong:** Hundreds of transactions per minute, whole-record structured clone each time.
**Do this instead:** Update memory at rAF rate, flush on a 1 s debounce plus leave events.

### Anti-Pattern 4: Pixel scroll offsets
**What people do:** Store `scrollTop`.
**Why it's wrong:** Font size, measure and image loads change layout; the saved pixel lands elsewhere.
**Do this instead:** Store a fraction of the chapter height.

### Anti-Pattern 5: Measuring progress over `.main` scrollHeight
**What people do:** `scrollTop / (scrollHeight − clientHeight)`.
**Why it's wrong:** `.main` includes the discussion, which loads late and can be 10 pages long. A finished chapter would read as 30 % done.
**Do this instead:** Measure against `.chapter.offsetHeight`.

### Anti-Pattern 6: Three new footer buttons for typography
**What people do:** Add A−, A+, width buttons to `.foot`.
**Why it's wrong:** Breaks the one-row footer; tooltips and long-press handling multiply.
**Do this instead:** One `Aa` button with a popover.

### Anti-Pattern 7: Bumping the IndexedDB version for a progress store
**Why it's wrong:** No `onblocked` handler; a second open tab can hang `Cache` for everything.
**Do this instead:** New key prefix in the existing store.

## Scale Considerations

| Concern | 20 chapters | 228 chapters (QQ 30813) | 1,000+ chapters |
|---------|-------------|-------------------------|-----------------|
| Progress record size | ~1 KB | ~7 KB per flush | ~30 KB per flush; still fine at a 1 s debounce. Split per volume only if it passes ~100 KB. |
| Filter rebuild | trivial | ~228 anchors per keystroke, debounced | ~1,000 anchors; still one frame. Virtualize only if measured slow. |
| TOC `scrollIntoView` | trivial | needed | needed |
| Prefetch (existing bug 7) | fine | several hundred requests per open | worse; not a v0.8 change, but progress and keys make the reader open more often, so fixing prefetch scope is a good neighbour task. |

## Testing Implications

- Existing tests reach only `Adapter`, `Store.makeIndex` and EPUB. `QQReader`, `Cache` and `Net` have no tests.
- `Progress` is testable in happy-dom: there is no IndexedDB, so `Cache.get` returns `null` and `Cache.set` still fills `mem`. Test the rules: merge, sticky `r`, `READ_AT`, resume window, empty-record fallback.
- `keyAction(e)` is a pure function: table-test every key, modifier, `repeat` and input target.
- One element-level test is feasible: mount `qq-reader`, set `el.index = Store.makeIndex(…)`, replace `el._openChapter` on the instance with a spy (methods are looked up at call time), dispatch `KeyboardEvent` on `el.shadowRoot`, assert the spy.
- Focus, native scroll keys and restore accuracy need the CDP e2e (`e2e/run.sh`). happy-dom does not model them. Add steps for: J/K moves chapters, Esc closes, scroll then reopen restores, TOC shows read marks.
- Add `Progress` and `keyAction` to the `__xfr` hook (line 407).

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `QQReader` ↔ `Progress` | direct calls: `load`, `get`, `set`, `flush` | `Progress` never touches the DOM. |
| `Progress` ↔ `Cache` | `get/set` with `PROGRESS_SCHEMA` | Only change to `Cache`. |
| `QQReader` ↔ `localStorage` | `xfReader:typo` (new), existing `view`, `theme`, `last:*`, `launch` | One JSON key for typography. |
| keyboard ↔ filter | `Escape` order; input guard | Defined in phase 1, completed in phase 3. |
| typography ↔ progress | scroll-fraction capture/restore on size change | Phase 3 uses phase 2's fraction. |

### External Services

None added. v0.8 makes no network request. Politeness and read-only constraints are untouched.

## Open Questions for Requirements / Phase Research

1. Persist the filter query or not? Recommendation: no.
2. Does "Mark as unread" belong in v0.8? Not in scope of #1 as written; `r` is sticky with no way back. Add a TOC context action only if wanted.
3. Dwell time for short chapters (2 s proposed) and `READ_AT` (0.95 proposed) are untuned numbers. Tune in the live test.
4. Confirm XenForo's document-level keyboard handler on QQ, SpaceBattles and Sufficient Velocity. Phase 1 e2e should press J/K/Esc with the reader open and check for no forum side effect.

## Sources

- `/Users/andrei/Developer/.worktrees/xenforo-story-reader/night-gsd-standard/xenforo-story-reader.user.js` (read in full, 408 lines, 27,797 chars) — HIGH
- `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `CONCERNS.md` (2026-11-02) — HIGH
- `test/smoke.test.js` line 44 (40,000-character guard) — HIGH
- [XenForo community: shortcut system uses an attribute on clickable elements](https://xenforo.com/community/threads/xenforo-2-0-discussion.132208) — LOW/MEDIUM (forum threads; `XF.KeyboardShortcut` API and exact document-level binding not confirmed from source)
- Shadow DOM event model (composed events retarget `e.target` at outer listeners; propagation crosses the host) and `:host{all:initial}` leaving custom properties alone — standard platform behaviour, from knowledge, not re-fetched this session — MEDIUM

---
*Architecture research for: v0.8 reading comfort, xenforo-story-reader*
*Researched: 2026-11-02*
