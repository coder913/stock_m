import type { PushPayload } from "../notifications/pushProvider";
import type { WebPushSubscription } from "../notifications/subscriptionCrypto";

export interface CapturedPush extends PushPayload { endpoint: string; capturedAt: string; }

export class FakePushProvider {
  private readonly captured: CapturedPush[] = [];
  constructor(private readonly now: () => Date) {}
  async send(subscription: WebPushSubscription, payload: PushPayload): Promise<void> {
    this.captured.push(structuredClone({ ...payload, endpoint: subscription.endpoint, capturedAt: this.now().toISOString() }));
  }
  list(): CapturedPush[] { return structuredClone(this.captured); }
  clear(): void { this.captured.length = 0; }
}
