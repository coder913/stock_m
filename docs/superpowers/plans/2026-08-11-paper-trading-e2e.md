# Paper Trading E2E Implementation Plan

1. Add failing Playwright coverage for browser order entry, confirmation, cancellation, mixed timeline events, ledger/performance updates, worker restart, and duplicate BullMQ delivery.
2. Replace the E2E server's manual command loop with a real outbox publisher, BullMQ queue/worker, and PostgreSQL inbox.
3. Add bounded test-only controls for worker restart, repeated delivery, broker fill state, and runtime diagnostics.
4. Preserve and adapt the lost-response and broker-drift lifecycle scenario.
5. Run focused Playwright tests, unit/integration tests, the complete test suite, and the production build.
6. Merge the verified branch into local `main` and remove the worktree.
