# Relocation reconciliation

The branch was moved out of cloud-synced Documents onto current `origin/main` because macOS repeatedly offloaded Git objects and dependencies. The working tree overlays the already reviewed local OmniLede code but deliberately preserves current remote `content/**`.

Requirements:

1. Do not delete, rewrite, stage selectively out, or modify any file under `content/**`.
2. Fix only the stale `lib/content/articles.test.ts` expectation exposed by the four newer published articles. Preserve the test's intent: original known article(s) remain present and every loaded article has its default language. Avoid another brittle exact total.
3. Use the observed failure as RED: the current suite reports expected length 18, received 22.
4. Run the focused test, then `npm test`, then `npm run typecheck:all`, and `git diff --check`.
5. Inspect `git status` and confirm no generated secrets, provider payloads, `.audit`, `node_modules`, or content changes are staged.
6. Commit the complete non-content overlay as `Carry OmniLede Studio onto current blog`.
7. Write a report to `.superpowers/sdd/2026-10-02-omnilede-studio-growth/relocation-report.md` with files, commands/results, the content-preservation check, and concerns.

The complete project remains £0. Add no dependency or external service.
