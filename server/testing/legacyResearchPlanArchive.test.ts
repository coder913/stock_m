// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("the legacy research-loop plan is archived instead of counted as active backlog", () => {
  const plan = readFileSync(
    new URL("../../docs/superpowers/plans/2026-08-04-stock-m-research-loop.md", import.meta.url),
    "utf8",
  );

  expect(plan).toContain("Status: Archived and superseded (audited 2026-08-11)");
  expect(plan).toContain("Historical unchecked steps audited: 46");
  expect(plan).toContain("Current development gaps represented by this plan: 0");
  expect(plan.match(/^- \[ \]/gm) ?? []).toHaveLength(0);
  expect(plan.match(/^\*\*Historical Step \d+:/gm) ?? []).toHaveLength(46);
});
