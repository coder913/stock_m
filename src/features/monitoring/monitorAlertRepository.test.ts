import { beforeEach, describe, expect, test } from "vitest";
import { MonitorAlertRepository } from "./monitorAlertRepository";

beforeEach(() => localStorage.clear());

const transition = (fromStatus: "pending" | "confirmed" | "breached" | undefined = "confirmed", toStatus: "confirmed" | "breached" | "expired" = "breached") => ({
  symbol: "NVDA", thesisVersionId: "thesis-1", conditionId: "condition-1", conditionVersion: "deadbeef", fromStatus, toStatus, severity: "high" as const, title: "NVDA 估值风险", explanation: "价格突破 180", asOf: "2026-08-09T10:00:00Z", createdAt: "2026-08-09T10:01:00Z",
});

describe("MonitorAlertRepository", () => {
  test("does not create the same transition alert twice", () => {
    const repo = new MonitorAlertRepository(localStorage);
    const first = repo.createTransition(transition());
    const second = repo.createTransition(transition());
    expect(second?.id).toBe(first?.id);
    expect(repo.list({ view: "pending", now: "2026-08-09T10:02:00Z" })).toHaveLength(1);
  });

  test("keeps identical normalized rules separate across theses", () => {
    const repo = new MonitorAlertRepository(localStorage);
    repo.createTransition(transition());
    repo.createTransition({ ...transition(), thesisVersionId: "thesis-2", conditionId: "condition-2" });
    expect(repo.list({ view: "pending", now: "2026-08-09T10:02:00Z" })).toHaveLength(2);
  });

  test("suppresses an initial pending to confirmed transition", () => {
    const repo = new MonitorAlertRepository(localStorage);
    expect(repo.createTransition(transition("pending", "confirmed"))).toBeUndefined();
    expect(repo.list({ view: "pending", now: "2026-08-09T10:02:00Z" })).toEqual([]);
  });

  test("supports read, snoozed, due restoration, and archive views", () => {
    const repo = new MonitorAlertRepository(localStorage);
    const alert = repo.createTransition(transition())!;
    expect(repo.markRead(alert.id, "2026-08-09T11:00:00Z").readAt).toBe("2026-08-09T11:00:00Z");
    repo.snooze(alert.id, "2026-08-11T00:00:00Z");
    expect(repo.list({ view: "snoozed", now: "2026-08-10T00:00:00Z" })).toHaveLength(1);
    repo.restoreDue("2026-08-11T00:00:00Z");
    expect(repo.list({ view: "pending", now: "2026-08-11T00:00:00Z" })).toHaveLength(1);
    repo.archive(alert.id, "2026-08-11T01:00:00Z");
    expect(repo.list({ view: "archived", now: "2026-08-11T01:00:00Z" })).toHaveLength(1);
  });

  test("isolates malformed persisted alerts", () => {
    const repo = new MonitorAlertRepository(localStorage);
    const valid = repo.createTransition(transition())!;
    localStorage.setItem("stock_m:monitor-alerts:v1", JSON.stringify([valid, { ...valid, id: "bad-alert", severity: "urgent" }]));

    expect(repo.list({ view: "pending", now: "2026-08-09T10:02:00Z" })).toEqual([expect.objectContaining({ id: valid.id })]);
  });
});
