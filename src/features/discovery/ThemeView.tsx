import type { MarketTheme } from "./domain";

export function ThemeView({ themes }: { themes: MarketTheme[] }) {
  return <section><h2>市场主题</h2><div className="theme-grid">{themes.map((theme) => <article key={theme.id} style={{ flexGrow: theme.marketCapWeight }}><h3>{theme.name}</h3><p>{theme.changePercent >= 0 ? "↑" : "↓"} {theme.changePercent}%</p><p>估值偏离 {theme.valuationDeviation}%</p></article>)}</div></section>;
}
