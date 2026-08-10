import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface WebPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export interface EncryptedSubscription {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function requireKey(key: Buffer): void {
  if (key.length !== 32) throw new TypeError("Push subscription encryption key must be 32 bytes");
}

export function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function encryptSubscription(subscription: WebPushSubscription, key: Buffer, nonce = randomBytes(12)): EncryptedSubscription {
  requireKey(key);
  if (nonce.length !== 12) throw new TypeError("AES-GCM nonce must be 12 bytes");
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(subscription), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: nonce.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptSubscription(encrypted: EncryptedSubscription, key: Buffer): WebPushSubscription {
  requireKey(key);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as WebPushSubscription;
}
