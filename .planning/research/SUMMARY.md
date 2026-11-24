# Project Research Summary

**Project:** xenforo-story-reader (milestone v0.8 "reading comfort")
**Domain:** Single-file Tampermonkey userscript. Book-style story reader over threadmarked XenForo threads. Shadow-DOM custom element `qq-reader`.
**Researched:** 2026-11-02
**Confidence:** MEDIUM-HIGH. Code-based findings are HIGH. Browser focus behavior, XenForo shortcuts and feature conventions are MEDIUM to LOW.

## Executive Summary

v0.8 adds three tracker items to an existing, working reader: #1 scroll progress and read state, #2 keyboard navigation, #3 TOC filter and typography controls. All four researchers agree on the shape of the work. No new dependency, no build step, `@grant none` stays, no network change. Every feature fits platform APIs. All changes land in `xenforo-story-reader.user.js`, which is 27,797 characters against a 40,000-character smoke-test cap. Estimated growth is 5-8 KB (one researcher says up to 12 KB with fixes).

The recommended approach has strong agreement on the core design. Store progress as a fraction of the `.chapter` box, never in pixels and never over the whole `.main` scroller (the discussion shares it). Mark "read" only on reaching the end of the chapter body, never on open. Keep progress separate from the disposable content cache, because a `CACHE_SCHEMA` bump would erase it. Bind keys so they die with the element, check `e.composedPath()[0]` for the typing guard, and ignore `e.repeat`, modifiers and IME. Drive typography with CSS custom properties whose defaults equal today's look. Put the filter input outside `.toc`.

The main risks are release mechanics and storage. Every merge to `main` is a production release through auto-update, and a revert does not roll back installs. An IndexedDB version bump can hang all tabs, because the current `db()` has no `onversionchange` handler. Known bugs (empty body cached, hung `_openChapter`) turn into data corruption once progress and held-key navigation exist. The researchers disagree on build order and on where to store progress. Both disagreements are recorded below and are NOT settled. The roadmapper or requirements step must decide them.

## Key Findings

### Recommended Stack (STACK.md)

No installs. Platform APIs only.

**Core technologies:**
- Passive `scroll` listener on `.main` plus `requestAnimationFrame` throttle: in-chapter progress. `.main` is the one scroll container. Avoids `IntersectionObserver` root-in-shadow-DOM unknowns.
- `visibilitychange` (hidden) plus about 800 ms debounce: flush progress. `beforeunload` and `unload` are unreliable.
- `keydown` with `e.composedPath()[0]`: keyboard. `e.target` is retargeted to the host at outer listeners. Keep shadow root `mode:'open'`.
- CSS custom properties (`--xfr-fs`, `--xfr-lh`, `--xfr-measure`), `ch` for measure, `px` for font size (`rem` follows the forum root size): typography.
- One JSON key `xfReader:typo` in `localStorage`, clamped on read: persistence. Synchronous, so no flash of default type.
- `<input type="search">`, `hidden` attribute toggling, `normalize('NFD')` plus `\p{M}` strip: TOC filter.
- Avoid: `scrollend` (only newly available), CSS `zoom` (fallback only), `durability` option on transactions, any library, any `GM_*` API.

### Expected Features (FEATURES.md)

Items tagged `[SUGGESTION - not in tracker]` come from research only. They are NOT planned scope. The requirements step must not add them without a decision.

