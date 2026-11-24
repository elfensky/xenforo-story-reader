---
last_mapped_commit: 447ebf2f10ee7bb2a3652eee8ab505d6464356d7
last_mapped_at: 2026-11-02
---
# Testing Patterns

**Analysis Date:** 2026-11-02

## Test Framework

**Runner:**
- Vitest `^3.2.0` (from `package.json` devDependencies; lockfile in `package-lock.json`)
- Config: `vitest.config.js`
- Environment: `happy-dom` (DOM simulation), set globally in `vitest.config.js`. The smoke test overrides it per file with `// @vitest-environment node`.
- Happy DOM `^19.0.0` is the DOM implementation.
- The `happyDOM.url` in `vitest.config.js` is `https://forums.spacebattles.com/threads/test-story.853195/`. Tests that read `location.href` depend on this URL.
- `vitest.config.js` excludes `**/.worktrees/**` so worktree copies are not run twice.

**Assertion Library:**
- Vitest built-in `expect` (Chai-compatible matchers: `toBe`, `toEqual`, `toContain`, `toMatch`, `toThrow`, `toHaveLength`, `not.toThrow`).

**Run Commands:**
```bash
npm test              # Run all unit and smoke tests once (vitest run)
npm run test:watch    # Watch mode (vitest)
npm run e2e           # Browser e2e against a live forum thread (machine-local, see below)
```

Coverage: no coverage command exists. `@vitest/coverage-v8` or another provider is not in `devDependencies`. Coverage output is not produced by any script.

**CI:**
- `.github/workflows/test.yml` runs on pushes to `main` and on every pull request.
- It uses `ubuntu-latest`, Node `26` (`actions/setup-node@v4`, `cache: npm`), then `npm ci` and `npm test`.
- CI does not run `npm run e2e`.

## Test File Organization

**Location:**
- All tests live in `test/`. Nothing is co-located with the source.
- The source under test is the single file `xenforo-story-reader.user.js` at the repo root.

**Naming:**
- `test/unit.test.js`: behavior of `Adapter`, `Store`, and the EPUB helpers.
- `test/smoke.test.js`: static checks of the userscript file (metadata, version, compile).
- E2E: `e2e/run.sh`. It is a Bash script, not a Vitest file.

**Structure:**
```
test/
├── unit.test.js     # 16 tests: Adapter URLs, Adapter parsing, Store.makeIndex, EPUB pipeline, esc
└── smoke.test.js    # 6 tests: metadata block, version match, host @match list, update URLs, compile, size budget
e2e/
└── run.sh           # live-browser check through the chrome-devtools CLI
```

## Loading the Userscript Under Test

The userscript is an IIFE with no exports. The unit test loads it through a test hook.

Pattern from `test/unit.test.js`:

```javascript
import { describe, it, expect } from 'vitest';

globalThis.__XFR_TEST__ = true;
await import('../xenforo-story-reader.user.js');
const { Adapter, Store, crc32, makeZip, bodyToXhtml, buildEpub, esc } = globalThis.__xfr;
```

How it works:
- `globalThis.__XFR_TEST__` must be set before the import. The script checks it at the bottom: `if(globalThis.__XFR_TEST__) globalThis.__xfr={Net,Adapter,Cache,Store,crc32,makeZip,esc,bodyToXhtml,buildEpub,mountLauncher};`.
- Without the flag, the script exposes nothing. This keeps production behavior unchanged.
- The import uses top-level `await`. Keep this form in new unit files.
- To test a new internal, add its name to the `__xfr` object. Do not export it another way.

## Test Structure

**Suite Organization:**
Use `describe` blocks named by area, with an em dash for sub-areas. Use `it` with a sentence that describes the behavior:

```javascript
describe('Adapter — URLs', () => {
  it('extracts threadId from the location', () => {
    expect(Adapter.threadId()).toBe('853195');
  });
});

describe('Store.makeIndex', () => {
  const index = Store.makeIndex('853195', 'Test Story', [ /* sections */ ]);

  it('grouped keeps section order, drops null postIds', () => {
    expect(index.grouped().map((c) => c.postId)).toEqual(['100', '300', '200']);
  });
});
```

**Patterns:**
- Build shared fixtures at the `describe` level when several `it` blocks use them: `const index = Store.makeIndex(...)` and `const tmIndex = doc(\`...\`)`.
- Build one-off fixtures inside the `it`: the `page` variable in `'parses posts: id, author, body html'`.
- No `beforeEach` or `afterEach` is used.
- Restore any overridden function in a `finally` block. See the mocking section.
- Keep one behavior per `it`. Several `expect` calls for one result are acceptable.

**Regression tests:**
- Mark them with a comment above the `it`: `// regression: ... (bug #N)`. Two examples exist in `test/unit.test.js`: `bug #1` (category URLs use query params) and `bug #2` (page count must ignore the footer `pageNav`).
- Add a regression test for every fixed parsing or URL bug. Use the same comment form.

