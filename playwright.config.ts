import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", channel: "chrome" },
  webServer: {
    command: "npm run build && npm run test:e2e:server",
    port: 4173,
  },
});
