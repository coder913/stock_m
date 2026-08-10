// @vitest-environment node
import { expect, test, vi } from "vitest";
import { NotificationService } from "./notificationService";

const alertEvent = { eventId: "event-1", topic: "monitor.alert.created", payload: { id: "alert-1", symbol: "NVDA", severity: "high", title: "风险条件触发", explanation: "价格跌破阈值" } } as const;

test("creates and successfully sends one delivery when the same alert event is consumed twice", async () => {
  const delivery = { id: "delivery-1", alertId: "alert-1", subscriptionId: "sub-1", status: "pending" as const, attemptCount: 0 };
  const repository = {
    prepare: vi.fn(async () => [delivery]),
    get: vi.fn(async () => delivery),
    recordAttempt: vi.fn(async () => undefined),
    markSucceeded: vi.fn(async () => { delivery.status = "succeeded" as never; }),
    markRetry: vi.fn(async () => undefined),
    markTerminal: vi.fn(async () => undefined),
  };
  const active = { id: "sub-1", endpointHash: "hash", subscription: { endpoint: "https://push.example/1", expirationTime: null, keys: { p256dh: "key", auth: "auth" } } };
  const subscriptions = { listActiveIds: vi.fn(async () => ["sub-1"]), loadActiveById: vi.fn(async () => active), invalidate: vi.fn() };
  const provider = { send: vi.fn(async () => undefined) };
  const scheduler = { retry: vi.fn(async () => undefined) };
  const service = new NotificationService({ repository: repository as never, subscriptions: subscriptions as never, provider, scheduler });
  await service.consume(alertEvent);
  await service.consume(alertEvent);
  expect(repository.prepare).toHaveBeenCalledTimes(2);
  expect(provider.send).toHaveBeenCalledTimes(1);
  expect(repository.markSucceeded).toHaveBeenCalledTimes(1);
});

test("invalidates gone subscriptions and schedules bounded transient retries", async () => {
  const base = { id: "delivery-1", alertId: "alert-1", subscriptionId: "sub-1", status: "pending" as const, attemptCount: 0 };
  const subscription = { id: "sub-1", endpointHash: "hash", subscription: { endpoint: "https://push.example/1", expirationTime: null, keys: { p256dh: "key", auth: "auth" } } };
  const make = (failure: unknown) => {
    const repository = { prepare: vi.fn(async () => [base]), get: vi.fn(async () => base), recordAttempt: vi.fn(), markSucceeded: vi.fn(), markRetry: vi.fn(), markTerminal: vi.fn() };
    const subscriptions = { listActiveIds: vi.fn(async () => ["sub-1"]), loadActiveById: vi.fn(async () => subscription), invalidate: vi.fn() };
    const scheduler = { retry: vi.fn() };
    return { service: new NotificationService({ repository: repository as never, subscriptions: subscriptions as never, provider: { send: vi.fn(async () => { throw failure; }) }, scheduler }), repository, subscriptions, scheduler };
  };
  const gone = make({ statusCode: 410 });
  await gone.service.consume(alertEvent);
  expect(gone.subscriptions.invalidate).toHaveBeenCalledWith("sub-1");
  expect(gone.repository.markTerminal).toHaveBeenCalledWith("delivery-1", "invalid", expect.any(String));

  const unavailable = make({ statusCode: 503 });
  await unavailable.service.consume(alertEvent);
  expect(unavailable.scheduler.retry).toHaveBeenCalledWith("delivery-1", 60_000);
});
