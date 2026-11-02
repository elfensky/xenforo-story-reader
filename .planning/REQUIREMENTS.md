# Requirements: XenForo Story Reader

**Defined:** 2026-11-02
**Core Value:** A threadmarked story reads like a book — chapters in order, the story as the focus, the discussion as comments — without the script ever touching the reader's account.

## v1 Requirements

Milestone **v0.8 — reading comfort** (GitHub milestone 1: #1, #2, #3). Each requirement maps to
one roadmap phase.

### Stability

<!-- No tracker issue. Named by .planning/codebase/CONCERNS.md (checked against the code 2026-11-02)
     and by research as prerequisites: progress state built on these failure paths would record
     wrong data. Confirm scope at the first discuss-phase. -->

- [ ] **STAB-01**: When a chapter fetch fails, the reader shows an error with a retry control instead of a skeleton that never resolves
- [ ] **STAB-02**: A chapter body that comes back empty (post selector missed) is not cached, so the next open fetches it again

### Keyboard (#2)

- [ ] **KEY-01**: Reader can press J or ArrowRight to open the next chapter, and K or ArrowLeft to open the previous chapter
- [ ] **KEY-02**: Reader can press Esc to close the reader; when the TOC filter has focus, Esc first clears and leaves the filter
- [ ] **KEY-03**: Shortcuts do nothing while the reader types in an input, holds Ctrl/Meta/Alt, composes text (IME), or holds a key down (auto-repeat)
- [ ] **KEY-04**: Shortcuts act only while the reader is open: forum shortcuts and page keys behave as before, and the listener is gone after the reader closes
- [ ] **KEY-05**: Keyboard focus moves into the reader when it opens, so shortcuts and scroll keys work without a click first
- [ ] **KEY-06**: Footer tooltips name the shortcut for previous, next and close

### Progress (#1)

- [ ] **PROG-01**: Reader sees a progress indicator for the current chapter that follows the scroll position within the chapter body (not the discussion below it)
- [ ] **PROG-02**: Reader returns to the same place in a partly read chapter on the next open, also after a browser restart
- [ ] **PROG-03**: A chapter is marked read only when the reader reaches the end of the chapter body; opening a chapter or stepping past it with keys does not mark it read, and an empty or failed body is never marked read
- [ ] **PROG-04**: TOC shows each chapter as unread, in progress or read, with a cue that is not colour alone
- [ ] **PROG-05**: Progress and read state persist in IndexedDB (per issue #1), survive a `CACHE_SCHEMA` bump, and need no IndexedDB version bump

### TOC filter (#3)

- [ ] **TOC-01**: Reader can type in a filter box above the TOC to narrow the chapter list by title (case-insensitive, live); sections with no match are hidden
- [ ] **TOC-02**: Reader sees a clear "no match" state and can clear the filter in one action
- [ ] **TOC-03**: The filter stays applied when the TOC re-renders (index refresh, reading-order toggle); the filter text is not persisted between sessions

### Typography (#3)

- [ ] **TYPO-01**: Reader can change the chapter font size
- [ ] **TYPO-02**: Reader can change the chapter column width (measure)
- [ ] **TYPO-03**: Reader can change the chapter line-height
- [ ] **TYPO-04**: Typography settings persist in localStorage under the `xfReader:` prefix, defaults equal today's rendering, and one action resets them

### Release

- [ ] **SHIP-01**: v0.8.0 reaches installs through `@updateURL` with `@version` and `package.json` bumped together, README.md and CONTEXT.md describing the shipped behaviour, and the e2e run on a live thread recorded

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

### Tracker backlog (open issues, no milestone)

- **BKLG-04**: Detect new chapters and refresh the cached index automatically (#4)
- **BKLG-05**: Load full discussion for a chapter, drop the 10-post cap (#5)
- **BKLG-06**: Highlight author posts in discussion (#6)
- **BKLG-07**: Continue-reading entry at the top of the TOC (#7, builds on PROG)
- **BKLG-08**: Responsive layout for narrow viewports (#8)
- **BKLG-09**: In-reader settings panel (#9, absorbs the typography controls)
- **BKLG-10**: EPUB title page, metadata and range export (#10)
- **BKLG-11**: Generic XenForo support from the Tampermonkey menu (#11)
- **BKLG-12**: Accessibility pass on the reader (#12)
- **BKLG-13**: Fetch chapters through XenForo's native `/reader` endpoint (#13)
- **BKLG-14**: Lazy index with a slow background trickle and a Net priority tier (#14)
- **BKLG-15**: Cache-complete stories, zero refetch on revisit (#15)
- **BKLG-16**: On close, land on the forum page of the current chapter (#16)

### Maintenance (CONCERNS.md, no tracker issue)

- **MAINT-01**: Sanitize forum HTML before it goes into `innerHTML` on the live reader path
- **MAINT-02**: Stop or cap background prefetch when the reader closes
- **MAINT-03**: Tests for `Net`, `Cache`, `collectDiscussion`, `QQReader` and the launcher

### Research suggestions (not in tracker, not planned)

- **IDEA-01**: Manual mark read/unread toggle per chapter
- **IDEA-02**: "Mark everything up to here as read" and an "N of M read" count
- **IDEA-03**: Filter the TOC to unread chapters
- **IDEA-04**: `/` focuses the filter; Enter opens the first match

## Out of Scope

| Feature | Reason |
|---------|--------|
| Posting, liking, any account change | The script is read-only by design (CONTEXT.md) |
| Nested comment threading | CONTEXT.md: "Recommended NOT to do" |
| Build step, bundler, UI framework | One-file userscript; plain shadow-DOM markup (#9) |
| Compression dependency for EPUB | Hand-rolled STORE-mode ZIP stays (#10) |
| Font-family picker | Conflicts with the `SITE_FONT` constraint |
| Paged (non-scroll) reading mode | Breaks scroll progress; not in the tracker |
| Remappable shortcuts | Not in the tracker; fixed keys are documented in tooltips |
| Progress sync across forums or devices | `@grant none` storage is per origin; no account features |

## Definition of Done

- `npm test` passes locally and in CI (Node 26), with new pure helpers covered by unit tests.
- The change is checked by hand on a live threadmarked thread (QQ thread 30813 is the reference).
- Defaults render exactly as v0.7.4 did for a reader who changes nothing.

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAB-01 | Phase 1 | Pending |
| STAB-02 | Phase 1 | Pending |
| KEY-01 | Phase 2 | Pending |
| KEY-02 | Phase 2 | Pending |
| KEY-03 | Phase 2 | Pending |
| KEY-04 | Phase 2 | Pending |
| KEY-05 | Phase 2 | Pending |
| KEY-06 | Phase 2 | Pending |
| PROG-01 | Phase 1 | Pending |
| PROG-02 | Phase 1 | Pending |
| PROG-03 | Phase 1 | Pending |
| PROG-04 | Phase 1 | Pending |
| PROG-05 | Phase 1 | Pending |
| TOC-01 | Phase 2 | Pending |
| TOC-02 | Phase 2 | Pending |
| TOC-03 | Phase 2 | Pending |
| TYPO-01 | Phase 3 | Pending |
| TYPO-02 | Phase 3 | Pending |
| TYPO-03 | Phase 3 | Pending |
| TYPO-04 | Phase 3 | Pending |
| SHIP-01 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-11-02*
*Last updated: 2026-11-02 after roadmap creation (traceability filled)*
