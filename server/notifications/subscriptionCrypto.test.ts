// @vitest-environment node
import { expect, test } from "vitest";
import { decryptSubscription, encryptSubscription } from "./subscriptionCrypto";

const subscription = { endpoint: "https://push.example/subscription/1", expirationTime: null, keys: { p256dh: "public-client-key", auth: "private-auth-secret" } };
const key = Buffer.alloc(32, 7);

test("AES-256-GCM round trips without retaining plaintext secrets", () => {
  const encrypted = encryptSubscription(subscription, key, Buffer.alloc(12, 3));
  expect(JSON.stringify(encrypted)).not.toContain(subscription.keys.auth);
  expect(JSON.stringify(encrypted)).not.toContain(subscription.endpoint);
  expect(decryptSubscription(encrypted, key)).toEqual(subscription);
});

test("rejects decryption with the wrong key", () => {
  const encrypted = encryptSubscription(subscription, key, Buffer.alloc(12, 3));
  expect(() => decryptSubscription(encrypted, Buffer.alloc(32, 8))).toThrow();
});
