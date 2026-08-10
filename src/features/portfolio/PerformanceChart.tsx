import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPortfolioPoint } from "./performance/domain";

export function PerformanceChart({ points }: { points: DailyPortfolioPoint[] }) {
  const data = points.map((point) => ({ ...point, portfolio: point.totalValue === undefined ? undefined : point.normalizedPortfolio, benchmark: point.benchmarkValue, drawdownPercent: point.drawdown === undefined ? undefined : -point.drawdown * 100 }));
  return <section className="performance-charts">
    <div data-testid="normalized-performance-chart" aria-label="组合与基准归一化曲线">
      <ResponsiveContainer width="100%" height={300}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="marketDate" /><YAxis /><Tooltip /><Line type="monotone" dataKey="portfolio" name="组合" connectNulls={false} stroke="#2557d6" dot={false} /><Line type="monotone" dataKey="benchmark" name="基准" connectNulls={false} stroke="#7a8599" dot={false} /></LineChart></ResponsiveContainer>
    </div>
    <div aria-label="组合回撤曲线"><ResponsiveContainer width="100%" height={160}><LineChart data={data}><XAxis dataKey="marketDate" /><YAxis /><Tooltip /><Line type="monotone" dataKey="drawdownPercent" name="回撤" connectNulls={false} stroke="#bd3348" dot={false} /></LineChart></ResponsiveContainer></div>
  </section>;
}
