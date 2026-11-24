---
last_mapped_commit: 447ebf2f10ee7bb2a3652eee8ab505d6464356d7
last_mapped_at: 2026-11-02
---
# External Integrations

**Analysis Date:** 2026-11-02

## APIs & External Services

**XenForo forum sites (scraped, no official API):**
- Supported hosts (`@match` in `xenforo-story-reader.user.js`):
  - `forum.questionablequesting.com`, `questionablequesting.com`
  - `forums.spacebattles.com`
  - `forums.sufficientvelocity.com`
- Access method: same-origin HTML requests, made with `fetch(url, {credentials:'include'})` in `Net.text` (`xenforo-story-reader.user.js`, Net section). The HTML is parsed with `DOMParser`.
- Endpoints requested:
  - Threadmarks index and category/page URLs: `Adapter.tmUrl`, `Adapter.threadmarksUrl` (`/threads/<slug>.<id>/threadmarks`, with `?threadmark_category=N` and `?page=N` query params)
  - Chapter pages: `Adapter.pageUrl` (thread pages used for chapter bodies and discussion posts)
- Auth: uses the visitor's existing forum session cookies. The script never logs in and never sends credentials of its own.
- SDK/Client: none. Plain `fetch`.
- Rate limiting: `Net` caps concurrency at 4 (`MAX_CONC`), spaces requests 120 ms apart (`MIN_GAP`), and retries on HTTP 429 and 503 with exponential backoff plus jitter (`RETRIES=3`, maximum 8000 ms).
- Read-only by design: the script fetches, parses, renders, and exports. It does not post, like, or change account state (`README.md` Features; `CONTEXT.md` Constraints).

**GitHub (distribution and updates only):**
- `@downloadURL` and `@updateURL` point to `https://raw.githubusercontent.com/elfensky/xenforo-story-reader/main/xenforo-story-reader.user.js`. The userscript manager polls this URL for updates. The script makes no runtime call to GitHub.
- Repository links in the header: `@homepageURL` and `@supportURL` point to `https://github.com/elfensky/xenforo-story-reader`.
- CI: GitHub Actions, see Monitoring & CI below.

**Userscript manager (host environment):**
- Tampermonkey, Violentmonkey, or Greasemonkey. The script declares `@grant none`, so it calls no `GM_*` or `GM.*` APIs and has no manager-specific storage.

**EPUB consumers (output only):**
- Generated EPUB2 files are saved locally. The XML namespaces in the output (`http://www.idpf.org/2007/opf`, `http://www.daisy.org/z3986/2005/ncx/`, `http://purl.org/dc/elements/1.1/`, `http://www.w3.org/1999/xhtml`) are identifiers only. No network request is made to them.

## Data Storage

**Databases:**
- Browser IndexedDB (in-page, origin-scoped to the forum site)
  - Database: `xfReaderDB`, version 1
  - Object store: `cache`
  - Client: raw `indexedDB` API, wrapped by the `Cache` module in `xenforo-story-reader.user.js`
  - Stored values: `{schema: CACHE_SCHEMA (2), data, ts}` keyed by string. A record with a different schema number is ignored on read.
  - Connection: none (local only)

**Browser localStorage (in-page, origin-scoped):**
- Keys use prefix `xfReader:`:
  - `xfReader:view` - reading order preference
  - `xfReader:theme` - `light` or dark theme
  - `xfReader:launch` - launcher state
- Client: direct `localStorage` calls in the `qq-reader` component

**In-memory:**
- `Cache.mem` (a `Map`) and the `Store` module hold parsed chapter indexes and page bodies for the current tab session.

**File Storage:**
- Local filesystem only, through the browser download mechanism. The EPUB is saved as `<sanitized title>.epub` via an `<a download>` element and `URL.createObjectURL`. The script does not upload files.

**Caching:**
- IndexedDB as described above, for the chapter index ("instant open" after first load) and fetched discussion pages.

## Authentication & Identity

**Auth Provider:**
- None owned by the project. The script relies on the forum's own login session, sent with `credentials: 'include'`.
- No tokens, API keys, or secrets are used, stored, or required.

## Monitoring & Observability

**Error Tracking:**
- None. There is no Sentry, GlitchTip, or similar SDK in the script.

**Logs:**
- Not detected. Errors surface as rejected promises and silent `catch` blocks (`Cache` get and set, `Net` retry path).

## CI/CD & Deployment

**Hosting:**
- Not applicable. The artifact is one JavaScript file served from GitHub raw content (`raw.githubusercontent.com`).

**CI Pipeline:**
- GitHub Actions, workflow `test` in `.github/workflows/test.yml`
  - Triggers: push to `main`, and every pull request
  - Runner: `ubuntu-latest`
  - Steps: `actions/checkout@v4`, `actions/setup-node@v4` with Node 26 and npm cache, `npm ci`, `npm test`
  - Scope: unit and smoke tests only. The e2e script is machine-local and does not run in CI.

**Local e2e:**
- `e2e/run.sh` drives a real logged-in Chrome through a local `chrome-devtools` CLI (`mise x node@26 -- chrome-devtools`). It opens a live thread, injects the script, and checks the `.xfr-launch` button and the TOC.

## Environment Configuration

**Required env vars:**
- None for the script or the tests.
- `E2E_THREAD` (optional) - overrides the thread URL used by `e2e/run.sh`.

**Secrets location:**
- No secrets are required or stored in this repository.
- `.npmrc` and other credential files are not present in the tracked tree.

## Webhooks & Callbacks

**Incoming:**
- None. The script runs only inside the page.

**Outgoing:**
- None. The script makes no requests to third-party endpoints. All outbound requests go to the four supported forum hosts.

## Network Surface Summary

| Destination | When | Purpose | Auth |
|---|---|---|---|
| Supported forum host (`*/threads/*`) | Page load and reader use | Threadmarks, chapter bodies, discussion posts | Visitor session cookies |
| `raw.githubusercontent.com` | Installed userscript update checks | Deliver new script versions | None |
| `github.com` | User clicks links only | Homepage and issues | None |

---

*Integration audit: 2026-11-02*
