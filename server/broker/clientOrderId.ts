import { createHash } from "node:crypto";

export function clientOrderIdFor(intentId: string): string {
  const digest = createHash("sha256").update(intentId, "utf8").digest("base64url").toLowerCase();
  return `stockm-${digest}`;
}
