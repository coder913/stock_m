import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { MetricConditionDraft } from "./domain";
import { ConditionEditor } from "./ConditionEditor";

afterEach(cleanup);

test("adds a structured risk price condition", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ConditionEditor drafts={[]} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "添加风险条件" }));
  await user.selectOptions(screen.getByLabelText("条件类型"), "metric");
  await user.selectOptions(screen.getByLabelText("指标"), "price");
  await user.selectOptions(screen.getByLabelText("比较符"), ">=");
  await user.clear(screen.getByLabelText("目标值"));
  await user.type(screen.getByLabelText("目标值"), "180");
  await user.selectOptions(screen.getByLabelText("严重程度"), "high");

  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ kind: "metric", direction: "risk", metric: "price", operator: ">=", target: 180, severity: "high" })]);
});

test("requires both bounds for a between condition", () => {
  const draft = { id: "condition-1", kind: "metric", name: "价格区间", direction: "support", severity: "medium", metric: "price", operator: "between", target: [180, undefined], period: "CURRENT" } as unknown as MetricConditionDraft;
  render(<ConditionEditor drafts={[draft]} onChange={() => undefined} />);

  expect(screen.getByRole("alert")).toHaveTextContent("请填写区间上限");
});

test("shows event-only occurrence controls and supports draft deletion", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ConditionEditor drafts={[]} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "添加支持条件" }));
  await user.selectOptions(screen.getByLabelText("条件类型"), "event");

  expect(screen.getByLabelText("事件语义")).toBeVisible();
  expect(screen.queryByLabelText("指标")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "删除草稿条件" }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});
