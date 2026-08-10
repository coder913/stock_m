// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const root = join(process.cwd(), "src");
const forbiddenImport = /^import[^;]*\b(?:LocalPortfolioRepository|LocalThesisRepository|PortfolioLedger|WatchlistRepository|SavedScreenRepository|ConditionRepository|EvaluationRepository|MonitorAlertRepository|ThesisReviewRepository|ReviewRepository)\b[^;]*from/m;
const browserBusinessKey = /localStorage\.(?:getItem|setItem|removeItem)\([^\n]*stock_m:(?:user-universe|saved-screens|watchlists|theses|monitor|portfolio-(?:ledger|settings|alerts|reviews))/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test("production pages do not import or construct browser business repositories", () => {
  const offenders = sourceFiles(root).filter((path) => /(?:Page|App)\.tsx$/.test(path) || path.endsWith("main.tsx"))
    .flatMap((path) => { const source = readFileSync(path, "utf8"); return forbiddenImport.test(source) || browserBusinessKey.test(source) ? [relative(root, path).replaceAll("\\", "/")] : []; });
  expect(offenders).toEqual([]);
});
