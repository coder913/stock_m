export const defaultUniverseSymbols = [
  "SPY", "QQQ", "DIA", "IWM", "XLK", "XLF", "XLV", "XLY", "XLP", "XLE", "XLI", "XLU", "XLB", "XLRE", "SOXX",
  "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "ADBE", "CSCO", "IBM", "NOW", "INTU", "ACN", "AMD", "QCOM", "TXN", "AMAT", "MU", "LRCX", "KLAC", "INTC", "PANW", "CRWD", "PLTR", "SNOW",
  "GOOGL", "META", "NFLX", "DIS", "TMUS", "VZ", "T", "CHTR", "AMZN", "TSLA", "HD", "MCD", "BKNG", "NKE", "SBUX", "LOW", "TJX", "CMG", "ABNB", "RCL",
  "WMT", "COST", "PG", "KO", "PEP", "PM", "MO", "MDLZ", "BRK.B", "JPM", "BAC", "WFC", "GS", "MS", "C", "V", "MA", "AXP",
  "LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "ISRG", "AMGN", "GILD", "GE", "CAT", "RTX", "HON", "UPS", "BA", "DE", "XOM", "CVX", "NEE", "LIN", "PLD", "DUK",
] as const;

const etfs = new Set(defaultUniverseSymbols.slice(0, 15));
export const defaultUniverse = defaultUniverseSymbols.map((symbol) => ({ symbol, kind: etfs.has(symbol) ? "etf" as const : "stock" as const }));
export const DEFAULT_UNIVERSE_VERSION = "us-large-cap-v1";
