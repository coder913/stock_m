import type { Freshness } from "../market/domain";
import type { CompanyEvent, MarketTheme, StockSnapshot } from "./domain";

export interface DiscoverySnapshot<T> {
  items: T[];
  source: string;
  updatedAt: string;
  freshness: Freshness;
  stale?: boolean;
}

export interface DiscoveryRepository {
  listStocks(): Promise<DiscoverySnapshot<StockSnapshot>>;
  listThemes(): Promise<DiscoverySnapshot<MarketTheme>>;
  listEvents(): Promise<DiscoverySnapshot<CompanyEvent>>;
  getPeers(symbol: string): Promise<DiscoverySnapshot<StockSnapshot>>;
}
