import type { PushSubscriptionRepository } from "./pushSubscriptionRepository";
import type { NotificationDeliveryView, NotificationRepository } from "./notificationRepository";
import { classifyPushFailure, createPushPayload, pushFailureMessage, pushRetryDelaysMs, type PushPayload } from "./pushProvider";

export interface NotificationEvent {
  eventId: string;
  topic: "monitor.alert.created" | "notification.test.requested";
  payload: unknown;
}

interface PushSender { send(subscription: Awaited<ReturnType<PushSubscriptionRepository["loadActive"]>>[number]["subscription"], payload: PushPayload): Promise<void>; }
interface RetryScheduler { retry(deliveryId: string, delayMs: number): Promise<unknown> | unknown; }

function statusCode(error: unknown): number | undefined { return (error as { statusCode?: number } | undefined)?.statusCode; }

function payloadFor(event: NotificationEvent): PushPayload {
  if (event.topic === "notification.test.requested") return createPushPayload({ alertId: `test:${event.eventId}`, symbol: "TEST", severity: "low", title: "Stock M 通知测试", explanation: "浏览器系统通知已连接。", url: "/settings/notifications" });
  const alert = event.payload as { id?: unknown; symbol?: unknown; severity?: unknown; title?: unknown; explanation?: unknown };
  if (typeof alert.id !== "string" || typeof alert.symbol !== "string" || !["low", "medium", "high"].includes(String(alert.severity)) || typeof alert.title !== "string" || typeof alert.explanation !== "string") throw new TypeError("Invalid monitor alert notification event");
  return createPushPayload({ alertId: alert.id, symbol: alert.symbol, severity: alert.severity as PushPayload["severity"], title: alert.title, explanation: alert.explanation, url: `/stocks/${encodeURIComponent(alert.symbol)}?alert=${encodeURIComponent(alert.id)}` });
}

export class NotificationService {
  constructor(private readonly dependencies: {
    repository: Pick<NotificationRepository, "prepare" | "get" | "recordAttempt" | "markSucceeded" | "markRetry" | "markTerminal">;
    subscriptions: Pick<PushSubscriptionRepository, "listActiveIds" | "loadActiveById" | "invalidate">;
    provider: PushSender;
    scheduler: RetryScheduler;
  }) {}

  async consume(event: NotificationEvent): Promise<void> {
    const payload = payloadFor(event);
    const activeIds = await this.dependencies.subscriptions.listActiveIds();
    const alertId = payload.alertId;
    const deliveries = await this.dependencies.repository.prepare(event.eventId, alertId, payload, activeIds);
    for (const delivery of deliveries) {
      if (delivery.status !== "pending") continue;
      const subscription = await this.dependencies.subscriptions.loadActiveById(delivery.subscriptionId);
      if (subscription) await this.deliver(delivery, subscription.subscription, payload);
    }
  }

  async retry(deliveryId: string): Promise<void> {
    const delivery = await this.dependencies.repository.get(deliveryId);
    if (!delivery || delivery.status !== "pending") return;
    const subscription = await this.dependencies.subscriptions.loadActiveById(delivery.subscriptionId);
    if (!subscription) { await this.dependencies.repository.markTerminal(delivery.id, "invalid", "Subscription is no longer active", delivery.eventId); return; }
    await this.deliver(delivery, subscription.subscription, delivery.payload);
  }

  private async deliver(delivery: NotificationDeliveryView, subscription: Awaited<ReturnType<PushSubscriptionRepository["loadActive"]>>[number]["subscription"], payload: PushPayload): Promise<void> {
    try {
      await this.dependencies.provider.send(subscription, payload);
      await this.dependencies.repository.recordAttempt(delivery.id, { outcome: "succeeded" });
      await this.dependencies.repository.markSucceeded(delivery.id);
    } catch (error) {
      const message = pushFailureMessage(error);
      const decision = classifyPushFailure(error);
      if (decision.action === "invalidate") {
        await this.dependencies.repository.recordAttempt(delivery.id, { outcome: "invalid", statusCode: statusCode(error), error: message });
        await this.dependencies.subscriptions.invalidate(delivery.subscriptionId);
        await this.dependencies.repository.markTerminal(delivery.id, "invalid", message);
        return;
      }
      if (decision.action === "retry" && delivery.attemptCount < pushRetryDelaysMs.length) {
        const delay = pushRetryDelaysMs[delivery.attemptCount];
        await this.dependencies.repository.recordAttempt(delivery.id, { outcome: "retry", statusCode: statusCode(error), error: message });
        await this.dependencies.repository.markRetry(delivery.id, delay, message);
        await this.dependencies.scheduler.retry(delivery.id, delay);
        return;
      }
      await this.dependencies.repository.recordAttempt(delivery.id, { outcome: "failed", statusCode: statusCode(error), error: message });
      await this.dependencies.repository.markTerminal(delivery.id, "dead_letter", message, delivery.eventId);
    }
  }
}
