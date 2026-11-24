# Roadmap: XenForo Story Reader

## Milestones

- **v0.8 Reading comfort** - Phases 1-4 (in progress)

## Overview

Milestone v0.8 adds reading comfort to the shipped v0.7.4 reader (GitHub milestone 1: #1, #2, #3).
Four phases: first the reader remembers where the reader stopped, then the reader moves fast
(filter and keyboard), then the text fits the screen (typography), then v0.8.0 ships. All work
edits one file, `xenforo-story-reader.user.js`, in the same methods (`connectedCallback`, `_wire`,
`_renderTOC`, `_tocLink`, `_markActive`, `_openChapter`, the CSS array). Phases therefore run in
sequence, never in parallel branches.

**Build order:** Progress first, because it carries the most risk and the only stored data, the two stability fixes must precede any progress write, and typography re-anchors on the progress fraction; filter and keyboard share a phase so the Esc chain ships whole.

Every merge to `main` reaches installs through `@updateURL`. The release rule is an open question
(see STATE.md), to settle before the first merge.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Reliable chapters and reading progress** - Failed or empty chapters are handled; scroll progress and read state persist
- [ ] **Phase 2: Filter and keyboard navigation** - TOC filter box; J/K, arrows and Esc inside the reader
- [ ] **Phase 3: Typography controls** - Font size, column width and line-height, persisted
- [ ] **Phase 4: v0.8.0 release** - Version bump, docs, live e2e record

## Phase Details

### Phase 1: Reliable chapters and reading progress
**Goal**: As a reader, I want to have my place and finished chapters remembered, so that I can leave a story and pick it up again.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: STAB-01, STAB-02, PROG-01, PROG-02, PROG-03, PROG-04, PROG-05
**Success Criteria** (what must be TRUE):
  1. When a chapter fetch fails, the reader shows an error with a retry control, and retry loads the chapter; the skeleton never stays on screen forever.
  2. A chapter body that comes back empty is not cached: the next open fetches it again.
  3. A progress indicator follows the scroll position within the chapter body (not the discussion below it), and reopening a partly read chapter, also after a browser restart, returns to the same place.
  4. The TOC shows each chapter as unread, in progress or read, with a cue that is not colour alone. A chapter becomes read only when the reader reaches the end of its body: opening it does not, and an empty or failed body never does.
  5. Progress and read state remain after the chapter cache is invalidated by a `CACHE_SCHEMA` bump, and need no IndexedDB version bump.
**Plans**: TBD
**UI hint**: yes

Sequencing inside the phase: STAB-01 and STAB-02 land in the first plan, before any progress write.
Open for the phase discussion: the progress store, the release rule, read detection, the untuned numbers (see STATE.md).

### Phase 2: Filter and keyboard navigation
**Goal**: As a reader, I want to filter the chapter list and step through chapters by keyboard, so that I can move around a long story fast.
**Mode:** mvp
**Depends on**: Phase 1 (same methods, so it runs after; the read rule of PROG-03 must still hold when chapters are stepped with keys)
**Requirements**: TOC-01, TOC-02, TOC-03, KEY-01, KEY-02, KEY-03, KEY-04, KEY-05, KEY-06
**Success Criteria** (what must be TRUE):
  1. Typing in a filter box above the TOC narrows the chapter list by title, live and case-insensitive; sections with no match are hidden; a clear "no match" state shows when nothing matches, and one action clears the filter.
  2. The filter stays applied after the TOC re-renders (index refresh, reading-order toggle), and the filter text is not kept between sessions.
  3. J or ArrowRight opens the next chapter, K or ArrowLeft the previous one, and Esc closes the reader; with the filter focused, Esc first clears and leaves the filter. Footer tooltips name these keys.
  4. Keys work right after the reader opens, with no click first. They do nothing while typing in an input, with Ctrl/Meta/Alt held, during IME composition, or on a held key.
  5. With the reader closed, forum shortcuts and page keys behave as before and no key listener of the reader remains. Stepping through chapters with keys does not mark any chapter read.
**Plans**: TBD
**UI hint**: yes

Sequencing inside the phase: the filter input and the key handler land together, so the Esc-clears-filter branch of KEY-02 has its input.

### Phase 3: Typography controls
**Goal**: As a reader, I want to set font size, column width and line-height, so that chapter text is comfortable on my screen.
**Mode:** mvp
**Depends on**: Phase 2 (same methods and CSS array); Phase 1 (re-anchoring after a reflow uses the stored progress fraction)
**Requirements**: TYPO-01, TYPO-02, TYPO-03, TYPO-04
**Success Criteria** (what must be TRUE):
  1. From a control in the reader, the reader changes the chapter font size, column width and line-height, and the chapter updates at once.
  2. After a change, the reader stays at the same place in the chapter.
  3. Settings are still applied after a page reload, are stored under the `xfReader:` prefix, and one action resets them.
  4. With no setting changed, the chapter renders exactly as in v0.7.4.
**Plans**: TBD
**UI hint**: yes

### Phase 4: v0.8.0 release
**Goal**: As a maintainer, I want to ship v0.8.0 with docs and a live check, so that installs receive a verified update.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: SHIP-01
**Success Criteria** (what must be TRUE):
  1. `@version` in the userscript header and `version` in `package.json` both read 0.8.0, and an installed copy is offered the update through `@updateURL`.
  2. README.md and CONTEXT.md describe the shipped v0.8 behaviour.
  3. The e2e run on a live threadmarked thread (reference: QQ thread 30813) is recorded and covers progress, filter, keys and typography; `npm test` passes in CI.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Reliable chapters and reading progress | 0/0 | Not started | - |
| 2. Filter and keyboard navigation | 0/0 | Not started | - |
| 3. Typography controls | 0/0 | Not started | - |
| 4. v0.8.0 release | 0/0 | Not started | - |

## Backlog

Open tracker issues without a milestone (v2, no phases). Maintenance and idea items are in `.planning/REQUIREMENTS.md` under v2.

- #4 - Detect new chapters and refresh the cached index automatically
- #5 - Load full discussion for a chapter (drop the 10-post cap)
- #6 - Highlight author posts in discussion
- #7 - Continue-reading: jump back to the last-read chapter
- #8 - Responsive layout for narrow viewports
- #9 - In-reader settings panel
- #10 - EPUB: title page, metadata, and range export
- #11 - Generic XenForo support: enable on any forum from the Tampermonkey menu
- #12 - Accessibility pass on the reader
- #13 - Fetch chapters through XenForo's native /reader endpoint
- #14 - Lazy index: start from the current page, trickle the rest in the background
- #15 - Cache-complete stories: never refetch what the browser already has
- #16 - On close, land the user on the forum page of their current chapter
