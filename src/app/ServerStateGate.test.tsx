import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ServerStateGate } from "./ServerStateGate";

afterEach(cleanup);

test("blocks production routes when the API database is not ready", async () => {
  render(<ServerStateGate health={Promise.resolve({ ready: false, services: { postgres: "unavailable", redis: "ready" }, migrationVersion: "006_market_cache" })}><p>routes</p></ServerStateGate>);
  expect(await screen.findByRole("alert")).toHaveTextContent("服务端数据暂不可用");
  expect(screen.queryByText("routes")).not.toBeInTheDocument();
});

test("renders production routes after readiness succeeds and no browser migration is needed", async () => {
  const storage = { length: 0, clear() {}, getItem: () => null, key: () => null, removeItem() {}, setItem() {} } satisfies Storage;
  render(<ServerStateGate health={Promise.resolve({ ready: true, services: { postgres: "ready", redis: "ready" }, migrationVersion: "006_market_cache" })} storage={storage}><p>routes</p></ServerStateGate>);
  expect(await screen.findByText("routes")).toBeVisible();
});
