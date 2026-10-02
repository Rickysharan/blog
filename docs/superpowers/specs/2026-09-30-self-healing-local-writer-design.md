# Self-Healing Local Writer Design

## Goal

OmniLede should turn one launch into one reviewable article without requiring terminal knowledge. It should diagnose and repair predictable local, network, generation, image, and delivery failures. Recovery must stay bounded and must never publish, delete content, overwrite an editor's work, or use a paid AI service.

Success means the desktop app either:

1. delivers one validated draft containing two or three relevant, reusable pictures and opens the review dashboard; or
2. preserves all completed work and explains the single action that still needs attention after two automatic repair attempts.

## Architecture

The Node local writer owns recovery policy because it already coordinates discovery, generation, images, and delivery. The native Mac app remains a thin status interface. It starts the writer, renders structured events, offers Cancel or Try again, and opens the dashboard only after verified delivery.

The writer will be divided into explicit stages:

1. preflight
2. discovery
3. generation
4. article normalization
5. image selection
6. local validation
7. dashboard delivery
8. delivery verification

Each stage returns a typed outcome rather than setting a global exit code. Outcomes identify whether the stage succeeded, repaired itself, needs a retry, or requires human attention. A recovery controller applies the stage's retry policy and emits progress events for the desktop app.

## Durable Run State

The writer stores non-secret state atomically in `.audit/current-run.json`. The state includes a run identifier, selected source story, current stage, attempt count, local draft reference, image count, delivery status, and timestamps. It never contains passwords, GitHub tokens, cookies, or complete environment values.

On launch, the controller checks for an unfinished run. It resumes from the last verified stage when its inputs still match. If state is malformed or refers to missing files, it moves the bad state to a timestamped diagnostic file and starts a clean run without deleting drafts.

The writer lock will contain its process ID and start time. A new run removes the lock only when the recorded process is no longer alive. A live process causes a clear “already running” result.

## Recovery Policies

### Preflight and Ollama

The writer validates the project path, writable audit and draft directories, required configuration names, available disk space, local model installation, GitHub authentication, and dashboard URL.

If Ollama is unavailable, the app starts the local-only server and waits for health. If a generation request later fails because Ollama stopped responding, the controller restarts it once and repeats the generation stage. It never switches to a cloud model or paid provider.

Missing models, invalid configuration, insufficient disk space, and unavailable credentials require human attention because automatic repair would require a download, a secret, or a user choice.

### News Discovery

Individual feed failures remain non-fatal while another active feed succeeds. If all feeds fail, the writer uses the existing validated queue. It retries discovery twice only when both live feeds and the saved queue cannot produce a story. It never scrapes sites that block unattended access.

### Generation and Content Repair

Ollama receives the original source record on every attempt. If its response is truncated, malformed JSON, unsafe MDX, missing the required analysis section, or outside the allowed length, the writer retries twice with the validation error as correction guidance. A retry starts from the source record rather than editing unsupported claims into the failed response.

Deterministic normalization removes a leading H1 that repeats the frontmatter title, removes model-generated source lines, normalizes the required “Why it matters” heading, and ensures the renderer shows source attribution once. It does not invent or rewrite facts.

### Pictures

The writer requires two or three distinct, relevant Wikimedia Commons photos with an allowed commercial reuse licence, artist attribution, source page, and licence URL. It checks that each image URL returns a supported image and has usable dimensions.

If fewer than two pictures pass, the writer retries with other named people, teams, organisations, or places explicitly present in the source. Generic category terms cannot satisfy relevance. After two failed attempts, it preserves the text draft locally and reports that pictures need attention; it does not upload an incomplete article or substitute unrelated images.

### Local Validation

Before delivery, a single validator confirms:

- valid article frontmatter and filename
- source-grounded article length and required section
- no imports, executable MDX, HTML, or duplicate top-level headline
- exactly one visible source attribution
- two or three distinct licensed pictures
- safe HTTPS destinations and complete picture credits

Validation failures route back only to the responsible generation, normalization, or image stage. The controller never reruns completed network work unnecessarily.

### GitHub Delivery

Network errors, rate limits, and GitHub 5xx responses are retried twice with short capped backoff. An uncertain create is resolved by reading the exact target path: matching bytes count as delivered, missing content is retried, and different content is a conflict.

Conflicts are never repaired by overwriting remote content. Published slugs, editor changes, authentication failures, and permission errors require human attention. An ordinary run delivers only the draft created by that run.

After creation, the writer reads the remote draft and compares its bytes with the validated local file. Only that verification may emit the delivered event.

## Desktop Experience

The native window shows the active stage, elapsed time, estimated remaining time, progress, and a short recovery message such as “Ollama stopped; restarted locally (1/2).” The estimate may change after a retry.

Successful completion shows the draft title, picture count, total time, repairs performed, and an enabled “Open review dashboard” button. The dashboard opens automatically after verified delivery.

An incomplete run shows what was saved, the failed stage, repairs already attempted, and one primary action. “Try again” resumes the saved run rather than starting another article. “Start a new article” is separate and never discards the saved one.

Closing or cancelling the app terminates the active child process cleanly after the current atomic file operation. It leaves resumable state and local drafts intact.

## Safety Boundaries

Automatic recovery may restart local services, retry bounded requests, remove a provably stale lock, normalize generated formatting, regenerate from the original source, and verify copies.

Automatic recovery may not publish or discard an article, edit an existing remote draft, replace a conflicting file, expose credentials, install or download models, use paid APIs, relax validation, invent facts, or retry indefinitely.

## Observability

Structured progress events include the run ID, stage, attempt, percent, status, and user-facing message. Secrets and full environment values are never logged. `.audit/desktop-writer.log` records stage outcomes and sanitized error categories. The final event contains the draft reference, picture count, delivery verification result, and repairs performed.

## Testing

Unit tests cover error classification, retry limits, backoff bounds, stale-lock ownership, state persistence, deterministic normalization, image requirements, and delivery reconciliation.

Integration tests use temporary repositories and controlled HTTP responses to prove resume behavior and ensure a retry does not duplicate or overwrite a draft. Native UI smoke tests cover normal progress, recovery progress, cancellation, successful delivery, and exhausted recovery.

An end-to-end local test runs through the desktop app with Ollama and a test delivery target. It verifies that two or three pictures render, the uploaded bytes match the local draft, the dashboard lists the draft, and Publish remains a deliberate user action.

## Rollout

The change will ship behind the desktop writer without changing the hosted publication contract. Existing local drafts and queue files remain compatible. If no run-state file exists, the first launch starts normally. Documentation will explain recovery messages and how to find the sanitized diagnostic log.
