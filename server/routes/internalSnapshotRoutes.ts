import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EvaluationDataState, MonitorSnapshot, MonitorSnapshotRequest, ThesisCondition } from "../../shared/monitoring";
import { ApiError } from "../core/errors";

const metricNames = ["price", "dailyChangePercent", "revenueGrowthYoY", "operatingMargin", "freeCashFlow", "freeCashFlowYield", "netDebtToEbitda", "earningsSurprise", "grossMarginYoYChange", "priceVs20DayHigh", "relativeVolume", "averageDollarVolume20d"] as const;
const eventTypes = ["earnings", "dividend", "split", "corporate-action", "macro"] as const;
const requestSchema = z.object({
  requirements: z.array(z.object({
    symbol: z.string().regex(/^[A-Za-z0-9.-]+$/),
    metrics: z.array(z.enum(metricNames)),
    eventWindows: z.array(z.object({ eventType: z.enum(eventTypes), from: z.iso.date().optional(), to: z.iso.date() })),
  })).min(1).max(100),
  evaluatedAt: z.iso.datetime({ offset: true }),
});

export interface InternalSnapshotLoader {
  load(conditions: ThesisCondition[], now: string): Promise<Map<string, MonitorSnapshot>>;
}

export interface InternalSnapshotRouteDependencies {
  token: string;
  loader: InternalSnapshotLoader;
}

function authorized(header: string | undefined, token: string): boolean {
  if (!header) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function toConditions(input: MonitorSnapshotRequest): ThesisCondition[] {
  return input.requirements.flatMap((requirement) => {
    const base = { symbol: requirement.symbol.toUpperCase(), thesisVersionId: "internal-snapshot", direction: "support" as const, severity: "low" as const, createdAt: input.evaluatedAt, updatedAt: input.evaluatedAt };
    const metrics: ThesisCondition[] = requirement.metrics.map((metric, index) => ({ ...base, id: `${base.symbol}:metric:${metric}:${index}`, name: metric, kind: "metric", metric, operator: ">=", target: 0, period: "CURRENT" }));
    const events: ThesisCondition[] = requirement.eventWindows.map((window, index) => ({ ...base, id: `${base.symbol}:event:${window.eventType}:${index}`, name: window.eventType, kind: "event", eventType: window.eventType, occurrence: window.from ? "within-range" : "before-date", ...(window.from ? { from: window.from } : {}), to: window.to }));
    return [...metrics, ...events];
  });
}

const statePriority: Record<EvaluationDataState, number> = { fresh: 0, missing: 1, stale: 2, unavailable: 3 };

export function registerInternalSnapshotRoutes(app: FastifyInstance, dependencies: InternalSnapshotRouteDependencies): void {
  app.post("/internal/v1/monitor-snapshots", async (request) => {
    if (!authorized(request.headers.authorization, dependencies.token)) throw new ApiError("UNAUTHORIZED", "Invalid internal service token", 401, false);
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError("INVALID_SNAPSHOT_REQUEST", "Invalid monitor snapshot request", 400, false, parsed.error.flatten());
    const input = parsed.data as MonitorSnapshotRequest;
    const loaded = await dependencies.loader.load(toConditions(input), input.evaluatedAt);
    const snapshots = Object.fromEntries([...loaded].map(([symbol, snapshot]) => [symbol.toUpperCase(), snapshot]));
    const states: EvaluationDataState[] = [];
    const sources = new Set<NonNullable<MonitorSnapshot["metrics"][keyof MonitorSnapshot["metrics"]]>["source"]>();
    for (const requirement of input.requirements) {
      const snapshot = snapshots[requirement.symbol.toUpperCase()];
      if (!snapshot) { states.push("unavailable"); continue; }
      for (const metric of requirement.metrics) {
        const value = snapshot.metrics[metric];
        states.push(value?.dataState ?? "missing");
        if (value?.source) sources.add(value.source);
      }
      if (requirement.eventWindows.length) {
        states.push(snapshot.eventsState);
        for (const event of snapshot.events) sources.add(event.source);
      }
    }
    const dataState = states.sort((left, right) => statePriority[right] - statePriority[left])[0] ?? "fresh";
    const generatedAt = Object.values(snapshots).map((snapshot) => snapshot.generatedAt).sort().at(-1) ?? input.evaluatedAt;
    return { snapshots, provenance: { dataState, sources: [...sources].sort(), generatedAt } };
  });
}
