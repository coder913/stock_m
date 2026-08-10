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
import IORedis from "ioredis";
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

const config = loadServerConfig(process.env);
const database = createDatabase(config.databaseUrl);
await migrateToLatest(database);
const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
const eventQueue = new Queue("platform-events", { connection: redis });
const outbox = new OutboxRepository();
const idempotency = new IdempotencyRepository();
const outboxPublisher = new OutboxPublisher(database, outbox, eventQueue);
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
  monitorState: { database, idempotency, outbox, repository: new PostgresMonitorStateRepository(database) },
  manualPortfolio: { database, idempotency, outbox, repository: new PostgresManualPortfolioRepository(database), reviews: new PostgresPortfolioReviewRepository(database) },
  browserMigration: { service: new BrowserMigrationService(database) },
});

await app.listen({ host: config.host, port: config.port });
outboxPublisher.start();

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await app.close();
  await outboxPublisher.stop();
  await eventQueue.close();
  await redis.quit();
  await database.destroy();
}

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
