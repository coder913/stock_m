// @vitest-environment node
import { expect, test } from "vitest";
import { loadServerConfig } from "./config";

const serviceEnvironment = {
  DATABASE_URL: "postgresql://stock_m:stock_m@postgres:5432/stock_m",
  REDIS_URL: "redis://redis:6379",
  INTERNAL_SERVICE_TOKEN: "test-internal-service-token",
};

test("exposes provider configuration without exposing provider secrets", () => {
  const config = loadServerConfig({
    ...serviceEnvironment,
    ALPACA_API_KEY_ID: "alpaca-id",
    ALPACA_API_SECRET_KEY: "alpaca-secret",
    SEC_USER_AGENT: "stock_m owner@example.com",
  });

  expect(config.host).toBe("127.0.0.1");
  expect(config.providers.alpaca.configured).toBe(true);
  expect(JSON.stringify(config.publicStatus)).not.toContain("alpaca-secret");
});

test("rejects a SEC user agent without a contact email", () => {
  expect(() => loadServerConfig({ ...serviceEnvironment, SEC_USER_AGENT: "stock_m" }))
    .toThrow("SEC_USER_AGENT 必须包含联系邮箱");
});

test("requires postgres, redis, and an internal service token", () => {
  expect(() => loadServerConfig({ SEC_USER_AGENT: "stock_m test@example.com" })).toThrow();
});

test("treats blank optional provider variables from Compose as unconfigured", () => {
  const config = loadServerConfig({ ...serviceEnvironment, SEC_USER_AGENT: "stock_m test@example.com", ALPACA_API_KEY_ID: "", ALPACA_API_SECRET_KEY: "", FINNHUB_API_KEY: "", FRED_API_KEY: "" });
  expect(config.providers).toMatchObject({ alpaca: { configured: false }, finnhub: { configured: false }, fred: { configured: false } });
});
