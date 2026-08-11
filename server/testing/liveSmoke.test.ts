// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { loadLiveSmokeEnvironment, runLiveSmoke } from "./liveSmoke";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporaryProject(): string {
  const directory = mkdtempSync(join(tmpdir(), "stock-m-smoke-"));
  temporaryDirectories.push(directory);
  return directory;
}

test("loads project .env while explicit process values take precedence", () => {
  const directory = temporaryProject();
  writeFileSync(join(directory, ".env"), "ALPACA_API_KEY_ID=env-id\nFRED_API_KEY=env-fred\n", "utf8");

  expect(loadLiveSmokeEnvironment({ FRED_API_KEY: "process-fred" }, directory)).toMatchObject({
    ALPACA_API_KEY_ID: "env-id",
    FRED_API_KEY: "process-fred",
  });
});

test("a missing .env preserves the supplied environment", () => {
  expect(loadLiveSmokeEnvironment({ FINNHUB_API_KEY: "process-key" }, temporaryProject())).toEqual({
    FINNHUB_API_KEY: "process-key",
  });
});

test("unconfigured providers are skipped with an explicit summary", async () => {
  const output = vi.fn();
  await runLiveSmoke({}, output);
  expect(output.mock.calls.flat().join(" ")).toContain("alpaca-paper: skipped");
  expect(output).toHaveBeenLastCalledWith("live-smoke: ok=0 skipped=4");
});

test("live smoke source has no broker mutation calls", () => {
  const source = readFileSync(new URL("./liveSmoke.ts", import.meta.url), "utf8");
  const forbidden = ["submit" + "Order", "cancel" + "Order"];
  for (const name of forbidden) expect(source).not.toContain(name);
});
