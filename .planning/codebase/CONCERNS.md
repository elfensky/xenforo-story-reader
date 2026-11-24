---
last_mapped_commit: 447ebf2f10ee7bb2a3652eee8ab505d6464356d7
last_mapped_at: 2026-11-02
---
# Codebase Concerns

**Analysis Date:** 2026-11-02

## Scope

The product is one userscript: `xenforo-story-reader.user.js` (408 lines, version 0.7.4). The repository also holds tests, CI, e2e scripts and docs. Line numbers below refer to the userscript unless a path is given. No code was executed for this analysis. Findings come from reading the source.

## Tech Debt

**Single closure holds all layers:**
- Issue: Net, Adapter, Cache, Store, EPUB, the Web Component and the bootstrap share one IIFE. Only selected parts are exposed to tests through `globalThis.__xfr` (lines 406-407).
- Files: `xenforo-story-reader.user.js`
- Impact: The stateful parts (Net queue, Cache, QQReader, launcher) cannot be unit tested without a browser. Tests cover only Adapter parsing, EPUB assembly and `makeIndex`.
- Fix approach: Keep the single-file output, because Tampermonkey needs it. Move source into modules and bundle them in a build step. Alternatively, pass Net and Cache into Store as injectable objects so tests can replace them.

**Test hook ships in the production file:**
- Issue: Lines 406-407 expose internals when `globalThis.__XFR_TEST__` is set.
- Files: `xenforo-story-reader.user.js`
- Impact: Low. Page scripts already have full access to the page world, so the hook adds little. It still leaks internals into the shipped artifact.
- Fix approach: Strip the hook in the build step once a build step exists.

**Documentation has drifted from the code:**
- Issue: `CONTEXT.md` names v0.7.2 as current and gives the file size as about 26 KB. Its "INSTALL STATE" section describes a v0.7.0 install that no longer applies. `README.md` (Install, step 3) says the Reader button appears bottom-right. Since v0.7.3 it appears bottom-left (line 394). `README.md` also claims "0ms rebuild after first load". `_boot` (line 302) rebuilds the index on every open, so 0 ms applies only to the first paint of the TOC.
- Files: `CONTEXT.md`, `README.md`, `xenforo-story-reader.user.js`
- Impact: Future sessions may act on stale state. Install instructions point to the wrong corner.
- Fix approach: Update `CONTEXT.md` and `README.md` in the same change as every version bump. Remove dated install-state text.

## Known Bugs

**1. Chapter open hangs after a network failure:**
- Symptoms: The chapter pane keeps its skeleton rows. No error text appears.
- Files: `xenforo-story-reader.user.js` lines 328-347 (`_openChapter`), specifically the unguarded `await Store.getChapterBody(ch)` on line 339.
- Trigger: `Net` rejects after 3 retries. A 403 is never retried. A 404 occurs for a deleted post. A dropped connection also triggers it. The rejected promise is unhandled.
- Workaround: Reload the reader tab.

**2. Empty or wrong responses are cached permanently:**
- Symptoms: One chapter shows an empty body, or one discussion page shows no comments, on every later visit.
- Files: `xenforo-story-reader.user.js` line 137 (`getChapterBody` stores `''` when `#post-<id>` is absent), line 142 (`getPagePosts` stores `[]` for a page parsed from a non-thread response), line 134 (`if(c!=null) return c;` returns the cached empty value).
- Trigger: A 200 response that is not the thread page. A Cloudflare interstitial served with status 200 is one example. The bad value is then stored under the post id or page key with no expiry (see "Cache Growth and Staleness").
- Workaround: Delete the `xfReaderDB` IndexedDB database for the forum origin.

**3. Stale last-read id leaves a blank pane:**
- Symptoms: The reader opens with an empty chapter pane. No chapter is highlighted in the TOC.
- Files: `xenforo-story-reader.user.js` line 308 (`_lastId`), line 326 (`_neighbors`), line 334 (`if(!ch) return;`).
- Trigger: The stored `xfReader:last:<threadId>` value names a threadmark that no longer exists, for example after the author removes or moves it. `_openChapter` does not fall back to `firstChapterId()`.
- Workaround: Click a chapter in the TOC.

