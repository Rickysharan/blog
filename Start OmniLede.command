#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v ollama >/dev/null; then
  echo "Install Ollama first. See docs/runbooks/local-writer.md."
  exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
mkdir -p .audit
web_pid=""
cleanup() {
  if [ -n "$web_pid" ]; then kill "$web_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
if ! curl --silent --fail http://127.0.0.1:11434/api/tags >/dev/null; then
  OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11434 nohup ollama serve > .audit/ollama.log 2>&1 &
  for attempt in {1..30}; do
    if curl --silent --fail http://127.0.0.1:11434/api/tags >/dev/null; then break; fi
    sleep 1
  done
fi
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
npm run content:local -- --limit 1
echo "Writer finished in $((SECONDS - started)) seconds."
echo "@omnilede $(node -e 'console.log(JSON.stringify({phase:"dashboard",url:process.argv[1]}))' "$review_url")"
if [ "${OMNILEDE_DESKTOP:-}" != "true" ]; then open "$review_url"; fi
echo "Review dashboard: $review_url"
if [ -n "$web_pid" ]; then
  echo "Keep this window open for the local dashboard. Press Control-C to stop."
  wait "$web_pid"
else
  echo "You can close this window. Open OmniLede again for another article."
fi
