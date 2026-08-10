import { buildApp } from "../app";
import { SqliteMarketDataCache } from "../cache/sqliteMarketDataCache";
import { MarketDataGateway } from "../core/marketDataGateway";
import { UniverseService } from "../universe/universeService";
import { createFixtureProviders } from "./createFixtureProviders";

const cache = new SqliteMarketDataCache(":memory:");
const port = Number(process.env.E2E_PORT ?? 4173);
let now = "2026-08-07T14:00:00Z";
const gateway = new MarketDataGateway({ cache, now: () => now });
const fixtures = createFixtureProviders();
const app = buildApp({
  config: { host: "127.0.0.1", port, providers: { alpaca: { configured: true }, sec: { configured: true }, finnhub: { configured: true }, fred: { configured: true } }, publicStatus: { providers: {} } },
  cache,
  market: { gateway, provider: fixtures.alpaca },
  company: { gateway, sec: fixtures.sec, profile: fixtures.finnhub, news: fixtures.alpaca },
  discovery: { universe: new UniverseService({ getQuotes: (symbols) => fixtures.alpaca.getQuotes(symbols), getCompanyProfile: (symbol) => fixtures.finnhub.getCompanyProfile(symbol), getFinancialFacts: (symbol) => fixtures.sec.getFinancialFacts(symbol) }, () => "2026-08-07T14:00:00Z") },
  events: { gateway, provider: { getEarnings: (...args) => fixtures.finnhub.getEarnings(...args), getCorporateActions: (...args) => fixtures.alpaca.getCorporateActions(...args), getReleaseEvents: (...args) => fixtures.fred.getReleaseEvents(...args) } },
  macro: { gateway, provider: fixtures.fred },
  staticDir: "dist",
});
app.post("/api/testing/fail-next", (request, reply) => {
  const body = request.body as { source?: "alpaca" | "sec" | "finnhub" | "fred"; code?: 429 | 503 };
  if (!body.source || (body.code !== 429 && body.code !== 503)) return reply.status(400).send({ code: "INVALID_TEST_FAILURE", message: "测试故障参数无效", retryable: false });
  now = new Date(new Date(now).getTime() + 16 * 60_000).toISOString();
  fixtures.failNext(body.source, body.code);
  return { ok: true };
});
app.post("/api/testing/market-state", (request, reply) => {
  const body = request.body as { symbol?: string; price?: number; previousClose?: number };
  if (!body.symbol || !/^[A-Z0-9.-]+$/.test(body.symbol) || !Number.isFinite(body.price) || body.price! <= 0 || (body.previousClose !== undefined && (!Number.isFinite(body.previousClose) || body.previousClose <= 0))) {
    return reply.status(400).send({ code: "INVALID_MARKET_STATE", message: "测试行情参数无效", retryable: false });
  }
  now = new Date(new Date(now).getTime() + 2 * 60_000).toISOString();
  fixtures.setQuote(body.symbol, body.price!, body.previousClose);
  return { ok: true, now };
});
void app.listen({ host: "127.0.0.1", port });
