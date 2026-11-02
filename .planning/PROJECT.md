# XenForo Story Reader

## What This Is

A Tampermonkey userscript that turns a threadmarked XenForo story thread (Questionable Questing,
SpaceBattles, Sufficient Velocity) into an AO3/FFN-style reader: a chapter TOC sidebar, the
chapter body as the focus, the forum discussion between chapters shown inline as comments under
each chapter, and a whole-story EPUB export. It is for a reader who likes stories on forum
boards but not the forum format. One file, read-only, no build step.

## Core Value

A threadmarked story reads like a book — chapters in order, the story as the focus, the
discussion as comments — without the script ever touching the reader's account.

## Requirements

### Validated

<!-- Shipped in v0.7.x and live-tested on QQ thread 30813 (CONTEXT.md). -->

- ✓ Floating "Reader" launcher, shown only on threads with threadmarks; bottom-left by default, draggable, position persisted (`xfReader:launch`) — v0.7.3
- ✓ Chapter index built from every threadmark category and list page, cached in IndexedDB (`xfReaderDB`, `CACHE_SCHEMA=2`) for a 0 ms reopen — v0.7.0
- ✓ Two reading orders: story-first (grouped by category) and chronological (sorted by post id) — v0.6.0
- ✓ Shadow-DOM reader (`qq-reader`): TOC sidebar, chapter body, skeletons, background prefetch, light/dark theme, one-row icon footer with tooltips (hover and long-press) — v0.7.1
- ✓ Last-opened chapter per thread stored (`xfReader:last:<threadId>`) and reopened — existing
- ✓ Inline discussion: posts between a chapter and the next, across forward pages, capped at 10, below a sticky discussion bar — v0.7.2
- ✓ Whole-story EPUB2 export in the browser: hand-rolled STORE-mode ZIP, sanitized XHTML — v0.7.0
- ✓ Polite fetching: `MAX_CONC=4`, `MIN_GAP=120` ms, `RETRIES=3`, backoff with jitter on 429/503 — v0.7.0
- ✓ All XenForo selectors in one `Adapter` (one inline selector remains in `Store.getChapterBody`) — v0.7.0
- ✓ Test harness: vitest + happy-dom unit and smoke tests (22), CI on Node 26, machine-local CDP e2e — v0.7.4

### Active

<!-- Milestone v0.8 — reading comfort (GitHub milestone 1). -->

- [ ] In-chapter scroll progress and read/unread state in the TOC, persisted in IndexedDB (#1)
- [ ] Keyboard navigation: J/K and arrows for previous/next chapter, Esc closes; bound inside the shadow DOM (#2)
- [ ] TOC search/filter and typography controls (font size, measure, line-height) persisted under `xfReader:` (#3)

### Out of Scope

- Posting, liking or any account change — the script is read-only by design (CONTEXT.md constraint)
- Nested comment threading — CONTEXT.md: "Recommended NOT to do"
- A build step, bundler or UI framework — the product is one file; UI stays plain shadow-DOM markup (#9)
- A compression dependency for EPUB — the hand-rolled STORE-mode ZIP stays (#10)
- Reproducing story prose in chat or docs — validation uses structural signals (IDs, counts, titles)
- Installing the script for the user — the user installs it in Tampermonkey

## Context

- **Codebase:** `xenforo-story-reader.user.js` (~408 lines, one IIFE). Layers in order: Net, Adapter, Cache, Store, EPUB, CSS, QQReader, launcher. Map: `.planning/codebase/` (2026-11-02).
- **Distribution:** installs from the raw GitHub URL on `main`; `@updateURL` points at the same file, so every push to `main` ships to every install.
- **Tracker:** `elfensky/xenforo-story-reader` — milestone v0.8 (#1, #2, #3) and 13 unmilestoned backlog issues (#4–#16), all opened 2026-08-30/31. No due dates.
- **Live validation:** data layer and EPUB pipeline proven on QQ "Governor's Gambit" (thread 30813: 228 threadmarks, 11 fetches, ~3.7 s build). The assembled v0.7.2 UI was not reloaded and clicked as a whole.
- **Known issues (CONCERNS.md, checked 2026-11-02):** an empty chapter body is cached permanently when the selector misses; `_openChapter` has no error handling, so a network failure leaves the skeleton; forum HTML goes into `innerHTML` without the EPUB sanitizer; prefetch walks the whole story on every open; CONTEXT.md says v0.7.2 and README says bottom-right (both stale).
- **Test gaps:** no tests for `Net`, `Cache`, `collectDiscussion`, `QQReader` or the launcher.

## Constraints

- **Tech stack**: plain browser JavaScript in one file, `@grant none`, no runtime dependencies — the userscript ships as its own source.
- **Read-only**: fetch, parse, render, export only — the script runs with the reader's logged-in session.
- **Politeness**: every request goes through `Net` (capped concurrency, gap, backoff) — the forums are volunteer-run sites.
- **Selectors**: XenForo markup is read only in `Adapter` — one place to change for DOM changes or new forums.
- **Font**: use the site's font stack (`SITE_FONT`), do not change it — CONTEXT.md.
- **Storage**: localStorage keys under `xfReader:`; IndexedDB `xfReaderDB`/`cache`, schema-versioned.
- **Tests**: `npm test` (vitest + happy-dom) must pass; CI runs it on Node 26.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single file, no build step | Tampermonkey installs one file; nothing to build or ship | ✓ Good |
| Read-only | Never risk the reader's forum account | ✓ Good |
| Shadow-DOM custom element for the UI | Site CSS cannot leak in, reader CSS cannot leak out | ✓ Good |
| IndexedDB cache with schema version | Instant reopen; `CACHE_SCHEMA` bump invalidates stale entries | ✓ Good |
| Hand-rolled STORE-mode ZIP for EPUB | No compression dependency in a one-file script | ✓ Good |
| Threadmark gate on the launcher | No threadmarks means no story to read | ✓ Good |
| Auto-update from raw `main` | One-click install, installs stay current | ⚠️ Revisit — no release gate (CONCERNS.md) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-02 after initialization*
