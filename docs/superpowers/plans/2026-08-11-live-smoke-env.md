# Live Smoke Environment Loading Plan

1. Add failing tests for `.env` loading, environment precedence, missing-file behavior, and summary output.
2. Implement an isolated CLI environment loader and invoke it only from the executable entry point.
3. Run focused tests and the direct live-smoke command.
4. Run the full unit suite and production build.
5. Merge the verified branch into local `main` and remove the worktree.