## HTML Fixtures

Parsing tests build HTML with a template literal and parse it through the real `Adapter.parse`:

```javascript
const doc = (html) => Adapter.parse(html);

const tmIndex = doc(`
  <div class="block-tabHeader--threadmarkCategoryTabs">
    <a class="tabs-tab" href="/threads/x.853195/threadmarks">Threadmarks</a>
  </div>
  <div class="block--threadmarkList">
    <div class="structItem--threadmark"><div class="structItem-title">
      <a href="/threads/x.853195/post-100">1.1</a></div></div>
  </div>
`);
```

Rules for fixtures:
- Copy only the element structure needed by the selector under test. Do not paste real forum pages.
- Include a "decoy" element when a selector is ambiguous. The `tmMaxPage` test includes a footer `pageNav` with the same class to prove the scope is correct.
- Include one malformed element when the parser filters rows. The `threadmarkRows` fixture includes a row with no link.
- Do not store real story prose in fixtures. Use `chapter text`, `a comment`, `Test Story`.

## Mocking

**Framework:** None. Vitest's `vi` helpers are not used. Mocks are done by replacing an object property on the exposed module and restoring it.

**Pattern (from `test/unit.test.js`, `buildEpub` test):**

```javascript
const orig = Store.getChapterBody;
Store.getChapterBody = async () => '<p>body</p>';
try {
  const blob = await buildEpub(index, null);
  // assertions
} finally {
  Store.getChapterBody = orig;
}
```

Rules:
- Replace a method on the `Store` object, because `buildEpub` calls `Store.getChapterBody` through the object. Do not replace a local function.
- Always restore in `finally`.
- Use a fixed return value. Do not call the network.

**Network:**
- Do not call `fetch` in unit tests. `Net` and `Store.buildIndex` have no unit tests.
- If a new test must cover `Net` or `Store` network code, replace `globalThis.fetch` in the test with a stub and restore it in `finally`. This pattern is not used yet.

**What to Mock:**
- Network responses (`Net.text`, `fetch`): not mocked yet. Stub them when a test needs them.
- The `Store.getChapterBody` function when testing EPUB assembly.

**What NOT to Mock:**
- `Adapter.parse` and the DOM parsing. Use happy-dom with real HTML strings.
- `crc32`, `makeZip`, and `bodyToXhtml`. Test them directly with real bytes.
- `esc`. It is a pure function.

## Fixtures and Factories

**Test Data:**
- Use `Store.makeIndex` to build index objects for tests. Do not hand-write the index shape. Example from `test/unit.test.js`:

```javascript
const index = Store.makeIndex('853195', 'Test Story', [
  { label: 'Threadmarks', chapters: [{ title: '1.1', postId: '100' }, { title: '2.1', postId: '300' }] },
  { label: 'Extras', chapters: [{ title: 'omake', postId: '200' }, { title: 'dead', postId: null }] },
]);
```

- Use `postId: null` in one chapter when a test covers filtering.
- Post ids are strings. Keep them as strings in fixtures.

**Location:**
- Fixtures are inline in each test file. There is no shared fixtures directory or factory module.

## Smoke Tests (static file checks)

`test/smoke.test.js` reads the userscript as text. It does not run the script.

Pattern:

```javascript
// @vitest-environment node
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../xenforo-story-reader.user.js', import.meta.url), 'utf8');
const meta = src.slice(0, src.indexOf('==/UserScript=='));
```

Checks it runs:
- The metadata block has the required keys: `@name`, `@version`, `@description`, `@match`, `@grant`, `@downloadURL`, `@updateURL`.
- `@version` is `MAJOR.MINOR.PATCH` and equals `package.json` `version`. Bump both together.
- The four supported forum hosts appear in `@match`.
- `@downloadURL` and `@updateURL` point to the raw file on `main` of `elfensky/xenforo-story-reader`.
- `new Function(src)` compiles without error.
- The file is under 40,000 characters.

When a version bump or a new host is added, update the matching assertion in this file.

## Coverage

**Requirements:** None enforced. No threshold is set in `vitest.config.js`.

**View Coverage:** Not available. No coverage provider is installed. To measure coverage, a developer would need to add `@vitest/coverage-v8` and a script. Do not add it without a request.

## Covered and Uncovered Areas

Covered by `test/unit.test.js`:
- `Adapter.threadId`, `threadmarksUrl`, `tmUrl`, `categoryIdFromHref`
- `Adapter.threadmarkRows`, `tmMaxPage`, `categoryTabs`, `posts`
- `Store.makeIndex` (`grouped`, `allChapters`, `firstChapterId`)
- `crc32`, `makeZip` (header and EOCD layout), `bodyToXhtml` (sanitizer and lazy-image promotion), `buildEpub` (manifest and TOC output)
- `esc`

