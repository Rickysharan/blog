#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ ! -d node_modules ]; then npm ci; fi
mkdir -p .audit
web_pid=""
writer_pid=""
cleanup() {
  if [ -n "$writer_pid" ]; then kill -TERM "$writer_pid" 2>/dev/null || true; wait "$writer_pid" 2>/dev/null || true; fi
  if [ -n "$web_pid" ]; then kill "$web_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
cancel_writer() {
  if [ -n "$writer_pid" ]; then kill -TERM "$writer_pid" 2>/dev/null || true; fi
  exit 130
}
trap cancel_writer INT TERM
review_url="$(node --env-file-if-exists=.env.local -e '
const local = "http://127.0.0.1:3100/admin/review";
const configured = process.env.LOCAL_WRITER_REVIEW_URL;
if (process.env.LOCAL_WRITER_SYNC === "true") {
  if (!configured) { console.error("Set LOCAL_WRITER_REVIEW_URL to your hosted review desk."); process.exit(1); }
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password) { console.error("Hosted review URL must be HTTPS without credentials."); process.exit(1); }
  console.log(url.href);
} else { console.log(local); }
')"
if [[ "$review_url" == http://127.0.0.1:* ]]; then
  if ! curl --silent --fail --max-time 2 http://127.0.0.1:3100/admin/login >/dev/null; then
    npm run dev -- --hostname 127.0.0.1 --port 3100 > .audit/dashboard.log 2>&1 &
    web_pid=$!
  fi
fi
echo "Finding recent news and writing an article with related photos…"
started=$SECONDS
writer_args=(--limit 1)
if [ "${OMNILEDE_START_NEW:-}" = "true" ]; then writer_args+=(--new); fi
if [ -n "${OMNILEDE_WRITER_EXECUTABLE:-}" ]; then
  "$OMNILEDE_WRITER_EXECUTABLE" "${writer_args[@]}" &
else
  node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/local-writer.ts "${writer_args[@]}" &
fi
writer_pid=$!
set +e
wait "$writer_pid"
writer_status=$?
set -e
writer_pid=""
if [ "$writer_status" -ne 0 ]; then exit "$writer_status"; fi
echo "Writer finished in $((SECONDS - started)) seconds."
echo "@omnilede $(node -e 'console.log(JSON.stringify({phase:"dashboard",url:process.argv[1]}))' "$review_url")"
if [ "${OMNILEDE_DESKTOP:-}" != "true" ]; then open "$review_url"; fi
echo "Review dashboard: $review_url"
if [ -n "$web_pid" ]; then
  disown "$web_pid" 2>/dev/null || true
  web_pid=""
  echo "The local dashboard is running in the background."
else
  echo "You can close this window. Open OmniLede again for another article."
fi
