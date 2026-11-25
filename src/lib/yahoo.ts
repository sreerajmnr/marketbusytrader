import { headlineSentiment, type NewsItem } from "./analysis";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export type Series = {
  symbol: string;
  timestamps: number[];
  closes: number[];
  currency?: string;
  marketState?: string;
};

const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const RANGE_DAYS: Record<string, number> = { "5d": 7, "1y": 400 };

async function getJson(path: string): Promise<unknown | null> {
  for (const host of HOSTS) {
    try {
      const res = await fetch(`https://${host}${path}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}

function parseChart(json: unknown, symbol: string): Series | null {
  const r = (json as { chart?: { result?: Record<string, any>[] } })?.chart?.result?.[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
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
  return { symbol, timestamps, closes, currency: r.meta?.currency, marketState: r.meta?.marketState };
}

export async function fetchChart(symbol: string, range = "1y"): Promise<Series | null> {
  // Use explicit period1/period2: Yahoo sometimes truncates `range=1y` responses to a few days.
  const now = Math.floor(Date.now() / 1000);
  const from = now - (RANGE_DAYS[range] ?? 400) * 86400;
  const minPoints = range === "1y" ? 150 : 2;
  const paths = [
    `/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${now}&interval=1d&includePrePost=false&events=div%2Csplit`,
    `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`,
  ];
  let best: Series | null = null;
  for (const path of paths) {
    const s = parseChart(await getJson(path), symbol);
    if (s && (!best || s.closes.length > best.closes.length)) best = s;
    if (best && best.closes.length >= minPoints) break;
  }
  return best;
}

export async function fetchNews(query: string, count = 6): Promise<NewsItem[]> {
  const path = `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=${count}`;
  try {
    const json = (await getJson(path)) as { news?: unknown[] } | null;
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
