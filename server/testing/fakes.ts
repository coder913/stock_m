import type { AppDependencies } from "../app";

export function createTestDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    config: {
      host: "127.0.0.1",
      port: 8787,
      providers: {
        alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false },
      },
      publicStatus: { providers: {} },
    },
    cache: { health: async () => ({ writable: true, entries: 0 }) },
    ...overrides,
  };
}
