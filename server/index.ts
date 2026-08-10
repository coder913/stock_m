import "dotenv/config";
import { buildApp } from "./app";
import { PostgresMarketDataCache } from "./cache/postgresMarketDataCache";
import { loadServerConfig } from "./config";
import { MarketDataGateway } from "./core/marketDataGateway";
import { AlpacaProvider } from "./providers/alpacaProvider";
import { SecProvider } from "./providers/secProvider";
import { FinnhubProvider } from "./providers/finnhubProvider";
import { UniverseService } from "./universe/universeService";
import { FredProvider } from "./providers/fredProvider";
import { Queue } from "bullmq";
import { createDatabase } from "./db/database";
import { migrateToLatest } from "./db/migrate";
import { OutboxRepository } from "./platform/outboxRepository";
import { OutboxPublisher } from "./platform/outboxPublisher";
import { IdempotencyRepository } from "./platform/idempotencyRepository";
import { PostgresDiscoveryStateRepository } from "./discovery/discoveryStateRepository";
import { PostgresWatchlistRepository } from "./watchlists/watchlistRepository";
import { PostgresThesisRepository } from "./thesis/thesisRepository";
import { PostgresMonitorStateRepository } from "./monitoring/monitorStateRepository";
import { PostgresManualPortfolioRepository } from "./portfolio/manualPortfolioRepository";
import { PostgresPortfolioReviewRepository } from "./portfolio/portfolioReviewRepository";
import { BrowserMigrationService } from "./migration/browserMigrationService";
import { createHealthService } from "./platform/healthService";
import { createGracefulShutdown } from "./platform/gracefulShutdown";
import { MonitorSnapshotLoader } from "../src/features/monitoring/monitorSnapshotLoader";
import { MarketApiClient } from "../src/features/market/marketApiClient";
import { createRedisConnection } from "./queue/redisConnection";
import { queueNames } from "./queue/queueNames";
import { MonitorScheduleRepository } from "./monitoring/monitorScheduleRepository";
import { MonitorScheduler } from "./monitoring/monitorScheduler";
import { createUsEquityMarketCalendar } from "./monitoring/scheduleDomain";
import { MonitorTaskHealthService } from "./monitoring/monitorTaskHealthService";
import { PushSubscriptionRepository } from "./notifications/pushSubscriptionRepository";

const config = loadServerConfig(process.env);
const database = createDatabase(config.databaseUrl);
await migrateToLatest(database);
const redis = createRedisConnection(config.redisUrl);
const eventQueue = new Queue("platform-events", { connection: redis });
const monitorQueue = new Queue(queueNames.monitorRuns, { connection: redis });
const outbox = new OutboxRepository();
const idempotency = new IdempotencyRepository();
const outboxPublisher = new OutboxPublisher(database, outbox, eventQueue);
const monitorSchedules = new MonitorScheduleRepository(database);
const monitorScheduler = new MonitorScheduler({ repository: monitorSchedules, queue: monitorQueue, calendar: createUsEquityMarketCalendar() });
const pushSubscriptions = config.secrets.push ? new PushSubscriptionRepository(database, config.secrets.push.subscriptionEncryptionKey) : undefined;
const cache = new PostgresMarketDataCache(database);
const gateway = new MarketDataGateway({ cache, now: () => new Date().toISOString() });
const alpaca = new AlpacaProvider(config.secrets.alpaca);
const sec = new SecProvider(config.secrets.secUserAgent);
const finnhub = new FinnhubProvider(config.secrets.finnhub?.apiKey);
const fred = new FredProvider(config.secrets.fred?.apiKey);
const app = buildApp({
  config,
  cache,
  market: {
    gateway, provider: alpaca,
  },
  company: {
    gateway, sec, profile: finnhub, news: alpaca,
  },
  discovery: { universe: new UniverseService({ getQuotes: (symbols) => alpaca.getQuotes(symbols), getCompanyProfile: (symbol) => finnhub.getCompanyProfile(symbol), getFinancialFacts: (symbol) => sec.getFinancialFacts(symbol) }) },
  events: { gateway, provider: { getEarnings: (...args) => finnhub.getEarnings(...args), getCorporateActions: (...args) => alpaca.getCorporateActions(...args), getReleaseEvents: (...args) => fred.getReleaseEvents(...args) } },
  macro: { gateway, provider: fred },
  stateDiscovery: {
    database,
    idempotency,
    outbox,
    discovery: new PostgresDiscoveryStateRepository(database),
    watchlists: new PostgresWatchlistRepository(database),
  },
  thesisState: { database, idempotency, outbox, repository: new PostgresThesisRepository(database) },
  monitorState: { database, idempotency, outbox, repository: new PostgresMonitorStateRepository(database), taskHealth: new MonitorTaskHealthService(database), runs: { enqueue: () => monitorScheduler.reconcile(), get: (id) => monitorSchedules.getRun(id) } },
  manualPortfolio: { database, idempotency, outbox, repository: new PostgresManualPortfolioRepository(database), reviews: new PostgresPortfolioReviewRepository(database) },
  browserMigration: { service: new BrowserMigrationService(database) },
  health: createHealthService(database, redis, cache),
  internalSnapshots: {
    token: config.internalServiceToken,
    loader: new MonitorSnapshotLoader(new MarketApiClient(undefined, config.internalApiBaseUrl)),
  },
  notifications: { configured: config.notifications.configured, publicKey: config.notifications.publicKey, database, idempotency, outbox, repository: pushSubscriptions },
});

await app.listen({ host: config.host, port: config.port });
outboxPublisher.start();

const shutdown = createGracefulShutdown({
  closeServer: () => app.close(),
  stopPublisher: () => outboxPublisher.stop(),
  closeQueue: async () => { await Promise.all([eventQueue.close(), monitorQueue.close()]); },
  closeRedis: async () => { await redis.quit(); },
  closeDatabase: () => database.destroy(),
});

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
