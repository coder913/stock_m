import { expect, test } from "vitest";
import { LocalThesisRepository } from "./localThesisRepository";

test("creates immutable thesis versions", () => {
  localStorage.clear(); const repo = new LocalThesisRepository(localStorage);
  const first = repo.save({ symbol: "NVDA", coreJudgment: "增长", evidence: ["收入"], risks: ["估值"], validationConditions: ["财报"] }, "2026-08-09T10:00:00Z");
  const second = repo.save({ ...first, coreJudgment: "更新判断" }, "2026-08-10T10:00:00Z");
  expect(first).toMatchObject({ version: 1, createdAt: "2026-08-09T10:00:00Z" });
  expect(second.version).toBe(2);
  expect(repo.getLatest("nvda")?.id).toBe(second.id);
  expect(repo.getHistory("NVDA")[0].coreJudgment).toBe("增长");
});

test("reads legacy theses without rewriting their free-text conditions", () => {
  localStorage.clear();
  localStorage.setItem("stock_m:theses", JSON.stringify([{ id: "legacy", symbol: "NVDA", coreJudgment: "增长", evidence: ["收入"], risks: ["估值"], validationConditions: ["财报后复核"], version: 1 }]));
  const repo = new LocalThesisRepository(localStorage);

  expect(repo.getLatest("NVDA")).toMatchObject({ createdAt: "1970-01-01T00:00:00.000Z", validationConditions: ["财报后复核"] });
  expect(JSON.parse(localStorage.getItem("stock_m:theses")!)[0].createdAt).toBeUndefined();
});
