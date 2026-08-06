import { expect, test } from "vitest";
import { evaluatePortfolioAlerts } from "./alertEngine";

const fixture = (weight: number) => ({ naturalPeriod: "2026-W32", positions: [{ symbol: "NVDA", weight }], sectorExposure: {}, drawdownPercent: 0 });

test.each([[19.99, undefined], [20, "warning"], [30, "critical"]] as const)("maps position weight %s to %s", (weight, severity) => {
  expect(evaluatePortfolioAlerts(fixture(weight)).find((item) => item.rule === "position-concentration")?.severity).toBe(severity);
});
