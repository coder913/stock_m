import type { BrowserPushSubscriptionJson, NotificationApi } from "./notificationApiClient";

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(value.length + ((4 - value.length % 4) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function hashPushEndpoint(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function serialize(subscription: PushSubscription): BrowserPushSubscriptionJson {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) throw new TypeError("Browser returned an incomplete Push subscription");
  return { endpoint: value.endpoint, expirationTime: value.expirationTime ?? null, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

export async function subscribeBrowserPush(registration: ServiceWorkerRegistration, publicKey: string, api: Pick<NotificationApi, "subscribe">, userAgent: string): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const subscriptionJson = serialize(subscription);
  const hash = await hashPushEndpoint(subscription.endpoint);
  await api.subscribe(subscriptionJson, userAgent, `push-subscription-${hash}`);
  return subscription;
}

export async function revokeBrowserPush(subscription: PushSubscription, api: Pick<NotificationApi, "revoke">): Promise<void> {
  const hash = await hashPushEndpoint(subscription.endpoint);
  await api.revoke(hash, `push-revoke-${hash}`);
  await subscription.unsubscribe();
}
