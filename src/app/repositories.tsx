import { createContext, useContext, type ReactNode } from "react";
import type { AsyncDiscoveryStateRepository } from "../../shared/discoveryState";
import type { AsyncWatchlistRepository } from "../../shared/watchlist";
import { DiscoveryStateApiRepository } from "../features/discovery/discoveryStateApiRepository";
import { MigrationApiClient, type MigrationClient } from "../features/migration/migrationApiClient";
import { MonitorApiRepository, type MonitorStateService } from "../features/monitoring/monitorApiRepository";
import { PortfolioApiRepository, type PortfolioStateService } from "../features/portfolio/portfolioApiRepository";
import { ThesisApiRepository, type ThesisStateService } from "../features/thesis/thesisApiRepository";
import { WatchlistApiRepository } from "../features/watchlist/watchlistApiRepository";
import { ApiClient } from "./apiClient";
import { NotificationApiClient, type NotificationApi } from "../features/notifications/notificationApiClient";

export interface ApplicationRepositories {
  discovery: AsyncDiscoveryStateRepository;
  watchlists: AsyncWatchlistRepository;
  theses: ThesisStateService;
  monitoring: MonitorStateService;
  portfolio: PortfolioStateService;
  migration: MigrationClient;
  notifications: NotificationApi;
}

export function createApplicationRepositories(baseUrl = "/api/v1"): ApplicationRepositories {
  const client = new ApiClient(baseUrl);
  return {
    discovery: new DiscoveryStateApiRepository(client),
    watchlists: new WatchlistApiRepository(client),
    theses: new ThesisApiRepository(client),
    monitoring: new MonitorApiRepository(client),
    portfolio: new PortfolioApiRepository(client),
    migration: new MigrationApiClient(client),
    notifications: new NotificationApiClient(client),
  };
}

export const defaultRepositories = createApplicationRepositories();
const RepositoryContext = createContext<ApplicationRepositories>(defaultRepositories);

export function RepositoryProvider({ value, children }: { value: ApplicationRepositories; children: ReactNode }) {
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): ApplicationRepositories { return useContext(RepositoryContext); }
