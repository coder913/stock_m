import { buildApp } from "../app";
const app = buildApp({ config: { host: "127.0.0.1", port: 4173, providers: { alpaca: { configured: false }, sec: { configured: true }, finnhub: { configured: false }, fred: { configured: false } }, publicStatus: { providers: {} } }, cache: { health: () => ({ writable: true, entries: 0 }) }, staticDir: "dist" });
void app.listen({ host: "127.0.0.1", port: 4173 });
