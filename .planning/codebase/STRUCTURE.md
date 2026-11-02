---
last_mapped_commit: 447ebf2f10ee7bb2a3652eee8ab505d6464356d7
last_mapped_at: 2026-11-02
---
# Codebase Structure

**Analysis Date:** 2026-11-02

## Directory Layout

```
night-gsd-standard/                       # repo root (git worktree)
├── xenforo-story-reader.user.js          # the entire product (408 lines, single IIFE)
├── package.json                          # npm manifest: test scripts, dev deps (vitest, happy-dom)
├── package-lock.json                     # lockfile, committed
├── vitest.config.js                      # test runner config (happy-dom, excludes .worktrees)
├── test/
│   ├── unit.test.js                      # Adapter, Store, EPUB pipeline tests
│   └── smoke.test.js                     # metadata block and version checks, node environment
├── e2e/
│   └── run.sh                            # machine-local end-to-end check via chrome-devtools CLI
├── screenshots/                          # PNG images used by README.md
├── .github/
│   └── workflows/test.yml                # CI: npm ci, npm test on push to main and on PRs
├── .gitignore                            # node_modules/, .worktrees/
├── README.md                             # user-facing install and feature doc
├── CONTEXT.md                            # handoff notes: architecture, selectors, constraints, history
├── AGENTS.md                             # agent rules: worktree workflow, PR flow
├── CLAUDE.md                             # Claude Code instructions, same worktree rules as AGENTS.md
├── LICENSE                               # MIT
└── .planning/
    └── codebase/                         # generated codebase map documents (this folder)
```

Notes on the layout:
- There is no `src/` directory. The userscript is one file at the repo root. This is intentional: Tampermonkey installs the raw file from `@downloadURL`, so the file must stay self-contained (`CONTEXT.md`, "File").
- `node_modules/` is created by `npm ci`. It is git-ignored and not part of the layout.
- `.worktrees/` holds git worktrees for parallel sessions. It is git-ignored (`.gitignore`) and excluded from vitest (`vitest.config.js`).

## Directory Purposes

**Repo root:**
- Purpose: Product file, configuration, docs.
- Contains: `xenforo-story-reader.user.js`, npm and vitest config, Markdown docs, license.
- Key files: `xenforo-story-reader.user.js`, `CONTEXT.md`, `AGENTS.md`.

**`test/`:**
- Purpose: Automated tests run by `npm test` and by CI.
- Contains: Two vitest files. `unit.test.js` loads the script with `globalThis.__XFR_TEST__ = true` and imports it (line 3-4), then uses `globalThis.__xfr`. `smoke.test.js` reads the source as text.
- Key files: `test/unit.test.js`, `test/smoke.test.js`.

**`e2e/`:**
- Purpose: Live check against a real forum thread. Not run in CI.
- Contains: `run.sh`, a bash script that wraps the userscript into a function and sends it to `chrome-devtools` with `evaluate_script`.
- Key files: `e2e/run.sh`.

**`screenshots/`:**
- Purpose: Images referenced by `README.md`.
- Contains: `reader-dark.png`, `reader-light.png`, `discussion.png`, `forum-before.png`.
- Generated: No. Committed: Yes.

**`.github/workflows/`:**
- Purpose: CI definition.
- Contains: `test.yml`. Uses Node 26 (`node-version: 26`).
- Key files: `.github/workflows/test.yml`.

**`.planning/codebase/`:**
- Purpose: Codebase map documents for GSD commands.
- Contains: `ARCHITECTURE.md`, `STRUCTURE.md`, and other mapper outputs when present.
- Generated: Yes (by `/gsd-map-codebase`). Committed: depends on the repo workflow.

## Key File Locations

**Entry Points:**
- `xenforo-story-reader.user.js` line 18: IIFE start. Line 404-405: mount trigger.
- `xenforo-story-reader.user.js` lines 1-17: Tampermonkey metadata block (`@match`, `@version`, `@downloadURL`, `@updateURL`, `@grant none`, `@run-at document-idle`).

**Configuration:**
- `xenforo-story-reader.user.js` lines 21-23: constants (`LS_PREFIX`, `DB_NAME`, `DB_STORE`, `CACHE_SCHEMA`, `MIN_GAP`, `MAX_CONC`, `RETRIES`, `PREFETCH_DISC_MAX`, `SITE_FONT`).
- `package.json`: npm scripts (`test`, `test:watch`, `e2e`) and the `version` field. The `version` must match the `@version` line in the script (checked by `test/smoke.test.js`).
- `vitest.config.js`: test environment and URL for happy-dom.

**Core Logic:**
- `xenforo-story-reader.user.js` lines 25-50: `Net` (fetch queue).
- Lines 52-88: `Adapter` (XenForo selectors and URLs).
- Lines 90-100: `Cache` (IndexedDB and memory).
- Lines 103-162: `Store` (data flow and index).
- Lines 164-216: EPUB builder (`makeZip`, `bodyToXhtml`, `buildEpub`).
- Lines 218-253: `CSS` constant.
- Lines 255-382: `QQReader` custom element.
- Lines 385-405: launcher (`mountLauncher`).

