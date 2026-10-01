# Local article writer

This worker discovers recent stories from the configured RSS feeds, writes drafts using a model on your own computer, and optionally uploads them to the existing blog review dashboard. It never calls a paid AI API and never publishes. RSS recency is not proof that a story is trending by audience size; editorial review remains necessary.

## Setup on this Mac

Use Node 22 or later. Run `npm ci` in the repository root and install Ollama. The desktop app starts the local-only Ollama server in the background when it is not already running. For manual troubleshooting, the equivalent command is:

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

I use **OmniLede.app** on my Desktop to write one article at a time. It shows the current step, a progress bar and an estimated wait, then opens my review dashboard after delivery. I select the draft, check it and click **Publish** myself. The writer runs in the background; I can minimise its window. No Terminal window is needed.

To build or reinstall the Mac app, run `python3 desktop/install-app.py` from this repository (Xcode command-line tools required). The app points to this project folder; reinstall it if the folder moves. The installer keeps the previous app under `~/Library/Application Support/OmniLede/`.

The app uses `LOCAL_WRITER_REVIEW_URL` when `LOCAL_WRITER_SYNC=true`, or the local dashboard on port 3100 otherwise. The hosted dashboard may require its own sign-in. A hosted run does not start a redundant local web server. Ollama stays available in the background, with the model kept in memory for up to 30 minutes to reduce repeated loading. The local admin password remains in `.env.local`. The shell launcher still works for troubleshooting.

## Write and review

```sh
npm run content:local -- --limit 1
npm run dev
```

Open `http://localhost:3000/admin/login`, then `/admin/review`. Review the claims against the linked source, edit and save, then use Publish deliberately. Source snippets can be incomplete; generated prose is not verified reporting.

The worker merges new feed stories with the pending queue and avoids existing source URLs. It creates at most one draft by default (`--limit 1` through `10`). Invalid or failed model outputs stay queued. Use `--queue-only` to skip RSS and retry the saved queue. An owned process lock prevents two instances from changing the queue at once and removes itself only when the recorded process is no longer alive.

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

The app repairs predictable failures automatically. It can restart the local-only Ollama server, remove a lock whose recorded process has stopped, correct duplicate generated formatting, retry invalid local output from the original source, retry temporary GitHub failures, and reconcile a delivery whose response was lost. A recoverable stage gets its initial attempt plus at most two retries.

Progress and sanitized repair details appear in the app. `.audit/current-run.json` records only non-secret stage data and is replaced atomically after verified boundaries. If the app or Mac stops mid-run, **Try again** resumes a valid saved draft instead of generating a duplicate. A malformed state file is moved to a timestamped diagnostic file; local drafts are not deleted. **Cancel** stops after the current atomic file operation and leaves completed work resumable.

The app asks for one manual action when repair would require a model download, credentials, permission changes, choosing different pictures, or resolving an editor conflict. Install a missing model yourself with `ollama pull MODEL_NAME`, then use **Try again**. Never bypass content validation or delete `.audit/local-writer.lock` while a writer process is active.

## Pictures and waiting time

I want short, source-grounded drafts with two or three relevant pictures. The local writer aims for 150–300 words, or less when the source is thin. It searches Wikimedia Commons only for named subjects from the source and requires two or three related archive photos inside the article, with photographer, source and licence links. It verifies supported image types, useful dimensions and reachability. These are not presented as photographs of the current event. The card cover remains the category artwork. If fewer than two suitable reusable photos are available, it keeps the text draft locally and blocks dashboard delivery; it does not substitute random pictures.

The app's bar shows completed stages, not token-by-token completion. Remaining time is an estimate based on the last successful run (90 seconds initially); cold model loading and network delays can change it. Progress reaches delivered only after successful draft upload. Technical details stay in `.audit/desktop-writer.log`. Nothing is published automatically.