Not covered by any test:
- `Net` (queue, retries, backoff, 429/503 handling)
- `Cache` (IndexedDB and in-memory map, schema check)
- `Adapter.hasThreadmarks` and `Adapter.threadTitle`
- `Store.buildIndex`, `cachedIndex`, `getChapterBody`, `getPagePosts`, `collectDiscussion`, `prefetchDiscussion`
- `QQReader` (`_openChapter` token cancellation, `_step`, `_renderTOC`, `_export`, theme and view toggles)
- `mountLauncher` (threadmark gate, drag persistence). The test hook exposes it but no test uses it.
- All CSS

The `e2e/run.sh` script covers the mount, open, and TOC population path in a real browser, but only on a developer machine.

## End-to-End Tests

**Framework:** Bash script with the `chrome-devtools` CLI (run through `mise x node@26 -- chrome-devtools`).

**Run:**
```bash
npm run e2e
E2E_THREAD=https://... ./e2e/run.sh   # override the target thread
```

**What it does (`e2e/run.sh`):**
1. Opens a real threadmarked thread (`forums.spacebattles.com`) with `new_page`.
2. Polls until `h1.p-title-value` exists, to wait out Cloudflare. It tries 15 times, 3 seconds apart.
3. Wraps `xenforo-story-reader.user.js` as an `evaluate_script` function and injects it.
4. Checks that `.xfr-launch` exists.
5. Clicks the launcher and polls until `qq-reader` shows TOC entries.
6. Prints `PASS` or exits with `FAIL: <reason>`.

Rules:
- The script is machine-local. It needs the shared Chrome and the chrome-devtools CLI described in `~/vault/meta/SETUP.md` § 2. It is not run in CI.
- Do not run it from a session that has no Chrome. It opens a real page.
- Do not add a login step or store credentials in it.
- Use `set -euo pipefail` and the `fail` helper for every new check. Keep the `PASS:` line format.

## Test Types

**Unit Tests:**
- Pure functions and parsers, using happy-dom for DOM parsing.
- Scope: `Adapter` parsers, `Store.makeIndex`, EPUB byte and XML helpers.
- Approach: input HTML string or object, then exact output assertion.

**Integration Tests:**
- Not present in Vitest. The EPUB test `buildEpub assembles a whole-story epub from the index` covers the EPUB pipeline end to end, with `Store.getChapterBody` stubbed.

**Smoke Tests:**
- `test/smoke.test.js`: static checks of the userscript file, described above.

**E2E Tests:**
- `e2e/run.sh`: live browser check, machine-local, described above.

## Common Patterns

**Async Testing:**
Use `async` `it` blocks and `await`. Vitest waits for the returned promise:

```javascript
it('makeZip emits local header first, mimetype uncompressed-first, and a valid EOCD', async () => {
  const blob = makeZip([{ name: 'mimetype', data: 'application/epub+zip' }]);
  const b = new Uint8Array(await blob.arrayBuffer());
  // assert bytes with DataView
});
```

Use `await blob.arrayBuffer()` to read a `Blob` in happy-dom and Node.

**Binary Assertions:**
Read ZIP bytes with `DataView` and little-endian reads. Check signatures as hex literals:

```javascript
const dv = new DataView(b.buffer);
expect(dv.getUint32(0, true)).toBe(0x04034b50); // local file header
```

**Error Testing:**
No test asserts a thrown error. The code path that rejects (`Net`, `HTTP` errors) has no test. Use this pattern for a new test:

```javascript
it('rejects on a non-ok response', async () => {
  await expect(promiseThatFails()).rejects.toThrow('HTTP 500');
});
```

**Sanitizer Testing:**
Pass HTML with forbidden content and assert the output does not contain it:

```javascript
const x = bodyToXhtml('<p onclick="evil()">hi<script>evil()</script></p>', 'T');
expect(x).not.toContain('script');
expect(x).not.toContain('onclick');
```

**Known Gaps To Close First:**
When adding tests, these are the highest-value gaps:
1. `Net` retry and backoff behavior (stub `fetch`, use fake timers).
2. `Store.collectDiscussion` page-range logic (stub `Store.getPagePosts`).
3. `Adapter.hasThreadmarks` (the threadmark gate).
4. `QQReader._openChapter` stale-token cancellation.

## Adding a New Test

1. Put the file in `test/` and name it `<area>.test.js`.
2. If it needs the userscript internals, set `globalThis.__XFR_TEST__ = true` and import the file at the top, as in `test/unit.test.js`. Add the needed name to the `__xfr` object in the userscript.
3. Use `describe` with an area name and `it` with a behavior sentence.
4. Add an HTML fixture with only the needed structure. Add a decoy or malformed element when the selector needs one.
5. Restore any replaced function in `finally`.
6. Run `npm test`. Do not add a coverage flag.

---

*Testing analysis: 2026-11-02*
