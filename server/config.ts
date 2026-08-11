import { z } from "zod";

export interface ProviderConfiguration { configured: boolean; }

export interface ServerConfig {
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  internalServiceToken: string;
  internalApiBaseUrl: string;
  workers: {
    monitorConcurrency: number;
    notificationConcurrency: number;
    tradingConcurrency: number;
  };
  paperTrading: {
    enabled: boolean;
    configured: boolean;
    baseUrl: "https://paper-api.alpaca.markets";
  };
  providers: Record<"alpaca" | "sec" | "finnhub" | "fred", ProviderConfiguration>;
  notifications: { configured: boolean; publicKey?: string; subject?: string };
  publicStatus: {
    providers: Record<string, ProviderConfiguration>;
    notifications: { configured: boolean; publicKey?: string; subject?: string };
    paperTrading: { enabled: boolean; configured: boolean };
  };
  secrets: {
    alpaca?: { keyId: string; secretKey: string };
    finnhub?: { apiKey: string };
    fred?: { apiKey: string };
    push?: { privateKey: string; subscriptionEncryptionKey: Buffer };
    secUserAgent: string;
  };
}

const optionalNonEmptyString = z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().min(1).optional());

const environmentSchema = z.object({
  HOST: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().optional(),
  ALPACA_API_KEY_ID: optionalNonEmptyString,
  ALPACA_API_SECRET_KEY: optionalNonEmptyString,
  FINNHUB_API_KEY: optionalNonEmptyString,
  FRED_API_KEY: optionalNonEmptyString,
  SEC_USER_AGENT: z.string().min(1),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
    message: "DATABASE_URL must be a PostgreSQL URL",
  }),
  REDIS_URL: z.string().url().refine((value) => value.startsWith("redis://") || value.startsWith("rediss://"), {
    message: "REDIS_URL must be a Redis URL",
  }),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  INTERNAL_API_BASE_URL: z.string().url().optional(),
  MONITOR_WORKER_CONCURRENCY: z.coerce.number().int().positive().optional(),
  NOTIFICATION_WORKER_CONCURRENCY: z.coerce.number().int().positive().optional(),
  TRADING_WORKER_CONCURRENCY: z.coerce.number().int().positive().optional(),
  ALPACA_PAPER_TRADING_ENABLED: z.enum(["true", "false"]).optional(),
  ALPACA_TRADING_BASE_URL: z.string().url().optional(),
  VAPID_PUBLIC_KEY: optionalNonEmptyString,
  VAPID_PRIVATE_KEY: optionalNonEmptyString,
  VAPID_SUBJECT: optionalNonEmptyString,
  PUSH_SUBSCRIPTION_ENCRYPTION_KEY: optionalNonEmptyString,
});

function decodeEncryptionKey(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("PUSH_SUBSCRIPTION_ENCRYPTION_KEY must be valid base64");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("PUSH_SUBSCRIPTION_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

export function loadServerConfig(environment: Record<string, string | undefined>): ServerConfig {
  const parsed = environmentSchema.parse(environment);
  if (!/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(parsed.SEC_USER_AGENT)) {
    throw new Error("SEC_USER_AGENT 必须包含联系邮箱");
  }
  const providers = {
    alpaca: { configured: Boolean(parsed.ALPACA_API_KEY_ID && parsed.ALPACA_API_SECRET_KEY) },
    sec: { configured: true },
    finnhub: { configured: Boolean(parsed.FINNHUB_API_KEY) },
    fred: { configured: Boolean(parsed.FRED_API_KEY) },
  };
  const paperTradingEnabled = parsed.ALPACA_PAPER_TRADING_ENABLED === "true";
  const paperTradingConfigured = Boolean(parsed.ALPACA_API_KEY_ID && parsed.ALPACA_API_SECRET_KEY);
  const paperTradingBaseUrl = parsed.ALPACA_TRADING_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (paperTradingEnabled && paperTradingBaseUrl !== "https://paper-api.alpaca.markets") {
    throw new Error("Alpaca Paper trading requires the exact Paper API origin");
  }
  if (paperTradingEnabled && !paperTradingConfigured) {
    throw new Error("Alpaca Paper trading credentials are required when trading is enabled");
  }
  const paperTrading = {
    enabled: paperTradingEnabled,
    configured: paperTradingConfigured,
    baseUrl: "https://paper-api.alpaca.markets" as const,
  };
  const pushValues = [parsed.VAPID_PUBLIC_KEY, parsed.VAPID_PRIVATE_KEY, parsed.VAPID_SUBJECT, parsed.PUSH_SUBSCRIPTION_ENCRYPTION_KEY];
  const hasAnyPushValue = pushValues.some(Boolean);
  const hasAllPushValues = pushValues.every(Boolean);
  if (hasAnyPushValue && !hasAllPushValues) throw new Error("Push configuration must include all VAPID and encryption values");
  if (parsed.VAPID_SUBJECT && !/^(mailto:|https:\/\/)/.test(parsed.VAPID_SUBJECT)) throw new Error("VAPID_SUBJECT must use mailto: or https://");
  const subscriptionEncryptionKey = parsed.PUSH_SUBSCRIPTION_ENCRYPTION_KEY ? decodeEncryptionKey(parsed.PUSH_SUBSCRIPTION_ENCRYPTION_KEY) : undefined;
  const notifications = hasAllPushValues
    ? { configured: true, publicKey: parsed.VAPID_PUBLIC_KEY!, subject: parsed.VAPID_SUBJECT! }
    : { configured: false };
  const port = parsed.PORT ?? 8787;
  return {
    host: parsed.HOST ?? "127.0.0.1",
    port,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    internalServiceToken: parsed.INTERNAL_SERVICE_TOKEN,
    internalApiBaseUrl: parsed.INTERNAL_API_BASE_URL ?? `http://127.0.0.1:${port}`,
    workers: {
      monitorConcurrency: parsed.MONITOR_WORKER_CONCURRENCY ?? 1,
      notificationConcurrency: parsed.NOTIFICATION_WORKER_CONCURRENCY ?? 1,
      tradingConcurrency: parsed.TRADING_WORKER_CONCURRENCY ?? 1,
    },
    paperTrading,
    providers,
    notifications,
    publicStatus: {
      providers,
      notifications,
      paperTrading: { enabled: paperTrading.enabled, configured: paperTrading.configured },
    },
    secrets: {
      alpaca: providers.alpaca.configured ? { keyId: parsed.ALPACA_API_KEY_ID!, secretKey: parsed.ALPACA_API_SECRET_KEY! } : undefined,
      finnhub: parsed.FINNHUB_API_KEY ? { apiKey: parsed.FINNHUB_API_KEY } : undefined,
      fred: parsed.FRED_API_KEY ? { apiKey: parsed.FRED_API_KEY } : undefined,
      push: hasAllPushValues ? { privateKey: parsed.VAPID_PRIVATE_KEY!, subscriptionEncryptionKey: subscriptionEncryptionKey! } : undefined,
      secUserAgent: parsed.SEC_USER_AGENT,
    },
  };
}
