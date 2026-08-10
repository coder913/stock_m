import webPush, { type RequestOptions, type SendResult } from "web-push";
import type { WebPushSubscription } from "./subscriptionCrypto";

export const pushRetryDelaysMs = [60_000, 300_000, 900_000, 3_600_000] as const;

export interface PushPayload {
  alertId: string;
  symbol: string;
  severity: "low" | "medium" | "high";
  title: string;
  explanation: string;
  url: string;
}

export function createPushPayload(payload: PushPayload): PushPayload {
  if (!payload.url.startsWith("/") || payload.url.startsWith("//")) throw new TypeError("Push URL must be a relative same-origin path");
  const normalized = { ...payload };
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 3_000) throw new TypeError("Push payload must not exceed 3,000 bytes");
  return normalized;
}

export type PushFailureDecision = { action: "invalidate" } | { action: "retry"; delaysMs: readonly number[] } | { action: "terminal" };

export function classifyPushFailure(error: unknown): PushFailureDecision {
  const failure = error as { statusCode?: number; code?: string; name?: string } | undefined;
  if (failure?.statusCode === 404 || failure?.statusCode === 410) return { action: "invalidate" };
  if (failure?.statusCode === 429 || (failure?.statusCode !== undefined && failure.statusCode >= 500) || failure?.code === "ETIMEDOUT" || failure?.name === "AbortError") {
    return { action: "retry", delaysMs: pushRetryDelaysMs };
  }
  return { action: "terminal" };
}

type SendNotification = (subscription: webPush.PushSubscription, payload?: string | Buffer | null, options?: RequestOptions) => Promise<SendResult>;

export class PushProvider {
  private readonly sendNotification: SendNotification;

  constructor(private readonly config: { subject: string; publicKey: string; privateKey: string; sendNotification?: SendNotification }) {
    this.sendNotification = config.sendNotification ?? webPush.sendNotification.bind(webPush);
  }

  async send(subscription: WebPushSubscription, payload: PushPayload): Promise<void> {
    const validPayload = createPushPayload(payload);
    await this.sendNotification(subscription, JSON.stringify(validPayload), {
      TTL: 300,
      urgency: validPayload.severity === "high" ? "high" : "normal",
      vapidDetails: { subject: this.config.subject, publicKey: this.config.publicKey, privateKey: this.config.privateKey },
    });
  }
}

export function pushFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  const failure = error as { statusCode?: number; code?: string } | undefined;
  return `Push failed${failure?.statusCode ? ` (${failure.statusCode})` : failure?.code ? ` (${failure.code})` : ""}`;
}
