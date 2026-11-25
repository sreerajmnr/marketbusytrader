import { headlineSentiment, type NewsItem } from "./analysis";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export type Series = {
  symbol: string;
  timestamps: number[];
  closes: number[];
  prevClose?: number;
  currency?: string;
  marketState?: string;
};

export async function fetchChart(symbol: string, range = "1y"): Promise<Series | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    if (!r) return null;
    const ts: number[] = r.timestamp ?? [];
    const raw: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = [];
    const closes: number[] = [];
    raw.forEach((c, i) => {
      if (c != null && Number.isFinite(c)) {
        timestamps.push(ts[i]);
        closes.push(c);
      }
    });
    // Prefer the live market price for the last point when available.
    const live = r.meta?.regularMarketPrice;
    if (typeof live === "number" && closes.length) closes[closes.length - 1] = live;
    if (closes.length < 2) return null;
    return {
      symbol,
      timestamps,
      closes,
      prevClose: r.meta?.chartPreviousClose && range === "1d" ? r.meta.chartPreviousClose : undefined,
      currency: r.meta?.currency,
      marketState: r.meta?.marketState,
    };
  } catch {
    return null;
  }
}

export async function fetchNews(query: string, count = 6): Promise<NewsItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=${count}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    const items: unknown[] = json?.news ?? [];
    return items
      .map((n) => {
        const o = n as { title?: string; publisher?: string; link?: string; providerPublishTime?: number };
        if (!o.title || !o.link) return null;
        return {
          title: o.title,
          publisher: o.publisher ?? "",
          link: o.link,
          time: o.providerPublishTime ?? 0,
          sentiment: headlineSentiment(o.title),
        } satisfies NewsItem;
      })
      .filter((x): x is NewsItem => x !== null);
  } catch {
    return [];
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
