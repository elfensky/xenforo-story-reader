---
gsd_state_version: '1.0'
status: planning
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-02)

**Core value:** A threadmarked story reads like a book — chapters in order, the story as the focus, the discussion as comments — without the script ever touching the reader's account.
**Current focus:** Phase 1 — Reliable chapters and reading progress

## Current Position

Phase: 1 of 4 (Reliable chapters and reading progress)
Plan: 0 of 0 in current phase
Status: Ready to plan
Last activity: 2026-11-02 — Roadmap created for milestone v0.8 (21 requirements, 4 phases)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Build order is progress (with the two stability fixes first), then filter plus keyboard, then typography, then release. Reason: progress carries the most risk and the only stored data, STAB must precede any progress write, typography re-anchors on the progress fraction, and filter plus keyboard share a phase so the Esc chain ships whole.
- [Roadmap]: Phases run in sequence; all three features edit the same methods of one file.
- [Roadmap]: Phase 3 criterion "stays at the same place after a change" is implied by the typography/progress dependency; no TYPO requirement states it. Add TYPO-05 if it should be explicit.

### Open Questions

Not decisions. Settle in the phase discussions, record the outcome in PROJECT.md Key Decisions.

1. **Progress store** (Phase 1 discussion, before the first storage code). All options agree: not under `CACHE_SCHEMA`, no IndexedDB version bump, key by `postId`, merge by max progress with a sticky read flag, debounced write plus flush on page hide.
   - S1: second IndexedDB database `xfReaderState` v1, one record per chapter.
   - S2: schema-agnostic key `progress:<threadId>` in the existing `xfReaderDB` store (`Cache.get/set` gain a schema parameter).
   - S3: `localStorage` key `xfReader:progress:<threadId>`. Deviates from the tracker text ("IndexedDB") and from PROG-05; needs owner consent and a requirement edit.
2. **Release rule** (before the first merge to `main`). Every merge ships through `@updateURL`; a revert does not roll installs back. Option 1: feature PRs do not bump `@version`, one final PR bumps to 0.8.0, rollback is a forward fix with a higher version. Option 2: update URLs point at a `release` branch or tag (needs a changed smoke test, which checks match, not increase).
3. Smaller choices, per phase: read detection (scroll fraction at `READ_AT` 0.95 versus an end sentinel with `IntersectionObserver`); resume window and dwell time (untuned, tune on thread 30813); key listener placement (window capture versus shadow root, with teardown); TOC filter by toggling `hidden` versus a predicate in `_renderTOC`; typography variable host and ranges; handling of inline `[SIZE]` styles (not verified on a live post); manual mark read/unread (IDEA-01, not in v1); whether comments follow the typography controls.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Known bugs from CONCERNS.md are covered by STAB-01 and STAB-02 (hung `_openChapter`, empty body cached permanently).
- [All]: `xenforo-story-reader.user.js` is 27,797 characters against a 40,000-character smoke-test cap; estimated growth 5-12 KB. If it does not fit, raise the cap once, deliberately, in the release PR.
- [Phase 2]: XenForo document-level shortcuts were not read from source. Verify J/K/Esc live on QQ, SpaceBattles and Sufficient Velocity. Native scroll-key and focus behaviour of a `tabindex="-1"` scroller is unverified in Firefox and Safari.
- [Phase 2]: Background prefetch (MAINT-02, v2) keeps running after close; one-key Esc and reopen make it worse. Not in v0.8 scope.
- [Phase 3]: Inline `font-size` and `line-height` in real chapter HTML are unverified; check one live post.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-02
Stopped at: Roadmap and state written; ready for `/gsd-plan-phase 1` (after the Phase 1 discussion)
Resume file: None
