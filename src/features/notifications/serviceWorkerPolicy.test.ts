import { expect, test } from "vitest";
import { safeNotificationPath } from "./serviceWorkerPolicy";

test("allows only relative same-origin notification deep links", () => {
  expect(safeNotificationPath("/stocks/NVDA?alert=one")).toBe("/stocks/NVDA?alert=one");
  expect(safeNotificationPath("https://evil.example/stocks/NVDA")).toBe("/");
  expect(safeNotificationPath("//evil.example/stocks/NVDA")).toBe("/");
  expect(safeNotificationPath("javascript:alert(1)")).toBe("/");
});
