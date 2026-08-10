// @vitest-environment node
import { expect, test } from "vitest";
import { createUsEquityMarketCalendar, requiredRunPeriods } from "./scheduleDomain";

const calendar = createUsEquityMarketCalendar({ closedDates: ["2026-12-25"] });

test("rounds summer and winter regular-session runs with the New York UTC offset", () => {
  expect(requiredRunPeriods({ now: "2026-08-10T14:07:00Z", calendar, lastSuccess: {} })).toContainEqual({
    type: "price",
    naturalPeriod: "2026-08-10T10:05-04:00",
    scheduledFor: "2026-08-10T14:05:00.000Z",
    catchUp: true,
  });
  expect(requiredRunPeriods({ now: "2026-11-02T15:07:00Z", calendar, lastSuccess: {} })).toContainEqual({
    type: "price",
    naturalPeriod: "2026-11-02T10:05-05:00",
    scheduledFor: "2026-11-02T15:05:00.000Z",
    catchUp: true,
  });
});

test("does not schedule price runs before, after, or outside a regular trading day", () => {
  const holidayNoon = requiredRunPeriods({ now: "2026-12-25T17:00:00Z", calendar, lastSuccess: {} });
  const preMarket = requiredRunPeriods({ now: "2026-08-10T13:29:00Z", calendar, lastSuccess: {} });
  const postMarket = requiredRunPeriods({ now: "2026-08-10T20:01:00Z", calendar, lastSuccess: {} });
  expect(holidayNoon).not.toContainEqual(expect.objectContaining({ type: "price" }));
  expect(preMarket).not.toContainEqual(expect.objectContaining({ type: "price" }));
  expect(postMarket).not.toContainEqual(expect.objectContaining({ type: "price" }));
});

test("schedules daily financial and event groups at 18:00 and 18:15 New York time", () => {
  const afterFinancial = requiredRunPeriods({ now: "2026-08-10T22:10:00Z", calendar, lastSuccess: {} });
  expect(afterFinancial).toContainEqual({ type: "financial", naturalPeriod: "2026-08-10", scheduledFor: "2026-08-10T22:00:00.000Z", catchUp: true });
  expect(afterFinancial).not.toContainEqual(expect.objectContaining({ type: "event", naturalPeriod: "2026-08-10" }));

  const afterEvents = requiredRunPeriods({ now: "2026-08-10T22:20:00Z", calendar, lastSuccess: {} });
  expect(afterEvents).toContainEqual({ type: "event", naturalPeriod: "2026-08-10", scheduledFor: "2026-08-10T22:15:00.000Z", catchUp: true });
});

test("restart catch-up returns only the latest missed run and skips successful periods", () => {
  const runs = requiredRunPeriods({
    now: "2026-08-10T14:07:00Z",
    calendar,
    lastSuccess: { price: "2026-08-10T09:35-04:00", financial: "2026-08-07", event: "2026-08-07" },
  });
  expect(runs.filter(({ type }) => type === "price")).toEqual([{ type: "price", naturalPeriod: "2026-08-10T10:05-04:00", scheduledFor: "2026-08-10T14:05:00.000Z", catchUp: true }]);
  expect(runs.filter(({ type }) => type === "financial")).toEqual([]);
  expect(runs.filter(({ type }) => type === "event")).toEqual([]);

  expect(requiredRunPeriods({
    now: "2026-08-10T14:07:00Z",
    calendar,
    lastSuccess: { price: "2026-08-10T10:05-04:00" },
  }).filter(({ type }) => type === "price")).toEqual([]);
});
