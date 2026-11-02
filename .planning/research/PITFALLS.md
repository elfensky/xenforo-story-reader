# Pitfalls Research

**Domain:** Single-file Tampermonkey userscript reader (shadow-DOM UI, IndexedDB cache, localStorage settings) on XenForo forums. Milestone v0.8 adds (1) scroll progress and read/unread state, (2) keyboard navigation, (3) TOC filter and typography controls. The file auto-updates from raw GitHub `main`.
**Researched:** 2026-11-02
**Confidence:** MEDIUM-HIGH. Findings tied to the current code (`xenforo-story-reader.user.js` v0.7.4, `.planning/codebase/CONCERNS.md`) are HIGH. Browser and Tampermonkey behaviour is from platform knowledge plus a light web check (MEDIUM). XenForo's built-in shortcuts are LOW (no official doc found).

**Phase names used below** (a suggested split; the roadmap may rename them):
- **P0 Foundations** - fix the failure paths and storage shape that the new features sit on.
- **P1 Progress** - issue #1.
- **P2 Keyboard** - issue #2.
- **P3 Filter + Typography** - issue #3.
- **P4 Release** - version bump, docs, manual e2e, ship.

---

## Critical Pitfalls

### Pitfall 1: Every merge to `main` is a production release, and rollback does not roll back

**What goes wrong:**
`@updateURL` and `@downloadURL` point at raw `main`. Tampermonkey installs a new file only when `@version` is higher than the installed one. Two bad outcomes follow:
1. A feature PR that bumps `@version` ships at once, half finished (for example the read-state markers without persistence, or the J/K handler without the focus fix). Three issues merged as three PRs means three live releases in one milestone.
2. A `git revert` of a bad release restores the old text, including the old `@version`. Installs do not downgrade, so every user keeps the broken build until a higher version is pushed.

**Why it happens:**
The workflow (PR, CI, rebase-merge) feels like normal development. The update channel is invisible in the diff. The smoke test checks that `@version` matches `package.json`, not that it increased. CI runs at the same time the file becomes the update source (CONCERNS.md, Security).

**How to avoid:**
- Decide the release rule before P1 starts. Recommended: feature PRs do NOT bump `@version`; one final P4 PR bumps to `0.8.0`. Unbumped changes on `main` are invisible to installed copies. Fresh installs and manual updates still fetch them, so `main` must always be shippable (tests green, no half features behind visible UI).
- Alternative (CONCERNS.md recommendation): point the update URLs at a `release` branch or tag. This needs one last shipment from `main` that carries the new URLs, and the smoke test `auto-update URLs point at the raw file on main` must change in the same PR.
- A rollback is a forward fix: restore the old code with a HIGHER `@version` (for example `0.8.1`). Record this rule in `AGENTS.md`.
- Add a smoke test: `@version` is greater than the version of `origin/main` or the last tag, or at least a documented bump check in the PR checklist.

**Warning signs:**
A PR diff touches `@version` while the milestone is incomplete. A "revert" PR has an `@version` equal to or lower than the broken release. Users report the old behaviour after a push.

**Phase to address:** P0 (decide and document) and P4 (execute the bump).

---

### Pitfall 2: Storing read state in the `Cache` layer makes user data disposable

**What goes wrong:**
The `Cache` module treats everything as a rebuildable cache. `Cache.get` returns `null` when `v.schema !== CACHE_SCHEMA`, so a routine `CACHE_SCHEMA` bump (the documented way to invalidate stale bodies) silently erases every reader's read/unread history. The same applies to any future eviction or age limit (CONCERNS.md proposes both) and to the "delete the `xfReaderDB` database" workaround for Known Bug 2.

**Why it happens:**
Issue #1 says "persisted in IndexedDB". The lowest-effort path is `Cache.set('progress:'+threadId, ...)`. That key lives in the same store with the same schema gate as `body:*` and `posts:*`.

**How to avoid:**
- Treat progress as user data, not cache. Give it a separate key family that skips the schema check and any eviction, and a separate format version field inside the value.
- Do NOT bump the IndexedDB version to add an object store (see Pitfall 3). Either reuse the existing `cache` store with a `progress:` prefix and a schema-agnostic read path, or store progress in localStorage (see Pitfall 4). Roadmap decision needed: PROJECT.md says IndexedDB, but localStorage is simpler and safer for this payload (about 25 bytes per chapter, so about 6 KB for a 228-chapter story).
- State in the code, next to `CACHE_SCHEMA`, that bumping it must not touch progress data.

**Warning signs:**
A `CACHE_SCHEMA` bump appears in a PR with no mention of progress. Read markers vanish after an update.

**Phase to address:** P0 (storage shape and rule) and P1 (implementation).

---

### Pitfall 3: An IndexedDB version bump can hang every tab, and auto-update guarantees mixed versions

**What goes wrong:**
`db()` opens version 1 with no `onblocked` or `onversionchange` handler (CONCERNS.md, "Open can hang"). If v0.8 bumps the DB version to add a store, any tab still running the old script holds a version-1 connection and blocks the upgrade. The new tab's `indexedDB.open` never resolves, every `Cache.get` waits forever, and the reader shows skeleton rows. Auto-update makes this likely: Tampermonkey updates on its own schedule (default interval reported as 24 h, MEDIUM confidence), and already-open tabs keep running old code until reloaded.

**Why it happens:**
"New data needs a new store" is the textbook IndexedDB answer. The one-file auto-update model breaks the textbook assumption that all clients upgrade together.

