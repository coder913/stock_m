import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { MonitorSnapshot, MonitorSnapshotRequest } from "../../shared/monitoring";
import { buildApp } from "../app";
import { PostgresMarketDataCache } from "../cache/postgresMarketDataCache";
import { MarketDataGateway } from "../core/marketDataGateway";
import { createDatabase } from "../db/database";
import { migrateToLatest } from "../db/migrate";
import type { Database } from "../db/types";
import { PostgresDiscoveryStateRepository } from "../discovery/discoveryStateRepository";
import { BrowserMigrationService } from "../migration/browserMigrationService";
import { PostgresMonitorStateRepository } from "../monitoring/monitorStateRepository";
import { MonitorRunService, PostgresMonitorRunStore } from "../monitoring/monitorRunService";
import { MonitorScheduleRepository } from "../monitoring/monitorScheduleRepository";
import { MonitorScheduler } from "../monitoring/monitorScheduler";
import { createUsEquityMarketCalendar } from "../monitoring/scheduleDomain";
import { NotificationRepository } from "../notifications/notificationRepository";
import { NotificationService } from "../notifications/notificationService";
import { PushSubscriptionRepository } from "../notifications/pushSubscriptionRepository";
import { IdempotencyRepository } from "../platform/idempotencyRepository";
import { OutboxRepository } from "../platform/outboxRepository";
import { OutboxPublisher } from "../platform/outboxPublisher";
import { PostgresManualPortfolioRepository } from "../portfolio/manualPortfolioRepository";
import { PostgresPortfolioReviewRepository } from "../portfolio/portfolioReviewRepository";
import { PostgresThesisRepository } from "../thesis/thesisRepository";
import { UniverseService } from "../universe/universeService";
import { PostgresWatchlistRepository } from "../watchlists/watchlistRepository";
import { createRedisConnection } from "../queue/redisConnection";
import { queueNames } from "../queue/queueNames";
import { createFixtureProviders } from "./createFixtureProviders";
import { DeterministicWorkerClock } from "./deterministicWorkerClock";
import { FakePushProvider } from "./fakePushProvider";
import { resetTestDatabase } from "./resetTestDatabase";
import{BrokerRepository}from"../broker/brokerRepository";
import{OrderPreviewService}from"../broker/orderPreviewService";
import{createOrderPreviewTokenService}from"../broker/orderPreviewToken";
import{OrderCommandService}from"../broker/orderCommandService";
import{CancelCommandService}from"../broker/cancelCommandService";
import{PostgresBrokerReconciliationRepository}from"../broker/brokerReconciliationRepository";
import{ReconciliationService}from"../broker/reconciliationService";
import{PostgresPaperPortfolioStore}from"../broker/paperPortfolioRepository";
import{createTradingJobProcessor,PostgresTradingInbox}from"../workers/tradingWorker";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://stock_m:stock_m@127.0.0.1:55432/stock_m_test";
const port = Number(process.env.E2E_PORT ?? 4174);
const initialNow = "2026-08-07T14:00:00Z";
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";

interface RunningServer {
  app: FastifyInstance;
  database: Kysely<Database>;
}

let running: RunningServer | undefined;
let restartPromise: Promise<void> | undefined;
let stopping = false;

async function count(database: Kysely<Database>, table: keyof Database): Promise<number> {
  const row = await database.selectFrom(table).select(({ fn }) => fn.countAll<string>().as("count")).executeTakeFirstOrThrow();
  return Number(row.count);
}

