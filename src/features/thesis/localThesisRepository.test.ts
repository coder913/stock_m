import { expect, test } from "vitest";
import { LocalThesisRepository } from "./localThesisRepository";

test("creates immutable thesis versions", () => {
  localStorage.clear(); const repo = new LocalThesisRepository(localStorage);
  const first = repo.save({ symbol: "NVDA", coreJudgment: "增长", evidence: ["收入"], risks: ["估值"], validationConditions: ["财报"] });
  const second = repo.save({ ...first, coreJudgment: "更新判断" });
  expect(first.version).toBe(1); expect(second.version).toBe(2); expect(repo.getHistory("NVDA")[0].coreJudgment).toBe("增长");
});
