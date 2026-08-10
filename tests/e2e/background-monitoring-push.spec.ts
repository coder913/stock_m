import type { APIRequestContext, BrowserContext } from "@playwright/test";
import { expect, test } from "./fixtures";

async function installPushBrowserFixture(context: BrowserContext) {
  await context.addInitScript(() => {
    const serialized = { endpoint: "https://push.fixture.test/browser-one", expirationTime: null, keys: { p256dh: "fixture-client-key", auth: "fixture-auth-secret" } };
    const subscription = { endpoint: serialized.endpoint, toJSON: () => serialized, unsubscribe: async () => true };
    const registration = { pushManager: { getSubscription: async () => (window as any).__pushEnabled ? subscription : null, subscribe: async () => { (window as any).__pushEnabled = true; return subscription; } } };
    Object.defineProperty(window, "PushManager", { value: class PushManager {}, configurable: true });
    Object.defineProperty(window, "Notification", { value: { permission: "default", requestPermission: async () => { (window as any).__pushEnabled = true; return "granted"; } }, configurable: true });
    Object.defineProperty(navigator, "serviceWorker", { value: { ready: Promise.resolve(registration), register: async () => registration, addEventListener: () => undefined }, configurable: true });
    (window as any).__stockMNotificationTest = {
      dispatch(payload: { url: string }) { sessionStorage.setItem("captured-push", JSON.stringify(payload)); },
      click() { const payload = JSON.parse(sessionStorage.getItem("captured-push") ?? "{}"); location.assign(typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//") ? payload.url : "/"); },
    };
  });
}

async function createRiskCondition(request: APIRequestContext) {
  const thesis = await request.post("/api/v1/theses", { headers: { "Idempotency-Key": "push-thesis" }, data: { symbol: "NVDA", coreJudgment: "AI demand remains strong", evidence: ["data-center demand"], risks: ["valuation"], validationConditions: ["price below risk threshold"] } });
  expect(thesis.status()).toBe(201);
  const version = await thesis.json();
  const conditions = await request.post(`/api/v1/theses/${version.id}/conditions`, { headers: { "Idempotency-Key": "push-condition" }, data: { symbol: "NVDA", conditions: [{ id: "push-risk-price", kind: "metric", name: "估值风险", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT" }] } });
  expect(conditions.status()).toBe(201);
  return (await conditions.json())[0] as { id: string; conditionVersion: string };
}

async function recordFreshBaseline(request: APIRequestContext, condition: { id: string; conditionVersion: string }) {
  const response = await request.post("/api/v1/monitor/evaluations", { headers: { "Idempotency-Key": "push-baseline-evaluation" }, data: { id: "push-baseline-evaluation", conditionId: condition.id, conditionVersion: condition.conditionVersion, status: "confirmed", dataState: "fresh", actualValue: 167.32, targetValue: 180, source: "alpaca", asOf: "2026-08-07T14:00:00.000Z", explanation: "风险条件未触发", evaluatedAt: "2026-08-07T14:00:00.000Z", changed: true, previousStatus: "pending" } });
  expect(response.status()).toBe(201);
}

async function runPriceCycle(request: APIRequestContext) {
  expect((await request.post("/api/testing/clock/advance", { data: { minutes: 5 } })).ok()).toBeTruthy();
  const response = await request.post("/api/testing/monitor/run", { data: { type: "price" } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("delivers one page-closed Push and opens the alert deep link without duplicate delivery", async ({ context, page, request }) => {
  await installPushBrowserFixture(context);
  await page.goto("/settings/notifications");
  await expect(page.getByText("尚未启用系统通知")).toBeVisible();
  await page.getByRole("button", { name: "启用系统通知" }).click();
  await expect(page.getByText("系统通知已启用")).toBeVisible();
  const condition = await createRiskCondition(request);
  await recordFreshBaseline(request, condition);
  await request.post("/api/testing/push/clear");
  await page.close();

  await request.post("/api/testing/market-state", { data: { symbol: "NVDA", price: 190, previousClose: 167.32 } });
  await runPriceCycle(request);
  const captures = await request.get("/api/testing/push/captures").then((response) => response.json());
  expect(captures).toHaveLength(1);
  expect(captures[0]).toMatchObject({ alertId: expect.any(String), symbol: "NVDA", severity: "high" });

  await request.post("/api/testing/outbox/replay");
  expect(await request.get("/api/testing/push/captures").then((response) => response.json())).toHaveLength(1);
  await expect(request.get("/api/testing/database-state").then((response) => response.json())).resolves.toMatchObject({ alerts: 1, notificationDeliveries: 1, successfulDeliveries: 1 });

  const notificationPage = await context.newPage();
  await notificationPage.goto("/");
  await notificationPage.evaluate((payload) => { (window as any).__stockMNotificationTest.dispatch(payload); (window as any).__stockMNotificationTest.click(); }, captures[0]);
  await expect(notificationPage).toHaveURL(new RegExp(`/stocks/NVDA\\?alert=${captures[0].alertId}$`));
  await expect(notificationPage.getByText(`已定位提醒 ${captures[0].alertId}`)).toBeVisible();
});

test("keeps the last fresh decision on 429 and rebuilds schedules after Redis reset", async ({ request }) => {
  const condition = await createRiskCondition(request);
  await recordFreshBaseline(request, condition);
  await request.post("/api/testing/fail-next", { data: { source: "alpaca", code: 429 } });
  await runPriceCycle(request);
  const state = await request.get(`/api/v1/monitor/conditions/${condition.id}`).then((response) => response.json());
  expect(state.latest).toMatchObject({ dataState: "stale", status: "confirmed" });
  expect(state.effective).toMatchObject({ dataState: "fresh", status: "confirmed" });
  const before = await request.get("/api/testing/database-state").then((response) => response.json());
  const rebuilt = await request.post("/api/testing/redis/flush").then((response) => response.json());
  expect(rebuilt.schedulers).toBe(3);
  const after = await request.get("/api/testing/database-state").then((response) => response.json());
  expect(after.alerts).toBe(before.alerts);
});
