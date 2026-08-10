// @vitest-environment node
import { expect, test, vi } from "vitest";
import { HealthService } from "./healthService";

test("reports PostgreSQL unavailability as not ready without leaking probe errors", async () => {
  const service = new HealthService({
    postgres: vi.fn(async () => { throw new Error("postgresql://secret-user:secret-password@db/stock_m"); }),
    redis: vi.fn(async () => "PONG"),
    cache: { health: async () => ({ writable: false, entries: 0 }) },
  });

  const result = await service.readiness();

  expect(result).toEqual({ ready: false, services: { postgres: "unavailable", redis: "ready" }, migrationVersion: "unknown", cache: { writable: false, entries: 0 } });
  expect(JSON.stringify(result)).not.toContain("secret-password");
});

test("reports Redis failure as degraded while PostgreSQL-backed commands remain ready", async () => {
  const service = new HealthService({
    postgres: vi.fn(async () => ({ migrationVersion: "006_market_cache" })),
    redis: vi.fn(async () => { throw new Error("redis://token@redis"); }),
    cache: { health: async () => ({ writable: true, entries: 4, oldestFetchedAt: "2026-08-10T09:00:00.000Z" }) },
  });

  expect(await service.readiness()).toEqual({
    ready: true,
    services: { postgres: "ready", redis: "degraded" },
    migrationVersion: "006_market_cache",
    cache: { writable: true, entries: 4, oldestFetchedAt: "2026-08-10T09:00:00.000Z" },
  });
  expect(service.liveness()).toEqual({ live: true });
});
