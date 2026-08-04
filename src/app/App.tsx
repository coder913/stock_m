import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";

const RoutePlaceholder = ({ title }: { title: string }) => <h1>{title}</h1>;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<RoutePlaceholder title="今日" />} />
          <Route path="discover" element={<RoutePlaceholder title="发现" />} />
          <Route path="watchlist" element={<RoutePlaceholder title="自选" />} />
          <Route path="portfolio" element={<RoutePlaceholder title="组合" />} />
          <Route path="journal" element={<RoutePlaceholder title="日志" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
