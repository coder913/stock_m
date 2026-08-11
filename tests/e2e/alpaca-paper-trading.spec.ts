import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

const headers = (key: string) => ({ "idempotency-key": key });

interface PaperOrder {
  id: string;
  symbol: string;
  state: string;
  remoteOrderId?: string;
}

interface TradingState {
  workerGeneration: number;
  submissionCount: number;
  inboxCount: number;
  eventCount: number;
}

async function createOrder(request: APIRequestContext, input: { symbol: string; side: "buy" | "sell"; quantity: string; type: "market" | "limit"; timeInForce: "day" | "gtc"; limitPrice?: string }, key: string) {
  const preview = await request.post("/api/v1/broker/alpaca-paper/order-previews", { headers: headers(`preview-${key}`), data: input });
  expect(preview.ok()).toBeTruthy();
  const token = (await preview.json()).token;
  const intent = await request.post("/api/v1/broker/alpaca-paper/order-intents", { headers: headers(`intent-${key}`), data: { previewToken: token } });
  expect(intent.ok()).toBeTruthy();
  return intent.json();
}

async function orders(request: APIRequestContext): Promise<PaperOrder[]> {
  return (await request.get("/api/v1/portfolio/alpaca-paper/orders")).json();
}

test("browser lifecycle survives worker restart and genuine duplicate delivery", async ({ page, request }) => {
  const marketFailures: string[] = [];
  page.on("requestfailed", (failed) => { if (/\/api\/(market|events)/.test(failed.url())) marketFailures.push(`${failed.method()} ${failed.url()} ${failed.failure()?.errorText ?? "failed"}`); });
  page.on("response", (response) => { if (/\/api\/(market|events)/.test(response.url()) && !response.ok()) marketFailures.push(`${response.request().method()} ${response.url()} ${response.status()}`); });

  await page.clock.setFixedTime(new Date("2026-08-07T14:00:00Z"));
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Alpaca Paper" }).click();
  await page.getByRole("button", { name: "创建 Alpaca Paper 订单" }).click();
  await page.getByLabel("数量").fill("1");
  await page.getByRole("button", { name: "预览订单" }).click();
  await expect(page.getByRole("dialog", { name: "Alpaca Paper 订单确认" })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("AAPL");
  await page.getByRole("button", { name: "提交到 Alpaca Paper" }).click();
  await expect(page.getByRole("status")).toHaveText("订单已进入提交队列");

  const submitted = (await orders(request)).find((order) => order.symbol === "AAPL");
  expect(submitted).toBeTruthy();
  const intentId = submitted!.id;

  const restart = await request.post("/api/testing/trading/worker/restart");
  expect(restart.ok()).toBeTruthy();
  expect((await restart.json()).workerGeneration).toBe(2);
  const processed = await request.post("/api/testing/trading/process");
  expect(processed.ok()).toBeTruthy();

  const accepted = (await orders(request)).find((order) => order.id === intentId)!;
  expect(accepted.state).toBe("accepted");
  expect(accepted.remoteOrderId).toBeTruthy();
  const beforeDuplicate: TradingState = await (await request.get(`/api/testing/trading/state/${intentId}`)).json();
  expect(beforeDuplicate).toMatchObject({ workerGeneration: 2, submissionCount: 1, inboxCount: 1 });

  const duplicate = await request.post(`/api/testing/trading/redeliver/${intentId}`);
  expect(duplicate.ok()).toBeTruthy();
  const afterDuplicate: TradingState = await (await request.get(`/api/testing/trading/state/${intentId}`)).json();
  expect(afterDuplicate).toEqual(beforeDuplicate);

  await request.post(`/api/testing/trading/orders/${accepted.remoteOrderId}/partial-fill`, { data: { quantity: "0.5", price: "100" } });
  await page.getByRole("tab", { name: "订单" }).click();
  await expect(page.getByRole("cell", { name: "部分成交" })).toBeVisible();
  await page.getByRole("button", { name: "查看 AAPL 订单详情" }).click();
  await expect(page.getByText("部分成交", { exact: true }).last()).toBeVisible();

  const cancelResponse = page.waitForResponse((response) => response.url().includes("/cancel-intents") && response.request().method() === "POST");
  await page.getByRole("button", { name: "撤销 AAPL 订单" }).click();
  expect((await cancelResponse).ok()).toBeTruthy();
  await request.post("/api/testing/trading/process");
  expect((await orders(request)).find((order) => order.id === intentId)?.state).toBe("cancel_pending");

  await request.post(`/api/testing/trading/orders/${accepted.remoteOrderId}/fill`, { data: { quantity: "0.5", price: "101" } });
  await page.getByRole("tab", { name: "总览" }).click();
  await page.getByRole("tab", { name: "订单" }).click();
  await expect(page.getByRole("cell", { name: "全部成交" })).toBeVisible();
  await page.getByRole("button", { name: "查看 AAPL 订单详情" }).click();
  const timeline = page.locator(".paper-order-timeline");
  await expect(timeline).toContainText("部分成交");
  await expect(timeline).toContainText("已请求撤单");
  await expect(timeline).toContainText("全部成交");

  const ledger = await (await request.get("/api/v1/portfolio/alpaca-paper/ledger")).json();
  expect(ledger.filter((event: { eventType: string }) => event.eventType === "buy")).toHaveLength(2);
  await page.getByRole("tab", { name: "绩效" }).click();
  await expect(page.getByText("比较基准 SPY")).toBeVisible();
  await expect(page.getByLabel("组合与基准归一化曲线")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("贡献已对账")).toBeVisible();
  expect(marketFailures).toEqual([]);
});

test("ambiguous submission converges and broker drift blocks performance", async ({ page, request }) => {
  await request.post("/api/testing/trading/lost-response");
  const lost = await createOrder(request, { symbol: "MSFT", side: "buy", quantity: "1", type: "market", timeInForce: "day" }, "lost");
  await request.post("/api/testing/trading/process");
  expect((await orders(request)).find((order) => order.id === lost.id)?.remoteOrderId).toBeTruthy();

  await request.post("/api/testing/trading/drift", { data: { cash: 1 } });
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Alpaca Paper" }).click();
  await expect(page.getByText(/Paper 对账不一致/).first()).toBeVisible();
  await expect(page.getByText(/现金差额/)).toBeVisible();
  await page.getByRole("tab", { name: "绩效" }).click();
  await expect(page.getByText("Paper 对账不一致，绩效暂不可用")).toBeVisible();
  await expect(page.getByLabel("绩效摘要")).not.toBeVisible();
});
