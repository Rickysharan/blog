# Local article writer

This worker discovers recent stories from the configured RSS feeds, writes drafts using a model on your own computer, and optionally uploads them to the existing blog review dashboard. It never calls a paid AI API and never publishes. RSS recency is not proof that a story is trending by audience size; editorial review remains necessary.

## Setup on this Mac

Use Node 22 or later. Run `npm ci` in the repository root. Install Ollama, then start a local-only server in a terminal:

```sh
OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

In another terminal, download a local model once:

```sh
ollama pull qwen2.5:7b
```

The model requires several GB of disk space. Inference uses your Mac's memory and electricity; no AI subscription or API key is needed. Internet is needed for the initial download, RSS discovery and optional GitHub draft delivery. The local command has no paid fallback.

Create `.env.local` with `OLLAMA_MODEL=qwen2.5:7b`. For the local review dashboard also configure `ADMIN_PASSWORD` (12+ characters) and `ADMIN_SESSION_SECRET` (32+ random characters). Do not commit this file.

## Launch as a local app

On macOS, double-click `Start OmniLede.command` after setup. It starts the local model server if needed, runs one discovery/drafting batch and opens the review dashboard. It uses port 3100 for local-only work or `LOCAL_WRITER_REVIEW_URL` for hosted delivery. Keep the terminal window open while using it. The local admin password is stored only in `.env.local`. The launcher uploads drafts when `LOCAL_WRITER_SYNC=true`; it never publishes them on the website.

## Write and review

```sh
npm run content:local -- --limit 1
npm run dev
```

Open `http://localhost:3000/admin/login`, then `/admin/review`. Review the claims against the linked source, edit and save, then use Publish deliberately. Source snippets can be incomplete; generated prose is not verified reporting.

The worker merges new feed stories with the pending queue and avoids existing source URLs. It creates at most one draft by default (`--limit 1` through `10`). Invalid or failed model outputs stay queued. Use `--queue-only` to skip RSS and retry the saved queue. A directory lock prevents two instances of this local command from overwriting each other's queue; do not run the legacy fetch/generate commands concurrently.

Local Publish updates the local repository only. To publish through the hosted dashboard, deliver the drafts first.

## Send drafts to the hosted dashboard

Configure these server-side values in `.env.local`:

```dotenv
GITHUB_REPOSITORY=Rickysharan/blog
GITHUB_BRANCH=main
GITHUB_TOKEN=
LOCAL_WRITER_SYNC=false
LOCAL_WRITER_REVIEW_URL=https://omnilede-news.netlify.app/admin/review
```

The worker first uses `GITHUB_TOKEN` if configured. Otherwise it uses your existing `gh auth login` session for github.com, keeping the retrieved credential in memory only. You can also supply a repository-scoped token with Contents read/write directly in the local file. Use the same repository and branch as the hosted blog's moderation configuration. Never paste the token into chat. The worker prints the destination before writes.

```sh
npm run content:local -- --limit 1 --sync
# Retry delivery without model inference or RSS:
npm run content:local -- --sync-only
```

Set `LOCAL_WRITER_SYNC=true` to deliver drafts after each local writing run, including the Mac launcher. Use `--local-only` to override this for a single run.

The GitHub-backed dashboard stores drafts as repository files. In a public repository, those files can be read on GitHub before publication on the website; this is not confidential draft storage. Do not put private material in this workflow.

`--sync` uploads all valid local drafts through the existing GitHub adapter as draft-only commits. Identical files are skipped on retry. Edited remote drafts and already-published slugs are not overwritten or republished; conflicts are reported. Local copies remain available after upload. Review at the hosted blog's `/admin/review`, then click Publish there. A site linked to the branch may redeploy after a draft commit, but drafts remain excluded from public pages.

The local writer is implemented and tested separately from the Contributor app's submission pipeline. Hosted delivery requires a configured token and confirmation that the deployed dashboard reads this repository; it is not implied configured by installing the local worker.

## Recovery

If Ollama is offline, start the local-only server again. If a model is missing, download it with `ollama pull`. If generation fails validation, keep the source queued and revise manually or try a different local model; never bypass content validation. If the process was forcibly killed, check that no writer is running before removing `.audit/local-writer.lock`.
