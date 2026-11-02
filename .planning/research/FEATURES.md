# Feature Research

**Domain:** Book-style story reader (userscript over threadmarked XenForo threads) — v0.8 "reading comfort"
**Researched:** 2026-11-02
**Confidence:** MEDIUM-LOW overall. Read the per-source note under Sources. Most behavior below is reader-app convention plus reasoning from the code, not measured user research.

**Scope of this file.** Three tracker items: #1 (scroll progress and read state), #2 (keyboard navigation), #3 (TOC filter and typography). Tags used below:

- `[#N]` = in the tracker (v0.8 #1-#3, or backlog #4-#16).
- `[SUGGESTION - not in tracker]` = found by this research. It is NOT planned scope. The requirements step must not add it without a decision.

**Facts about the current code that shape the findings** (`xenforo-story-reader.user.js`, checked 2026-11-02):

- One scroller, `.main`, holds the chapter, the sticky discussion bar and the discussion. Scroll height is chapter + discussion.
- `_openChapter` sets `.main.scrollTop = 0` and sets `_curId` before the body loads. Body is inserted after `await`.
- `_renderTOC` rebuilds the whole TOC with `innerHTML=''`. It runs after the cached render, after `buildIndex`, and on the order toggle.
- `_step` walks `index.list(view)`. `.chapter` is `max-width:760px`, line-height 1.7 on `p, li`, no font-size rule. The footer has 6 buttons in 320 px.
- Cache entries carry `schema: CACHE_SCHEMA`. An entry with another schema counts as a miss (`Cache.get`, line 96).
- No `keydown` handler exists. TOC links are `<a>` without `href` (not focusable; CONCERNS.md).

---

## Feature Landscape

### Feature 1 — In-chapter scroll progress + read/unread state [#1]

**What readers expect (eli14):** a bookmark that never falls out. Close the book, open it tomorrow, find the page. The contents page also shows which chapters are finished, like ticks on a to-do list. Today: no bookmark inside a chapter. Future risk if built badly: the ticks lie (chapters marked read that were skipped), and people stop trusting them.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Resume scroll position when the last-opened chapter reopens | Every reader app (Kindle, Books, Kobo) and web-novel scripts restore position; a long chapter that restarts at the top feels broken | MEDIUM | Store a fraction 0..1 of the chapter body, not pixels: typography (Feature 3) and viewport change height. Restore only AFTER the body is in the DOM. Replace the unconditional `scrollTop=0` in `_openChapter`. |
| Resume rule that does not trap re-readers | Reader who clicks an old chapter in the TOC expects the top, not "97% down" | LOW | Suggested rule: resume only when progress is between about 3% and 97% and the chapter is not marked read; else start at top. A "start at top" link is cheap insurance. |
| Three TOC states: unread / in progress / read | The TOC is the only overview of a 228-chapter story; one boolean hides "I stopped half-way" | LOW-MEDIUM | State must not rely on color alone: use a glyph or text plus `aria-label` (ties to #12). `_tocLink` builds `<a>` with `textContent`; it needs a marker child and a data attribute. |
| Read = reached the end of the CHAPTER BODY, not of the scroller | Discussion sits under the chapter in the same scroller; "bottom of scroller" would mean "read the comments" | MEDIUM | Detect with an end-of-body sentinel and `IntersectionObserver` rooted on `.main` (also handles chapters shorter than the viewport, where there is no scroll event at all). Progress denominator = `.chapter` bounds, never `.main.scrollHeight`. |
| Manual toggle: mark read / mark unread | Auto-detection is fallible (skim, jump with End, read elsewhere). Every tracking system offers a manual override | LOW | One control on the chapter header or a TOC context action. Manual state must beat auto state. |
| Thin visible progress cue in the chapter view | The issue is named "scroll progress"; a hidden position is not a feature a user can see | LOW | Sticky 2-3 px bar at top of `.main`, scoped to the chapter body. A percent readout is optional. |
| Throttled persistence | Writing on every scroll event hammers IndexedDB and the main thread | LOW | Save on scroll idle (about 500-1000 ms), on chapter change, on `visibilitychange`/`pagehide`, and on reader close (needs a flush in `remove()`/`disconnectedCallback`). |
| Progress survives cache invalidation | Progress is user data; the cache is disposable | MEDIUM | Today a `CACHE_SCHEMA` bump turns every entry into a miss. Read state must use its own record/schema, or the next schema bump silently erases everyone's progress. Also exclude it from any future "clear cache" control (#9, #15). Decision needed: the tracker says IndexedDB; progress for one story is a few KB and would also fit `xfReader:` localStorage. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Mark everything up to here as read" `[SUGGESTION - not in tracker]` | Read state starts empty. A reader who finished 120 of 228 chapters before installing would otherwise tick 120 boxes | LOW | One action over `index.list(view)`. Pairs with a per-story "reset progress". |
| "N of M read" count at the top of the TOC `[SUGGESTION - not in tracker]` | Cheap whole-story progress, the thing book readers show | LOW | Derived from the same state map. |
| Per-chapter mini progress bar in the TOC for in-progress chapters `[SUGGESTION - not in tracker]` | Shows where the story was left at a glance | LOW | Underline fill on the TOC row. |
| Continue-reading entry and "first unread" jump [#7] | Direct use of read state; the tracker says #7 "depends on read-state from #1" | LOW once #1 exists | Not part of #1 itself. |
| New-chapter badge until first read [#4] | New chapters are unread by definition | LOW once #1 exists | Not part of #1 itself. |
| Estimated time left in chapter `[SUGGESTION - not in tracker]` | Kindle-style cue (from training knowledge, not verified in this research) | MEDIUM | Needs word count and a reading speed; defer. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Mark a chapter read when it is opened | Simplest to build | Pressing J/K through 20 chapters (Feature 2) marks all 20 read | Mark read only on reaching the end sentinel (optionally with a 1-2 s dwell so End-key skipping is not a read) |
| Sync progress to the forum or any account | "Works on all my devices" | Violates the read-only constraint (PROJECT.md): no account change | Local-only progress. State the limit in the README: it does not follow the reader across browsers (Royal Road's settings also stay per device, [source 1]) |
| Save position on every scroll event | "Never lose a line" | IndexedDB write storm; races with chapter change | Throttle (see Table Stakes) |
| Progress over chapter + discussion | One number is simpler | The bar jumps when discussion loads below; "read" fires on the comment tail | Chapter-body-only denominator |
| Progress in pixels | Simplest to store | Wrong after any font-size, measure or window change | Fraction of body height |

---

### Feature 2 — Keyboard navigation (J/K, arrows, Esc) [#2]

**What readers expect (eli14):** the reader works like a remote control. Right or "next" turns to the next chapter. "Escape" shuts the book. Nothing breaks when a person types in a text box. Today: no keys at all. Future risk: keys fire while typing in the filter box, or while the forum page behind still grabs keys.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Next/previous chapter on ArrowRight / ArrowLeft | Established userscript convention on AO3: rixx's `ao3-arrows` binds exactly Right = next, Left = previous [source 3] | LOW | Reuse `_step(1)` / `_step(-1)`. This follows the active reading order (grouped or chrono), same as the footer buttons. |
| J / K as the vim-style pair | In the tracker. j/k come from vi and are used by Gmail, Twitter and Google Reader [source 5] | LOW | Direction is a decision. Suggested: **J = next, K = previous** (vi: j moves down/forward). Gmail uses j = older and k = newer, so "next" is ambiguous across apps; document the choice in the tooltips. |
| Esc closes the reader | In the tracker | LOW | Esc has layers: (1) clear and blur the filter input if it holds text, (2) close an open settings popover, (3) close the reader. Without the layering, Esc in the filter box shuts the book. Cross-feature with Feature 3. |
| Ignore keys while typing and while modified | Standard guard. rixx's script returns early for INPUT/TEXTAREA and for ctrl/alt/meta/shift [source 3] | LOW | Inside shadow DOM the event target is retargeted: test `event.composedPath()[0]` or `shadowRoot.activeElement`, not `event.target`. Also ignore `isComposing` (IME) and `contenteditable`. Never take Ctrl/Cmd/Alt combos (browser Back, find, zoom stay intact). |
| Ignore auto-repeat (`event.repeat`) | A held key would fire chapter after chapter | LOW | Each chapter open starts a body fetch and discussion fetches through `Net`. Holding K would breach the politeness constraint. The existing `_tok` cancel does not undo requests already queued. |
| Keys scoped to the reader | Tracker says: "bind inside the shadow DOM so forum shortcuts are untouched" | MEDIUM | Needs real focus inside the shadow root: give `.wrap` (or `.main`) `tabindex="-1"` and focus it on open and after each chapter change. Without focus, the keydown goes to `document.body` and the listener inside the shadow never sees it. `stopPropagation` handled keys so page-level handlers (and extensions such as Vimium, which also own j/k) do not double-act. |
| Native scrolling keys keep working | Space, PageUp/PageDown, Home/End, Up/Down are how people scroll a long text | LOW | Do not bind Up/Down or Space. The same focus fix makes these scroll `.main`; with focus on the page behind the fixed overlay they can scroll the document under it instead. Behavior needs a live check in Chrome and Firefox. |
| Shortcut discoverability | Hidden keys are never found | LOW | Add keys to the existing footer tooltips: "Next chapter (J / →)". This reuses `data-tip`. |

Why this passes the character-key rule: WCAG 2.1.4 (Level A) lets single-character shortcuts stand if they are active only while the component has focus [sources 4a, 4b]. A reader overlay that holds focus meets this without a settings toggle. The ArrowLeft/ArrowRight bindings are not character keys.

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "?" shortcut help overlay `[SUGGESTION - not in tracker]` | Common in keyboard-heavy web apps; lists all keys | LOW-MEDIUM | Tooltips already cover discoverability; defer unless more keys appear. |
| "/" focuses the TOC filter `[SUGGESTION - not in tracker]` | Familiar search-focus key (GitHub, YouTube) | LOW | Ships with Feature 3. Esc layering above makes it safe. |
| Key to jump between chapter and discussion `[SUGGESTION - not in tracker]` | Discussion lives in the same scroller | LOW | Only if usage shows a need. |
| Brief "last chapter" / "first chapter" cue at the ends | Silent no-op reads as a broken key | LOW | A transient line in the footer or discussion bar. |
| Focus returns to the launcher on close; focus enters on open [#12] | Keyboard users need a path in and out | LOW | #12 owns the full pass; #2 needs the focus-on-open part to function. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Remappable key bindings UI | "Let me choose" | Settings surface and storage for a handful of keys; one-file product | Fixed keys, documented in tooltips |
| Global (document-level) listeners that live after the reader closes | Easiest wiring | Steals j/k, arrows and Esc from the forum and from Vimium-type tools on the page | Handler on the reader's shadow root, removed with the element |
| Binding Up/Down/Space/PageUp/PageDown | "Full keyboard control" | Fights native scrolling | Leave them native; make sure the scroller has focus |
| Confirm dialog on Esc | Guard against accidental close | Reopen costs about 0 ms from cache; the chapter and position are saved | Flush progress on close and rely on resume |
| Intercepting modified keys (Ctrl/Cmd/Alt) | Extra shortcuts | Breaks browser Back, find, zoom | Unmodified keys only |

---

### Feature 3 — TOC search/filter + typography controls [#3]

**What readers expect (eli14):** the contents page gets a search box, like finding a song in a long playlist. The text gets a "make it comfortable" dial, like adjusting a reading lamp and chair. Today: no search, and text size comes only from browser zoom. Future risk: the filter text vanishes whenever the TOC redraws, and the settings change the layout for people who liked the old look.

#### 3a. TOC filter — Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live filter as the user types | Standard list-filter behavior; 228 rows need no debounce | LOW | Case-insensitive substring on chapter title. Threadmark titles often carry numbers ("4.6"); substring matching already covers number search. |
| Section headers hide when all their chapters are filtered out (grouped view) | Otherwise orphan headers litter the list | LOW | Same loop shape as `_renderTOC`. Chrono view has no headers. |
| Clear control and Esc-to-clear | Quick reset | LOW | Esc layering (Feature 2). Input must be excluded from J/K/arrow handling. |
| Filter survives TOC re-render | `_renderTOC` runs after cached paint, after `buildIndex`, and on order toggle; each run wipes `innerHTML` | LOW-MEDIUM | Keep filter text on the instance and re-apply in `_renderTOC` (or hide rows by class instead of rebuilding). Easy to miss: the background index build lands seconds after the user starts typing. |
| Empty state ("No chapters match") and match count ("12 of 228") | A blank sidebar looks broken | LOW | |
| Active chapter stays identifiable | `_markActive` runs on every render | LOW | Decision: keep the active row visible while filtered, or let it hide. Suggested: let it hide; keep prev/next independent of the filter. |
| Prev/next ignore the filter | A filter that silently changes what "next" means is a trap | LOW | `_step` already uses the full list; leave it. |

#### 3a. TOC filter — Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Enter in the filter opens the first match `[SUGGESTION - not in tracker]` | Gives keyboard users a path to a chapter while TOC rows are not focusable (CONCERNS.md; #12) | LOW | |
| Filter by read state (unread only) `[SUGGESTION - not in tracker]` | Needs #1; answers "what is left?" | LOW once #1 exists | |
| Full-text search across chapter bodies `[SUGGESTION - not in tracker]` | Find "that scene" | HIGH | Only sensible after #15 (cache-complete stories). Defer. |

#### 3a. TOC filter — Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fuzzy / ranked search | Typo tolerance | Code and tests for little gain on short titles | Substring match |
| Full-text search before the cache is complete | "Search the story" | Forces fetching every chapter, against the politeness constraint and the lazy-index goals (#14, #15) | Title filter now; revisit after #15 |
| Persist the filter text across sessions | "Remember my search" | Reopening to a half-filtered, apparently shorter TOC looks broken | Session-only |

#### 3b. Typography controls — Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Font size control | Present in every reader; Royal Road offers 10-32 [source 1]. Browser zoom scales the TOC and chrome too, so it is not a substitute | LOW | Step buttons (A- / A+) with a visible value beat a bare slider. Apply through a CSS custom property on the host (as `--bg`/`--fg` already work). Today there is no font-size rule: capture the current look as the default (browser default 16 px). |
| Measure (line length) control | Royal Road lets the column run from 100% down to 50% of the reader area [source 1]. Guidance puts body text at about 50-75 characters per line [source 2] | LOW | Express in `ch`/`em` so it scales with font size, capped by the viewport (`min(var(--measure), 100%)`), which also serves #8. Current default is `max-width:760px`; by estimate that is near 95 characters at 16 px, above the guidance. The estimate has not been measured. Offer narrow / medium / wide steps; keep 760 px as the default so nothing shifts for existing users. |
| Line-height control | WCAG 1.4.12 benchmark is 1.5x [source 6]; the current 1.7 is already above it | LOW | Three steps (about 1.4 / 1.7 / 2.0). Note: the rule is on `p, li` only; headings and unwrapped text keep their own height. Check chapters whose BB code produces `div`/`span` text. |
| Reset to defaults | Users must be able to undo a bad setting | LOW | One button. |
| Persistence under `xfReader:` | In the tracker | LOW | One JSON key, or three. Global, not per story. |
| Live preview | Controls where nothing moves feel broken | LOW | Applies instantly through CSS variables. |
| Defaults equal today's look | An update ships to all installs from `main` (PROJECT.md: auto-update) | LOW | Verify visually: 760 px, 1.7, same font size. |
| Layout must not break at text-spacing overrides | WCAG 1.4.12 requires content to survive user spacing without clipping or overlap [source 6] | LOW | Avoid fixed heights on text containers; the current CSS has none in the chapter. |

#### 3b. Typography controls — Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Strip author styling in the chapter (inline colors, fonts, sizes) `[SUGGESTION - not in tracker]` | Royal Road offers this [source 1]. Inline `font-size`/`color` from BB code ignores the size control and can be unreadable on dark. Comments already neutralize color/background (CSS lines 248-249); chapters do not | MEDIUM | Touches sanitizing scope; related to the known "forum HTML goes into innerHTML" concern. Do not bundle into #3 without a decision. |
| Paragraph spacing control `[SUGGESTION - not in tracker]` | Covered by WCAG 1.4.12 values | LOW | Skip unless asked. |
| "Aa" popover that #9 later absorbs | One home for settings | LOW-MEDIUM | See dependencies: the footer is full; #3 needs a place for its controls before #9 exists. |
| Typography applies to the discussion too, proportionally `[SUGGESTION - not in tracker]` | Comments are 14 px fixed today | LOW | Decision: scale with the chapter, or leave. |

#### 3b. Typography controls — Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Font-family picker (serif, dyslexia font, web fonts) | Common in readers, for example Royal Road's several fonts [source 1] | Conflicts with the recorded constraint: use `SITE_FONT`, do not change it (PROJECT.md, CONTEXT.md). Web fonts also break the local-only asset rule | Only if the owner revisits the constraint |
| Paged mode (CSS columns, page turns) | "Book-style" | Breaks scroll progress (Feature 1), resume and the sticky discussion bar; HIGH cost | Keep continuous scroll |
| Per-story typography profiles | "Different story, different feel" | State and UI for little value | One global profile |
| Free pixel sliders for every value | Precision | Awkward on touch and for tests; sprawling settings | Small named steps |
| Auto-fit measure from device detection | "Smart defaults" | Guesswork; viewport cap already handles narrow screens | Cap by viewport |

---

## Feature Dependencies

```
[#1 read state + progress]
    └──requires──> body inserted before restore (changes _openChapter order: no scrollTop=0 before restore)
    └──requires──> own storage record, independent of CACHE_SCHEMA
    └──enables───> [#7 Continue reading] ──enables──> launcher tooltip
    └──enables───> [#4 new-chapter badge until first read]
    └──enables───> [3a filter by unread]
    └──conflicts─> "mark read on open" (J/K skipping would mark everything read)

[#3b typography]
    └──affects───> [#1 restore]  (height changes: store a fraction, re-apply after reflow)
    └──needs─────> a UI home ──> [#9 settings panel] (later absorbs it)
    └──feeds─────> [#8 responsive] (measure capped by viewport)

[#2 keyboard]
    └──requires──> focus inside the shadow root (shares work with [#12 a11y])
    └──requires──> input guard ──> [3a filter input]
    └──shares────> Esc layering with [3a filter] and [3b popover]
    └──stresses──> Net politeness (needs event.repeat guard)
    └──compensates> non-focusable TOC rows until [#12]

[3a filter] ──requires──> re-apply after every _renderTOC
```

### Dependency Notes

- **#1 and `_openChapter`:** the function now sets `_curId` and `scrollTop=0` before the body exists. A scroll listener that reads progress during that window writes 0% for the NEW chapter and overwrites the saved position before restore runs. Gate the listener until restore finishes. Flush the old chapter's progress before switching.
- **#1 and #2:** read state must come from reaching the end, not from opening. This keeps J/K stepping from corrupting the data.
- **#2 and #3:** the filter box is the first text input in the reader. The input guard and Esc layering have to land with (or before) the filter.
- **#3 and #9:** #9 lists typography as "once #3 lands". Design the #3 controls as a self-contained popover so #9 can host it without a rewrite.
- **#1 and #15 / #9:** a future cache clear or schema bump must not delete progress.

## MVP Definition

### Launch With (v0.8)

- [ ] Resume position for the last-opened chapter, stored as a fraction, with the 3%-97% rule — core of #1
- [ ] End-of-body detection marks read; manual read/unread toggle; three TOC states with non-color cue — core of #1
- [ ] Thin chapter-scoped progress bar — makes #1 visible
- [ ] Progress record independent of `CACHE_SCHEMA` — avoids silent data loss on the next bump
- [ ] ArrowLeft/ArrowRight and J/K, Esc with layering, input and modifier guard, `event.repeat` guard, focus on open — all of #2
- [ ] Shortcut text in footer tooltips — #2 discoverability, nearly free
- [ ] TOC filter (live, substring, headers hidden, count, empty state, survives re-render) — core of #3
- [ ] Font size, measure (viewport-capped, `ch`/`em`), line-height, reset, persistence, defaults equal today's look — core of #3

### Add After Validation (v0.8.x)

- [ ] "Mark up to here as read", "N of M read" — once the tracker confirms demand; cheap on top of #1
- [ ] Enter-opens-first-match and "/" focus in the filter — keyboard follow-up
- [ ] Filter by unread — after #1 data exists

### Future Consideration

- [ ] Strip author inline styles in chapters — needs a decision on sanitizer scope
- [ ] Full-text search — after #15
- [ ] Time left in chapter, help overlay — only on demand

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Resume position (fraction) | HIGH | MEDIUM | P1 |
| End-of-body read detection + manual toggle | HIGH | MEDIUM | P1 |
| Progress storage independent of cache schema | HIGH (data loss) | LOW-MEDIUM | P1 |
| Chapter-scoped progress bar | MEDIUM | LOW | P1 |
| Arrow keys + J/K + Esc layering + guards | HIGH | LOW-MEDIUM | P1 |
| Focus management inside shadow DOM | HIGH (without it, keys fail) | MEDIUM | P1 |
| Shortcut text in tooltips | MEDIUM | LOW | P1 |
| TOC live filter surviving re-render | HIGH | LOW-MEDIUM | P1 |
| Font size / measure / line-height + reset | HIGH | LOW-MEDIUM | P1 |
| Mark-up-to-here, N of M read | MEDIUM | LOW | P2 |
| Filter Enter-to-open, "/" focus | MEDIUM | LOW | P2 |
| Filter by unread | MEDIUM | LOW | P2 |
| Strip author styles | MEDIUM | MEDIUM | P3 |
| Time left in chapter, help overlay | LOW | MEDIUM | P3 |
| Full-text search | MEDIUM | HIGH | P3 |

**Priority key:** P1 = needed for v0.8 to count as done; P2 = add when cheap; P3 = defer.

## Competitor Feature Analysis

| Feature | AO3 (userscripts) | Royal Road | Kindle / e-reader apps | Our Approach |
|---------|-------------------|------------|------------------------|--------------|
| Next/prev chapter keys | Not built in; rixx's script adds Left/Right [source 3] | Not found in research | Page-turn keys (training knowledge) | Left/Right + J/K, scoped to the reader |
| Font size | Browser/skin only | 10-32 [source 1] | Yes (training knowledge) | Stepped control, default = today |
| Measure/width | Skin width (rixx's script sets 64em) [source 3] | 100%-50% of reader area [source 1] | Margins | Narrow/medium/wide in `ch`, viewport-capped |
| Line-height | Not found in research | Not found in Royal Road article [source 1] | Yes (training knowledge) | Three steps |
| Font family | Browser | Several fonts, strip author styling [source 1] | Yes | Not offered: `SITE_FONT` constraint |
| Settings persistence | Per skin / account | Local to the device, not synced [source 1] | Synced (training knowledge) | `localStorage`, per browser |
| Read state | Account history (training knowledge) | Not verified | Whole-book position sync | Local, per chapter, three states |

## Sources

1. Royal Road, "Optimize the Reading Experience" — https://www.royalroad.com/support/knowledgebase/80 — read through search summary only (direct fetch returned 403). Confidence MEDIUM (official source, second-hand text). Archive: [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4331).
2. Baymard, "Readability: the optimal line length" — https://baymard.com/blog/line-length-readability — 50-75 characters guidance; secondary sources repeat it; the same search found a claim that studies range from about 40 to 100+ characters (unverified). Confidence MEDIUM.
3. rixx, `ao3-arrows.user.js` — https://raw.githubusercontent.com/rixx/userscripts/refs/heads/main/src/ao3-arrows.user.js — read directly: Right/Left keys, input and modifier guard. Confidence MEDIUM (primary code, single script). [🔖 2026-11-02](https://linkding.lav.ren/bookmarks?details=4333).
4. W3C, Understanding SC 2.1.4 Character Key Shortcuts — (a) https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts, (b) https://dequeuniversity.com/resources/wcag2.1/2.1.4-character-key-shortcuts — focus-only exception. Confidence MEDIUM (two sources agree).
5. Labnol, "Why do Gmail and other web apps use j and k keys" — https://Labnol.org/internet/j-k-keyboard-shortcuts/20779/ — and Gmail shortcut lists (Tom's Guide and others) — sources disagree on Gmail "next" vs "older". Confidence LOW-MEDIUM.
6. W3C, Understanding SC 1.4.12 Text Spacing — https://w3c.github.io/wcag/understanding/text-spacing.html (and Deque, NYU summaries) — 1.5x line-height benchmark. Confidence MEDIUM.
7. Project files: `.planning/PROJECT.md`, `xenforo-story-reader.user.js`, tracker issues #1-#16 (read with `gh`, 2026-11-02). Confidence HIGH for what the code and tracker say.

**Confidence note.** The `classify-confidence` seam rates plain web-search results LOW, and MEDIUM when cross-checked. Statements marked "training knowledge" (Kindle, AO3 history, FFN) were NOT verified in this research and stay LOW. The search found nothing on FanFiction.net reader settings, Kindle "time left", or Reddit/RES j/k; no claim in this file rests on them. Design recommendations (resume rule, sentinel detection, Esc layering, `event.repeat` guard, shadow-DOM focus) are reasoning from the code and platform behavior, not sourced; a live test in Chrome and Firefox should confirm the focus and scroll-key behavior.

---
*Feature research for: book-style XenForo story reader, v0.8 reading comfort*
*Researched: 2026-11-02*
