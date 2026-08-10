import { z } from "zod";

export interface ProviderConfiguration { configured: boolean; }

export interface ServerConfig {
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  internalServiceToken: string;
  providers: Record<"alpaca" | "sec" | "finnhub" | "fred", ProviderConfiguration>;
  publicStatus: { providers: Record<string, ProviderConfiguration> };
  secrets: {
    alpaca?: { keyId: string; secretKey: string };
    finnhub?: { apiKey: string };
    fred?: { apiKey: string };
    secUserAgent: string;
  };
}

const environmentSchema = z.object({
  HOST: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().optional(),
  ALPACA_API_KEY_ID: z.string().min(1).optional(),
  ALPACA_API_SECRET_KEY: z.string().min(1).optional(),
  FINNHUB_API_KEY: z.string().min(1).optional(),
  FRED_API_KEY: z.string().min(1).optional(),
  SEC_USER_AGENT: z.string().min(1),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
    message: "DATABASE_URL must be a PostgreSQL URL",
  }),
  REDIS_URL: z.string().url().refine((value) => value.startsWith("redis://") || value.startsWith("rediss://"), {
    message: "REDIS_URL must be a Redis URL",
  }),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
});

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
  return {
    host: parsed.HOST ?? "127.0.0.1",
    port: parsed.PORT ?? 8787,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    internalServiceToken: parsed.INTERNAL_SERVICE_TOKEN,
    providers,
    publicStatus: { providers },
    secrets: {
      alpaca: providers.alpaca.configured ? { keyId: parsed.ALPACA_API_KEY_ID!, secretKey: parsed.ALPACA_API_SECRET_KEY! } : undefined,
      finnhub: parsed.FINNHUB_API_KEY ? { apiKey: parsed.FINNHUB_API_KEY } : undefined,
      fred: parsed.FRED_API_KEY ? { apiKey: parsed.FRED_API_KEY } : undefined,
      secUserAgent: parsed.SEC_USER_AGENT,
    },
  };
}
