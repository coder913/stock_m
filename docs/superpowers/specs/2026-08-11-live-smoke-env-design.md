# Live Smoke Environment Loading Design

## Goal

Make `npm run test:data:smoke` load provider configuration from the project-root `.env` when invoked directly, without making imported tests depend on the developer's local secrets.

## Design

- Keep `runLiveSmoke(environment, output)` pure and injectable.
- Add a loader used only by the command-line entry point.
- Read exactly `.env` from the current project directory.
- Preserve standard precedence: already supplied process environment variables override `.env` values.
- Treat a missing `.env` as an unconfigured smoke run, but surface other read/parse failures.
- Never print credentials or environment values.
- Print a final count of checks that actually ran and checks that were skipped.

The smoke remains read-only: market-data checks fetch provider data, while Alpaca Paper only reads account, asset, open orders, and activities.

## Verification

Unit tests use temporary directories to prove `.env` loading and environment precedence without reading the real workspace environment. The direct smoke command must then either execute configured checks or report explicit skips and an accurate summary.
