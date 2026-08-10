import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [react(), VitePWA({
    strategies: "injectManifest", srcDir: "src", filename: "service-worker.ts", scope: "/", registerType: "autoUpdate", injectRegister: "auto",
    manifest: { name: "stock_m", short_name: "stock_m", start_url: "/", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: "#175cd3" },
    injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"] },
  })],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  preview: { proxy: { "/api": "http://127.0.0.1:8787" } },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**", "**/*.integration.test.ts"]
  }
});
