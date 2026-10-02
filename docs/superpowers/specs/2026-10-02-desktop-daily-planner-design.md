# Desktop Daily Planner Design

## Goal

OmniLede should open as an idle planning dashboard instead of immediately writing an article. The dashboard should tell the editor which categories need coverage today, show the state of each task, and start local writing only after the editor chooses a task and clicks **Start writing**.

The daily plan contains three category tasks selected automatically from Anime, Movies, Politics, Sports, Finance, and Share Market. Selection prioritises categories with the least recent coverage. The feature remains local, uses the existing Ollama writer, and requires no paid service.

## Main Window

The initial view is a **Today** dashboard. Opening the app must not start Ollama, discovery, generation, image search, delivery, or the review dashboard.

The top of the window contains:

- the current date
- a **Refresh** button
- today's completion count, such as **1 of 3 written**
- total draft and published article counts

The main area contains three daily task cards. Each card shows the category, a short reason it was selected, and one of these states:

- **To do**
- **Writing**
- **Draft ready**
- **Published**
- **Needs attention**

Selecting an actionable card enables one clear **Start writing** button. Each task also provides **Replace task** while it has not been started. A draft-ready or published task cannot be replaced.

When writing begins, the existing stage, progress bar, elapsed time, estimated remaining time, cancellation, recovery, and delivery messages appear in the same window. Successful delivery enables and opens the review dashboard. Returning to the Today view shows the updated task state and counts.

## Daily Plan Selection

The app creates one stable plan for each local calendar date and saves it locally. Reopening the app on the same day restores that plan instead of choosing different categories. The next local day creates a new plan automatically.

The planner inspects valid published articles and valid drafts. It ranks each category using:

1. the date of its newest published article, with the oldest coverage first
2. the number of valid published articles, with the smaller total first
3. the category's fixed registry order as a deterministic tie-breaker

The first three categories become today's tasks. An existing valid draft for a selected category starts as **Draft ready**. A newly published article associated with today's task starts or becomes **Published**. Otherwise the task starts as **To do**.

Replacing a task chooses the highest-ranked category not already present in the current plan. The replacement is saved immediately. If every category is already represented or unavailable, the current task remains unchanged and the app explains why.

## Status and Counts

The app derives article counts from validated local content rather than maintaining a second counter. It shows:

- today's completed tasks out of three
- total valid drafts
- total valid published articles

For the daily completion number, both **Draft ready** and **Published** count as written. The separate task label preserves the distinction so the editor can see which articles still require review and publishing.

The **Refresh** button rescans plans, drafts, published content, and resumable run state. It updates counts and task states without writing an article. The app also refreshes after a writer process ends and when it becomes active again.

## Data and Integration

Daily plans are stored as non-secret JSON in `.audit/daily-plans/` using the local date as the filename. Each task records the category, creation time, current draft reference when known, and the publication evidence needed to avoid treating an unrelated old article as today's completion.

A small Node command produces a validated JSON snapshot for the native app. It owns category ranking, plan creation, replacement, content counting, and state reconciliation. Keeping this logic in TypeScript allows it to reuse the category registry and content schemas instead of duplicating them in Swift.

The native app renders the snapshot and sends explicit actions to the Node command. The existing writer accepts a selected category and filters the discovered queue to that category before choosing a story. Resume state remains authoritative: if a run is unfinished, retry resumes that exact story and category.

Plan files never store passwords, tokens, article bodies, or paid-service credentials. Existing queue, draft, and run-state files remain compatible.

## Failure and Recovery Behaviour

If the plan snapshot cannot be loaded, the app remains idle and shows **Refresh** with a short recovery message. It must not start writing as a fallback.

If writing fails, the selected task becomes **Needs attention** and offers **Try again**. Retry uses the existing saved run. Cancelling safely stops the child process and returns to Today while preserving completed files and resumable state.

A category with no current source story remains **To do** or **Needs attention** and explains that no source was available. The planner does not silently write in a different category.

Automatic status reconciliation may recognise validated drafts and published articles. It may not publish, discard, overwrite, or modify article content.

## Testing

Unit tests cover deterministic ranking, three-task selection, same-day persistence, next-day rollover, replacement, content counts, and status reconciliation.

Writer tests prove that a selected category filters story choice, that an unavailable category does not fall back to another category, and that resuming preserves the original selection.

Native smoke tests cover idle startup, the top Refresh button, category selection, explicit start, progress presentation, cancellation, retry, dashboard opening, and refreshed completion counts.

An end-to-end test starts the installed app, confirms that no writer process begins before a click, generates a draft for the selected task, observes **Draft ready**, opens the dashboard, and confirms that publishing remains a deliberate editor action.

## Acceptance Criteria

- Opening OmniLede never starts writing automatically.
- The Today view contains three stable, automatically selected category tasks.
- The top Refresh button updates counts and statuses without starting a writer.
- The editor chooses a task and clicks **Start writing** before generation begins.
- The selected category controls which trending story is written.
- The app displays today's written count plus total draft and published counts.
- Task states distinguish To do, Writing, Draft ready, Published, and Needs attention.
- Daily plans roll over by the Mac's local date and remain stable within a day.
- Existing drafts, resumable work, and deliberate dashboard publishing remain safe.
