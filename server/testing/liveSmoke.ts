import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { AlpacaTradingProvider } from "../broker/alpacaTradingProvider";
import { loadServerConfig } from "../config";
import { AlpacaProvider } from "../providers/alpacaProvider";
import { FinnhubProvider } from "../providers/finnhubProvider";
import { FredProvider } from "../providers/fredProvider";

export function loadLiveSmokeEnvironment(
  environment: Record<string, string | undefined> = process.env,
  projectDirectory = process.cwd(),
): Record<string, string | undefined> {
  const path = resolve(projectDirectory, ".env");
  if (!existsSync(path)) return { ...environment };
  const loaded: Record<string, string> = {};
  const result = loadDotenv({ path, processEnv: loaded, quiet: true });
  if (result.error) throw result.error;
  return { ...loaded, ...environment };
}

export async function runLiveSmoke(environment = process.env, output: (line: string) => void = console.log) {
  const config = loadServerConfig({
    SEC_USER_AGENT: "stock_m smoke@example.com",
    DATABASE_URL: "postgresql://smoke:smoke@127.0.0.1:5432/smoke",
    REDIS_URL: "redis://127.0.0.1:6379",
    INTERNAL_SERVICE_TOKEN: "read-only-smoke-placeholder-token",
    ...environment,
  });
  const checks = [
    { name: "alpaca", configured: config.providers.alpaca.configured, run: () => new AlpacaProvider(config.secrets.alpaca).getQuotes(["SPY"]) },
    { name: "finnhub", configured: config.providers.finnhub.configured, run: () => new FinnhubProvider(config.secrets.finnhub?.apiKey).getCompanyProfile("NVDA") },
    { name: "fred", configured: config.providers.fred.configured, run: () => new FredProvider(config.secrets.fred?.apiKey).getSeries(["CPIAUCSL"]) },
  ];
  let ok = 0;
  let skipped = 0;
  for (const check of checks) {
    if (!check.configured) { skipped += 1; output(`${check.name}: skipped`); continue; }
    const result = await check.run();
    output(`${check.name}: ok ${result.source} ${result.asOf}`);
    ok += 1;
  }
  if (config.paperTrading.enabled && config.secrets.alpaca) {
    const paper = new AlpacaTradingProvider({ baseUrl: config.paperTrading.baseUrl, ...config.secrets.alpaca });
    const [account, asset, orders, activities] = await Promise.all([
      paper.getAccount(), paper.getAsset("SPY"), paper.listOpenOrders(), paper.listActivities(),
    ]);
    if (!account.accountId || asset.symbol !== "SPY" || !Array.isArray(orders) || !Array.isArray(activities)) {
      throw new Error("alpaca-paper: invalid read-only response");
    }
    output(`alpaca-paper: ok accountShape=true asset=SPY openOrders=${orders.length} activities=${activities.length}`);
    ok += 1;
  } else { skipped += 1; output("alpaca-paper: skipped"); }
  output(`live-smoke: ok=${ok} skipped=${skipped}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runLiveSmoke(loadLiveSmokeEnvironment());
}