**4. A partial index is cached as complete:**
- Symptoms: Some categories (for example Extras) are missing from the TOC. The gap persists across opens if the failure repeats.
- Files: `xenforo-story-reader.user.js` line 124 (per-category `catch` logs and continues), line 126 (the partial `sections` are written to the cache), lines 111-117 (`fetchCategoryAll` throws on any failed page and drops the whole category).
- Trigger: One threadmark page request fails during `buildIndex`.
- Workaround: Reload after the forum recovers. Each open rebuilds the index (line 302).

**5. Discussion truncated without notice:**
- Symptoms: The bar shows `Discussion (N)` with a count that is lower than the real count.
- Files: `xenforo-story-reader.user.js` line 150 (`catch` followed by `break`), line 345 (count shown as final).
- Trigger: One discussion page request fails.

**6. Build failure leaves the TOC as skeleton rows:**
- Symptoms: On a first visit with no cache, the TOC shows 12 grey skeleton rows indefinitely.
- Files: `xenforo-story-reader.user.js` line 306 (`catch` writes to console only), line 301 (skeleton).
- Trigger: `buildIndex` fails, for example the threadmarks root page is unreachable.

**7. Prefetch loops multiply on each reopen:**
- Symptoms: Request volume rises as the reader is opened and closed. Duplicate requests appear in the network log.
- Files: `xenforo-story-reader.user.js` line 273 (`connectedCallback` calls `_boot`), line 357 (each call starts 4 `pump` loops), lines 348-358 (no cancel path). `Cache.get` (lines 94-96) checks only completed entries, so in-flight requests for the same key are not shared.
- Trigger: Open and close the reader more than once in one page session.

**8. Fallback scheduler receives an object as its delay:**
- Symptoms: Where `requestIdleCallback` is missing, prefetch pumps run back to back.
- Files: `xenforo-story-reader.user.js` line 355: `(window.requestIdleCallback||setTimeout)(pump,{timeout:1500})`. With `setTimeout`, the options object is coerced to a delay of 0.
- Trigger: A browser without `requestIdleCallback`. Support in Safari should be checked before relying on this path.

**9. EPUB filename loses non-ASCII titles:**
- Symptoms: A story whose title uses non-Latin letters downloads as `.epub`.
- Files: `xenforo-story-reader.user.js` line 371 (`[^\w\- ]+` keeps only ASCII word characters). The same expression can also produce an empty name when the title has only symbols.
- Trigger: Non-ASCII or symbol-only thread title.

**10. Internal links and images break in the EPUB:**
- Symptoms: Links such as `#post-<id>` inside chapters lead nowhere. Images show as broken when offline.
- Files: `xenforo-story-reader.user.js` line 193 (removes `id` and `class`), line 194 (`data-src` promoted, remote URLs kept). No image is downloaded or embedded.
- Trigger: Any chapter with anchor links or images.

**11. Threadmarks without a post id disappear silently:**
- Symptoms: A threadmark is missing from the TOC.
- Files: `xenforo-story-reader.user.js` line 79 (`postId` set to `null` when the link has no `post-` segment), line 107 (`grouped()` drops it), lines 106 and 147 (`allChapters()` drops it).
- Trigger: A threadmark link that carries no `post-<id>` fragment.

**12. Category tab fallback is too broad:**
- Symptoms: A non-category link inside the tab header appears as a category section.
- Files: `xenforo-story-reader.user.js` line 73 (`querySelectorAll('.tabs-tab,[role="tab"],a')`).
- Trigger: Extra anchors in the threadmark tab header on a forum skin change.

## Security Considerations

