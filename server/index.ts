import "dotenv/config";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildApp } from "./app";
import { SqliteMarketDataCache } from "./cache/sqliteMarketDataCache";
import { loadServerConfig } from "./config";
import { MarketDataGateway } from "./core/marketDataGateway";
import { AlpacaProvider } from "./providers/alpacaProvider";
import { SecProvider } from "./providers/secProvider";
import { FinnhubProvider } from "./providers/finnhubProvider";
import { UniverseService } from "./universe/universeService";

const config = loadServerConfig(process.env);
mkdirSync(".data", { recursive: true });
const cache = new SqliteMarketDataCache(join(".data", "stock-m-cache.sqlite"));
const gateway = new MarketDataGateway({ cache, now: () => new Date().toISOString() });
const alpaca = new AlpacaProvider(config.secrets.alpaca);
const sec = new SecProvider(config.secrets.secUserAgent);
const finnhub = new FinnhubProvider(config.secrets.finnhub?.apiKey);
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
  events: { gateway, provider: finnhub },
});

void app.listen({ host: config.host, port: config.port });
