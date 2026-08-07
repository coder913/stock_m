import { loadServerConfig } from "../config";
import { AlpacaProvider } from "../providers/alpacaProvider";
import { FinnhubProvider } from "../providers/finnhubProvider";
import { FredProvider } from "../providers/fredProvider";
export async function runLiveSmoke(environment = process.env, output: (line: string) => void = console.log) { const config = loadServerConfig(environment); const checks = [{ name: "alpaca", configured: config.providers.alpaca.configured, run: () => new AlpacaProvider(config.secrets.alpaca).getQuotes(["SPY"]) }, { name: "finnhub", configured: config.providers.finnhub.configured, run: () => new FinnhubProvider(config.secrets.finnhub?.apiKey).getCompanyProfile("NVDA") }, { name: "fred", configured: config.providers.fred.configured, run: () => new FredProvider(config.secrets.fred?.apiKey).getSeries(["CPIAUCSL"]) }]; for (const check of checks) { if (!check.configured) { output(`${check.name}: skipped`); continue; } const result = await check.run(); output(`${check.name}: ok ${result.source} ${result.asOf}`); } }
if (import.meta.url === `file://${process.argv[1]}`) void runLiveSmoke();