**Forum HTML is inserted without sanitizing in the live reader:**
- Risk: Lines 341 and 346 insert chapter bodies and comment bodies with `innerHTML`. The EPUB path sanitizes its input (lines 188-198), but the on-page path does not. An event-handler attribute in forum HTML would run in the forum's origin with the user's session.
- Files: `xenforo-story-reader.user.js` lines 341, 346 (sinks); lines 188-198 (existing sanitizer used only for EPUB).
- Current mitigation: XenForo sanitizes BB code on the server. That is the only defense in this script.
- Recommendations: Apply the same sanitizer to the on-page path before insertion. Remove `on*` attributes and the `script`, `iframe`, `object`, `embed` and `form` elements.

**The script runs in the page's JavaScript world:**
- Risk: `@grant none` (line 15) means the script shares globals with the forum page. Page scripts can read or change its state, and the script trusts page globals such as `location`, `localStorage` and `customElements`.
- Files: `xenforo-story-reader.user.js` line 15.
- Current mitigation: None needed for the current design. The script makes no privileged calls.
- Recommendations: Treat this as a design limit. Review any new `@grant` before adding it.

**Auto-update takes every merge to `main` straight to users:**
- Risk: `@downloadURL` and `@updateURL` (lines 9-10) point to the raw file on `main`. Tampermonkey pulls that file on its update check. A bad push, or a compromised account, reaches every install. Tampermonkey does not verify a signature.
- Files: `xenforo-story-reader.user.js` lines 9-10; `.github/workflows/test.yml` (runs on `push` to `main` and on `pull_request`).
- Current mitigation: CI runs unit and smoke tests. On `push` to `main`, CI runs at the same time the file becomes the update source. CI does not gate the update.
- Recommendations: Publish updates from a release tag or release branch. Point the update URLs there. Update them only after CI passes on that commit.

**Background reads run under the user's session:**
- Risk: `Net` sends `credentials:'include'` (line 34) on every request. Prefetch reads the whole thread in the background. The script is read-only, but the traffic runs under the user's account. Forum terms of use for automated reads were not checked for this analysis.
- Files: `xenforo-story-reader.user.js` lines 34, 348-358.
- Recommendations: Confirm the terms of each supported forum. Reduce prefetch scope (see Performance).

**Test hook is reachable from page code:**
- Risk: A page script that sets `globalThis.__XFR_TEST__` before the userscript runs gets `Net`, `Cache` and the EPUB builder. The page already has equivalent access, so the impact is low.
- Files: `xenforo-story-reader.user.js` lines 406-407.

**No secrets are stored:**
- The script stores only theme, reading order, last chapter id and launcher position in `localStorage` (lines 259, 281, 331, 395-400). The IndexedDB cache holds forum HTML and parsed post data. No credential is written by this script. Nothing was found that needs action.

## Performance Bottlenecks

**Unbounded prefetch on every open:**
- Problem: `_prefetch` (lines 348-358) walks every chapter in the story. For each chapter it prefetches up to `PREFETCH_DISC_MAX` (10) discussion pages (line 158). A story of about 230 threadmarks (the size noted in `CONTEXT.md`) means several hundred requests on the first open. At one request start per 120 ms (line 22), that is a few minutes of background load.
- Files: `xenforo-story-reader.user.js` lines 22, 157-160, 348-358.
- Cause: No cap on story size. No stop when the reader closes. No user opt-in.
- Improvement path: Prefetch the next N chapters only. Stop the loop when the reader closes. Start prefetch after the first chapter renders.

**Foreground requests wait behind background work:**
- Problem: `Net` (lines 26-50) is one FIFO queue. Retries re-enter at the tail (lines 38, 44). EPUB export enqueues every chapter at once (line 367), so a chapter opened during export waits behind the whole export.
- Files: `xenforo-story-reader.user.js` lines 26-50, 367.
- Improvement path: Give user-initiated requests a higher priority. Put retries ahead of the prefetch backlog.

