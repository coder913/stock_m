// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const rootFile = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");

function serviceBlock(compose: string, service: string): string {
  const match = compose.match(new RegExp(`^  ${service}:\\r?\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|^networks:)`, "m"));
  if (!match) throw new Error(`Missing Compose service: ${service}`);
  return match[1];
}

test("runtime image includes modules imported by the server entry point", () => {
  expect(rootFile("Dockerfile")).toContain("COPY --from=build /app/src ./src");
});

test.each(["monitor-worker", "notification-worker", "trading-worker"])("%s has outbound and backend networks", (service) => {
  const block = serviceBlock(rootFile("docker-compose.yml"), service);
  expect(block).toMatch(/networks:\s*\r?\n\s*- edge\s*\r?\n\s*- backend/);
});