**Testing:**
- `test/unit.test.js`: `describe` blocks for Adapter URLs, Adapter parsing, Store, CRC32, ZIP, sanitizer and `buildEpub`. Regression comments reference numbered bug entries from `CONTEXT.md`.
- `test/smoke.test.js`: metadata block presence, semver check, match against `package.json` version.
- `e2e/run.sh`: TOC count check after injection.

**Documentation:**
- `README.md`: install, features, development commands.
- `CONTEXT.md`: architecture summary, selectors, constants, version history, roadmap.
- `AGENTS.md`: worktree and PR workflow.
- `CLAUDE.md`: Claude Code instructions. Content matches `AGENTS.md`.

## Naming Conventions

**Files:**
- Userscript: `<kebab-case-name>.user.js`. The `.user.js` suffix is the Tampermonkey convention and must stay.
- Tests: `<subject>.test.js` in `test/`. Vitest picks up this pattern by default.
- Docs: root-level `UPPERCASE.md` (`README.md`, `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`). Codebase maps use the same style in `.planning/codebase/`.
- Shell: `run.sh` in a named folder (`e2e/run.sh`).

**Code (inside the userscript):**
- Module objects: PascalCase `const` holding an IIFE result: `Net`, `Adapter`, `Cache`, `Store`.
- Custom element: `QQReader` class registered as `qq-reader`. Custom element names must contain a hyphen.
- Functions: camelCase (`buildIndex`, `getChapterBody`, `makeZip`, `bodyToXhtml`).
- Private methods on the component: leading underscore (`_wire`, `_boot`, `_openChapter`, `_renderTOC`, `_q`).
- Constants: UPPER_SNAKE (`MAX_CONC`, `CACHE_SCHEMA`, `LS_PREFIX`).
- CSS classes: short lowercase names inside the shadow DOM (`.wrap`, `.side`, `.toc`, `.foot`, `.discbar`, `.comment`). Launcher class is `.xfr-launch` (light DOM, page-global, so it keeps the `xfr-` prefix).
- Storage keys: prefix `xfReader:` for `localStorage` (`LS_PREFIX`). Cache keys use `index:`, `body:`, `posts:` prefixes.
- Log prefix: `[xfReader]`.

**Directories:**
- Lowercase, single word: `test`, `e2e`, `screenshots`.
- Dot-directories for tooling: `.github`, `.planning`, `.worktrees`.

## Where to Add New Code

**New XenForo selector or URL pattern (new forum or markup change):**
- Code: add a method to the `Adapter` IIFE, lines 52-88 of `xenforo-story-reader.user.js`.
- Test: add a case in `test/unit.test.js` inside the `describe('Adapter …')` block, with a small HTML fixture written inline.

**New data fetch or cache key:**
- Code: add a function to the `Store` IIFE, lines 103-162. Use `Cache.get` and `Cache.set` with a new prefix. Bump `CACHE_SCHEMA` (line 21) if the stored shape changes.
- Test: `test/unit.test.js`, using the `Store` export on `globalThis.__xfr`.

**New reader UI control (footer button, toolbar, setting):**
- Code: markup in `QQReader.connectedCallback` (lines 261-272), wiring in `_wire` (lines 276-297), styles in the `CSS` array (lines 219-252). Keep the footer on one row. Each button has a `data-tip` and an `aria-label`.
- Preference storage: `localStorage` key with the `LS_PREFIX` prefix.

**New view or reading order:**
- Code: extend `makeIndex` (line 104) with a new method. Update `_renderTOC` (lines 310-323) and `_step` (line 327) to handle it.

**New export format:**
- Code: add a builder next to `buildEpub` (lines 199-216). Reuse `Store.getChapterBody` and `bodyToXhtml`. Trigger it from a new button in `connectedCallback`.
- Test: `test/unit.test.js` follows the existing `buildEpub` tests.

**Utilities:**
- Shared helpers: `esc` (line 187) is the HTML escape function. Put any new general helper near the top of the file, inside the IIFE, after the constants. Do not add a new file.

**New file of any kind in the shipped code path:**
- Do not create a `src/` tree or a separate module file. The script must stay one file so Tampermonkey can install it from `@downloadURL`. Put new tests in `test/` and new tooling in the repo root or `e2e/`.

**Version bump:**
- Change `@version` at line 4 of `xenforo-story-reader.user.js` and `"version"` in `package.json`. The smoke test fails if they differ.

## Special Directories

**`.worktrees/`:**
- Purpose: One git worktree per session or PR branch (`.worktrees/<slug>`).
- Generated: Yes, by `git worktree add`.
- Committed: No (git-ignored). Excluded from vitest.

**`node_modules/`:**
- Purpose: npm dependencies.
- Generated: Yes, by `npm ci`.
- Committed: No (git-ignored).

**`.planning/`:**
- Purpose: GSD planning and codebase map output.
- Generated: Yes.
- Committed: Depends on repo policy. Do not place secrets here.

**`.claude/worktrees/`:**
- Purpose: Claude Code subagent isolation. Managed by the harness (`AGENTS.md`).
- Generated: Yes. Committed: No.

---

*Structure analysis: 2026-11-02*
