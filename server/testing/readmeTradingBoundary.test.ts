// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("README states the Paper-only trading boundary without denying Paper broker orders", () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  expect(readme).toContain("当前版本不包含 Live Trading；仅支持 Alpaca Paper");
  expect(readme).not.toContain("当前版本不包含真实券商下单");
});
