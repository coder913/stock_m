import { beforeEach, describe, expect, test } from "vitest";
import { LocalThesisRepository } from "../thesis/localThesisRepository";
import { ConditionRepository } from "./conditionRepository";
import { EvaluationRepository } from "./evaluationRepository";
import { MonitorAlertRepository } from "./monitorAlertRepository";
import { ThesisReviewRepository } from "./thesisReviewRepository";
import type { MetricConditionDraft, MonitorSnapshot } from "./domain";
import { ThesisMonitorService } from "./thesisMonitorService";

const draft: MetricConditionDraft = { id: "condition-price", kind: "metric", name: "NVDA 估值风险", direction: "risk", severity: "high", metric: "price", operator: ">=", target: 180, period: "CURRENT" };
const priceSnapshot = (price: number, asOf: string, dataState: "fresh" | "stale" = "fresh"): MonitorSnapshot => ({ symbol: "NVDA", metrics: { price: { value: price, source: "alpaca", asOf, dataState, notices: [] } }, events: [], eventsState: "fresh", eventsAsOf: asOf, generatedAt: asOf });

function setup(snapshots: MonitorSnapshot[]) {
  const conditionRepository = new ConditionRepository(localStorage);
  const evaluationRepository = new EvaluationRepository(localStorage);
  const alertRepository = new MonitorAlertRepository(localStorage);
  const reviewRepository = new ThesisReviewRepository(localStorage);
  const thesisRepository = new LocalThesisRepository(localStorage);
  const thesis = thesisRepository.save({ symbol: "NVDA", coreJudgment: "AI 需求增长", evidence: ["收入"], risks: ["估值"], validationConditions: ["旧文本"] }, "2026-08-09T09:00:00Z");
  conditionRepository.saveForThesis({ symbol: "NVDA", thesisVersionId: thesis.id, conditions: [draft], now: "2026-08-09T09:00:00Z" });
  let index = 0;
  const loader = { load: async () => new Map([["NVDA", snapshots[Math.min(index++, snapshots.length - 1)]]]) };
  const service = new ThesisMonitorService({ conditionRepository, evaluationRepository, alertRepository, reviewRepository, thesisRepository, snapshotLoader: loader });
  return { service, alertRepository, reviewRepository, thesis, thesisRepository, conditionRepository };
}

beforeEach(() => localStorage.clear());

describe("ThesisMonitorService", () => {
  test("creates one alert when a condition changes from confirmed to breached", async () => {
    const { service, alertRepository } = setup([priceSnapshot(170, "2026-08-09T10:00:00Z"), priceSnapshot(190, "2026-08-09T10:05:00Z")]);
    await service.evaluate({ now: "2026-08-09T10:00:01Z" });
    await service.evaluate({ now: "2026-08-09T10:05:01Z" });
    await service.evaluate({ now: "2026-08-09T10:05:01Z" });

    expect(alertRepository.list({ view: "pending", now: "2026-08-09T10:06:00Z" })).toEqual([
      expect.objectContaining({ symbol: "NVDA", fromStatus: "confirmed", toStatus: "breached" }),
    ]);
  });

  test("does not alert or overwrite a decisive result when a provider becomes stale", async () => {
    const { service, alertRepository } = setup([priceSnapshot(170, "2026-08-09T10:00:00Z"), priceSnapshot(190, "2026-08-09T10:05:00Z", "stale")]);
    const first = await service.evaluate({ now: "2026-08-09T10:00:01Z" });
    const second = await service.evaluate({ now: "2026-08-09T10:05:01Z" });

    expect(first.conditions[0].status).toBe("confirmed");
    expect(second.conditions[0]).toMatchObject({ status: "confirmed", dataState: "stale" });
    expect(alertRepository.list({ view: "pending", now: "2026-08-09T10:06:00Z" })).toEqual([]);
  });

  test("keeps reaffirmed health normal until the concern set changes", async () => {
    const { service, reviewRepository, thesis } = setup([priceSnapshot(190, "2026-08-09T10:00:00Z"), priceSnapshot(190, "2026-08-09T10:05:00Z")]);
    await service.evaluate({ now: "2026-08-09T10:00:01Z" });
    expect(service.getHealth(["NVDA"], "2026-08-09T10:01:00Z").items[0].status).toBe("review-needed");
    reviewRepository.record({ thesisVersionId: thesis.id, symbol: "NVDA", decision: "reaffirmed", conditionSnapshot: service.getConditionView(thesis.id).map(({ condition, evaluation }) => ({ conditionId: condition.id, conditionVersion: condition.conditionVersion!, name: condition.name, severity: condition.severity, status: evaluation!.status })), createdAt: "2026-08-09T10:02:00Z" });
    await service.evaluate({ now: "2026-08-09T10:05:01Z" });
    expect(service.getHealth(["NVDA"], "2026-08-09T10:06:00Z").items[0].status).toBe("normal");
  });

  test("reports unmonitored symbols instead of assuming normal", () => {
    const { service } = setup([priceSnapshot(170, "2026-08-09T10:00:00Z")]);
    expect(service.getHealth(["MSFT"], "2026-08-09T10:01:00Z").items[0].status).toBe("unmonitored");
  });

  test("evaluates only conditions bound to the latest thesis version", async () => {
    const { service, thesisRepository, conditionRepository } = setup([priceSnapshot(190, "2026-08-09T10:00:00Z")]);
    const latest = thesisRepository.save({ symbol: "NVDA", coreJudgment: "latest", evidence: ["evidence"], risks: ["risk"], validationConditions: ["validation"] }, "2026-08-09T10:01:00Z");
    conditionRepository.saveForThesis({ symbol: "NVDA", thesisVersionId: latest.id, conditions: [{ ...draft, id: "condition-price-v2", target: 200 }], now: "2026-08-09T10:01:00Z" });

    const result = await service.evaluate({ now: "2026-08-09T10:02:00Z" });

    expect(result.conditions).toHaveLength(1);
    expect(result.conditions[0].conditionId).toBe("condition-price-v2");
  });

  test("stops evaluating an archived thesis", async () => {
    const { service, reviewRepository, thesis } = setup([priceSnapshot(190, "2026-08-09T10:00:00Z")]);
    reviewRepository.record({ thesisVersionId: thesis.id, symbol: "NVDA", decision: "archived", note: "closed", conditionSnapshot: [], createdAt: "2026-08-09T10:01:00Z" });

    expect(await service.evaluate({ now: "2026-08-09T10:02:00Z" })).toMatchObject({ conditions: [], alertsCreated: 0 });
  });

  test("requires another review after a recovered condition breaches again", async () => {
    const { service, reviewRepository, thesis } = setup([
      priceSnapshot(190, "2026-08-09T10:00:00Z"),
      priceSnapshot(170, "2026-08-09T10:05:00Z"),
      priceSnapshot(190, "2026-08-09T10:10:00Z"),
    ]);
    await service.evaluate({ now: "2026-08-09T10:00:01Z" });
    reviewRepository.record({ thesisVersionId: thesis.id, symbol: "NVDA", decision: "reaffirmed", conditionSnapshot: service.getConditionView(thesis.id).map(({ condition, evaluation }) => ({ conditionId: condition.id, conditionVersion: condition.conditionVersion!, name: condition.name, severity: condition.severity, status: evaluation!.status })), createdAt: "2026-08-09T10:02:00Z" });
    await service.evaluate({ now: "2026-08-09T10:05:01Z" });
    await service.evaluate({ now: "2026-08-09T10:10:01Z" });

    expect(service.getHealth(["NVDA"], "2026-08-09T10:11:00Z").items[0].status).toBe("review-needed");
  });
});
