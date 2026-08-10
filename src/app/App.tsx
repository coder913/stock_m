import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DiscoveryPage } from "../features/discovery/DiscoveryPage";
import { MonitorPage } from "../features/monitoring/MonitorPage";
import { JournalPage, PortfolioPage } from "../features/portfolio/PortfolioPage";
import { ResearchPage } from "../features/research/ResearchPage";
import { TodayPage } from "../features/today/TodayPage";
import { WatchlistPage } from "../features/watchlist/WatchlistPage";
import { AppShell } from "./AppShell";
import { ServerStateGate } from "./ServerStateGate";

export function AppRoutes() {
  return <Routes><Route element={<AppShell />}><Route index element={<TodayPage />} /><Route path="discover" element={<DiscoveryPage />} /><Route path="watchlist" element={<WatchlistPage />} /><Route path="portfolio" element={<PortfolioPage />} /><Route path="monitor" element={<MonitorPage />} /><Route path="journal" element={<JournalPage />} /><Route path="stocks/:symbol" element={<ResearchPage />} /></Route></Routes>;
}

export function App() { return <BrowserRouter><ServerStateGate><AppRoutes /></ServerStateGate></BrowserRouter>; }
