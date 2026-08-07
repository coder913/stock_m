import { useEffect, useState } from "react";
import type { StockSnapshot } from "../discovery/domain";
import type { MarketApiClient } from "../market/marketApiClient";

interface PeerComparisonProps { peers: StockSnapshot[]; candidates?: StockSnapshot[]; period: "TTM" | "FY1" | "mixed"; source: string; }
const metric = (value: number | undefined, suffix = "") => value === undefined ? "数据缺失" : `${value}${suffix}`;

export function PeerComparison({ peers, candidates = [], period, source }: PeerComparisonProps) {
  const [selected, setSelected] = useState(peers);
  const [candidate, setCandidate] = useState("");
  if (period === "mixed") return <section><h2>同业比较</h2><p role="alert">财务周期不一致，无法进行直接比较。</p></section>;
  const available = candidates.filter((item) => !selected.some((peer) => peer.symbol === item.symbol));
  return <section className="peer-comparison"><h2>同业比较</h2><p>{period} · {source}</p>{available.length > 0 && <div><label>添加可比公司<select aria-label="添加可比公司" value={candidate} onChange={(event) => setCandidate(event.target.value)}><option value="">选择公司</option>{available.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol}</option>)}</select></label><button type="button" disabled={!candidate || selected.length >= 5} onClick={() => { const item = available.find((entry) => entry.symbol === candidate); if (item) setSelected((current) => [...current, item]); setCandidate(""); }}>添加公司</button></div>}<table><thead><tr><th>代码</th><th>公司</th><th>营收增长</th><th>预期市盈率</th><th>营业利润率</th><th>操作</th></tr></thead><tbody>{selected.slice(0, 5).map((peer) => <tr key={peer.symbol}><th scope="row">{peer.symbol}</th><td>{peer.name}</td><td>{metric(peer.metrics.revenueGrowthYoY, "%")}</td><td>{metric(peer.metrics.forwardPE)}</td><td>{metric(peer.metrics.operatingMargin, "%")}</td><td><button type="button" onClick={() => setSelected((current) => current.filter((item) => item.symbol !== peer.symbol))}>移除 {peer.symbol}</button></td></tr>)}</tbody></table></section>;
}

export function ResearchPeerComparison({ symbol, marketClient }: { symbol: string; marketClient: Pick<MarketApiClient, "getUniverse"> }) {
  const [peers, setPeers] = useState<StockSnapshot[]>([]);
  const [source, setSource] = useState("");
  const [candidates, setCandidates] = useState<StockSnapshot[]>([]);
  useEffect(() => { void marketClient.getUniverse().then((result) => { const items = result.data.items.map((item) => ({ symbol: item.symbol, name: item.name ?? item.symbol, industry: item.sector ?? "未分类", metrics: item.metrics })); const current = items.find((item) => item.symbol === symbol); const comparable = items.filter((item) => item.symbol !== symbol && (!current || item.industry === current.industry)).slice(0, 5); setPeers(comparable); setCandidates(items); setSource(result.source); }).catch(() => undefined); }, [marketClient, symbol]);
  if (peers.length === 0) return <section><h2>同业比较</h2><p role="status">暂无可比较的同业数据。</p></section>;
  return <PeerComparison peers={peers} candidates={candidates} period="TTM" source={source} />;
}
