// @vitest-environment node
import { expect, test } from "vitest";
import { loadServerConfig } from "./config";

test("exposes provider configuration without exposing provider secrets", () => {
  const config = loadServerConfig({
    ALPACA_API_KEY_ID: "alpaca-id",
    ALPACA_API_SECRET_KEY: "alpaca-secret",
    SEC_USER_AGENT: "stock_m owner@example.com",
  });

  expect(config.host).toBe("127.0.0.1");
  expect(config.providers.alpaca.configured).toBe(true);
  expect(JSON.stringify(config.publicStatus)).not.toContain("alpaca-secret");
});

test("rejects a SEC user agent without a contact email", () => {
  expect(() => loadServerConfig({ SEC_USER_AGENT: "stock_m" }))
    .toThrow("SEC_USER_AGENT 必须包含联系邮箱");
});