**How to avoid:**
- Keep `indexedDB.open(DB_NAME, 1)`. Add no store. New data uses new KEYS, not new stores.
- If a bump is ever unavoidable: add `db.onversionchange = () => db.close()` to the connection, add `onblocked` handling, and give `Cache.get` a timeout that falls through to the network.
- Make every storage change additive and readable by the previous version: never change the shape of an existing key (`xfReader:last:<threadId>` stays a bare string, `xfReader:theme` and `xfReader:view` keep their values). Old tabs must ignore new keys and not crash on them.

**Warning signs:**
Reader stuck on skeleton rows after an update with a second tab open. `indexedDB.open` request never fires `onsuccess`.

**Phase to address:** P0.

---

### Pitfall 4: Progress writes are lost or racy (async IDB, whole-map overwrite, multi-tab)

**What goes wrong:**
- `Cache.set` is fire-and-forget: it does not wait for `oncomplete`, and an empty `catch` swallows quota and abort errors. A tab closed right after the last scroll loses the write. A quota error is invisible.
- A single JSON blob per thread, written as read-modify-write, loses data when two tabs read the same story: the later write replaces the earlier map.
- Writing on every `scroll` event costs a transaction (or a synchronous localStorage write) per frame.
- `Cache.get` returns the shared object held in `mem`. Mutating it in place changes the cache without a write.

**Why it happens:**
Scroll handlers feel cheap, and the cache helper looks like a general key-value store.

**How to avoid:**
- Compute progress in a `requestAnimationFrame`-throttled passive scroll handler, but write at most every 0.5-1 s (debounced) and flush on `visibilitychange` (hidden), `pagehide`, chapter change and reader close. IndexedDB writes in `pagehide` are not reliable; a synchronous localStorage write is. This favours localStorage for the hot cursor.
- Merge on write: re-read, take the MAXIMUM progress per chapter, keep "read" monotonic (scrolling up never un-reads). Only an explicit action clears it.
- Key by `postId` (stable), never by list position. Threadmarks can be reordered or removed.
- Never mutate the object returned by `Cache.get`; copy first.
- Listen for the `storage` event if localStorage is chosen, so a second tab updates its TOC markers.
- Surface write failures with `console.warn` (existing swallow-all `catch` hides them).

**Warning signs:**
Read markers revert after closing a tab quickly. Two tabs disagree. DevTools shows a write per scroll frame.

**Phase to address:** P1.

---

### Pitfall 5: Progress is measured against the wrong box (chapter plus discussion share one scroll container)

**What goes wrong:**
`.main` is the single scroll container. It holds the chapter, the sticky discussion bar and up to 10 pages of comments. `scrollTop / (scrollHeight - clientHeight)` therefore includes the discussion. A short chapter followed by a long thread reads as "5%" at the end of the story text, so it never becomes "read". Short chapters shorter than the viewport emit no scroll event at all, so they are never marked either.

**Why it happens:**
The obvious formula uses the scroll container. The inline discussion (v0.7.2) was added after the chapter pane was designed.

**How to avoid:**
- Define progress as the fraction of the `.chapter` element that has passed the viewport bottom: `(scrollTop + clientHeight - chapter.offsetTop) / chapter.offsetHeight`, clamped to 0-1. Ignore `.disc`.
- Prefer an `IntersectionObserver` with `root` = `.main` and a zero-height sentinel at the end of `.chapter` (before `.discbar`). It handles short chapters, late layout and lazy images without scroll maths. Mark "read" when the sentinel is reached.
- Attach the sentinel only AFTER the real body is rendered, and detach it on chapter change (use the existing `tok` guard). While the skeleton is visible the sentinel is on screen, and an early observer marks the chapter read at once.
- Do not mark "read" for an empty or near-empty body (see Pitfall 6). Define "read" explicitly (for example reached the end sentinel, or at least 90% with a dwell) and write it into the requirement.

**Warning signs:**
Short chapters never become read. Held `K`/`J` marks every chapter read. A chapter with a failed or empty body is marked read.

**Phase to address:** P1.

---

### Pitfall 6: The new features sit on top of known failure paths and turn them into data corruption

**What goes wrong:**
CONCERNS.md lists bugs that become worse once progress and keyboard navigation exist:
- **Known Bug 2** (empty body cached permanently): an empty chapter has a visible end sentinel at once, so it is auto-marked "read" forever.
- **Known Bug 1** (`_openChapter` hangs on network failure): keyboard navigation reaches this state far more often than clicking, and the skeleton stays with no way to retry.
- **Known Bug 3** (stale last id leaves a blank pane): a stored progress record for a deleted threadmark has no TOC row to show it.
- **Bug 7** (prefetch loops multiply on each reopen): the reader is closed and reopened more often once Esc is a one-key action.

**Why it happens:**
The v0.8 issues were written as pure additions. The failure paths were found later, by the codebase map.

**How to avoid:**
- Do a small P0 before any feature: try/catch around `_openChapter` with an inline error and a retry control; refuse to cache an empty body; fall back to `firstChapterId()` when the stored id is missing; make prefetch cancellable on close.
- Progress code must require a non-empty rendered body and a successful render before it records anything.
- Ignore stored progress for chapter ids that are not in the current index (prune lazily, do not crash).

**Warning signs:**
A chapter with zero text shows as read. Pressing `J` repeatedly leaves grey skeleton rows.