**Index rebuilt on every open:**
- Problem: `_boot` always calls `buildIndex` (line 302). That refetches every threadmark page each time, even when the cache is fresh. `CONTEXT.md` gives about 11 requests for a 228-threadmark story.
- Files: `xenforo-story-reader.user.js` lines 118-128, 298-307.
- Improvement path: Skip the rebuild when the cached index is younger than a set age. The `ts` field is already written (line 98) but never read.

**Discussion pages are fetched one at a time:**
- Problem: `collectDiscussion` (lines 144-156) awaits each page in turn. A chapter with many discussion pages waits for each request.
- Files: `xenforo-story-reader.user.js` lines 144-156.
- Improvement path: Fetch the pages in parallel, within the `MAX_CONC` limit.

**EPUB held in memory twice:**
- Problem: `makeZip` (lines 167-186) keeps all chunks and then copies them into one `Uint8Array`. Peak memory is about twice the output size. ZIP64 is not supported, so an archive above 4 GiB would fail. Story sizes seen so far are far below either limit.
- Files: `xenforo-story-reader.user.js` lines 167-186.

## Cache Growth and Staleness

**No eviction and no quota handling:**
- Problem: `Cache.set` (line 98) writes `body:*`, `posts:*` and `index:*` entries and never deletes them. Errors are swallowed by an empty `catch`. A quota error loses the write with no signal.
- Files: `xenforo-story-reader.user.js` lines 91-100.
- Improvement path: Add an LRU or age limit. Surface write failures to the console.

**Stale content never expires:**
- Problem: Chapter bodies (`body:<postId>`) and discussion pages (`posts:<threadId>:<page>`) have no expiry. Author edits to a chapter are not shown. The last discussion page of a thread stops updating after its first cache.
- Files: `xenforo-story-reader.user.js` lines 133-142.
- Improvement path: Read the `ts` value that line 98 already writes. Use an age limit for discussion pages and an edit check for chapters.

**Writes are not awaited:**
- Problem: `set` (line 98) starts a transaction and returns without waiting for `oncomplete`. The in-memory map hides this during a session. A tab closed right after a write can lose it.
- Files: `xenforo-story-reader.user.js` line 98.

**Open can hang:**
- Problem: `db()` (line 93) has no `onblocked` or `onversionchange` handler. A future version bump with another tab open can block the open. Every `Cache.get` then waits forever, and the reader stays on skeleton rows.
- Files: `xenforo-story-reader.user.js` lines 93-96.
- Current state: Database version is 1 and no bump exists.

## Fragile Areas

**All selectors depend on XenForo class names:**
- Files: `xenforo-story-reader.user.js` lines 53-87 (`Adapter`). Selectors used: `.structItem--threadmark`, `.block--threadmarkList`, `.block-tabHeader--threadmarkCategoryTabs`, `.message--post`, `article.message`, `.bbWrapper`, `h1.p-title-value`.
- Why fragile: A skin or XenForo update changes the markup. The script then fails silently. The launcher does not mount (line 388) or the TOC is empty. No message reaches the user.
- Safe modification: Change selectors only in `Adapter`. Add a fixture from each supported forum to the unit tests.
- Improvement path: Show a "could not read threadmarks" state when the parse finds nothing.

**Launcher gate runs once:**
- Files: `xenforo-story-reader.user.js` lines 64-69 and 386-388.
- Why fragile: `hasThreadmarks` runs at load. If a forum replaces the page without a full reload, the Reader button does not appear for the new thread.

**Discussion boundary is a post-id range:**
- Files: `xenforo-story-reader.user.js` lines 147-152.
- Why fragile: Every post between two chapter ids counts as discussion. Author notes and Q&A posts appear as comments. No filter exists. This is the designed behavior, but it is not documented as a limit.

**Two domains keep separate caches:**
- Files: `xenforo-story-reader.user.js` lines 21, 308, 331.
- Why fragile: `questionablequesting.com` and `forum.questionablequesting.com` are different origins. Each has its own IndexedDB and `localStorage`. A reader who uses both hosts downloads the story twice.

## Accessibility

