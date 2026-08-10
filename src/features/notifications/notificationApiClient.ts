import { ApiClient } from "../../app/apiClient";

export interface BrowserPushSubscriptionJson {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export interface PushSubscriptionView {
  id: string;
  endpointHash: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
  invalidAt?: string;
}

export interface NotificationStatus {
  configured: boolean;
  publicKey?: string;
  subscriptions: PushSubscriptionView[];
}

export interface NotificationApi {
  getStatus(): Promise<NotificationStatus>;
  subscribe(subscription: BrowserPushSubscriptionJson, userAgent: string, idempotencyKey: string): Promise<PushSubscriptionView>;
  revoke(endpointHash: string, idempotencyKey: string): Promise<{ revoked: boolean }>;
  test(idempotencyKey: string): Promise<{ accepted: boolean }>;
}

export class NotificationApiClient implements NotificationApi {
  constructor(private readonly client = new ApiClient("/api/v1")) {}
  getStatus(): Promise<NotificationStatus> { return this.client.requestJson({ path: "/notifications/status" }); }
  subscribe(subscription: BrowserPushSubscriptionJson, userAgent: string, idempotencyKey: string): Promise<PushSubscriptionView> {
    return this.client.requestJson({ method: "POST", path: "/notifications/subscriptions", body: { subscription, userAgent }, idempotencyKey });
  }
  revoke(endpointHash: string, idempotencyKey: string): Promise<{ revoked: boolean }> {
    return this.client.requestJson({ method: "DELETE", path: `/notifications/subscriptions/${encodeURIComponent(endpointHash)}`, idempotencyKey });
  }
  test(idempotencyKey: string): Promise<{ accepted: boolean }> {
    return this.client.requestJson({ method: "POST", path: "/notifications/test", body: {}, idempotencyKey });
  }
}
