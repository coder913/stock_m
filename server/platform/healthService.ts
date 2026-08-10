import { sql, type Kysely } from "kysely";
import type { MarketDataCache, CacheHealth } from "../core/providerTypes";
import type { Database } from "../db/types";

export interface ReadinessPayload {
  ready: boolean;
  services: { postgres: "ready" | "unavailable"; redis: "ready" | "degraded" };
  migrationVersion: string;
  cache: CacheHealth;
}

export interface HealthServiceDependencies {
  postgres(): Promise<{ migrationVersion: string }>;
  redis(): Promise<string>;
  cache: Pick<MarketDataCache, "health">;
}

export class HealthService {
  constructor(private readonly dependencies: HealthServiceDependencies) {}

  liveness(): { live: true } { return { live: true }; }

  async readiness(): Promise<ReadinessPayload> {
    const [postgres, redis, cache] = await Promise.allSettled([
      this.dependencies.postgres(), this.dependencies.redis(), this.dependencies.cache.health(),
    ]);
    return {
      ready: postgres.status === "fulfilled",
      services: { postgres: postgres.status === "fulfilled" ? "ready" : "unavailable", redis: redis.status === "fulfilled" && redis.value === "PONG" ? "ready" : "degraded" },
      migrationVersion: postgres.status === "fulfilled" ? postgres.value.migrationVersion : "unknown",
      cache: cache.status === "fulfilled" ? cache.value : { writable: false, entries: 0 },
    };
  }
}

export function createHealthService(database: Kysely<Database>, redis: { ping(): Promise<string> }, cache: Pick<MarketDataCache, "health">): HealthService {
  return new HealthService({
    postgres: async () => {
      await sql`select 1`.execute(database);
      const migration = await database.selectFrom("platform.schema_migration").select("name").orderBy("name", "desc").executeTakeFirst();
      return { migrationVersion: migration?.name ?? "none" };
    },
    redis: () => redis.ping(),
    cache,
  });
}