- TOC entries are `<a>` elements without `href` (line 324, `_tocLink`). Anchors without `href` are not in the keyboard tab order. A keyboard user cannot reach a chapter. Medium.
- EPUB progress changes only `data-tip` and the glyph (lines 362-368). The button keeps the static `aria-label` (line 265), so a screen reader does not hear progress. Low.
- Footer tooltips are shown on hover and on touch long press (lines 238-239, 291-296). Keyboard focus does not show them. Each button still has an `aria-label`, so the name is available. Low.

## Scaling Limits

- Whole-story export: held in memory (see Performance). Limit is available RAM.
- Forum request rate: at most 4 concurrent requests and one start per 120 ms, about 8 per second (lines 22, 30). The rate is fixed. There is no per-host adaptive limit. Retries use exponential backoff only on 429 and 503 (lines 36-37). Forum limits were not measured for this analysis.
- Cache size: unbounded (see Cache Growth and Staleness).

## Dependencies at Risk

- Runtime: none. The script is plain JavaScript with `@grant none`.
- Development: `vitest ^3.2.0` and `happy-dom ^19.0.0` (`package.json`). `node_modules` is absent in this worktree. No `npm audit` was run for this analysis.
- CI pins Node 26 (`.github/workflows/test.yml`). The e2e script pins `node@26` through `mise` (`e2e/run.sh`). Both follow the runtime policy in the user's global instructions.

## Missing Critical Features

- No user-facing error state. Every failure goes to `console.error` (lines 124, 306, 376). The reader has no retry control and no message. This is the root of Known Bugs 1, 4, 5 and 6.
- No cache inspection or clear control. A user with a bad cached entry (Known Bug 2) has no in-page way to fix it.

## Test Coverage Gaps

| Area | Lines | Covered by tests | Risk | Priority |
|------|-------|------------------|------|----------|
| `Net` queue, 429/503 backoff, retry on error | 26-50 | No | Silent request loss or flood | High |
| `Cache` get/set, schema check, IndexedDB failure | 91-100 | No (happy-dom has no IndexedDB) | Stale or empty data (Bug 2) | High |
| `Store.buildIndex` partial failure | 111-128 | No | Partial TOC cached (Bug 4) | High |
| `Store.getChapterBody` and `collectDiscussion` boundaries | 133-156 | No | Wrong discussion, truncated count (Bug 5) | High |
| `QQReader._openChapter` token guard and failure path | 328-347 | No | Hung pane (Bug 1), race between chapters | High |
| `QQReader._boot` and `_lastId` fallback | 298-308 | No | Blank pane (Bug 3) | High |
| `mountLauncher` drag and persisted position | 386-405 | No | Button off-screen | Medium |
| `bodyToXhtml` anchors and remote images | 188-198 | Partly (sanitizing only) | Broken links in EPUB (Bug 10) | Medium |
| `makeZip` with real data and multi-chunk files | 167-186 | Partly (one short entry) | Corrupt EPUB on larger input | Low |
| End-to-end UI | `e2e/run.sh` | Manual only, not in CI | UI regressions reach `main` | High |

Notes:
- `e2e/run.sh` targets one SpaceBattles thread behind Cloudflare. It needs a local Chrome with CDP. CI does not run it.
- The smoke test (`test/smoke.test.js`) checks that `@version` matches `package.json`, that the four `@match` hosts exist and that the file stays under 40,000 characters. These checks are useful, but they do not test behavior.

## Priority Summary

1. High: Permanent caching of bad responses (Known Bug 2).
2. High: Chapter open hang after a network failure (Known Bug 1).
3. High: Background prefetch volume and loops that survive a close (Performance; Known Bug 7).
4. Medium: Unsanitized forum HTML in the live reader (Security).
5. Medium: Auto-update path with no gate (Security).
6. Medium: Partial index cached as complete (Known Bug 4).
7. High: No CI coverage of the UI (Test Coverage Gaps).

---

*Concerns audit: 2026-11-02*
