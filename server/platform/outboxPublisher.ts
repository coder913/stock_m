import type { Kysely } from "kysely";
import type { Database } from "../db/types";
import type { OutboxRepository } from "./outboxRepository";

export interface EventQueue {
  add(name: string, data: unknown, options: { jobId: string }): Promise<unknown>;
}

export class OutboxPublisher {
  private timer?: ReturnType<typeof setInterval>;
  private activePublish?: Promise<number>;

  constructor(
    private readonly database: Kysely<Database>, private readonly outbox: OutboxRepository,
    private readonly queue: EventQueue, private readonly now: () => Date = () => new Date(),
  ) {}

  publishBatch(limit: number): Promise<number> {
    return this.database.transaction().execute(async (transaction) => {
      const events = await this.outbox.listUnpublishedForUpdate(transaction, limit);
      let published = 0;
      for (const event of events) {
        try {
          await this.queue.add(event.topic, event.payloadJson, { jobId: event.id });
          await this.outbox.markPublished(transaction, event.id, this.now());
          published += 1;
        } catch {
          await this.outbox.recordFailure(transaction, event.id);
        }
      }
      return published;
    });
  }

  start(intervalMs = 500): void {
    if (this.timer) return;
    const publish = () => {
      if (this.activePublish) return;
      this.activePublish = this.publishBatch(100).finally(() => { this.activePublish = undefined; });
      void this.activePublish.catch(() => undefined);
    };
    publish();
    this.timer = setInterval(publish, intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.activePublish;
  }
}
