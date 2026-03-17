export interface DimensionScores {
  /** Earnings beat/miss vs estimates — max 25 */
  earnings: number;
  /** P/E, debt, margins, free cash flow — max 20 */
  fundamentals: number;
  /** Analyst upgrades/downgrades, consensus — max 15 */
  analystSentiment: number;
  /** 52-week range, historical returns — max 10 */
  historical: number;
  /** Broad market trend, VIX, sector rotation — max 10 */
  marketContext: number;
  /** Sector vs S&P500 — max 10 */
  sector: number;
  /** RSI, MACD, volume — max 5 */
  momentum: number;
  /** News & social sentiment — max 5 */
  sentiment: number;
}

export interface Signal {
  type: "bullish" | "bearish" | "neutral";
  source: "insider" | "analyst" | "momentum" | "fundamental" | "rumor" | "earnings";
  description: string;
  /** 0–1 */
  confidence: number;
}

export interface InsiderTrade {
  filerName: string;
  title: string;
  transactionType: "buy" | "sell" | "other";
  shares: number;
  pricePerShare: number | null;
  totalValue: number | null;
  filedDate: string;
}

export interface StockAnalysis {
  symbol: string;
  name: string;
  price: number;
  change1d: number;
  change1w: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  pe: number | null;
  forwardPe: number | null;
  eps: number | null;
  dividendYield: number | null;
  analystRating: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell" | null;
  analystTarget: number | null;
  week52High: number;
  week52Low: number;
  insiderTrades: InsiderTrade[];
  signals: Signal[];
  score: number;
  scores: DimensionScores;
  summary: string;
  disclaimer: string;
}

export interface CryptoAnalysis {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change1d: number;
  change7d: number;
  change30d: number;
  volume24h: number;
  marketCap: number;
  rank: number;
  ath: number;
  athDate: string;
  signals: Signal[];
  score: number;
  summary: string;
  disclaimer: string;
}

export interface HotStock {
  symbol: string;
  name: string;
  price: number;
  change1d: number;
  /** Volume vs 3-month average */
  volumeRatio: number;
  reason: string;
}

export interface Rumor {
  symbol: string;
  type: "ma" | "insider_buy" | "insider_sell" | "analyst_upgrade" | "analyst_downgrade" | "short_squeeze";
  description: string;
  source: string;
  date: string;
  impact: "high" | "medium" | "low";
}

export interface StockAnalysisConfig {
  /** Required for AI-powered summary generation */
  anthropicApiKey: string;
  /** Claude model — default claude-haiku-4-5-20251001 */
  model?: string;
  /** Skip insider trade lookup (faster) */
  skipInsider?: boolean;
  /** Skip AI summary generation */
  skipAI?: boolean;
}
