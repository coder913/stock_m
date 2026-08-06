import { beforeEach, expect, test } from "vitest";
import { AlertRepository } from "./alertRepository";

beforeEach(() => localStorage.clear());
const candidate = (severity: "warning" | "critical") => ({ dedupeKey: "position-concentration:NVDA:2026-W32", rule: "position-concentration", severity, symbol: "NVDA", message: "NVDA 仓位集中", currentValue: severity === "critical" ? 30 : 20, threshold: severity === "critical" ? 30 : 20 });

test("deduplicates an active alert and upgrades severity", () => {
  const repository = new AlertRepository(localStorage);
  repository.reconcile([candidate("warning")], "2026-08-06T10:00:00Z"); repository.reconcile([candidate("critical")], "2026-08-06T11:00:00Z");
  expect(repository.list()).toHaveLength(1); expect(repository.list()[0].severity).toBe("critical");
});

test("snoozes and restores an alert on its due date", () => {
  const repository = new AlertRepository(localStorage); const [alert] = repository.reconcile([candidate("warning")], "2026-08-06T10:00:00Z");
  repository.snooze(alert.id, "2026-08-10T00:00:00Z"); repository.restoreDue("2026-08-09T23:59:59Z"); expect(repository.get(alert.id).status).toBe("snoozed");
  repository.restoreDue("2026-08-10T00:00:00Z"); expect(repository.get(alert.id).status).toBe("open");
});
