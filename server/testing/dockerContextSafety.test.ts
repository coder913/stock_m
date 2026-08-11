// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("keeps local credential files out of the Docker build context", () => {
  const ignored = readFileSync(new URL("../../.dockerignore", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim());

  expect(ignored).toContain(".env");
  expect(ignored).toContain("readme_work.md");
});
