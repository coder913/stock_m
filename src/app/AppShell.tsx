import { NavLink, Outlet } from "react-router-dom";

const navigationItems = [
  ["/", "今日"],
  ["/discover", "发现"],
  ["/watchlist", "自选"],
  ["/portfolio", "组合"],
  ["/monitor", "监控"],
  ["/journal", "日志"]
] as const;

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand" aria-label="stock_m 信号透镜">
          <strong>stock_m</strong>
          <span>信号透镜</span>
        </div>
        <nav className="primary-nav">
          {navigationItems.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="data-state">模拟数据 · 延迟 15 分钟</p>
      </aside>
      <main id="main" className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
