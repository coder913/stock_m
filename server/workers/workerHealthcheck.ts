import "dotenv/config";
import { createDatabase } from "../db/database";
import { WorkerHeartbeatRepository, type WorkerName } from "../queue/workerHeartbeatRepository";

const worker = process.argv[2] as WorkerName | undefined;
if (worker !== "monitor" && worker !== "notifications") throw new Error("worker must be monitor or notifications");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const database = createDatabase(databaseUrl);
try {
  const heartbeat = await new WorkerHeartbeatRepository(database).latest(worker);
  if (!heartbeat || heartbeat.state === "degraded" || heartbeat.state === "stopping") process.exitCode = 1;
  else if (Date.now() - new Date(heartbeat.at).getTime() > 45_000) process.exitCode = 1;
} finally {
  await database.destroy();
}
