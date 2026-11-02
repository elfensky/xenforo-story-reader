---
last_mapped_commit: 447ebf2f10ee7bb2a3652eee8ab505d6464356d7
last_mapped_at: 2026-11-02
---
# Technology Stack

**Analysis Date:** 2026-11-02

## Languages

**Primary:**
- JavaScript (ES2017+, browser-native, `'use strict'`) - all application code in `xenforo-story-reader.user.js` (about 408 lines)

**Secondary:**
- JavaScript (ESM, `"type": "module"`) - tests in `test/unit.test.js`, `test/smoke.test.js`, and config in `vitest.config.js`
- Bash - the machine-local e2e driver `e2e/run.sh`
- YAML - CI workflow `.github/workflows/test.yml`
- Markdown - docs `README.md`, `AGENTS.md`, `CONTEXT.md`

No TypeScript, no transpiler, and no bundler are used. The userscript ships as the source file itself.

## Runtime

**Environment:**
- Target runtime: a desktop or mobile browser page on `https://forum.questionablequesting.com`, `https://questionablequesting.com`, `https://forums.spacebattles.com`, and `https://forums.sufficientvelocity.com` (`@match` rules in `xenforo-story-reader.user.js`, header lines 11-14)
- Userscript manager required: Tampermonkey (recommended), Violentmonkey, or Greasemonkey (`README.md`, Install section)
- Browser APIs used: `fetch`, `DOMParser`, `indexedDB`, `localStorage`, `Blob`, `URL.createObjectURL`, `TextEncoder`, Shadow DOM (`attachShadow`), and Custom Elements (`customElements.define`)
- Test/dev runtime: Node.js 26 (`.github/workflows/test.yml` sets `node-version: 26`; `e2e/run.sh` runs `mise x node@26`)
- No `.nvmrc`, `.node-version`, `.tool-versions`, `.mise.toml`, or `engines` field exists. The Node version lives only in CI and in `e2e/run.sh`.

**Package Manager:**
- npm
- Lockfile: present (`package-lock.json`, lockfileVersion 3)

## Frameworks

**Core:**
- None. The userscript uses vanilla DOM APIs, a Custom Element `<qq-reader>` with a shadow root, and no UI library.

**Testing:**
- Vitest `^3.2.0` (locked at 3.2.7) - test runner, configured in `vitest.config.js`
- happy-dom `^19.0.0` (locked at 19.0.2) - DOM environment for tests (`environment: 'happy-dom'` in `vitest.config.js`)
- Node built-in `node:fs` and `node:path` URL helpers - used by `test/smoke.test.js` to read the script as text

**Build/Dev:**
- None. There is no build step. The file in the repo is the file installed by users.
- Vite 7.x and esbuild are transitive dependencies of Vitest. They are not used directly by the project.

## Key Dependencies

**Critical (dev only; nothing ships to users):**
- `vitest` `^3.2.0` (3.2.7 locked) - runs `npm test`, which is `vitest run`
- `happy-dom` `^19.0.0` (19.0.2 locked) - simulates the XenForo DOM for `Adapter` parsing tests

**Infrastructure:**
- `@types/node` - present in the lock as a transitive dependency only
- `chrome-devtools` CLI (external, not in `package.json`) - drives the real browser in `e2e/run.sh`. It is installed via `mise` and is machine-local.

**Runtime dependencies:**
- None. The `package.json` has no `dependencies` section. The script uses no libraries and no `@require` URLs.

## Userscript Metadata and Grants

Declared in the header of `xenforo-story-reader.user.js`:
- `@version 0.7.4` (matches `package.json` version; the smoke test enforces this)
- `@grant none` - the script uses no `GM_*` APIs. It runs in the page context with the page's own `localStorage`, `indexedDB`, and cookies.
- `@run-at document-idle`
- `@downloadURL` and `@updateURL` - both point to `https://raw.githubusercontent.com/elfensky/xenforo-story-reader/main/xenforo-story-reader.user.js`

Test hook: when `globalThis.__XFR_TEST__` is set, the script assigns internals to `globalThis.__xfr` (line 407). In the browser this flag is not set, so the hook stays inert.

## Configuration

**Environment:**
- No environment variables are read by the script or the tests.
- No `.env` files are present in the tracked tree.
- Runtime tuning constants live at the top of `xenforo-story-reader.user.js` (lines 20-23):
  - `LS_PREFIX='xfReader:'` - prefix for `localStorage` keys (`view`, `theme`, `launch`)
  - `DB_NAME='xfReaderDB'`, `DB_STORE='cache'`, `CACHE_SCHEMA=2` - IndexedDB cache settings
  - `MIN_GAP=120`, `MAX_CONC=4`, `RETRIES=3` - polite fetch queue settings
  - `PREFETCH_DISC_MAX=10` - maximum forum pages walked for discussion prefetch
  - `SITE_FONT` - system font stack

**Build:**
- `vitest.config.js` - `happy-dom` environment, URL `https://forums.spacebattles.com/threads/test-story.853195/`, excludes `**/.worktrees/**`
- `package.json` scripts: `test` (`vitest run`), `test:watch` (`vitest`), `e2e` (`./e2e/run.sh`)
- `.gitignore` - ignores `node_modules/` and `.worktrees/`

## Export Format

The EPUB export is built in-browser with no library:
- Hand-rolled ZIP writer `makeZip` and `crc32` in the userscript
- EPUB2 structure: `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/toc.ncx`, and XHTML chapters
- Output is a `Blob` of type `application/epub+zip`, downloaded through a temporary `<a download>` element

## Platform Requirements

**Development:**
- Node.js 26 and npm (matches CI)
- `npm ci` then `npm test` for unit and smoke tests
- `npm run e2e` additionally requires a logged-in Chrome with a CDP-capable `chrome-devtools` CLI, described in `e2e/run.sh` header and `meta/SETUP.md` (vault reference)
- A userscript manager to load the file into a browser for manual testing

**Production:**
- Distributed as a single file through GitHub raw URLs (`https://raw.githubusercontent.com/elfensky/xenforo-story-reader/main/xenforo-story-reader.user.js`)
- Runs client-side only. There is no server, no hosting, and no deployment pipeline beyond merging to `main`.

---

*Stack analysis: 2026-11-02*