**Phase to address:** P0.

---

### Pitfall 7: Restoring the scroll position lands in the wrong place (async layout, edits, typography)

**What goes wrong:**
- `_openChapter` sets `scrollTop = 0`, swaps the body, then awaits. The scroll event from that reset (and from the `innerHTML` swap) can fire the progress saver, which writes 0% for the chapter and overwrites the stored position before it was restored.
- Restoring a saved pixel offset before images and embeds load lands too early. Lazy images shift layout after the restore.
- A saved pixel offset is wrong after the reader changes font size, measure or line-height (P3), or after the author edits the chapter.
- The restore fights the user: a delayed `scrollTo` after the user has started scrolling yanks the page back.

**Why it happens:**
Scroll position looks like a simple number. In a reflowing reader it is a function of width, font and content.

**How to avoid:**
- Store a RATIO of the chapter box (0-1), not pixels. Optionally store a paragraph index plus ratio inside it for better accuracy.
- Block saves while a chapter is loading or restoring (a `restoring` flag tied to the `tok` guard). Capture the chapter id AT SCHEDULE TIME, so a delayed save cannot write to the next chapter.
- Restore after the body is rendered, once on the next animation frame and once more after images settle. Cancel any pending restore on the first `wheel`, `touchstart` or `keydown`.
- When typography changes, capture the ratio before applying the new values and restore it after (reflow keeps the reader at the same place).
- Do not restore when progress is at or above the "read" threshold; open at the top (a re-read starts at the start).

**Warning signs:**
Reopening a chapter shows 0%. Position drifts after changing font size. The page jumps while the user scrolls on slow networks.

**Phase to address:** P1 (restore, save guard) and P3 (typography reflow).

---

### Pitfall 8: The global key handler sees the wrong target, fires when the reader is closed, or never fires

**What goes wrong:**
Four separate failures, all specific to shadow DOM:
1. **Retargeting.** A `document` keydown listener sees `e.target === <qq-reader>` for every key typed in the TOC search input inside the shadow root. A check on `e.target.tagName` never matches `INPUT`, so typing "j" in the filter navigates chapters. Use `e.composedPath()[0]`.
2. **Leak.** A listener added in `connectedCallback` and never removed survives `this.remove()`. After the reader closes, `J`, `K`, arrows and Esc keep running on the forum page, and each reopen adds another copy (Bug 7 pattern). There is no `disconnectedCallback` today.
3. **Focus is on `body`.** TOC anchors have no `href` or `tabindex`, so clicking one moves focus to nothing. `document.activeElement` is `body`. Native keys (Space, PageDown, Up, Down) then scroll the DOCUMENT behind the overlay, not `.main`. Keyboard users cannot scroll the chapter, and progress does not advance.
4. **Focus loss on re-render.** `chap.innerHTML = ...` and `toc.innerHTML = ''` destroy the focused element. Focus drops to `body` after every chapter change.

**Why it happens:**
Event retargeting and shadow-root focus are easy to forget when the UI was written with `onclick` handlers only.

