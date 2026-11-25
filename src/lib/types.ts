import type { Metrics, NewsItem } from "./analysis";

export type StockData = {
  yahoo: string;
  symbol: string;
  name: string;
  code: string;
  sector: string;
  metrics: Metrics;
  history: { t: number[]; c: number[] };
  news: NewsItem[];
};

export type IndexData = { yahoo: string; name: string; value: number; changePct: number; marketState?: string };

export type MarketResponse = {
  updatedAt: string;
  source: string;
  stocks: StockData[];
  indices: IndexData[];
  failed: number;
};

export type Holding = { qty: number; avg: number };
export type Order = {
  id: string;
  time: number;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
};

export type PaperAccount = {
  cash: number;
  holdings: Record<string, Holding>;
  orders: Order[];
  watchlist: string[];
};

export const STARTING_CASH = 1_000_000;
