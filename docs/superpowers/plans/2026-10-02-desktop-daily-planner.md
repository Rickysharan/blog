# Desktop Daily Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OmniLede open idle on a three-task daily category plan, write only after an explicit click, and show accurate draft, publication, and task status.

**Architecture:** A TypeScript planner owns content inventory, deterministic rotation, persistence, and reconciliation. The native AppKit app consumes a small structured command protocol, renders the Today dashboard, and invokes the existing writer with an explicit category. The writer records its result against the selected daily task, while Publish remains a separate dashboard action.

**Tech Stack:** TypeScript 5.9, Node.js 22, Vitest, Zod, Swift/AppKit, Bash, existing local Ollama and GitHub repositories.

**Spec:** `docs/superpowers/specs/2026-10-02-desktop-daily-planner-design.md`

## Global Constraints

- Opening OmniLede must not start Ollama, story discovery, article generation, the dashboard server, or delivery.
- Each local calendar date has exactly three stable category tasks chosen from the six-category registry.
- The top **Refresh** action updates the plan and counts without starting a writer.
- Writing uses the chosen category and must not fall back to another category.
- Existing drafts, queue data, and `.audit/current-run.json` remain compatible and must not be overwritten or deleted.
- Publishing always requires the editor to click **Publish** in the review dashboard.
- The feature uses the existing local Ollama model and no paid service.

## Review Focus

- A malformed daily-plan file must leave the app idle, preserve the file, and show a refreshable error; Task 1 tests this.
- A refresh after local midnight must create the new date's plan without changing yesterday's plan; Task 1 tests this.
- An unavailable synced GitHub inventory must not replace remote counts with misleading local counts; Task 1 tests this.
- An unfinished run for one category must block a request to start a different category and preserve the saved run; Task 2 tests this.
- A selected category with no source story must report that category needs attention and never write from another category; Task 2 tests this.

---

### Task 1: Content Inventory and Daily Plan Domain

**Files:**
- Create: `lib/desktop/content-inventory.ts`
- Create: `lib/desktop/content-inventory.test.ts`
- Create: `lib/desktop/daily-plan.ts`
- Create: `lib/desktop/daily-plan.test.ts`

**Interfaces:**
- Produces: `loadEditorialInventory(input: { contentRoot: string; env: Record<string, string | undefined>; fetchImpl?: FetchLike }): Promise<EditorialInventory>`.
- Produces: `getDailyPlanSnapshot(input: PlannerInput): Promise<DailyPlanSnapshot>`.
- Produces: `replaceDailyPlanTask(input: PlannerInput & { category: CategorySlug }): Promise<DailyPlanSnapshot>`.
- Produces: `recordDailyPlanRun(input: { auditRoot: string; date: string; category: CategorySlug; result: LocalRunResult; now?: Date }): Promise<void>`.
- `DailyPlanSnapshot` contains `date`, `completedCount`, `totalTasks: 3`, `draftCount`, `publishedCount`, and three tasks containing `category`, `label`, `reason`, `status`, and optional `draftRef`.
- Task status is exactly `todo | writing | draft-ready | published | needs-attention`.

- [ ] **Step 1: Write failing content-inventory tests**

Cover validated local drafts/articles, synced GitHub tree and blob inventory, invalid MDX exclusion, and a failed synced read that rejects without silently using local counts.

- [ ] **Step 2: Run the inventory tests and confirm failure**

Run: `npm test -- lib/desktop/content-inventory.test.ts`
Expected: FAIL because `loadEditorialInventory` does not exist.

- [ ] **Step 3: Implement the inventory boundary**

Use the existing article parser and category registry. Select GitHub when `LOCAL_WRITER_SYNC=true`, using `resolveLocalGitHubTarget` and `GitDataClient`; otherwise scan local `content/drafts` and `content/articles`. Return only validated items with kind, category, filename, slug, and article date.

- [ ] **Step 4: Write failing daily-plan tests**

Assert oldest coverage then lowest article count then registry order; exactly three stable tasks; existing newest draft assignment; draft-ready and published reconciliation by exact filename; replacement only for unstarted tasks; completed count including draft-ready and published; malformed-plan preservation; and local-date rollover.

