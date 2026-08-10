import { expect, test, vi } from "vitest";
import { ThesisApiRepository } from "./thesisApiRepository";

test("creates thesis versions with an idempotency key", async () => {
  const client = { requestJson: vi.fn(async () => ({ id: "thesis-1" })) };
  const repository = new ThesisApiRepository(client as never);
  const draft = { symbol: "NVDA", coreJudgment: "AI demand", evidence: ["revenue"], risks: ["valuation"], validationConditions: ["earnings"] };
  await repository.create(draft, "command-1");
  expect(client.requestJson).toHaveBeenCalledWith({ method: "POST", path: "/theses", body: draft, idempotencyKey: "command-1" });
});
