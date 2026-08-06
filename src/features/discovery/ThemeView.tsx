import { useState } from "react";
import type { MarketTheme } from "./domain";

export function ThemeView({ themes }: { themes: MarketTheme[] }) {
  const [kind, setKind] = useState<"industry" | "theme">("industry");
  return <section><h2>市场主题</h2><div><button type="button" aria-pressed={kind === "industry"} onClick={() => setKind("industry")}>行业</button><button type="button" aria-pressed={kind === "theme"} onClick={() => setKind("theme")}>主题</button></div><div className="theme-grid">{themes.filter((theme) => theme.kind === kind).map((theme) => <article key={theme.id} style={{ flexGrow: theme.marketCapWeight }}><h3>{theme.name}</h3><p>{theme.changePercent >= 0 ? "↑" : "↓"} {theme.changePercent}%</p><p>估值偏离 {theme.valuationDeviation}%</p></article>)}</div></section>;
}
