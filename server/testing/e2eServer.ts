import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import { buildApp } from "../app";
import { PostgresMarketDataCache } from "../cache/postgresMarketDataCache";
import { MarketDataGateway } from "../core/marketDataGateway";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import type { Database } from "../db/types";
import { PostgresDiscoveryStateRepository } from "../discovery/discoveryStateRepository";
import { BrowserMigrationService } from "../migration/browserMigrationService";
import { PostgresMonitorStateRepository } from "../monitoring/monitorStateRepository";
import { IdempotencyRepository } from "../platform/idempotencyRepository";
import { OutboxRepository } from "../platform/outboxRepository";
import { PostgresManualPortfolioRepository } from "../portfolio/manualPortfolioRepository";
import { PostgresPortfolioReviewRepository } from "../portfolio/portfolioReviewRepository";
import { PostgresThesisRepository } from "../thesis/thesisRepository";
import { UniverseService } from "../universe/universeService";
import { PostgresWatchlistRepository } from "../watchlists/watchlistRepository";
import { createFixtureProviders } from "./createFixtureProviders";
import { resetTestDatabase } from "./resetTestDatabase";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test";
const port = Number(process.env.E2E_PORT ?? 4174);
const initialNow = "2026-08-07T14:00:00Z";

interface RunningServer {
  app: FastifyInstance;
  database: Kysely<Database>;
}

let running: RunningServer | undefined;
let restartPromise: Promise<void> | undefined;
let stopping = false;

async function count(database: Kysely<Database>, table: keyof Database): Promise<number> {
  const row = await database.selectFrom(table).select(({ fn }) => fn.countAll<string>().as("count")).executeTakeFirstOrThrow();
  return Number(row.count);
}

async function createServer(database: Kysely<Database>): Promise<FastifyInstance> {
  const serverInstanceId = randomUUID();
  const cache = new PostgresMarketDataCache(database);
  const clock = { now: initialNow };
  const gateway = new MarketDataGateway({ cache, now: () => clock.now });
  const fixtures = createFixtureProviders();
  const outbox = new OutboxRepository();
  const idempotency = new IdempotencyRepository(() => new Date(clock.now));
  const repositoryNow = () => new Date(clock.now);
  const app = buildApp({
    config: {
      host: "127.0.0.1",
      port,
      providers: { alpaca: { configured: true }, sec: { configured: true }, finnhub: { configured: true }, fred: { configured: true } },
      publicStatus: { providers: {} },
    },
    cache,
    market: { gateway, provider: fixtures.alpaca },
    company: { gateway, sec: fixtures.sec, profile: fixtures.finnhub, news: fixtures.alpaca },
    discovery: {
      universe: new UniverseService({
        getQuotes: (symbols) => fixtures.alpaca.getQuotes(symbols),
        getCompanyProfile: (symbol) => fixtures.finnhub.getCompanyProfile(symbol),
        getFinancialFacts: (symbol) => fixtures.sec.getFinancialFacts(symbol),
      }, () => clock.now),
    },
    events: {
      gateway,
      provider: {
        getEarnings: (...args) => fixtures.finnhub.getEarnings(...args),
        getCorporateActions: (...args) => fixtures.alpaca.getCorporateActions(...args),
        getReleaseEvents: (...args) => fixtures.fred.getReleaseEvents(...args),
      },
    },
    macro: { gateway, provider: fixtures.fred },
    stateDiscovery: {
      database,
      idempotency,
      outbox,
      discovery: new PostgresDiscoveryStateRepository(database, repositoryNow),
      watchlists: new PostgresWatchlistRepository(database, repositoryNow),
    },
    thesisState: { database, idempotency, outbox, repository: new PostgresThesisRepository(database, repositoryNow) },
    monitorState: { database, idempotency, outbox, repository: new PostgresMonitorStateRepository(database, repositoryNow) },
    manualPortfolio: {
      database,
      idempotency,
      outbox,
      repository: new PostgresManualPortfolioRepository(database, repositoryNow),
      reviews: new PostgresPortfolioReviewRepository(database, repositoryNow),
    },
    browserMigration: { service: new BrowserMigrationService(database, repositoryNow) },
    staticDir: "dist",
  });
  app.post("/api/testing/reset", async () => {
    await resetTestDatabase(database);
    clock.now = initialNow;
    fixtures.reset();
    return { ok: true };
  });

  app.post("/api/testing/restart", (_request, reply) => {
    reply.send({ ok: true });
    if (!restartPromise) {
      setTimeout(() => {
        if (!stopping && !restartPromise) restartPromise = restartServer().finally(() => { restartPromise = undefined; });
      }, 100);
    }
    return reply;
  });

  app.get("/api/testing/database-state", async () => ({
    serverInstanceId,
    migrationReceipts: await count(database, "platform.browser_migration_receipt"),
    migrationRecords: await count(database, "platform.browser_migration_record"),
    watchlists: await count(database, "core.watchlist_group"),
    savedScreens: await count(database, "core.saved_screen"),
    theses: await count(database, "core.thesis_version"),
    alerts: await count(database, "monitor.alert"),
    ledgerEvents: await count(database, "core.manual_portfolio_ledger_event"),
    weeklyReviews: await count(database, "core.portfolio_weekly_review"),
  }));

  app.post("/api/testing/fail-next", (request, reply) => {
    const body = request.body as { source?: "alpaca" | "sec" | "finnhub" | "fred"; code?: 429 | 503 };
    if (!body.source || (body.code !== 429 && body.code !== 503)) {
      return reply.status(400).send({ code: "INVALID_TEST_FAILURE", message: "测试故障参数无效", retryable: false });
    }
    clock.now = new Date(new Date(clock.now).getTime() + 16 * 60_000).toISOString();
    fixtures.failNext(body.source, body.code);
    return { ok: true };
  });

  app.post("/api/testing/market-state", (request, reply) => {
    const body = request.body as { symbol?: string; price?: number; previousClose?: number };
    if (!body.symbol || !/^[A-Z0-9.-]+$/.test(body.symbol) || !Number.isFinite(body.price) || body.price! <= 0 || (body.previousClose !== undefined && (!Number.isFinite(body.previousClose) || body.previousClose <= 0))) {
      return reply.status(400).send({ code: "INVALID_MARKET_STATE", message: "测试行情参数无效", retryable: false });
    }
    clock.now = new Date(new Date(clock.now).getTime() + 2 * 60_000).toISOString();
    fixtures.setQuote(body.symbol, body.price!, body.previousClose);
    return { ok: true, now: clock.now };
  });

  return app;
}

async function startServer(reset: boolean): Promise<RunningServer> {
  const database = createDatabase(connectionString);
  try {
    await migrateToLatest(database);
    if (reset) await resetTestDatabase(database);
    const app = await createServer(database);
    await app.listen({ host: "127.0.0.1", port });
    return { app, database };
  } catch (error) {
    await database.destroy();
    throw error;
  }
}

async function restartServer(): Promise<void> {
  const previous = running;
  if (!previous) return;
  running = undefined;
  await previous.app.close();
  await previous.database.destroy();
  running = await startServer(false);
}

async function close(): Promise<void> {
  stopping = true;
  if (restartPromise) await restartPromise;
  if (!running) return;
  await running.app.close();
  await running.database.destroy();
  running = undefined;
}

running = await startServer(true);
process.once("SIGINT", () => { void close(); });
process.once("SIGTERM", () => { void close(); });
