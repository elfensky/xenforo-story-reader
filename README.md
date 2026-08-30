# XenForo Story Reader

A Tampermonkey userscript that turns a threadmarked XenForo story thread into an
AO3/FFN-style reader: chapter table of contents, the chapter body as the focus, and the
forum discussion between chapters shown inline as comments under each chapter.

Works on Questionable Questing, SpaceBattles, and Sufficient Velocity (any XenForo forum
with threadmarks — all selectors live in one Adapter).

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open [`xenforo-story-reader.user.js`](https://github.com/elfensky/xenforo-story-reader/raw/main/xenforo-story-reader.user.js) — Tampermonkey offers to install it.
3. Open a threadmarked story thread; a floating **Reader** button appears bottom-right.

## Features

- **Instant open** — chapter index cached in IndexedDB, 0ms rebuild after first load.
- **Two reading orders** — story-first (grouped by threadmark category) or fully chronological (omake/extras interleaved).
- **Inline discussion** — the forum posts between two chapters shown as comments under each chapter, with a sticky section bar.
- **EPUB export** — whole story to a valid EPUB2, built in the browser (hand-rolled ZIP, sanitized XHTML).
- **Polite fetching** — capped concurrency, request gap, retry with backoff on 429/503.
- **Read-only** — fetch, parse, render, export. Never posts, likes, or touches the account.

## Roadmap

1. In-chapter scroll progress + read/unread state.
2. Keyboard nav (J/K, arrows, Esc).
3. TOC search/filter; typography controls (font size / width / line-height).

## Development

Single file, no build step. Architecture and selector notes: [CONTEXT.md](CONTEXT.md).

## License

MIT
