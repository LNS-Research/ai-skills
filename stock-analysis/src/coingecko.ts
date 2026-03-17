/**
 * CoinGecko free API client — no API key required (rate limit: 10-30 req/min).
 * https://api.coingecko.com/api/v3
 */

const BASE = "https://api.coingecko.com/api/v3";
const HEADERS = { Accept: "application/json" };

/** Common crypto IDs — maps symbol → coingecko ID */
const SYMBOL_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  USDC: "usd-coin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
  DOT: "polkadot",
  TRX: "tron",
  LINK: "chainlink",
  MATIC: "matic-network",
  TON: "the-open-network",
  SHIB: "shiba-inu",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  NEAR: "near",
  UNI: "uniswap",
  APT: "aptos",
};

export interface CoinGeckoData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number;
  price_change_percentage_30d_in_currency: number;
  ath: number;
  ath_date: string;
  atl: number;
  circulating_supply: number;
  total_supply: number | null;
}

export async function fetchCrypto(symbolOrId: string): Promise<CoinGeckoData | null> {
  const id = SYMBOL_MAP[symbolOrId.toUpperCase()] ?? symbolOrId.toLowerCase();
  try {
    const url = `${BASE}/coins/markets?vs_currency=usd&ids=${id}&price_change_percentage=7d,30d&sparkline=false`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return null;
    const data = await r.json() as CoinGeckoData[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

/** Fetch trending coins (last 24h) */
export async function fetchTrendingCrypto(): Promise<Array<{ id: string; symbol: string; name: string; rank: number }>> {
  try {
    const r = await fetch(`${BASE}/search/trending`, { headers: HEADERS });
    if (!r.ok) return [];
    const d = await r.json() as { coins: Array<{ item: { id: string; symbol: string; name: string; market_cap_rank: number } }> };
    return d.coins.map(c => ({
      id: c.item.id,
      symbol: c.item.symbol,
      name: c.item.name,
      rank: c.item.market_cap_rank,
    }));
  } catch {
    return [];
  }
}

/** Fetch global market data */
export async function fetchCryptoMarket(): Promise<{ totalMarketCap: number; btcDominance: number; change24h: number } | null> {
  try {
    const r = await fetch(`${BASE}/global`, { headers: HEADERS });
    if (!r.ok) return null;
    const d = await r.json() as { data: { total_market_cap: Record<string, number>; market_cap_change_percentage_24h_usd: number; market_cap_percentage: Record<string, number> } };
    return {
      totalMarketCap: d.data.total_market_cap.usd,
      btcDominance: d.data.market_cap_percentage.btc,
      change24h: d.data.market_cap_change_percentage_24h_usd,
    };
  } catch {
    return null;
  }
}
