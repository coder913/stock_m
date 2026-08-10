// @vitest-environment node
import { expect, test, vi } from "vitest";
import { PushProvider, classifyPushFailure, createPushPayload } from "./pushProvider";

test("classifies invalid, transient, timeout, and terminal Push failures", () => {
  expect(classifyPushFailure({ statusCode: 410 })).toEqual({ action: "invalidate" });
  expect(classifyPushFailure({ statusCode: 404 })).toEqual({ action: "invalidate" });
  expect(classifyPushFailure({ statusCode: 503 })).toEqual({ action: "retry", delaysMs: [60_000, 300_000, 900_000, 3_600_000] });
  expect(classifyPushFailure({ statusCode: 429 })).toEqual({ action: "retry", delaysMs: [60_000, 300_000, 900_000, 3_600_000] });
  expect(classifyPushFailure({ code: "ETIMEDOUT" })).toEqual({ action: "retry", delaysMs: [60_000, 300_000, 900_000, 3_600_000] });
  expect(classifyPushFailure({ statusCode: 400 })).toEqual({ action: "terminal" });
});

test("accepts concise relative deep links and rejects external or oversized payloads", () => {
  expect(createPushPayload({ alertId: "alert-1", symbol: "NVDA", severity: "high", title: "风险条件触发", explanation: "价格跌破阈值", url: "/stocks/NVDA?alert=alert-1" }).url).toBe("/stocks/NVDA?alert=alert-1");
  expect(() => createPushPayload({ alertId: "1", symbol: "NVDA", severity: "high", title: "x", explanation: "x", url: "https://evil.example" })).toThrow("relative");
  expect(() => createPushPayload({ alertId: "1", symbol: "NVDA", severity: "high", title: "x", explanation: "x".repeat(3_001), url: "/stocks/NVDA" })).toThrow("3,000");
});

test("passes only the validated JSON payload to web-push", async () => {
  const sendNotification = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
  const provider = new PushProvider({ subject: "mailto:owner@example.com", publicKey: "public", privateKey: "private", sendNotification });
  const payload = createPushPayload({ alertId: "alert-1", symbol: "NVDA", severity: "high", title: "title", explanation: "body", url: "/stocks/NVDA" });
  await provider.send({ endpoint: "https://push.example/1", expirationTime: null, keys: { p256dh: "key", auth: "auth" } }, payload);
  expect(sendNotification).toHaveBeenCalledWith(expect.anything(), JSON.stringify(payload), expect.objectContaining({ vapidDetails: expect.objectContaining({ subject: "mailto:owner@example.com" }) }));
});
