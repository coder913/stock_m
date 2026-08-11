// @vitest-environment node
import { describe, expect, test } from "vitest";
import { transition, type LocalOrderState, type OrderLifecycleEvent } from "./orderStateMachine";

describe("paper order state transitions", () => {
  test.each<[LocalOrderState, OrderLifecycleEvent, LocalOrderState]>([
    ["confirmed", "command.submit_requested", "pending_submission"],
    ["pending_submission", "command.reconciling", "reconciling"],
    ["pending_submission", "remote.accepted", "accepted"],
    ["accepted", "remote.new", "new"],
    ["new", "remote.partially_filled", "partially_filled"],
    ["partially_filled", "remote.filled", "filled"],
    ["new", "command.cancel_requested", "cancel_pending"],
    ["cancel_pending", "remote.canceled", "canceled"],
    ["cancel_pending", "remote.filled", "filled"],
    ["pending_submission", "remote.rejected", "rejected"],
    ["new", "remote.expired", "expired"],
  ])("moves %s through %s to %s", (current, event, expected) => {
    expect(transition(current, event)).toBe(expected);
  });

  test("treats duplicate observations of the current remote state as a no-op", () => {
    expect(transition("partially_filled", "remote.partially_filled")).toBe("partially_filled");
    expect(transition("filled", "remote.filled")).toBe("filled");
  });

  test("rejects regression from a terminal state", () => {
    expect(() => transition("filled", "remote.new")).toThrow("INVALID_BROKER_TRANSITION");
    expect(() => transition("canceled", "remote.partially_filled")).toThrow("INVALID_BROKER_TRANSITION");
  });
});
