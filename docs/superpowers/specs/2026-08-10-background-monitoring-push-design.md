# Background Monitoring and Web Push Design

**Date:** 2026-08-10  
**Status:** Approved in design review  
**Depends on:** Completed server-persistence milestone

## 1. Goal

Evaluate investment-thesis conditions while the page is closed, persist deterministic results and alerts, and deliver opt-in application and browser system notifications. Data degradation must preserve the last valid monitoring conclusion and must never create a trading command.

## 2. Service Responsibilities

### Monitor Worker

- Owns scheduled monitor runs and condition evaluation writes.
- Requests normalized snapshots from the internal market-data API.
- Reuses the current pure `conditionEvaluator` semantics.
- Writes evaluations, alert facts and Outbox events transactionally.
- Records heartbeats, queue lag, provider state and run diagnostics.

### Notification Worker

- Consumes `monitor.alert.created` events.
- Creates one delivery per active Push subscription and alert.
- Sends payloads through Web Push using server-side VAPID credentials.
- Records attempts, retry schedule, terminal failure and subscription invalidation.
- Never evaluates conditions or changes alert state.

### API and PWA

- API manages notification subscriptions and immutable user alert actions.
- The Service Worker displays notifications and handles deep-link clicks.
- The settings UI controls permission, subscription, test notification and revocation.
- Today, Research and Monitor pages read the same server alerts and evaluations.

## 3. Scheduling Model

All natural periods and market-session calculations use `America/New_York` and the U.S. equity calendar supplied by the market gateway.

| Condition group | Schedule | Natural run key |
| --- | --- | --- |
| Price and intraday market metrics | Every five minutes during regular market hours | `price:YYYY-MM-DDTHH:mm` rounded to five minutes |
| Financial metrics | Once daily after 18:00 ET | `financial:YYYY-MM-DD` |
| News and company/macro events | Once daily after 18:15 ET | `event:YYYY-MM-DD` |

BullMQ repeatable jobs enqueue group runs rather than one job per condition. A run loads the active latest thesis versions, batches symbols and evaluates their conditions. `(run_type, natural_period)` is unique in PostgreSQL, so duplicate scheduler deliveries converge on one run.

On worker startup, the scheduler compares each group’s latest successful natural period with the current required period. If a planned window was missed, it enqueues only the most recent catch-up run. It does not replay every missing five-minute interval.

## 4. Evaluation and Alert Rules

- Only a `fresh` snapshot with all required fields can change a condition to confirmed or breached.
- `stale`, `missing` and `unavailable` evaluations use the existing waiting explanations and retain the last fresh effective status.
- Deadlines and event windows use market/date semantics already defined by the monitoring domain.
- A monitor alert is unique by condition ID, condition version, from/to status and natural period.
- Duplicate queue delivery or worker restart cannot create another alert with the same key.
- User actions—read, snooze, archive and review decision—append action rows. They do not rewrite alert facts or evaluations.
- An alert may deep-link to an order ticket, but it cannot pre-confirm, queue or send an order.

## 5. Web Push Lifecycle

The PWA registers a Service Worker in production and E2E builds. The settings page explains notification behavior before requesting permission; permission is requested only after the user clicks “Enable system notifications.”

`POST /api/v1/notifications/subscriptions` accepts a Push subscription and user agent with an idempotency key derived from the endpoint hash. Endpoint, `p256dh` and `auth` values are encrypted at rest with a server environment key. `DELETE` revokes the subscription. The API never returns private subscription material after creation.

Notification payloads contain only alert ID, symbol, severity, concise title, concise explanation and a same-origin relative deep link such as `/stocks/NVDA?alert=<id>`. They contain no provider keys, full thesis body, account balance or order data.

When a push is clicked, the Service Worker focuses an existing application window or opens one, navigates to the deep link and lets the page fetch current alert details from the API.

## 6. Retry, Degradation and Recovery

- Provider `429`, `503`, stale fallback or missing data: persist a waiting evaluation; do not transition the effective condition status and do not send a false recovery/breach notification.
- Redis restart/loss: recreate repeatable jobs from PostgreSQL schedule definitions and republish pending Outbox events.
- Duplicate BullMQ delivery: Inbox and alert uniqueness constraints make the second delivery a no-op.
- Push timeout or `5xx`: retry with exponential backoff at 1, 5, 15 and 60 minutes, then move the delivery to a PostgreSQL dead-letter record.
- Push `404` or `410`: mark the subscription invalid and stop retrying it; retain the application alert.
- Permission revoked in the browser: the next open detects the mismatch and revokes the server subscription.
- Monitor Worker unavailable: task health becomes degraded; no other service fabricates evaluations.
- Notification Worker unavailable: alerts remain immediately visible in the application and pending deliveries resume from Outbox after recovery.

## 7. User Experience

Notification settings show:

- browser permission and server subscription status;
- last successful delivery and last failure;
- a test-notification button;
- enable, re-subscribe and revoke actions;
- an explanation that Docker services and network access must be running for page-closed notifications.

The monitor center adds task health for each schedule group: last started, last succeeded, last data state, next planned run and queue delay. A user can request one manual refresh; the same natural run key prevents overlap with a scheduled job.

Today and Research preserve their current review flows. A system notification deep-link highlights the same alert and evidence that the application inbox displays.

## 8. Configuration and Security

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `PUSH_SUBSCRIPTION_ENCRYPTION_KEY` are required to enable Push.
- Missing Push configuration disables subscription UI but does not disable background monitoring or application alerts.
- Internal API requests use the Compose-only service token.
- Push payload and structured logs are redacted and size-bounded.
- Service Worker scope is limited to the application origin.

## 9. Testing and Completion Criteria

- Unit tests cover natural period keys across DST, market closures, startup catch-up, alert dedupe and retry classification.
- Integration tests use real PostgreSQL/Redis to verify repeatable job reconstruction, competing workers, Inbox dedupe, Outbox replay and dead-letter transitions.
- Contract tests use a fake Push endpoint and fixture market snapshots for fresh, stale, missing, `429` and `503` states.
- Service Worker tests cover push display, existing-window focus and deep-link navigation.
- Chrome E2E subscribes through a fixture Push service, closes the page, advances the deterministic worker clock, receives a notification event, clicks it and verifies the highlighted alert.
- A Redis-reset E2E proves schedules recover without duplicate alerts or deliveries.
- Production scans confirm no test-only trigger route or fixture provider is registered by normal startup.

Milestone 2 is complete only when monitoring continues with the page closed, service restart performs exactly one required catch-up, stale provider data cannot flip a conclusion, and one status transition produces one application alert and at most one successful notification per subscription.

## 10. Non-Goals

- Email, SMS or mobile-app push.
- User-configurable per-condition schedules.
- Automatic trading or queued order creation.
- Replaying every missed intraday interval.