- [ ] **Step 5: Implement atomic daily-plan persistence and reconciliation**

Store versioned JSON at `.audit/daily-plans/YYYY-MM-DD.json`, validate it with Zod, use temporary-file rename writes, and never put secrets or article bodies in the plan. `recordDailyPlanRun` links the exact run ID and draft reference and records completed, cancelled, or attention outcomes.

- [ ] **Step 6: Run Task 1 tests and commit**

Run: `npm test -- lib/desktop/content-inventory.test.ts lib/desktop/daily-plan.test.ts`
Expected: PASS.

Commit: `git commit -m "Add local daily editorial planner"`

### Task 2: Category-Constrained Writer

**Files:**
- Modify: `lib/pipeline/local-run.ts`
- Modify: `lib/pipeline/local-run-types.ts`
- Modify: `lib/pipeline/local-run.test.ts`
- Modify: `scripts/local-writer.ts`

**Interfaces:**
- Consumes: `recordDailyPlanRun` from Task 1.
- Produces: `RunLocalWriterOptions.category?: CategorySlug`.
- Produces: CLI options `--category <CategorySlug>` and `--plan-date <YYYY-MM-DD>`.
- Adds the requested category to persisted run state and structured writer events so the native app and planner can reconcile the active task.

- [ ] **Step 1: Add failing writer tests**

Assert that a selected category chooses the first queued story in that category, refreshes discovery before declaring it unavailable, never falls back to another category, preserves the category on resume, and rejects a different category while another task is resumable.

- [ ] **Step 2: Run the targeted writer tests and confirm failure**

Run: `npm test -- lib/pipeline/local-run.test.ts`
Expected: FAIL on the new category-selection assertions.

- [ ] **Step 3: Implement category selection and state compatibility**

Validate the option with `isCategorySlug`, filter after saved/live queue merging, and keep the original category when resuming older state. Extend state parsing compatibly so existing version-1 state without a requested category still loads.

- [ ] **Step 4: Connect CLI plan recording**

Parse both new options, pass the category to `runLocalWriter`, and call `recordDailyPlanRun` once for every terminal result when a plan date and category were supplied. Reject malformed dates/categories before starting local services.

- [ ] **Step 5: Run Task 2 tests and commit**

Run: `npm test -- lib/pipeline/local-run.test.ts lib/pipeline/run-state.test.ts`
Expected: PASS.

Commit: `git commit -m "Write articles for selected daily categories"`

### Task 3: Desktop Planner Command Protocol

**Files:**
- Create: `scripts/desktop-plan.ts`
- Create: `scripts/desktop-plan.test.ts`
- Modify: `Start OmniLede.command`

**Interfaces:**
- Consumes: Task 1 planner functions and Task 2 writer CLI.
- Produces: `desktop-plan.ts --action snapshot` and `desktop-plan.ts --action replace --category <slug>`.
- Produces one structured stdout line: `@omnilede-plan <DailyPlanSnapshot JSON>`; failures emit one sanitized `@omnilede-plan-error` event and exit nonzero.
- The launcher accepts `OMNILEDE_ACTION=plan-snapshot | plan-replace | write`, `OMNILEDE_CATEGORY`, and `OMNILEDE_PLAN_DATE`.

- [ ] **Step 1: Write failing protocol tests**

Test snapshot output, replacement output, invalid action/category/date rejection, and absence of secrets in errors.

- [ ] **Step 2: Run the protocol tests and confirm failure**

Run: `npm test -- scripts/desktop-plan.test.ts`
Expected: FAIL because the command does not exist.

- [ ] **Step 3: Implement the planner command**

Use `parseArgs`, call the Task 1 functions, and keep stdout machine-readable. Default the date from the Mac's local calendar when it is not supplied.

- [ ] **Step 4: Route launcher actions without side effects**

