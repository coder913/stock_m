import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

export const test = base.extend<{ resetPersistentState: void }>({
  resetPersistentState: [async ({ request }, use) => {
    const response = await request.post("/api/testing/reset");
    if (!response.ok()) throw new Error(`E2E database reset failed: ${response.status()} ${await response.text()}`);
    await use();
  }, { auto: true }],
});
