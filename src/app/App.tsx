import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { TodayPage } from "../features/today/TodayPage";
import { ResearchPage } from "../features/research/ResearchPage";
import { JournalPage, PortfolioPage } from "../features/portfolio/PortfolioPage";
import { DiscoveryPage } from "../features/discovery/DiscoveryPage";
import { WatchlistPage } from "../features/watchlist/WatchlistPage";

const RoutePlaceholder = ({ title }: { title: string }) => <h1>{title}</h1>;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TodayPage />} />
          <Route path="discover" element={<DiscoveryPage />} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="stocks/:symbol" element={<ResearchPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
