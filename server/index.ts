import "dotenv/config";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildApp } from "./app";
import { SqliteMarketDataCache } from "./cache/sqliteMarketDataCache";
import { loadServerConfig } from "./config";
import { MarketDataGateway } from "./core/marketDataGateway";
import { AlpacaProvider } from "./providers/alpacaProvider";

const config = loadServerConfig(process.env);
mkdirSync(".data", { recursive: true });
const cache = new SqliteMarketDataCache(join(".data", "stock-m-cache.sqlite"));
const app = buildApp({
  config,
  cache,
  market: {
    gateway: new MarketDataGateway({ cache, now: () => new Date().toISOString() }),
    provider: new AlpacaProvider(config.secrets.alpaca),
  },
});

void app.listen({ host: config.host, port: config.port });
