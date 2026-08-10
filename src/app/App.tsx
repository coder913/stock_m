import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { TodayPage } from "../features/today/TodayPage";
import { ResearchPage } from "../features/research/ResearchPage";
import { JournalPage, PortfolioPage } from "../features/portfolio/PortfolioPage";
import { DiscoveryPage } from "../features/discovery/DiscoveryPage";
import { WatchlistPage } from "../features/watchlist/WatchlistPage";
import { MonitorPage } from "../features/monitoring/MonitorPage";
import { MigrationWizard } from "../features/migration/MigrationWizard";
import { MigrationApiClient } from "../features/migration/migrationApiClient";
import { migrationKeys } from "../features/migration/browserStateExport";

const RoutePlaceholder = ({ title }: { title: string }) => <h1>{title}</h1>;

export function App() {
  const [migrationReady,setMigrationReady]=useState(false);const [migrationRequired,setMigrationRequired]=useState(false);
  useEffect(()=>{let active=true;const hasSource=migrationKeys.some(key=>localStorage.getItem(key)!==null);if(!hasSource){setMigrationReady(true);return()=>{active=false};}void new MigrationApiClient().getReceipt().then(receipt=>{if(!active)return;if(receipt){localStorage.setItem("stock_m:server-migration-receipt:v1",JSON.stringify(receipt));setMigrationReady(true);}else setMigrationRequired(true);}).catch(()=>{if(active)setMigrationRequired(true);});return()=>{active=false};},[]);
  if(!migrationReady)return migrationRequired?<MigrationWizard onComplete={()=>setMigrationReady(true)}/>:<p role="status">正在检查数据迁移状态</p>;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TodayPage />} />
          <Route path="discover" element={<DiscoveryPage />} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="monitor" element={<MonitorPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="stocks/:symbol" element={<ResearchPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
