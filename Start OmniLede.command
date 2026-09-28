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
ollama_pid=""
web_pid=""
cleanup() {
  if [ -n "$web_pid" ]; then kill "$web_pid" 2>/dev/null || true; fi
  if [ -n "$ollama_pid" ]; then kill "$ollama_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
if ! curl --silent --fail http://127.0.0.1:11434/api/tags >/dev/null; then
  OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11434 ollama serve > .audit/ollama.log 2>&1 &
  ollama_pid=$!
  for attempt in {1..30}; do
    if curl --silent --fail http://127.0.0.1:11434/api/tags >/dev/null; then break; fi
    sleep 1
  done
fi
# Bind to this Mac only. A separate existing dashboard can continue to run.
npm run dev -- --hostname 127.0.0.1 --port 3100 > .audit/dashboard.log 2>&1 &
web_pid=$!
for attempt in {1..30}; do
  if curl --silent --fail http://127.0.0.1:3100/admin/login >/dev/null; then break; fi
  sleep 1
done
open http://127.0.0.1:3100/admin/review
npm run content:local -- --limit 1 || echo "Writer needs attention; see the message above. The dashboard remains open."
echo "Dashboard: http://127.0.0.1:3100/admin/review"
echo "Keep this window open. Press Control-C to stop."
wait "$web_pid"