**How to avoid:**
- Attach in `connectedCallback`, remove in a new `disconnectedCallback`. One handler, one place. Also bind `isConnected` as a guard.
- Give `.main` `tabindex="-1"` (or `.wrap`) and call `.focus({preventScroll:true})` on open and after each chapter render, so native scroll keys act on the reader. Restore focus to the launcher button on close.
- In the handler: read `composedPath()[0]`; ignore `INPUT`, `TEXTAREA`, `SELECT` and `isContentEditable` (the forum's quick-reply editor behind the overlay stays focusable); ignore any event with `ctrlKey`, `metaKey` or `altKey` (Ctrl+J, Cmd+K and Alt+Left are browser shortcuts); ignore `e.isComposing`; ignore `e.defaultPrevented`.
- Call `preventDefault()` and `stopPropagation()` only for keys the reader handles, so forum and browser shortcuts for other keys keep working.
- Add `overscroll-behavior: contain` on `.main` so wheel chaining does not scroll the page behind.

**Warning signs:**
Typing in the filter box changes the chapter. `J` moves chapters after the reader is closed. Space scrolls the forum page behind the overlay. Keys stop working after the first chapter click.

**Phase to address:** P2 (handler, focus) with the `href`/`tabindex` fix in P0.

---

### Pitfall 9: Held keys flood the one FIFO request queue

**What goes wrong:**
Holding `J` or an arrow sends auto-repeat keydown events (`e.repeat === true`), about 30 per second. Each one calls `_openChapter`, which queues a chapter-page fetch and a discussion fetch. `Net` is one FIFO queue with 4 slots and a 120 ms gap. The `tok`/`tokRef` guard cancels discussion loops but NOT chapter fetches already queued. Foreground requests also wait behind the prefetch backlog (CONCERNS.md, Performance). The forum sees dozens of page requests from one held key.

**Why it happens:**
Click navigation is naturally rate-limited by the human. Key repeat is not. The politeness constraint (PROJECT.md) was designed around clicks and prefetch.

**How to avoid:**
- Ignore `e.repeat` for chapter navigation.
- Debounce loading: move the TOC highlight and the title at once, but start the fetch after about 150-250 ms of quiet.
- Keep one load active: skip the fetch when a newer `tok` exists before the request is queued.
- Prefer serving from `Cache.mem`/IndexedDB (instant). Only the first visit to a chapter costs a request.
- Optionally give foreground requests priority in `Net` (already listed as an improvement in CONCERNS.md).

**Warning signs:**
A burst of requests in the Network panel while a key is held. HTTP 429 from the forum after fast navigation.

**Phase to address:** P2.

---

### Pitfall 10: Key choices collide with scrolling, selection, the host page and IME

**What goes wrong:**
- Left/Right as previous/next steals horizontal caret movement and horizontal scroll in wide tables or code blocks inside chapters, and breaks text selection by keyboard.
- Up/Down must stay native for scrolling. Binding them to chapter moves makes the chapter unreadable by keyboard.
- Esc closes the reader while the user only wanted to clear the filter or close a popover. Esc also reaches the forum: XenForo uses Esc to close its own overlays and menus (MEDIUM), so an unstopped Esc closes both.
- XenForo ships its own shortcuts: `M` for the visitor menu, `Alt+number` for navigation tabs, `Ctrl/Cmd+Enter` to submit (LOW confidence, from community threads; no official doc found). Capture-phase handling inside the open reader avoids most of this, but only if the handler stops the keys it consumes.
- Browser extensions such as Vimium also bind `J`/`K`. They cannot be fully overridden. Arrow keys are the fallback, so both must work.
- On non-Latin layouts `e.key` for the J/K physical keys is a different letter. Choose `e.key` (letters as typed) or `e.code` (physical) on purpose and document it.

**Why it happens:**
Key maps are designed in isolation from selection, IME, popovers and the host page.

**How to avoid:**
- Bind: `J`/`ArrowRight` = next, `K`/`ArrowLeft` = previous. Leave Up/Down/Space/PageUp/PageDown/Home/End native.
- Define one Esc priority chain and test it: (1) clear and blur the filter input, (2) close an open popover, (3) close the reader.
- Skip arrows when the selection is non-collapsed or focus is in a scrollable element that can scroll horizontally.
- Keep the map in one pure function `keyToAction(event-like)` that unit tests can call without a DOM.
- Show the shortcuts in a tooltip or `title`; do not rely on discovery.

**Warning signs:**
Esc closes the reader while a popover is open. Arrow keys misbehave in a wide table. Esc also closes a forum menu behind the reader.

**Phase to address:** P2.

---

### Pitfall 11: The TOC re-render destroys scroll position, filter state and the filter input

**What goes wrong:**
`_renderTOC` does `toc.innerHTML = ''` and rebuilds every anchor. The consequences for v0.8:
- Emptying `.toc` collapses its `scrollTop` to 0. `_boot` calls `_renderTOC` twice (cached index, then fresh index), and the view toggle calls it again. The TOC jumps to the top while the user is mid-list.
- If the filter `<input>` is placed inside `.toc` it is destroyed on every render, mid-typing.
- Read markers and the active class must be re-applied after each render. Only `_markActive` is re-applied today.
- A per-keystroke full rebuild with per-anchor `onclick` closures is wasteful. Some stories have far more than 228 threadmarks (the SV/SB long runners reach four digits, MEDIUM confidence).

**Why it happens:**
The render function was written as "draw everything" and was never asked to preserve UI state.

**How to avoid:**
- Put the filter input OUTSIDE `.toc` (above it, inside `.side`).
- Render the full TOC once per index change; filter by toggling the `hidden` attribute on existing rows and on section headers (hide a header when none of its rows match). Do not rebuild on keystroke.
- Preserve `.toc.scrollTop` across `_renderTOC`, and re-apply the filter, read markers and active row after it.
- Use one delegated click handler on `.toc` instead of per-anchor closures.
- Scroll the active row into view with `scrollIntoView({block:'nearest'})` on the row, after keyboard navigation.
- Update a single row's marker (classList) when progress changes. Do not call `_renderTOC` from the progress saver.

**Warning signs:**
TOC list jumps to the top when the index finishes loading. Typing in the filter loses focus. Read marker disappears after toggling the reading order.

**Phase to address:** P1 (markers, preserve state) and P3 (filter).

---

### Pitfall 12: The filter semantics are undefined and it conflicts with navigation order

**What goes wrong:**
- `_step` and `J`/`K` walk `index.list(view)`. With a filter active, should `J` follow the full order or only the visible rows? Left undefined, the reader jumps to chapters the user cannot see, or skips ones they can.
- Matching is case-sensitive, accent-sensitive and treats IME composition input as final text on every keystroke.
- Highlighting the match by writing `innerHTML` with the chapter title inserts forum-controlled text as HTML.
- Filtering by title only misses what readers search for (chapter number, category). Filtering by chapter text is not possible: only visited and prefetched bodies are cached.

**Why it happens:**
"Search/filter" looks like a UI feature, but it touches the navigation model and untrusted text.

**How to avoid:**
- Decide and write down: recommended, `J`/`K` always follow the full reading order; the filter only changes what the TOC shows. Show a small "N of M" count and an empty state.
- Normalize both sides: `toLocaleLowerCase()` plus `normalize('NFD')` with combining marks removed. Debounce about 100 ms; skip updates while `e.isComposing`.
- Build highlights from DOM nodes (`textContent` plus a `<mark>` element). Never use `innerHTML` with a title. Titles are forum-controlled.
- Clear the filter when the view toggles, or keep it and re-apply. Pick one.

**Warning signs:**
`J` opens a chapter that is hidden by the filter. A title containing `<` renders wrongly.

**Phase to address:** P3.

---

### Pitfall 13: Typography settings: bad parse, hard-coded CSS, inline forum styles, unit drift

**What goes wrong:**
- `Number(localStorage.getItem(k))` returns `0` for a missing key, and `parseFloat('')` returns `NaN`. A font size of 0 or `NaN` makes the chapter invisible, with the controls in the same broken reader.
- The current CSS hard-codes values in three places: `.chapter{max-width:760px}`, `.disc{max-width:760px}` and `.discbar` width, and `.chapter :is(p,li){line-height:1.7}`. A control on `.chapter` does not override the rule on `p,li`. The measure applied to `.chapter` alone leaves the comments at 760px.
- XenForo's BB code `[SIZE]` renders inline `font-size` on spans. Inline styles beat any inherited size, so the font-size control appears to do nothing for those spans (MEDIUM; confirm on a live thread). `.comment` already works around inline colors with `!important` rules, which shows the host markup carries inline styles.
- Measure in `px` plus a font-size control changes characters per line in a way the user did not choose. Use `ch` or `em` for the measure.
- `rem` inside the shadow tree resolves against the FORUM's root font size, not the reader's. The current look is 16px (`:host{all:initial}` gives `medium`). Keep px values to preserve it.
- Changing the family would violate the site-font constraint (`SITE_FONT`, CONTEXT.md). Expose size, measure and line-height only.
- Writing to localStorage on every `input` event of a slider is a write storm.

**Why it happens:**
Settings are treated as a single number, and the CSS was written with fixed values before it needed to be dynamic.

**How to avoid:**
- One parse function: `parse(value, min, max, default)` that handles `null`, `''`, `NaN`, out-of-range and wrong types, then clamps. Unit test it.
- Store one JSON key (for example `xfReader:type`) with a version field, so a partial write cannot leave a mix.
- Define CSS custom properties on the host (`--fs`, `--measure`, `--lh`) with defaults that equal today's look (16px, 760px-equivalent, 1.7). Replace the three hard-coded rules with `var(...)`. Custom properties are unaffected by `all:initial`.
- Decide scope up front: chapter only, or chapter and comments. State it in the UI.
- For inline forum sizes, either accept the limit and document it, or apply a scale to the container; do not strip author formatting silently.
- Apply live on `input`, persist on `change`. Add a "Reset" action.
- Clamp the measure to the viewport: `max-width: min(100%, var(--measure))`.

**Warning signs:**
Blank chapter after clearing site data partly. The slider changes nothing for some paragraphs. Line length changes when only the size was changed.

**Phase to address:** P3.

---

### Pitfall 14: Typography controls do not fit the one-row footer, and popover focus is mishandled

**What goes wrong:**
The footer is six `flex:1 1 0; nowrap` icon buttons in a 320px sidebar. Three more controls squeeze each button to unusable width or overflow. A popover opened from the footer collides with the `::after` tooltips that sit above the buttons, needs outside-click and Esc handling, and its inputs steal focus from the reader (and must be ignored by the key handler, see Pitfall 8). Touch users have no hover; the long-press tooltip logic does not cover new controls.

**Why it happens:**
The footer was sized for the first set of controls.

**How to avoid:**
- Add ONE footer button ("Aa") that opens a popover or a panel above the TOC, with the three controls inside. Keep the footer to seven buttons at most, or move low-use buttons into the panel.
- Give the popover `role="dialog"` or a labelled group, `aria-expanded` on its button, Esc to close (Esc chain, Pitfall 10), and focus return to the button.
- Use native `<input type="range">` with labels and `aria-valuetext` for readable values.
- Check at 320px sidebar width and on a narrow phone width.

**Warning signs:**
Icon buttons clipped. Tooltip and popover overlap. Esc closes the reader instead of the popover.

**Phase to address:** P3.

---

### Pitfall 15: Read state is colour-only and anchors are not focusable

**What goes wrong:**
Dimming read titles or tinting unread ones conveys state by colour or opacity only. Screen reader and low-vision users get nothing. The dimmed colour on the light theme (`--muted:#555` on `#f0efea`) and dark theme must keep readable contrast. TOC `<a>` elements have no `href`, so they are not in the tab order (CONCERNS.md, Accessibility): keyboard users cannot reach a chapter, which defeats the keyboard feature.

**Why it happens:**
The first version was pointer-only.

**How to avoid:**
- Make TOC rows real controls: `<a href="#post-ID">` with `preventDefault` in the delegated handler, or `<button>`. Set `aria-current="true"` on the active row.
- Mark read with a text or glyph marker plus an `aria-label`/visually hidden text ("read", "in progress 40%"), not colour alone.
- Add `:focus-visible` styling for rows and footer buttons inside the shadow CSS (site CSS does not reach in).

**Warning signs:**
Tab from the filter input skips the chapter list. Read and unread rows look the same in greyscale.

**Phase to address:** P0 (anchor fix) and P1 (marker).

---

## Moderate Pitfalls

### Pitfall 16: Test coverage does not reach any of the new code

**What goes wrong:** `QQReader`, `Cache` and the launcher have no tests. happy-dom has no layout (zero `scrollHeight`/`offsetHeight`) and no real IndexedDB, so scroll maths, `IntersectionObserver` behaviour and key events across a shadow boundary cannot be proven there. The e2e script is manual and targets one SpaceBattles thread behind Cloudflare. CI does not run it. UI regressions reach `main`, and `main` is the update channel.
**Prevention:**
- Pull logic into pure, exported functions and expose them through `__xfr`: `progressRatio(box)`, `mergeProgress(a,b)`, `isRead(p)`, `keyToAction(ev)`, `parseTypography(raw)`, `matchTitle(title,query)`. Keep DOM wiring thin.
- Unit test those. Test `parseTypography` with `null`, `''`, `'abc'`, `-5`, `1e9`.
- Extend the CDP e2e with: open reader, press `J`, check the chapter id changed; type `j` in the filter and check it did not; close with Esc and check no listener remains (press `J`, nothing moves); scroll to the end and check the TOC marker.
- Make the pre-merge checklist include a manual e2e run on a live thread until CI can do it.
**Phase to address:** every phase; test hooks in P0.

### Pitfall 17: The 40,000-character smoke-test cap will be hit

**What goes wrong:** The file is about 27,800 characters; the smoke test caps it at 40,000. Three features plus fixes can add 8-12 KB. A cap that blocks a PR gets raised without a decision.
**Prevention:** Track size per phase. Prefer small, delegated handlers and shared helpers over copy-pasted blocks. If the cap must rise, raise it once, deliberately, in the P4 PR with the reason. Do not add a build step to escape it (out of scope, PROJECT.md).
**Phase to address:** P1-P3 (budget), P4 (decision).

### Pitfall 18: localStorage access can throw, and keys can collide

**What goes wrong:** The constructor reads `localStorage` without a guard. It throws when storage is disabled or blocked, and the whole custom element fails. New keys that reuse the prefix (`xfReader:last:`) can collide with a prefix scan. Quota errors on `setItem` throw too.
**Prevention:** One tiny `ls.get/ls.set` helper with try/catch, used by every new feature. Keep key names flat and distinct (`xfReader:type`, `xfReader:progress:<threadId>`). Do not rename existing keys.
**Phase to address:** P0.

### Pitfall 19: Two forum hostnames mean two separate progress stores

**What goes wrong:** `questionablequesting.com` and `forum.questionablequesting.com` are different origins with separate storage (CONCERNS.md). A reader who uses both sees unread chapters on the other host. `@grant none` rules out `GM_setValue` as a shared store.
**Prevention:** Document it as a known limit in README. Do not try to merge. Do not add a `@grant` for this (CONCERNS.md: review any new `@grant`).
**Phase to address:** P4 (docs).

### Pitfall 20: Author edits and removed threadmarks invalidate stored progress

**What goes wrong:** An author edits a chapter (cached body is stale, Known Bug "Stale content never expires") or removes a threadmark. Stored ratio and "read" flag refer to content that no longer exists.
**Prevention:** Key by `postId`. Ignore and lazily prune ids not in the index. Do not try to detect edits in this milestone; note it as a known limit.
**Phase to address:** P1.

### Pitfall 21: Closing the reader mid-save, and the index rebuilt under the user

**What goes wrong:** `this.remove()` runs while a debounced save timer is pending, so the last position is lost. `_boot` swaps `this.index` when the fresh index arrives; code that held a reference to the old index (for `_neighbors` or key navigation) uses stale objects.
**Prevention:** Flush the pending save in `disconnectedCallback`. Always read `this.index` at use time; never cache a chapter list in a closure.
**Phase to address:** P1, P2.

### Pitfall 22: Raw-GitHub caching and update lag give a mixed-version fleet

**What goes wrong:** `raw.githubusercontent.com` serves with a short CDN cache (about 5 minutes, MEDIUM, not verified in this research). Tampermonkey checks on its own interval (about 24 h by default, MEDIUM). So after a push, old and new versions run side by side for a day, and an open tab keeps old code until reloaded.
**Prevention:** Additive storage only (Pitfall 3). Test the NEW build against data written by the OLD build, and the old build against new keys. Do not expect users to get a fix within minutes.
**Phase to address:** P0 (rule), P4 (verify).

---

## Minor Pitfalls

### Pitfall 23: Text inserted with `innerHTML`
**What goes wrong:** New UI strings (filter count, empty state, error text, marker labels) inserted via `innerHTML` with any forum-derived text (titles).
**Prevention:** Use `textContent` for anything that includes titles or counts. `esc()` exists for the template-string paths.

### Pitfall 24: Setting CSS from stored strings
**What goes wrong:** `style.setProperty('--fs', stored)` with an unvalidated string. Same-origin page code can write localStorage.
**Prevention:** Validate to a number, clamp, then format with a unit yourself.

### Pitfall 25: Stale docs ship with the feature
**What goes wrong:** README and CONTEXT.md already drifted (v0.7.2, bottom-right). New shortcuts and settings go undocumented.
**Prevention:** Update README (shortcuts, settings, known limits) in the same PR as each feature.

### Pitfall 26: `scrollIntoView` scrolls the host page
**What goes wrong:** `scrollIntoView()` with default options on a TOC row can scroll ancestor containers, including the page behind the fixed overlay on some browsers.
**Prevention:** Use `{block:'nearest'}`, or set `.toc.scrollTop` directly.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse `Cache.set` for progress | No new storage code | Progress erased by a schema bump or eviction (Pitfall 2) | Only with a schema-agnostic key family |
| Bump DB version for a new store | "Proper" IndexedDB design | Blocked upgrade hangs all tabs (Pitfall 3) | Never, unless `onversionchange` and a timeout exist first |
| Pixel scroll offset | One line of code | Wrong after any reflow (Pitfall 7) | Never |
| Per-keystroke full TOC rebuild | Reuses `_renderTOC` | Loses scroll, focus, markers (Pitfall 11) | Never |
| Global keydown on `document` with no teardown | Works first time | Leak, duplicate handlers, hijacked page keys (Pitfall 8) | Never |
| Bump `@version` on every feature PR | Looks like normal releases | Half-finished features go live (Pitfall 1) | Only when the PR is complete and shippable |
| Raise the 40,000-char cap quietly | Unblocks the PR | The guard stops meaning anything | Once, deliberately, in P4 |
| Skip new tests because happy-dom lacks layout | Faster | Logic bugs ship to every install | Never for pure functions; layout bits get e2e |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tampermonkey update | Revert to an older `@version` to roll back | Forward-fix with a higher `@version` |
| Tampermonkey update | Expect instant propagation | Plan for about a day of mixed versions; additive storage |
| Raw GitHub `main` | Treat merge as safe staging | `main` is production; gate it (Pitfall 1) |
| IndexedDB | Fire-and-forget writes, version bump with no `onversionchange` | Flush on `pagehide` via localStorage for the hot cursor; no bump |
| localStorage | Unguarded `getItem`/`setItem`, `Number(null)` | Guarded helper, validate and clamp on read |
| Shadow DOM events | Check `e.target` at `document` | Use `e.composedPath()[0]`; focus a root inside the shadow |
| Shadow DOM CSS | `rem` and inherited sizes | Reader-owned px values via custom properties on the host |
| XenForo markup | Assume plain text bodies | Inline `style="font-size:..."` and lazy images are present |
| XenForo shortcuts | Assume no global handlers | Capture phase, stop only the keys the reader consumes |
| `IntersectionObserver` | Observe during the skeleton phase | Observe only after the real body renders; disconnect on chapter change |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Scroll handler writes storage each event | Jank, many transactions | rAF throttle plus 0.5-1 s debounce, flush on hide | Any long chapter |
| Held-key navigation | Request burst, HTTP 429 | Ignore `e.repeat`, debounce load | Immediately, on uncached chapters |
| TOC rebuild per keystroke | Typing lag, scroll reset | Toggle `hidden`, render once | Stories with about 1,000 threadmarks |
| Per-anchor `onclick` closures | Memory and render cost | One delegated handler | Large TOCs |
| Layout reads in the scroll handler (`offsetHeight`) | Forced reflow every frame | Cache chapter box on render and on resize; use `IntersectionObserver` | Long chapters with images |
| Prefetch loops multiplying on reopen (Bug 7) | More requests each reopen | Cancel on close before adding one-key Esc | Reopening several times per session |
| Progress map rewritten whole each save | Large writes for large stories | Small per-thread map; write only on change | Many chapters across many stories |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Highlight filter match via `innerHTML` | Forum-controlled title becomes HTML in the forum origin (MEDIUM) | Build text and `<mark>` nodes with `textContent` |
| Unvalidated stored values into CSS or logic | Layout break; small injection surface from same-origin code | Parse, clamp, format with own units |
| New `@grant` added "for shared storage" | Widens the privilege of a script that runs with the reader's session | Keep `@grant none`; document the per-origin limit |
| Shipping a bad release through auto-update | Reaches every install with no signature check | Release rule (Pitfall 1); CI plus manual e2e before the bump |
| Key handler `stopPropagation` on all keys | Breaks forum and browser shortcuts, accessibility tools | Stop only the consumed keys |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Read" on open | A skipped chapter counts as read | Read on reaching the end, never on open or prefetch |
| No way to mark unread | A mis-marked chapter stays wrong | A per-row or footer "mark unread" action |
| Read state is colour-only | Invisible to some users | Glyph or text plus aria label |
| Esc closes everything | Lose reader while clearing a filter | Esc chain: filter, popover, reader |
| Filter hides the active chapter | User loses their place | Keep the active row visible or show a clear count and reset |
| No shortcut hints | Feature is undiscoverable | `title` and tooltip text; README table |
| Typography with no reset | A bad value traps the user | Reset button; clamp ranges |
| Progress restore fights scrolling | Page jumps under the finger | Cancel restore on first user input |
| Progress bar covers the sticky discussion bar | Visual clash | Place any indicator in the TOC row or sidebar |

## "Looks Done But Isn't" Checklist

- [ ] **Progress:** Often missing the short-chapter case. Verify a chapter shorter than the viewport becomes read.
- [ ] **Progress:** Often missing the empty-body guard. Verify a chapter with a failed or empty body is NOT marked read.
- [ ] **Progress:** Often missing a flush on close. Verify close the tab 200 ms after scrolling and check the stored value.
- [ ] **Progress:** Often missing multi-tab merge. Verify two tabs on one story keep the higher progress.
- [ ] **Progress:** Often missing `CACHE_SCHEMA` independence. Verify bump the schema and check progress survives.
- [ ] **Storage:** Often missing old/new compatibility. Verify the v0.7.4 file still works against data written by v0.8.
- [ ] **Keyboard:** Often missing teardown. Verify after Esc, `J` does nothing and no duplicate listeners exist after three open/close cycles.
- [ ] **Keyboard:** Often missing the shadow boundary. Verify typing `j` in the filter does not navigate.
- [ ] **Keyboard:** Often missing focus after a chapter change. Verify Space scrolls the reader, not the page behind.
- [ ] **Keyboard:** Often missing repeat control. Verify holding `J` sends at most one load.
- [ ] **Keyboard:** Often missing modifier checks. Verify Ctrl+J and Cmd+K still reach the browser.
- [ ] **Filter:** Often missing preserved scroll. Verify the TOC does not jump when the fresh index arrives.
- [ ] **Filter:** Often missing empty state and count. Verify a query with no match shows a message.
- [ ] **Typography:** Often missing invalid stored values. Verify set `xfReader:type` to garbage and reload.
- [ ] **Typography:** Often missing the comment pane and `.discbar` widths. Verify measure changes apply to the chosen scope.
- [ ] **Typography:** Often missing position preservation. Verify font size change keeps the reader at the same passage.
- [ ] **Release:** Often missing the `@version` rule. Verify the final PR bumps once, and `package.json` matches.
- [ ] **Release:** Often missing the live click-through. The v0.7.2 UI was never clicked as a whole; run the manual e2e on a real thread before the bump.
- [ ] **Docs:** Verify README lists shortcuts, settings and the per-origin limit.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bad release on `main` | MEDIUM | Revert the code, set a HIGHER `@version`, push. Users get it at their next check (about a day). |
| Progress erased by schema bump | HIGH | Not recoverable from the script. Add the separate key family and tell users in the release note. |
| DB upgrade blocked | MEDIUM | Ship a build that opens version 1 again with `onversionchange` and a timeout. Ask users to close old tabs. |
| Leaked key listener | LOW | Add `disconnectedCallback`, bump, ship. Reload clears the leak for users. |
| Corrupt typography value | LOW | The parse and clamp fix self-heals on reload. A Reset button helps in-session. |
| Wrong "read" marks | LOW | "Mark unread" action; or delete the `xfReader:progress:*` key. |
| Request flood from held key | LOW | Add `e.repeat` ignore and debounce, ship. Watch for 429 reports. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Every merge ships; rollback needs higher version | P0 (rule), P4 (bump) | One bump in the final PR; rollback rule in `AGENTS.md` |
| 2 Progress inside the disposable cache | P0, P1 | Schema bump leaves progress intact |
| 3 DB version bump hangs tabs | P0 | `open(...,1)` unchanged; no new store; old build reads new keys |
| 4 Lost or racy writes | P1 | Quick tab close and two-tab merge tests |
| 5 Wrong progress box | P1 | Short chapter and long discussion both resolve correctly |
| 6 Known bugs corrupt new state | P0 | Empty or failed body never marks read; error state with retry |
| 7 Restore lands wrong | P1, P3 | 0% never overwrites saved value; font change keeps place |
| 8 Shadow DOM key handler | P2 (and P0 anchor fix) | Filter typing, teardown and focus checks in e2e |
| 9 Held-key flood | P2 | Network panel shows one load per held key |
| 10 Key collisions and Esc chain | P2 | Esc chain test; modifier keys reach the browser |
| 11 TOC re-render destroys state | P1, P3 | TOC scroll and filter survive the index refresh |
| 12 Filter semantics | P3 | Unit tests for `matchTitle`; written rule for `J`/`K` |
| 13 Typography parse and CSS | P3 | `parseTypography` unit tests; garbage-value reload |
| 14 Footer overflow and popover | P3 | Visual check at 320px and a phone width |
| 15 Colour-only state, unfocusable rows | P0, P1 | Tab reaches rows; marker has text or glyph |
| 16 Test gaps | P0-P3 | Pure functions exposed and tested; e2e extended |
| 17 40,000-char cap | P1-P4 | Size tracked per phase; one deliberate decision |
| 18 localStorage guards | P0 | Helper in use; no bare `localStorage` in new code |
| 19 Two hostnames | P4 | README note |
| 20 Edits and removed threadmarks | P1 | Unknown ids ignored without error |
| 21 Close mid-save, stale index | P1, P2 | Flush on disconnect; index read at use time |
| 22 Mixed-version fleet | P0, P4 | Cross-version storage test |

## Sources

- `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `xenforo-story-reader.user.js` v0.7.4 (lines 91-100 Cache, 273-360 QQReader, 386-405 launcher), `test/smoke.test.js` - HIGH, read directly.
- [Tampermonkey documentation](https://www.tampermonkey.net/documentation.php?locale=ja&q=update_url): `@version` is used for the update check and must increase on every update - MEDIUM.
- [Greasy Fork feedback thread](https://greasyfork.org/vi/forum/discussion/comment/22541/): default update interval 24 h, from an older release - LOW-MEDIUM.
- [XenForo community: What's new in XenForo 2.0](https://www.xenforo.com/community/threads/whats-new-in-xenforo-2-0.133426/page-7) and related shortcut threads: template-attribute shortcut system, `M` for the visitor menu, `Alt+number` tab shortcuts - LOW (no official `data-xf-key` documentation found).
- Platform knowledge, not re-verified in this run: shadow-DOM event retargeting and `composedPath()`; focus and native scroll keys act on the focused element's scroller; IndexedDB `blocked`/`versionchange` semantics; `IntersectionObserver` with a custom `root`; `raw.githubusercontent.com` short CDN cache - MEDIUM.
- Not researched: the actual XenForo JS shortcut handlers (read the forum's loaded JS or test live before relying on Pitfall 10's host-page claims).

---
*Pitfalls research for: single-file Tampermonkey XenForo story reader, milestone v0.8*
*Researched: 2026-11-02*
