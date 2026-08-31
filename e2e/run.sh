#!/usr/bin/env bash
# e2e: inject the userscript into a real threadmarked thread via the local
# chrome-devtools-mcp daemon and assert the reader actually works.
#
# Machine-local by design (needs the shared Chrome + chrome-devtools CLI from
# meta/SETUP.md); CI runs unit+smoke only. Override the target thread with
#   E2E_THREAD=https://... ./e2e/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."

THREAD="${E2E_THREAD:-https://forums.spacebattles.com/threads/here-comes-the-new-boss-nothing-like-the-old-boss-worm-au.853195/}"
CD() { mise x node@24 -- chrome-devtools "$@" 2>/dev/null; }

fail() { echo "FAIL: $1" >&2; exit 1; }

# wrap the userscript as an evaluate_script function
WRAP="$(mktemp)"; trap 'rm -f "$WRAP"' EXIT
{ printf '() => {\n'; cat xenforo-story-reader.user.js; printf '\nreturn "injected";\n}'; } > "$WRAP"

echo "· opening $THREAD"
CD new_page "$THREAD" >/dev/null

# wait out Cloudflare: inject only once the real thread DOM is there
READY=false
for i in $(seq 1 15); do
  sleep 3
  if CD evaluate_script "() => !!document.querySelector('h1.p-title-value')" | grep -q true; then READY=true; break; fi
done
$READY || fail "thread page never became ready (Cloudflare?)"

CD evaluate_script "$(cat "$WRAP")" | grep -q injected || fail "script injection"

CD evaluate_script "() => !!document.querySelector('.xfr-launch')" | grep -q true || fail "launcher did not mount"

echo "· launcher mounted, opening reader"
CD evaluate_script "() => { document.querySelector('.xfr-launch').click(); return 'ok'; }" >/dev/null

for i in $(seq 1 12); do
  sleep 5
  N=$(CD evaluate_script "() => { const r=document.querySelector('qq-reader'); return r ? r.shadowRoot.querySelectorAll('.toc a').length : 0; }" | grep -oE '[0-9]+' | tail -1)
  [ "${N:-0}" -gt 0 ] && break
done
[ "${N:-0}" -gt 0 ] || fail "TOC never populated"

echo "PASS: reader open with $N TOC entries"
