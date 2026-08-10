import type { Queue } from "bullmq";
import type { MarketScheduleCalendar, RequiredRun } from "./scheduleDomain";
import { requiredRunPeriods } from "./scheduleDomain";
import type { ClaimedMonitorRun, MonitorScheduleRepository } from "./monitorScheduleRepository";

interface MonitorSchedulerOptions {
  repository: MonitorScheduleRepository;
  queue: Queue;
  calendar: MarketScheduleCalendar;
  now?: () => Date;
}

function monitorJobId(run: RequiredRun): string {
  return `monitor:${run.type}:${encodeURIComponent(run.naturalPeriod)}`;
}

export class MonitorScheduler {
  private readonly now: () => Date;

  constructor(private readonly options: MonitorSchedulerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async start(): Promise<ClaimedMonitorRun[]> {
    await Promise.all([
      this.options.queue.upsertJobScheduler("monitor-price-tick", { every: 300_000 }, { name: "monitor-schedule-tick", data: { type: "price" } }),
      this.options.queue.upsertJobScheduler("monitor-financial-tick", { pattern: "0 0 18 * * 1-5", tz: "America/New_York" }, { name: "monitor-schedule-tick", data: { type: "financial" } }),
      this.options.queue.upsertJobScheduler("monitor-event-tick", { pattern: "0 15 18 * * 1-5", tz: "America/New_York" }, { name: "monitor-schedule-tick", data: { type: "event" } }),
    ]);
    return this.reconcile();
  }

  async reconcile(): Promise<ClaimedMonitorRun[]> {
    const required = requiredRunPeriods({
      now: this.now().toISOString(),
      calendar: this.options.calendar,
      lastSuccess: await this.options.repository.lastSuccess(),
    });
    const claimed: ClaimedMonitorRun[] = [];
    for (const run of required) {
      const claim = await this.options.repository.claim(run);
      if (!claim) continue;
      await this.options.queue.add("monitor-run", claim, { jobId: monitorJobId(run), removeOnComplete: true });
      claimed.push(claim);
    }
    return claimed;
  }
}
