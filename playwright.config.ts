import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4174);

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, channel: "chrome" },
  webServer: {
    command: "npm run test:e2e:server",
    port,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
