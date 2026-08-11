// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("the Paper sandbox record contains completed real partial-fill evidence", () => {
  const record = readFileSync(
    new URL("../../docs/runbooks/alpaca-paper-sandbox-acceptance-2026-08-11.md", import.meta.url),
    "utf8",
  );

  expect(record).toContain("## 真实部分成交验收（已通过）");
  expect(record).toContain("85ce92f6-1b89-4463-bdd8-a22dc5982526");
  expect(record).toContain("3/10 → 6/10 → 8/10 → 10/10");
  expect(record).toContain("最终 AAPL 持仓：`0`");
  expect(record).toContain("未完成订单：`0`");
  expect(record).toContain("live-smoke: ok=4 skipped=0");
  expect(record).not.toContain("## 尚未观察");
});
