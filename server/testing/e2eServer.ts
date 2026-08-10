import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import type { MonitorSnapshot, MonitorSnapshotRequest } from "../../shared/monitoring";
import { buildApp } from "../app";
import { PostgresMarketDataCache } from "../cache/postgresMarketDataCache";
import { MarketDataGateway } from "../core/marketDataGateway";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import type { Database } from "../db/types";
import { PostgresDiscoveryStateRepository } from "../discovery/discoveryStateRepository";
import { BrowserMigrationService } from "../migration/browserMigrationService";
import { PostgresMonitorStateRepository } from "../monitoring/monitorStateRepository";
import { MonitorRunService, PostgresMonitorRunStore } from "../monitoring/monitorRunService";
import { MonitorScheduleRepository } from "../monitoring/monitorScheduleRepository";
import { MonitorScheduler } from "../monitoring/monitorScheduler";
import { createUsEquityMarketCalendar } from "../monitoring/scheduleDomain";
import { NotificationRepository } from "../notifications/notificationRepository";
import { NotificationService } from "../notifications/notificationService";
import { PushSubscriptionRepository } from "../notifications/pushSubscriptionRepository";
import { IdempotencyRepository } from "../platform/idempotencyRepository";
import { OutboxRepository } from "../platform/outboxRepository";
import { PostgresManualPortfolioRepository } from "../portfolio/manualPortfolioRepository";
import { PostgresPortfolioReviewRepository } from "../portfolio/portfolioReviewRepository";
import { PostgresThesisRepository } from "../thesis/thesisRepository";
import { UniverseService } from "../universe/universeService";
import { PostgresWatchlistRepository } from "../watchlists/watchlistRepository";
import { createRedisConnection } from "../queue/redisConnection";
import { queueNames } from "../queue/queueNames";
import { createFixtureProviders } from "./createFixtureProviders";
import { DeterministicWorkerClock } from "./deterministicWorkerClock";
import { FakePushProvider } from "./fakePushProvider";
import { resetTestDatabase } from "./resetTestDatabase";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test";
const port = Number(process.env.E2E_PORT ?? 4174);
const initialNow = "2026-08-07T14:00:00Z";
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";

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
  const clock = new DeterministicWorkerClock(initialNow);
  const gateway = new MarketDataGateway({ cache, now: clock.iso });
  const fixtures = createFixtureProviders();
  const outbox = new OutboxRepository();
  const idempotency = new IdempotencyRepository(clock.now);
  const repositoryNow = clock.now;
  const theses = new PostgresThesisRepository(database, repositoryNow);
  const monitoring = new PostgresMonitorStateRepository(database, repositoryNow);
  const schedules = new MonitorScheduleRepository(database, repositoryNow);
  const pushSubscriptions = new PushSubscriptionRepository(database, Buffer.alloc(32, 6), repositoryNow);
  const notificationRepository = new NotificationRepository(database, repositoryNow);
  const fakePush = new FakePushProvider(repositoryNow);
  const notificationService = new NotificationService({ repository: notificationRepository, subscriptions: pushSubscriptions, provider: fakePush, scheduler: { retry: async () => undefined } });
  const redis = createRedisConnection(redisUrl);
  const monitorQueue = new Queue(queueNames.monitorRuns, { connection: redis });
  const monitorScheduler = new MonitorScheduler({ repository: schedules, queue: monitorQueue, calendar: createUsEquityMarketCalendar(), now: repositoryNow });
  const snapshotClient = {
    async load(input: MonitorSnapshotRequest) {
      const symbols = input.requirements.map(({ symbol }) => symbol);
      try {
        const quotes = await fixtures.alpaca.getQuotes(symbols);
        const snapshots = new Map<string, MonitorSnapshot>(input.requirements.map((requirement) => {
          const quote = quotes.data.find((item) => item.symbol === requirement.symbol);
          const metrics: MonitorSnapshot["metrics"] = {};
          if (requirement.metrics.includes("price")) metrics.price = { value: quote?.price, source: "alpaca", asOf: quotes.asOf, dataState: quote?.price === undefined ? "missing" : "fresh", notices: [] };
          return [requirement.symbol, { symbol: requirement.symbol, metrics, events: [], eventsState: "fresh", generatedAt: input.evaluatedAt }];
        }));
        return { snapshots, provenance: { dataState: "fresh" as const, sources: ["alpaca" as const], generatedAt: input.evaluatedAt } };
      } catch {
        const snapshots = new Map<string, MonitorSnapshot>(input.requirements.map((requirement) => [requirement.symbol, { symbol: requirement.symbol, metrics: Object.fromEntries(requirement.metrics.map((metric) => [metric, { dataState: "stale", notices: ["fixture provider failure"] }])), events: [], eventsState: "stale", generatedAt: input.evaluatedAt }]));
        return { snapshots, provenance: { dataState: "stale" as const, sources: ["alpaca" as const], generatedAt: input.evaluatedAt } };
      }
    },
  };
  const monitorRuns = new MonitorRunService({ store: new PostgresMonitorRunStore(database, theses, monitoring, schedules, outbox), snapshotClient });
  const processNotificationOutbox = async () => {
    const events = await database.selectFrom("platform.outbox_event").selectAll().where("publishedAt", "is", null).where("topic", "in", ["monitor.alert.created", "notification.test.requested"]).orderBy("occurredAt").execute();
    for (const event of events) {
      await notificationService.consume({ eventId: event.id, topic: event.topic as "monitor.alert.created" | "notification.test.requested", payload: event.payloadJson });
      await database.updateTable("platform.outbox_event").set({ publishedAt: repositoryNow() }).where("id", "=", event.id).execute();
    }
  };
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
      }, clock.iso),
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
    thesisState: { database, idempotency, outbox, repository: theses },
    monitorState: { database, idempotency, outbox, repository: monitoring, runs: { enqueue: async () => [], get: (id) => schedules.getRun(id) } },
    manualPortfolio: {
      database,
      idempotency,
      outbox,
      repository: new PostgresManualPortfolioRepository(database, repositoryNow),
      reviews: new PostgresPortfolioReviewRepository(database, repositoryNow),
    },
    browserMigration: { service: new BrowserMigrationService(database, repositoryNow) },
    notifications: { configured: true, publicKey: "AQIDBA", database, idempotency, outbox, repository: pushSubscriptions },
    staticDir: "dist",
  });
  app.addHook("onClose", async () => { await monitorQueue.close(); if (redis.status !== "end") await redis.quit(); });
  app.post("/api/testing/reset", async () => {
    await resetTestDatabase(database);
    clock.reset();
    fixtures.reset();
    fakePush.clear();
    await redis.flushdb();
    await monitorScheduler.start();
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
    notificationDeliveries: await count(database, "notification.delivery"),
    successfulDeliveries: Number((await database.selectFrom("notification.delivery").select(({ fn }) => fn.countAll<string>().as("count")).where("status", "=", "succeeded").executeTakeFirstOrThrow()).count),
  }));

  app.post("/api/testing/clock/advance", (request, reply) => {
    const minutes = (request.body as { minutes?: number }).minutes;
    try { return { now: clock.advanceMinutes(minutes!) }; }
    catch { return reply.status(400).send({ code: "INVALID_CLOCK_ADVANCE", message: "minutes must be between 1 and 1440", retryable: false }); }
  });

  app.post("/api/testing/monitor/run", async (request, reply) => {
    const type = (request.body as { type?: string }).type;
    if (type !== "price") return reply.status(400).send({ code: "INVALID_RUN_TYPE", message: "only price is supported by this E2E control", retryable: false });
    const now = clock.iso();
    const claimed = await schedules.claim({ type: "price", naturalPeriod: now.slice(0, 16), scheduledFor: now, catchUp: false });
    if (!claimed) return { duplicate: true };
    const result = await monitorRuns.run(claimed, now);
    await processNotificationOutbox();
    return result;
  });

  app.get("/api/testing/push/captures", () => fakePush.list());
  app.post("/api/testing/push/clear", () => { fakePush.clear(); return { ok: true }; });
  app.post("/api/testing/outbox/replay", async () => { await database.updateTable("platform.outbox_event").set({ publishedAt: null }).where("topic", "in", ["monitor.alert.created", "notification.test.requested"]).execute(); await processNotificationOutbox(); return { ok: true }; });
  app.post("/api/testing/redis/flush", async () => { await redis.flushdb(); await monitorScheduler.start(); return { ok: true, schedulers: await monitorQueue.getJobSchedulersCount() }; });

  app.post("/api/testing/fail-next", (request, reply) => {
    const body = request.body as { source?: "alpaca" | "sec" | "finnhub" | "fred"; code?: 429 | 503 };
    if (!body.source || (body.code !== 429 && body.code !== 503)) {
      return reply.status(400).send({ code: "INVALID_TEST_FAILURE", message: "测试故障参数无效", retryable: false });
    }
    clock.advanceMinutes(16);
    fixtures.failNext(body.source, body.code);
    return { ok: true };
  });

  app.post("/api/testing/market-state", (request, reply) => {
    const body = request.body as { symbol?: string; price?: number; previousClose?: number };
    if (!body.symbol || !/^[A-Z0-9.-]+$/.test(body.symbol) || !Number.isFinite(body.price) || body.price! <= 0 || (body.previousClose !== undefined && (!Number.isFinite(body.previousClose) || body.previousClose <= 0))) {
      return reply.status(400).send({ code: "INVALID_MARKET_STATE", message: "测试行情参数无效", retryable: false });
    }
    clock.advanceMinutes(2);
    fixtures.setQuote(body.symbol, body.price!, body.previousClose);
    return { ok: true, now: clock.iso() };
  });

  await monitorScheduler.start();
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
