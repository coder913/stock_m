import type { MarketApiClient } from "../market/marketApiClient";
import type { PriceBar } from "../market/apiDomain";
import { ResearchDataSection, useResearchRequest } from "./ResearchDataSection";

function CandlestickChart({ symbol, bars }: { symbol: string; bars: PriceBar[] }) {
  if (!bars.length) return null;
  const width = 640;
  const height = 180;
  const padding = 12;
  const low = Math.min(...bars.map((bar) => bar.low));
  const high = Math.max(...bars.map((bar) => bar.high));
  const range = high - low || 1;
  const step = (width - padding * 2) / bars.length;
  const y = (value: number) => padding + ((high - value) / range) * (height - padding * 2);
  return (
    <svg role="img" aria-label={`${symbol} 日 K 线`} viewBox={`0 0 ${width} ${height}`} className="candlestick-chart">
      <title>{symbol} 日 K 线</title>
      {bars.map((bar, index) => {
        const x = padding + step * index + step / 2;
        const openY = y(bar.open);
        const closeY = y(bar.close);
        const rising = bar.close >= bar.open;
        return (
          <g key={bar.startedAt}>
            <line x1={x} x2={x} y1={y(bar.high)} y2={y(bar.low)} className={rising ? "candle-up" : "candle-down"} />
            <rect
              x={x - Math.max(2, step * 0.28)}
              y={Math.min(openY, closeY)}
              width={Math.max(4, step * 0.56)}
              height={Math.max(1, Math.abs(closeY - openY))}
              className={rising ? "candle-up" : "candle-down"}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function PriceHistory({ symbol, marketClient }: { symbol: string; marketClient: Pick<MarketApiClient, "getBars"> }) {
  const now = new Date();
  const from = new Date(now);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const request = useResearchRequest(`${symbol}:bars`, marketClient, () => marketClient.getBars(symbol, {
    timeframe: "1Day",
    start: from.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  }));
  return (
    <ResearchDataSection title="价格历史" request={request} errorMessage="K 线数据暂时不可用" emptyMessage="暂无 K 线数据">
      {(bars) => (
        <>
          <CandlestickChart symbol={symbol} bars={bars} />
          <table>
            <thead><tr><th>日期</th><th>开盘</th><th>最高</th><th>最低</th><th>收盘</th><th>成交量</th></tr></thead>
            <tbody>{bars.slice(-20).map((bar) => (
              <tr key={bar.startedAt}>
                <th>{bar.startedAt.slice(0, 10)}</th>
                <td>{bar.open.toFixed(2)}</td>
                <td>{bar.high.toFixed(2)}</td>
                <td>{bar.low.toFixed(2)}</td>
                <td>{bar.close.toFixed(2)}</td>
                <td>{bar.volume?.toLocaleString() ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}
    </ResearchDataSection>
  );
}