For plan actions, run only the planner command and exit before dashboard startup or writer setup. For write, preserve current dashboard and cleanup behavior and append `--category`, `--plan-date`, and `--new` only from validated environment values.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- scripts/desktop-plan.test.ts && bash -n 'Start OmniLede.command'`
Expected: PASS and no shell syntax errors.

Commit: `git commit -m "Add desktop planner command protocol"`

### Task 4: Idle AppKit Today Dashboard

**Files:**
- Create: `desktop/DailyPlanModels.swift`
- Modify: `desktop/OmniLede.swift`
- Modify: `desktop/install-app.py`

**Interfaces:**
- Consumes: `@omnilede-plan`, `@omnilede-plan-error`, and existing `@omnilede` writer events.
- `DailyPlanModels.swift` defines `DailyPlanSnapshot`, `DailyPlanTask`, `DailyTaskStatus`, and their `Decodable` wire values.
- The native app invokes the launcher with explicit planner or writer environment actions and never invokes write from `applicationDidFinishLaunching`.

- [ ] **Step 1: Extend the DEBUG smoke test to fail on the required planner UI**

Before implementation, assert no writer task exists after launch; the top **Refresh** button exists; three injected tasks render; selecting a todo task enables **Start writing**; published tasks cannot start or be replaced; and planner failure leaves the app idle with Refresh available.

- [ ] **Step 2: Compile and run the smoke test to confirm failure**

Run: `swiftc -D DEBUG desktop/DailyPlanModels.swift desktop/OmniLede.swift -o .audit/OmniLede-test -framework AppKit && .audit/OmniLede-test --smoke-test`
Expected: FAIL on missing planner behavior.

- [ ] **Step 3: Build the Today view and planner process handling**

Render date, top Refresh, `N of 3 written`, total draft/published counts, three selectable task rows, per-task status/reason, conditional Replace, and one Start writing button. Refresh on launch, after writer termination, and when the app becomes active; planner reads must never fall through to `start()`.

- [ ] **Step 4: Integrate explicit writing and recovery**

Pass the selected category/date to the launcher, show the existing progress view while writing, return to Today on cancel/failure/completion, expose Try again for the same resumable task, and retain automatic dashboard opening only after verified delivery.

- [ ] **Step 5: Update compilation and pass the native smoke test**

Make `desktop/install-app.py` compile both Swift sources. Run the Step 2 command again.
Expected: `Native UI smoke checks passed` with idle startup, refresh, selection, status, recovery, and delivery assertions.

- [ ] **Step 6: Commit the native app**

Commit: `git commit -m "Show daily tasks before starting the writer"`

### Task 5: Documentation, Installation, and Full Verification

**Files:**
- Modify: `desktop/README.md`
- Modify: `docs/runbooks/local-writer.md`

**Interfaces:**
- Documents the idle launch, smart three-category rotation, top Refresh button, task states, Replace, Start writing, Try again, and deliberate Publish flow.

- [ ] **Step 1: Update operator and user documentation**

Document `.audit/daily-plans/YYYY-MM-DD.json`, synced versus local status sources, recovery messages, and that opening or refreshing the app never starts writing.

- [ ] **Step 2: Run repository validation**

Run separately: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `bash -n 'Start OmniLede.command'`, the DEBUG Swift smoke command from Task 4, and `python3 -m py_compile desktop/install-app.py`.
Expected: every command passes.

- [ ] **Step 3: Reinstall and verify the signed Desktop app**

Run: `python3 desktop/install-app.py` followed by `codesign --verify --deep --strict --verbose "$HOME/Applications/OmniLede.app"`.
Expected: installer reports both the Applications bundle and Desktop shortcut; strict signature verification succeeds.

- [ ] **Step 4: Prove installed idle launch has no writer side effect**

Launch the installed executable with `OMNILEDE_WRITER_EXECUTABLE` pointing to a temporary marker script, wait for the Today view, and assert the marker was not created. Then click Start writing in a controlled smoke run and assert the marker receives the selected `--category` and `--plan-date` arguments.

- [ ] **Step 5: Preserve user content and commit documentation**

Confirm `git status --short` still shows the user's queue and draft files only as their pre-existing unstaged data, with no content file staged by this feature.

Commit: `git commit -m "Document the desktop daily planner"`
