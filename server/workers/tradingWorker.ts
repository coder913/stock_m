import { pathToFileURL } from "node:url";
import { UnrecoverableError, type Job } from "bullmq";
import type { Kysely } from "kysely";
import { AlpacaTradingProvider } from "../broker/alpacaTradingProvider";
import { startAlpacaTradeUpdateStream } from "../broker/alpacaTradeUpdates";
import { BrokerRepository } from "../broker/brokerRepository";
import { CancelCommandService } from "../broker/cancelCommandService";
import { OrderCommandService } from "../broker/orderCommandService";
import { PostgresBrokerReconciliationRepository } from "../broker/brokerReconciliationRepository";
import { ReconciliationService } from "../broker/reconciliationService";
import type { Database } from "../db/types";
import { consumeOnce } from "../platform/outboxRepository";
import { queueNames } from "../queue/queueNames";
import { runWorker } from "./workerRuntime";

interface Commands {
  submit(event: { eventId: string; intentId: string }): Promise<void>;
  cancel(event: { eventId: string; intentId: string; cancelIntentId: string }): Promise<void>;
  reconcileFull?(): Promise<void>;
}

export interface TradingInbox {
  consume(eventId: string, effect: () => Promise<void>): Promise<boolean>;
}

export class PostgresTradingInbox implements TradingInbox {
  constructor(private readonly database: Kysely<Database>) {}

  consume(eventId: string, effect: () => Promise<void>): Promise<boolean> {
    return this.database.transaction().execute((transaction) =>
      consumeOnce(transaction, "trading-worker", eventId, async () => effect()));
  }
}

function commandFor(job: Job, commands: Commands, eventId: string): () => Promise<void> {
  const body = job.data as Record<string, unknown>;
  if (job.name === "broker.order.submit.requested") {
    return () => commands.submit({ eventId, intentId: String(body.id ?? body.intentId) });
  }
  if (job.name === "broker.order.cancel.requested") {
    return () => commands.cancel({ eventId, intentId: String(body.intentId), cancelIntentId: String(body.cancelIntentId) });
  }
  if (job.name === "broker.order.reconcile.requested") {
    return () => commands.submit({ eventId, intentId: String(body.intentId) });
  }
  if (job.name === "broker.reconciliation.requested") {
    return async () => { await commands.reconcileFull?.(); };
  }
  throw new UnrecoverableError(`Unsupported trading job: ${job.name}`);
}

export function createTradingJobProcessor(commands: Commands, inbox: TradingInbox): (job: Job) => Promise<void> {
  return async (job) => {
    const body = job.data as Record<string, unknown>;
    const eventId = String(job.id ?? body.eventId ?? "");
    if (!eventId) throw new UnrecoverableError("Trading job has no event id");
    const command = commandFor(job, commands, eventId);
    await inbox.consume(eventId, command);
  };
}

interface BackgroundLifecycleInput {
  reconcileOrders(): Promise<unknown>;
  reconcileAll(): Promise<unknown>;
  startStream(onHealth: (healthy: boolean) => void): { stop(): Promise<void> };
}

interface TradingBackgroundLifecycle {
  healthy(): boolean;
  close(): Promise<void>;
}

export function createTradingBackgroundLifecycle(input: BackgroundLifecycleInput): TradingBackgroundLifecycle {
  let streamHealthy = false;
  let orderReconciliationHealthy = true;
  let fullReconciliationHealthy = true;
  let stopped = false;
  let closePromise: Promise<void> | undefined;
  const active = new Set<Promise<void>>();

  const run = (kind: "orders" | "full", operation: () => Promise<unknown>) => {
    if (stopped) return;
    const task = Promise.resolve()
      .then(operation)
      .then(() => {
        if (kind === "orders") orderReconciliationHealthy = true;
        else fullReconciliationHealthy = true;
      })
      .catch(() => {
        if (kind === "orders") orderReconciliationHealthy = false;
        else fullReconciliationHealthy = false;
      })
      .finally(() => { active.delete(task); });
    active.add(task);
  };

  const orderTimer = setInterval(() => run("orders", input.reconcileOrders), 30_000);
  const fullTimer = setInterval(() => run("full", input.reconcileAll), 300_000);
  orderTimer.unref?.();
  fullTimer.unref?.();
  const stream = input.startStream((healthy) => { streamHealthy = healthy; });

  return {
    healthy: () => streamHealthy && orderReconciliationHealthy && fullReconciliationHealthy,
    close: () => {
      if (closePromise) return closePromise;
      stopped = true;
      clearInterval(orderTimer);
      clearInterval(fullTimer);
      closePromise = (async () => {
        await stream.stop();
        await Promise.allSettled([...active]);
      })();
      return closePromise;
    },
  };
}

export async function startTradingWorker(): Promise<void> {
  await runWorker({
    worker: "trading",
    queueName: queueNames.tradingCommands,
    concurrency: 1,
    initialize: async ({ config, database, queue }) => {
      if (!config.paperTrading.enabled || !config.paperTrading.configured || !config.secrets.alpaca) {
        throw new Error("Alpaca Paper trading is not enabled and configured");
      }
      const credentials = config.secrets.alpaca;
      const provider = new AlpacaTradingProvider({ baseUrl: config.paperTrading.baseUrl, ...credentials });
      const repository = new BrokerRepository(database);
      const reconciliationRepository = new PostgresBrokerReconciliationRepository(database);
      const reconciliation = new ReconciliationService(provider, reconciliationRepository);
      const scheduler = {
        reconcileOrder: (intentId: string) => queue.add("broker.order.reconcile.requested", { intentId }, { delay: 1000, jobId: `reconcile-${intentId}-${Date.now()}` }),
      };
      await reconciliation.reconcileAll();
      const background = createTradingBackgroundLifecycle({
        reconcileOrders: () => reconciliation.reconcileOrders(),
        reconcileAll: () => reconciliation.reconcileAll(),
        startStream: (onHealth) => startAlpacaTradeUpdateStream({
          ...credentials,
          observe: (order) => reconciliationRepository.observeOrder(order),
          onHealth,
        }),
      });
      const commands = {
        submit: (event: { eventId: string; intentId: string }) => new OrderCommandService(repository, provider, scheduler).submit(event),
        cancel: (event: { eventId: string; intentId: string; cancelIntentId: string }) => new CancelCommandService(repository, provider, scheduler).cancel(event),
        reconcileFull: () => reconciliation.reconcileAll().then(() => undefined),
      };
      return {
        process: createTradingJobProcessor(commands, new PostgresTradingInbox(database)),
        healthy: background.healthy,
        close: background.close,
      };
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startTradingWorker();
