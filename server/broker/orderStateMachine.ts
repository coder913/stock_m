export type LocalOrderState =
  | "draft"
  | "confirmed"
  | "pending_submission"
  | "reconciling"
  | "accepted"
  | "new"
  | "partially_filled"
  | "filled"
  | "cancel_pending"
  | "canceled"
  | "rejected"
  | "expired";

export type OrderLifecycleEvent =
  | "command.confirmed"
  | "command.submit_requested"
  | "command.reconciling"
  | "command.cancel_requested"
  | "remote.accepted"
  | "remote.new"
  | "remote.partially_filled"
  | "remote.filled"
  | "remote.canceled"
  | "remote.rejected"
  | "remote.expired";

const terminalStates = new Set<LocalOrderState>(["filled", "canceled", "rejected", "expired"]);
const remoteStateByEvent: Partial<Record<OrderLifecycleEvent, LocalOrderState>> = {
  "remote.accepted": "accepted",
  "remote.new": "new",
  "remote.partially_filled": "partially_filled",
  "remote.filled": "filled",
  "remote.canceled": "canceled",
  "remote.rejected": "rejected",
  "remote.expired": "expired",
};

const allowed: Partial<Record<LocalOrderState, ReadonlySet<OrderLifecycleEvent>>> = {
  draft: new Set(["command.confirmed"]),
  confirmed: new Set(["command.submit_requested"]),
  pending_submission: new Set(["command.reconciling", "remote.accepted", "remote.new", "remote.partially_filled", "remote.filled", "remote.rejected"]),
  reconciling: new Set(["remote.accepted", "remote.new", "remote.partially_filled", "remote.filled", "remote.canceled", "remote.rejected", "remote.expired"]),
  accepted: new Set(["remote.new", "remote.partially_filled", "remote.filled", "remote.canceled", "remote.rejected", "remote.expired", "command.cancel_requested"]),
  new: new Set(["remote.partially_filled", "remote.filled", "remote.canceled", "remote.rejected", "remote.expired", "command.cancel_requested"]),
  partially_filled: new Set(["remote.filled", "remote.canceled", "remote.expired", "command.cancel_requested"]),
  cancel_pending: new Set(["remote.partially_filled", "remote.filled", "remote.canceled", "remote.rejected", "remote.expired"]),
};

export function transition(current: LocalOrderState, event: OrderLifecycleEvent): LocalOrderState {
  const observedRemoteState = remoteStateByEvent[event];
  if (observedRemoteState === current) return current;
  if (terminalStates.has(current) || !allowed[current]?.has(event)) {
    throw new Error(`INVALID_BROKER_TRANSITION:${current}:${event}`);
  }
  if (event === "command.confirmed") return "confirmed";
  if (event === "command.submit_requested") return "pending_submission";
  if (event === "command.reconciling") return "reconciling";
  if (event === "command.cancel_requested") return "cancel_pending";
  if (observedRemoteState) return observedRemoteState;
  throw new Error(`INVALID_BROKER_TRANSITION:${current}:${event}`);
}
