import "dotenv/config";
import { buildApp } from "./app";
import { loadServerConfig } from "./config";

const config = loadServerConfig(process.env);
const app = buildApp({
  config,
  cache: { health: () => ({ writable: true, entries: 0 }) },
});

void app.listen({ host: config.host, port: config.port });
