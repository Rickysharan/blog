# OmniLede desktop writer

`OmniLede.app` is the visible controller for the local article writer. It runs the project launcher in the background, reads only structured `@omnilede` progress events, and opens the review dashboard after the uploaded draft has been read back and verified.

Install or refresh the app from the repository root:

```sh
python3 desktop/install-app.py
```

The installer places the signed app at `~/Desktop/OmniLede.app` and records this repository path in the app bundle. Reinstall after moving the repository.

During a run the window shows the active stage, elapsed and estimated time, automatic repairs, picture count, and progress. **Cancel** stops the child process while preserving atomic run state and drafts. **Try again** resumes saved work. **Start a new article** is enabled after successful delivery; it stays disabled while an unfinished draft needs recovery. The dashboard button becomes available only after verified delivery. Publishing always requires clicking **Publish** in the dashboard.

Sanitized diagnostics are stored in `.audit/desktop-writer.log`. Non-secret resume state is stored atomically in `.audit/current-run.json`.
