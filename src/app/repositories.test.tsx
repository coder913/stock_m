import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { WatchlistPage } from "../features/watchlist/WatchlistPage";
import { RepositoryProvider, type ApplicationRepositories } from "./repositories";

afterEach(cleanup);

test("supplies the server-backed watchlist repository to a production page", async () => {
  const watchlists = {
    list: vi.fn(async () => [{ id: "server", name: "AI Infrastructure", symbols: [], order: 0, version: 1 }]),
    listDeleted: vi.fn(async () => []), createGroup: vi.fn(), renameGroup: vi.fn(), addSymbol: vi.fn(), removeSymbol: vi.fn(), removeGroup: vi.fn(), restoreGroup: vi.fn(), moveGroup: vi.fn(),
  };
  const repositories = { watchlists } as unknown as ApplicationRepositories;

  render(<RepositoryProvider value={repositories}><WatchlistPage /></RepositoryProvider>);

  expect(await screen.findByText("AI Infrastructure")).toBeVisible();
  expect(watchlists.list).toHaveBeenCalledOnce();
});