**Must have (table stakes, all in tracker #1-#3):**
- Resume scroll position as a fraction, with a rule that re-readers start at the top (suggested window about 3%-97%, not read). Numbers untuned.
- Three TOC states (unread, in progress, read) with a non-color cue.
- Read means end of chapter body reached, never open. Manual mark read/unread toggle.
- Thin progress cue in the chapter view.
- Progress record that survives `CACHE_SCHEMA` bumps.
- ArrowLeft/ArrowRight and J/K for previous/next, Esc with layering (clear filter, close popover, close reader), typing/modifier/`isComposing`/`e.repeat` guards, focus inside the shadow root on open, shortcut text in footer tooltips.
- TOC live filter: substring, case-insensitive, section headers hidden, count and empty state, survives `_renderTOC`, prev/next ignore the filter, filter text session-only.
- Font size, measure (viewport-capped), line-height, reset, persistence, defaults equal today's look.

**Should have (competitive):**
- `[SUGGESTION - not in tracker]` "Mark everything up to here as read", "N of M read" count, per-chapter mini bar in the TOC.
- `[SUGGESTION - not in tracker]` Enter-opens-first-match and "/" focus in the filter.
- `[SUGGESTION - not in tracker]` Filter by unread (needs #1).
- Tracker items that depend on #1 but are NOT part of #1: #7 continue reading, #4 new-chapter badge.

**Defer (v2+):**
- `[SUGGESTION - not in tracker]` Strip author inline styles in chapters (needs a sanitizer-scope decision).
- `[SUGGESTION - not in tracker]` Full-text search (only after #15), time left in chapter, "?" help overlay, paragraph spacing control, scaling comments with typography.
- Anti-features: font-family picker (violates `SITE_FONT` constraint), paged mode, remappable keys, account sync, per-story typography profiles.

### Architecture Approach (ARCHITECTURE.md)

No new layer. `Net` and `Adapter` are unchanged. `Cache` gains at most one parameter. A small `Progress` data module sits beside `Store`. Everything else is UI work in `QQReader` and `CSS`. The UI never calls `Cache` directly. It calls `Store` for content and `Progress` for user state. All three features edit the same methods (`connectedCallback`, `_wire`, `_renderTOC`, `_tocLink`, `_markActive`, `_openChapter`, the CSS array), so phases must run in sequence, not in parallel branches.

**Major components:**
1. `Progress` (new, about 25 lines) — per-thread record, merge rules, sticky read flag, debounced and page-hide flush. Never touches the DOM.
2. `QQReader` key handler plus pure `keyAction(e)` — maps keys to next, prev, close, filter focus. Pure function goes in the `__xfr` test hook.
3. `QQReader` scroll tracker, `_bodyReady` gate, restore, `_tocLink` decoration — progress UI. `_tocLink` is the right place for state marks because `_renderTOC` rebuilds all links on every call.
4. Typography panel plus CSS variables — one "Aa" footer button opens a popover. The footer is full (six buttons in 320 px), so no extra footer buttons.
5. TOC filter — input outside `.toc`, session-only state.

Pure rule functions (`keyAction`, read threshold, typography clamp, title match, progress merge) belong at module level and in the test hook. happy-dom has no layout and no IndexedDB, so scroll, focus and restore accuracy need the CDP e2e.

### Critical Pitfalls (PITFALLS.md)

1. **Every merge to `main` ships, and rollback does not roll back** — Tampermonkey needs a higher `@version`. Decide the release rule before work starts. Recommended by PITFALLS.md: feature PRs do not bump `@version`, one final PR bumps to 0.8.0, rollbacks are forward fixes with a higher version. Alternative: point update URLs at a `release` branch or tag (needs a changed smoke test).
2. **Progress inside the disposable cache** — `Cache.get` returns `null` on a schema mismatch, so a `CACHE_SCHEMA` bump silently erases all progress. Use a separate schema or key family.
3. **IndexedDB version bump hangs tabs** — `db()` has no `onversionchange` or `onblocked`. Old tabs hold v1 after auto-update. Keep `open(DB_NAME, 1)` or add the handlers first. All storage changes must be additive and readable by the previous version.
4. **Progress measured against the wrong box, and restore races** — the discussion shares `.main`. The skeleton and `scrollTop = 0` in `_openChapter` fire scroll events that write 0% over the saved value. Gate with `_bodyReady`, capture the chapter id at schedule time, flush the leaving chapter before overwriting `_curId`, never mark an empty or failed body read.
5. **Shadow-DOM key handling** — retargeting breaks `e.target` checks. A listener without teardown leaks. Focus on `body` makes Space scroll the page behind the overlay. Held keys flood the FIFO `Net` queue (the `_tok` guard drops renders, not queued requests). Needs `composedPath()[0]`, teardown, `tabindex="-1"` focus anchor, `e.repeat` ignore.

Also high value: the TOC re-render destroys `.toc.scrollTop`, filter focus and read markers (Pitfall 11). TOC `<a>` elements have no `href` or `tabindex`, so keyboard users cannot reach them (Pitfall 15). Typography values need a guarded parse and clamp, and inline BBCode `[SIZE]` styles ignore the font-size control (Pitfall 13).

## Implications for Roadmap

### Open decision 1: build order (researchers disagree, NOT settled)

| Option | Source | Order | Argument for | Argument against |
|--------|--------|-------|--------------|------------------|
| A. Keyboard first | ARCHITECTURE.md | #2, then #1, then #3 | Smallest, no data, no schema. Proves the in-shadow event and focus pattern. Closes the TOC anchor concern. Progress second so the live thread test covers the highest-risk piece early. | Leaves the Pitfall 6 failure paths unfixed while held-key navigation already exists. |
| B. Progress first | STACK.md lists #1 first; FEATURES.md puts the data and `_openChapter` ordering changes at the core of #1 and says read state must not come from opening, so J/K cannot corrupt it | #1, then #2, then #3 | Defines the fraction model before keys and typography depend on it. Keys never exist without a read-state rule in place. | Highest-risk feature goes first with no shared focus anchor yet. |
| C. Foundations phase (P0) first | PITFALLS.md | P0, then Progress, Keyboard, Filter+Typography, Release | Fixes known bugs, storage shape, `ls` guard helper, release rule, TOC anchors and test hooks before features sit on them. | Adds a phase that delivers no user-visible feature. Scope creep risk. |

Hard dependencies that hold under every option:
- The Esc-clears-filter branch needs both keyboard and filter. Define the Esc chain in the keyboard phase, wire the filter branch in the filter phase.
- Typography scroll re-anchor needs the progress fraction (#1) to exist.
- Unread-only filter (suggestion) needs #1.
- The input guard and Esc layering must land with or before the filter input.
- Whatever the order, the release rule (Pitfall 1) and the storage decision (below) must be fixed before the first feature merges.

Suggested minimum regardless of order: a small foundation slice ahead of or inside the first phase containing `try/catch` plus retry in `_openChapter`, refuse to cache an empty body, fallback when the stored last id is missing, guarded `localStorage` helper, `href`/`tabindex` on TOC links, and `onversionchange` on the existing DB connection. This is the common core of option C and ARCHITECTURE.md's "suggested prerequisite", so the roadmapper can place it as phase 0 or fold it into phase 1.

### Open decision 2: progress store (researchers disagree, NOT settled)

| Option | Source | Mechanism | Pros | Cons |
|--------|--------|-----------|------|------|
| S1. Second IndexedDB database | STACK.md | New DB `xfReaderState` v1, store `progress`, one record per chapter, key `<threadId>:<postId>`, `{p, read, ts, v:1}`. In-memory Map as UI source. | No upgrade conflict with old tabs. No change to `Cache`. Per-chapter writes are atomic, TOC read is one `getAll(range)`. | A second DB connection and open path to maintain. Does not cover hot-flush on `pagehide` reliably. Roughly duplicates `Cache` plumbing. |
| S2. Schema-agnostic key in the existing store | ARCHITECTURE.md (`Cache.get/set` gain a `schema` parameter, key `progress:<threadId>`, `PROGRESS_SCHEMA`); PITFALLS.md also allows it | Whole-thread record about 7 KB, one read at boot. No DB version bump. | Smallest code change. Reuses the open path. One read at boot. | Whole-record write: two tabs, last writer wins, needs a merge (max per chapter). Shares the DB with disposable data, so a manual "delete database" workaround for Known Bug 2 would erase progress. Writes are not awaited, so best-effort at page hide. |
| S3. `localStorage` | PITFALLS.md leans this way; FEATURES.md flags it as a real option | Key such as `xfReader:progress:<threadId>`, about 6 KB for 228 chapters. | Synchronous write works in `pagehide`. `storage` event can sync tabs. Matches `view`, `theme`, `last:*`. | Deviates from the tracker text ("IndexedDB"). Per-origin quota. Synchronous cost on every flush for large stories. Needs the guarded helper. |

All three options agree on the rule: progress must not live under `CACHE_SCHEMA` and must not trigger an IndexedDB version bump. All three agree on keying by `postId`, merge by max progress with a sticky read flag, debounced writes and flush on leave events. The tracker says IndexedDB, so S3 needs an explicit decision to change that. S1 and S2 differ on whether progress shares the cache store.

### Open decision 3: smaller disagreements to settle in requirements

| Topic | Variants |
|-------|----------|
| Key listener placement | STACK.md: `window` capture listener, removed by `AbortController`, because the overlay owns the keyboard and clicking a TOC link can leave focus on `body`. ARCHITECTURE.md: listener on `shadowRoot`, so it dies with the element, plus `tabindex="-1"` focus anchors. PITFALLS.md: `document` listener acceptable only with `disconnectedCallback` teardown and `composedPath()`. FEATURES.md: scope to the reader, focus required. Common ground: teardown on removal, focus anchor on `.main` or `.wrap`, `composedPath()[0]` or equivalent, `stopPropagation` only for consumed keys. |
| Read detection | STACK.md: scroll fraction, read at p >= 0.95. ARCHITECTURE.md: same plus a 2 s dwell for chapters shorter than the viewport. FEATURES.md and PITFALLS.md: end sentinel with `IntersectionObserver` rooted on `.main` (handles short chapters). STACK.md argues against IO because root-in-shadow-DOM is untested. |
| TOC filter implementation | STACK.md and PITFALLS.md: toggle `hidden` on existing rows, no rebuild. ARCHITECTURE.md: predicate inside `_renderTOC`, debounced about 100 ms. Either must re-apply after every `_renderTOC` and keep `.toc.scrollTop`. |
| Where typography variables live | STACK.md: on `.wrap`. ARCHITECTURE.md: on the host element. Both survive `:host{all:initial}`. |
| Typography control shape | ARCHITECTURE.md: stepper rows, 1 px font steps 14-24, measure 560-960 px, line-height 1.4-2.0. STACK.md: range inputs, clamps fs 12-32, lh 1.2-2.2, measure 40-100 ch. FEATURES.md: named steps. Pick one set of ranges. |
| Inline `[SIZE]` styles | STACK.md recommends `.chapter [style*="font-size"]{font-size:inherit !important}`. PITFALLS.md says do not strip author formatting silently. FEATURES.md marks stripping author styles as `[SUGGESTION - not in tracker]`. Not verified on a live post. |
| Release rule | PITFALLS.md only: no `@version` bump in feature PRs, one final bump, or a `release` branch. Needs an owner decision; the smoke test currently checks match, not increase. |
| Untuned numbers | `READ_AT` 0.95, resume window 3%-97% (FEATURES) or 2%-98% (ARCHITECTURE), dwell 2 s. All untuned. |
| Key semantics | J = next, K = previous (FEATURES.md suggestion; direction is ambiguous across apps). Document in tooltips. |

### Phase structure the roadmapper can start from

The researchers agree on the content of the feature groups. The order is open (decision 1). A neutral structure:

**Foundation slice (optional phase 0, or fold into the first phase)**
- Delivers: `_openChapter` error handling and retry, no caching of empty bodies, stale last-id fallback, guarded storage helper, TOC link focusability (`href` or `tabindex`), `onversionchange` on the DB, decisions recorded for release rule and storage.
- Avoids: Pitfalls 1, 3, 6, 15, 18.

**Keyboard navigation (#2)**
- Delivers: key map and pure `keyAction`, teardown, focus anchors, guards, `scrollIntoView({block:'nearest'})` in `_markActive`, tooltip text, Esc chain definition.
- Avoids: Pitfalls 8, 9, 10, 15.

**Progress and read state (#1)**
- Delivers: store per decision 2, scroll tracker with `_bodyReady` gate, restore, flush hooks, TOC decoration with glyph or text, thin progress cue, manual read/unread toggle.
- Avoids: Pitfalls 2, 4, 5, 7, 11, 20, 21.

**TOC filter and typography (#3)**
- Delivers: filter outside `.toc` with count and empty state, typography popover, CSS variables with today's defaults, clamped persistence, scroll-fraction re-anchor on size change, Esc chain completion.
- Could split into typography and filter. Filter first if the unread-only suggestion is wanted.
- Avoids: Pitfalls 11, 12, 13, 14, 24.

**Release**
- Delivers: version bump per the release rule (`@version` and `package.json` together), README and CONTEXT.md updates, per-origin limit note, one deliberate decision on the 40,000-character cap, manual e2e on a real thread.
- Avoids: Pitfalls 1, 17, 19, 22, 25.

### Research Flags

Phases likely needing deeper research during planning:
- **Progress and read state:** untuned thresholds, IO-in-shadow-DOM behavior if the sentinel route is chosen, late image reflow, storage option choice. Run a live test on QQ thread 30813.
- **Keyboard navigation:** XenForo's document-level shortcut handlers were not read from source. Focus and native scroll-key behavior across Chrome, Firefox, Safari are unverified. Needs a live check and an e2e step for J/K/Esc with no forum side effect.
- **Typography:** inline `[SIZE]` and inline line-height on real posts are unverified. Check one live post before choosing strip versus `zoom` versus accept.

Phases with standard patterns (skip research-phase):
- **TOC filter:** plain list filtering with documented platform APIs. Only the re-render integration needs care.
- **Foundation slice and Release:** mechanical, defined by CONCERNS.md and the smoke tests.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | API choices cite MDN and W3C pages read on 2026-11-02. MEDIUM for IO root in shadow DOM, XenForo shortcuts and `zoom` effect on `max-width`. |
| Features | MEDIUM-LOW | Conventions come from a few secondary sources (Royal Road via search summary only, one AO3 userscript, WCAG pages). Kindle, AO3 and FFN claims are training knowledge and stay LOW. Code and tracker facts are HIGH. |
| Architecture | HIGH / MEDIUM | HIGH for layer placement and state (source read in full at `57b9aea`). MEDIUM for focus/scroll behavior and XenForo key handling. Needs live e2e confirmation. |
| Pitfalls | MEDIUM-HIGH | Code-linked findings HIGH. Tampermonkey update interval, raw GitHub cache lifetime and XenForo shortcuts MEDIUM to LOW. |

**Overall confidence:** MEDIUM-HIGH for what to build and how. LOW-MEDIUM for the untuned numbers and the open decisions above.

### Gaps to Address

- Build order: decide A, B or C (decision 1) in the roadmap step.
- Progress store: decide S1, S2 or S3 (decision 2) before the first storage code. S3 changes the tracker text and needs owner consent.
- Release rule: decide no-bump-until-final versus a `release` branch before the first merge.
- XenForo keyboard handlers on QQ, SpaceBattles and Sufficient Velocity: verify live with J/K/Esc. Also check whether admin-defined shortcuts exist.
- Native scroll-key and focus behavior of a `tabindex="-1"` scroller in Firefox and Safari: verify in e2e (Chrome 132+ makes scrollers focusable by default, other browsers unverified).
- Inline `font-size` and `line-height` in real chapter HTML: no fixture contains it. Check one live post.
- `READ_AT`, dwell time, resume window: untuned. Tune on thread 30813.
- Persist the filter text? ARCHITECTURE.md and FEATURES.md both say no. The tracker text says "persisted under `xfReader:`", read as typography only. Confirm.
- Does "mark as unread" belong in v0.8? FEATURES.md lists it as table stakes under #1. ARCHITECTURE.md says #1 as written has no way back. Confirm scope.
- Should comments and `.discbar`/`.disc` widths follow the typography controls? Chapter only is the simpler default; state the scope in the UI.
- Held-key flood: `e.repeat` ignore is agreed. Whether to add a 150-250 ms load debounce (PITFALLS.md) is open.
- Size cap: expected to fit. If it does not, raise it once, deliberately, in the release PR.
- Prefetch scope (Known Bug 7) is a neighbour issue, not v0.8 scope, but it worsens with one-key Esc and reopen. Flag it for the roadmapper.

## Sources

### Primary (HIGH confidence)
- `xenforo-story-reader.user.js` v0.7.4, `test/smoke.test.js`, `.planning/PROJECT.md`, `.planning/codebase/*.md` — read directly by all four researchers.
- MDN: IntersectionObserver, `Event.composedPath`, `visibilitychange`, `IDBObjectStore.getAll`, `IDBOpenDBRequest` blocked event, `addEventListener`, `scrollend` — checked 2026-11-02.
- W3C IntersectionObserver spec text (root rule, silent on shadow DOM).
- Tracker issues #1-#16 (read with `gh`).

### Secondary (MEDIUM confidence)
- W3C WCAG 2.1.4 Character Key Shortcuts and 1.4.12 Text Spacing (with Deque summaries).
- Royal Road "Optimize the Reading Experience" (second-hand via search summary, fetch returned 403).
- Baymard line-length guidance (50-75 characters).
- rixx `ao3-arrows.user.js` (primary code, single script).
- Tampermonkey documentation (`@version` must increase for updates).
- Chrome blog on keyboard-focusable scrollers (Chrome 132 only).
- MDN CSS `zoom` (effect on `max-width` is inference).

### Tertiary (LOW confidence, needs validation)
- XenForo community threads on shortcuts (`M`, `Alt+number`, `data-xf-key`). No official doc found.
- Gmail j/k direction sources disagree.
- Greasy Fork thread on 24 h default update interval (older release).
- Training-knowledge statements about Kindle, AO3 history, FFN.
- `raw.githubusercontent.com` short CDN cache (not verified).
- `IDBDatabase.transaction` `durability` option: per-browser support not shown, not recommended.

---
*Research completed: 2026-11-02*
*Ready for roadmap: yes, after the open decisions are made or deliberately deferred to requirements*