async function createServer(database: Kysely<Database>): Promise<FastifyInstance> {
  const serverInstanceId = randomUUID();
  const cache = new PostgresMarketDataCache(database);
  const clock = new DeterministicWorkerClock(initialNow);
  const gateway = new MarketDataGateway({ cache, now: clock.iso });
  const fixtures = createFixtureProviders();
  const outbox = new OutboxRepository();
  const idempotency = new IdempotencyRepository(clock.now);
  const repositoryNow = clock.now;
  const broker=new BrokerRepository(database,repositoryNow);
  const reconciliationRepository=new PostgresBrokerReconciliationRepository(database,repositoryNow);
  const reconciliation=new ReconciliationService(fixtures.trading,reconciliationRepository,repositoryNow);
  const previewTokens=createOrderPreviewTokenService(Buffer.alloc(32,9),repositoryNow);
  const orderPreview=new OrderPreviewService({enabled:true,now:repositoryNow,loadAccount:async()=>{const account=await fixtures.trading.getAccount();return{buyingPower:account.buyingPower,equity:account.equity};},loadAsset:symbol=>fixtures.trading.getAsset(symbol),loadQuote:async symbol=>{const result=await fixtures.alpaca.getQuotes([symbol]);return{price:String(result.data[0]?.price??0),source:"fixture",asOf:result.asOf,state:"fresh"};},loadPosition:async symbol=>({quantity:(await fixtures.trading.getPosition(symbol))?.quantity??"0"}),hasActiveDrift:()=>broker.hasActiveDrift(),tokens:previewTokens});
  const theses = new PostgresThesisRepository(database, repositoryNow);
  const monitoring = new PostgresMonitorStateRepository(database, repositoryNow);
  const schedules = new MonitorScheduleRepository(database, repositoryNow);
  const pushSubscriptions = new PushSubscriptionRepository(database, Buffer.alloc(32, 6), repositoryNow);
  const notificationRepository = new NotificationRepository(database, repositoryNow);
  const fakePush = new FakePushProvider(repositoryNow);
  const notificationService = new NotificationService({ repository: notificationRepository, subscriptions: pushSubscriptions, provider: fakePush, scheduler: { retry: async () => undefined } });
  const redis = createRedisConnection(redisUrl);
  const monitorQueue = new Queue(queueNames.monitorRuns, { connection: redis });
  const tradingQueueConnection = createRedisConnection(redisUrl);
  const tradingQueue = new Queue(queueNames.tradingCommands, { connection: tradingQueueConnection });
  const tradingOutbox: Pick<OutboxRepository,"listUnpublishedForUpdate"|"markPublished"|"recordFailure"> = {
    listUnpublishedForUpdate: (transaction, limit) => transaction.selectFrom("platform.outbox_event").selectAll()
      .where("publishedAt", "is", null).where("topic", "like", "broker.%")
      .orderBy("occurredAt", "asc").orderBy("id", "asc").limit(limit).forUpdate().skipLocked().execute(),
    markPublished: (transaction, id, at) => outbox.markPublished(transaction, id, at),
    recordFailure: (transaction, id) => outbox.recordFailure(transaction, id),
  };
  const tradingPublisher = new OutboxPublisher(database, tradingOutbox, tradingQueue, repositoryNow);
  let tradingWorkerConnection: ReturnType<typeof createRedisConnection> | undefined;
  let tradingWorker: Worker | undefined;
  let workerGeneration = 0;
  let reconcileSequence = 0;
  const scheduler = { reconcileOrder: (intentId:string) => tradingQueue.add("broker.order.reconcile.requested", { intentId }, { jobId: `e2e-reconcile-${intentId}-${++reconcileSequence}` }) };
  const submitCommands=new OrderCommandService(broker,fixtures.trading,scheduler,repositoryNow);
  const cancelCommands=new CancelCommandService(broker,fixtures.trading,scheduler,repositoryNow);
  const tradingProcessor=createTradingJobProcessor({submit:event=>submitCommands.submit(event),cancel:event=>cancelCommands.cancel(event),reconcileFull:()=>reconciliation.reconcileAll().then(()=>undefined)},new PostgresTradingInbox(database));
  const stopTradingWorker=async()=>{const worker=tradingWorker;const connection=tradingWorkerConnection;tradingWorker=undefined;tradingWorkerConnection=undefined;if(worker)await worker.close();if(connection&&connection.status!=="end")await connection.quit();};
  const startTradingWorker=async()=>{tradingWorkerConnection=createRedisConnection(redisUrl);tradingWorker=new Worker(queueNames.tradingCommands,tradingProcessor,{connection:tradingWorkerConnection,concurrency:1});await tradingWorker.waitUntilReady();workerGeneration+=1;};
  const waitForTradingIdle=async()=>{const deadline=Date.now()+10_000;while(Date.now()<deadline){const counts=await tradingQueue.getJobCounts("waiting","active","delayed");if((counts.waiting??0)+(counts.active??0)+(counts.delayed??0)===0){const failed=await tradingQueue.getFailed(0,9);if(failed.length)throw new Error(`Trading queue failed: ${failed.map(job=>`${job.name}: ${job.failedReason}`).join("; ")}`);return counts;}await new Promise(resolve=>setTimeout(resolve,20));}throw new Error(`Trading queue did not become idle: ${JSON.stringify(await tradingQueue.getJobCounts())}`);};
  const monitorScheduler = new MonitorScheduler({ repository: schedules, queue: monitorQueue, calendar: createUsEquityMarketCalendar(), now: repositoryNow });
  const snapshotClient = {
    async load(input: MonitorSnapshotRequest) {
      const symbols = input.requirements.map(({ symbol }) => symbol);
      try {
        const quotes = await fixtures.alpaca.getQuotes(symbols);
        const snapshots = new Map<string, MonitorSnapshot>(input.requirements.map((requirement) => {
          const quote = quotes.data.find((item) => item.symbol === requirement.symbol);
          const metrics: MonitorSnapshot["metrics"] = {};
          if (requirement.metrics.includes("price")) metrics.price = { value: quote?.price, source: "alpaca", asOf: quotes.asOf, dataState: quote?.price === undefined ? "missing" : "fresh", notices: [] };
          return [requirement.symbol, { symbol: requirement.symbol, metrics, events: [], eventsState: "fresh", generatedAt: input.evaluatedAt }];
        }));
        return { snapshots, provenance: { dataState: "fresh" as const, sources: ["alpaca" as const], generatedAt: input.evaluatedAt } };
      } catch {
        const snapshots = new Map<string, MonitorSnapshot>(input.requirements.map((requirement) => [requirement.symbol, { symbol: requirement.symbol, metrics: Object.fromEntries(requirement.metrics.map((metric) => [metric, { dataState: "stale", notices: ["fixture provider failure"] }])), events: [], eventsState: "stale", generatedAt: input.evaluatedAt }]));
        return { snapshots, provenance: { dataState: "stale" as const, sources: ["alpaca" as const], generatedAt: input.evaluatedAt } };
      }
    },
  };
  const monitorRuns = new MonitorRunService({ store: new PostgresMonitorRunStore(database, theses, monitoring, schedules, outbox), snapshotClient });
  const processNotificationOutbox = async () => {
    const events = await database.selectFrom("platform.outbox_event").selectAll().where("publishedAt", "is", null).where("topic", "in", ["monitor.alert.created", "notification.test.requested"]).orderBy("occurredAt").execute();
    for (const event of events) {
      await notificationService.consume({ eventId: event.id, topic: event.topic as "monitor.alert.created" | "notification.test.requested", payload: event.payloadJson });
      await database.updateTable("platform.outbox_event").set({ publishedAt: repositoryNow() }).where("id", "=", event.id).execute();
    }
  };
  const app = buildApp({
    config: {
      host: "127.0.0.1",
      port,
      providers: { alpaca: { configured: true }, sec: { configured: true }, finnhub: { configured: true }, fred: { configured: true } },
      publicStatus: { providers: {} },
    },
    cache,
    market: { gateway, provider: fixtures.alpaca },
    company: { gateway, sec: fixtures.sec, profile: fixtures.finnhub, news: fixtures.alpaca },
    discovery: {
      universe: new UniverseService({
        getQuotes: (symbols) => fixtures.alpaca.getQuotes(symbols),
        getCompanyProfile: (symbol) => fixtures.finnhub.getCompanyProfile(symbol),
        getFinancialFacts: (symbol) => fixtures.sec.getFinancialFacts(symbol),
      }, clock.iso),
    },
    events: {
      gateway,
      provider: {
        getEarnings: (...args) => fixtures.finnhub.getEarnings(...args),
        getCorporateActions: (...args) => fixtures.alpaca.getCorporateActions(...args),
        getReleaseEvents: (...args) => fixtures.fred.getReleaseEvents(...args),
      },
    },
    macro: { gateway, provider: fixtures.fred },
    stateDiscovery: {
      database,
      idempotency,
      outbox,
      discovery: new PostgresDiscoveryStateRepository(database, repositoryNow),
      watchlists: new PostgresWatchlistRepository(database, repositoryNow),
    },
    thesisState: { database, idempotency, outbox, repository: theses },
    monitorState: { database, idempotency, outbox, repository: monitoring, runs: { enqueue: async () => [], get: (id) => schedules.getRun(id) } },
    manualPortfolio: {
      database,
      idempotency,
      outbox,
      repository: new PostgresManualPortfolioRepository(database, repositoryNow),
      reviews: new PostgresPortfolioReviewRepository(database, repositoryNow),
    },
    browserMigration: { service: new BrowserMigrationService(database, repositoryNow) },
    notifications: { configured: true, publicKey: "AQIDBA", database, idempotency, outbox, repository: pushSubscriptions },
    paperTrading:{status:{enabled:true,configured:true},database,idempotency,outbox,repository:broker,preview:{preview:input=>orderPreview.preview(input),verify:token=>previewTokens.verify(token)},now:repositoryNow},
    paperPortfolio:{store:new PostgresPaperPortfolioStore(database),database,idempotency,outbox,now:repositoryNow},
    staticDir: "dist",
  });
  app.addHook("onClose", async () => { await tradingPublisher.stop();await stopTradingWorker();await tradingQueue.close();if(tradingQueueConnection.status!=="end")await tradingQueueConnection.quit();await monitorQueue.close(); if (redis.status !== "end") await redis.quit(); });
  app.post("/api/testing/reset", async () => {
    await stopTradingWorker();
    await resetTestDatabase(database);
    clock.reset();
    fixtures.reset();
    fakePush.clear();
    await redis.flushdb();
    workerGeneration=0;
    reconcileSequence=0;
    await startTradingWorker();
    await monitorScheduler.start();
    return { ok: true };
  });

  app.post("/api/testing/restart", (_request, reply) => {
    reply.send({ ok: true });
    if (!restartPromise) {
      setTimeout(() => {
        if (!stopping && !restartPromise) restartPromise = restartServer().finally(() => { restartPromise = undefined; });
      }, 100);
    }
    return reply;
  });

  app.get("/api/testing/database-state", async () => ({
    serverInstanceId,
    migrationReceipts: await count(database, "platform.browser_migration_receipt"),
    migrationRecords: await count(database, "platform.browser_migration_record"),
    watchlists: await count(database, "core.watchlist_group"),
    savedScreens: await count(database, "core.saved_screen"),
    theses: await count(database, "core.thesis_version"),
    alerts: await count(database, "monitor.alert"),
    ledgerEvents: await count(database, "core.manual_portfolio_ledger_event"),
    weeklyReviews: await count(database, "core.portfolio_weekly_review"),
    notificationDeliveries: await count(database, "notification.delivery"),
    successfulDeliveries: Number((await database.selectFrom("notification.delivery").select(({ fn }) => fn.countAll<string>().as("count")).where("status", "=", "succeeded").executeTakeFirstOrThrow()).count),
  }));

  app.post("/api/testing/clock/advance", (request, reply) => {
    const minutes = (request.body as { minutes?: number }).minutes;
    try { return { now: clock.advanceMinutes(minutes!) }; }
    catch { return reply.status(400).send({ code: "INVALID_CLOCK_ADVANCE", message: "minutes must be between 1 and 1440", retryable: false }); }
  });

  app.post("/api/testing/monitor/run", async (request, reply) => {
    const type = (request.body as { type?: string }).type;
    if (type !== "price") return reply.status(400).send({ code: "INVALID_RUN_TYPE", message: "only price is supported by this E2E control", retryable: false });
    const now = clock.iso();
    const claimed = await schedules.claim({ type: "price", naturalPeriod: now.slice(0, 16), scheduledFor: now, catchUp: false });
    if (!claimed) return { duplicate: true };
    const result = await monitorRuns.run(claimed, now);
    await processNotificationOutbox();
    return result;
  });

  app.get("/api/testing/push/captures", () => fakePush.list());
  app.post("/api/testing/push/clear", () => { fakePush.clear(); return { ok: true }; });
  app.post("/api/testing/outbox/replay", async () => { await database.updateTable("platform.outbox_event").set({ publishedAt: null }).where("topic", "in", ["monitor.alert.created", "notification.test.requested"]).execute(); await processNotificationOutbox(); return { ok: true }; });
  app.post("/api/testing/redis/flush", async () => { await redis.flushdb(); await monitorScheduler.start(); return { ok: true, schedulers: await monitorQueue.getJobSchedulersCount() }; });

  app.post("/api/testing/fail-next", (request, reply) => {
    const body = request.body as { source?: "alpaca" | "sec" | "finnhub" | "fred"; code?: 429 | 503 };
    if (!body.source || (body.code !== 429 && body.code !== 503)) {
      return reply.status(400).send({ code: "INVALID_TEST_FAILURE", message: "测试故障参数无效", retryable: false });
    }
    clock.advanceMinutes(16);
    fixtures.failNext(body.source, body.code);
    return { ok: true };
  });

  app.post("/api/testing/market-state", (request, reply) => {
    const body = request.body as { symbol?: string; price?: number; previousClose?: number };
    if (!body.symbol || !/^[A-Z0-9.-]+$/.test(body.symbol) || !Number.isFinite(body.price) || body.price! <= 0 || (body.previousClose !== undefined && (!Number.isFinite(body.previousClose) || body.previousClose <= 0))) {
      return reply.status(400).send({ code: "INVALID_MARKET_STATE", message: "测试行情参数无效", retryable: false });
    }
    clock.advanceMinutes(2);
    fixtures.setQuote(body.symbol, body.price!, body.previousClose);
    return { ok: true, now: clock.iso() };
  });

  const submissionEvent=async(intentId:string)=>database.selectFrom("platform.outbox_event").selectAll().where("aggregateId","=",intentId).where("topic","=","broker.order.submit.requested").executeTakeFirst();
  const processTrading=async()=>{const published=await tradingPublisher.publishBatch(100);const counts=await waitForTradingIdle();await reconciliation.reconcileAll();return{published,counts};};
  app.post("/api/testing/trading/process",processTrading);
  app.post("/api/testing/trading/worker/restart",async()=>{await stopTradingWorker();await startTradingWorker();return{ok:true,workerGeneration};});
  app.get<{Params:{id:string}}>("/api/testing/trading/state/:id",async(request,reply)=>{const event=await submissionEvent(request.params.id);if(!event)return reply.status(404).send({code:"TEST_SUBMISSION_EVENT_NOT_FOUND"});const [inbox,eventCount]=await Promise.all([database.selectFrom("platform.inbox_event").select(({fn})=>fn.countAll<string>().as("count")).where("consumer","=","trading-worker").where("eventId","=",event.id).executeTakeFirstOrThrow(),broker.countOrderEvents(request.params.id)]);return{workerGeneration,submissionCount:fixtures.trading.getSubmissionCount(),inboxCount:Number(inbox.count),eventCount};});
  app.post<{Params:{id:string}}>("/api/testing/trading/redeliver/:id",async(request,reply)=>{const event=await submissionEvent(request.params.id);if(!event)return reply.status(404).send({code:"TEST_SUBMISSION_EVENT_NOT_FOUND"});const job=await tradingQueue.getJob(event.id);if(!job)return reply.status(409).send({code:"TEST_TRADING_JOB_NOT_FOUND"});const name=job.name;const data=job.data;await job.remove();await tradingQueue.add(name,data,{jobId:event.id});await waitForTradingIdle();return{ok:true,eventId:event.id};});
  app.post("/api/testing/trading/lost-response",()=>{fixtures.trading.failNextSubmitAsLostResponse();return{ok:true};});
  app.post<{Params:{id:string}}>("/api/testing/trading/orders/:id/partial-fill",async request=>{const order=fixtures.trading.partialFill(request.params.id,String((request.body as {quantity?:string}).quantity??"0.5"),String((request.body as {price?:string}).price??"100"));await reconciliationRepository.observeOrder(order);await reconciliation.reconcileAll();return order;});
  app.post<{Params:{id:string}}>("/api/testing/trading/orders/:id/fill",async request=>{const order=fixtures.trading.fill(request.params.id,String((request.body as {quantity?:string}).quantity??"1"),String((request.body as {price?:string}).price??"100"));await reconciliationRepository.observeOrder(order);await reconciliation.reconcileAll();return order;});
  app.post<{Params:{id:string}}>("/api/testing/trading/orders/:id/cancel-ack",async request=>{const order=fixtures.trading.acknowledgeCancel(request.params.id);await reconciliationRepository.observeOrder(order);return order;});
  app.post("/api/testing/trading/drift",async request=>{fixtures.trading.setCash(Number((request.body as{cash?:number}).cash??9999));return reconciliation.reconcileAll();});

  await startTradingWorker();
  await monitorScheduler.start();
  return app;
}

async function startServer(reset: boolean): Promise<RunningServer> {
  const database = createDatabase(connectionString);
  try {
    await migrateToLatest(database);
    if (reset) await resetTestDatabase(database);
    const app = await createServer(database);
    await app.listen({ host: "127.0.0.1", port });
    return { app, database };
  } catch (error) {
    await database.destroy();
    throw error;
  }
}

async function restartServer(): Promise<void> {
  const previous = running;
  if (!previous) return;
  running = undefined;
  await previous.app.close();
  await previous.database.destroy();
  running = await startServer(false);
}

async function close(): Promise<void> {
  stopping = true;
  if (restartPromise) await restartPromise;
  if (!running) return;
  await running.app.close();
  await running.database.destroy();
  running = undefined;
}

running = await startServer(true);
process.once("SIGINT", () => { void close(); });
process.once("SIGTERM", () => { void close(); });
