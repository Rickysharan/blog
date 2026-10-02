# OmniLede desktop writer

`OmniLede.app` is the visible controller for the local article writer. It opens on a **Today** page and stays idle until **Start writing** is clicked. Opening the app or clicking the top **Refresh** button never starts Ollama, discovers stories, writes an article, or delivers a draft.

Install or refresh the app from the repository root:

```sh
python3 desktop/install-app.py
```

The installer places the signed bundle at `~/Applications/OmniLede.app`, adds `~/Desktop/OmniLede.app` as its Desktop shortcut, and records this repository path in the app bundle. Keeping the signed bundle outside Desktop prevents file-provider metadata from invalidating its signature. Reinstall after moving the repository.

Each day the app keeps a stable list of three category tasks. The smart rotation prefers categories that have gone longest without a published article, then categories with fewer articles. Select a **To do** task and click **Start writing**. An unstarted task can be exchanged with **Replace**. The page shows `N of 3 written`, total draft and published counts, and one of these task states:

- **To do** — ready to select and start.
- **Writing** — saved work exists for this category.
- **Draft ready** — the draft was created and is ready for review.
- **Published** — the matching article is in published content.
- **Needs attention** — the last attempt needs repair or another try.

During a run the window shows the active stage, elapsed and estimated time, automatic repairs, picture count, and progress. **Cancel** stops the child process while preserving atomic run state and drafts. **Try again** continues the same resumable task. After verified delivery the app opens the review dashboard, where publishing still requires clicking **Publish**. Returning to Today or clicking **Refresh** reconciles the task states and counts.

The daily assignment is stored atomically in `.audit/daily-plans/YYYY-MM-DD.json`; it contains task metadata, never article bodies or secrets. Sanitized diagnostics are stored in `.audit/desktop-writer.log`. Non-secret resume state is stored atomically in `.audit/current-run.json`. When synced delivery is enabled, counts and states come from the configured GitHub repository; if it cannot be read, the app reports the error instead of showing misleading local counts. In local-only mode, it reads this project's validated local drafts and articles.
