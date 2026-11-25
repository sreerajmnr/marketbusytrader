import { connection } from "next/server";
import { computeMetrics } from "@/lib/analysis";
import { INDICES, UNIVERSE } from "@/lib/universe";
import { fetchChart, fetchNews, mapLimit } from "@/lib/yahoo";

export const maxDuration = 60;

export async function GET() {
  // Always run at request time; responses are cached at the CDN via Cache-Control below.
  await connection();
  const [stocks, indices] = await Promise.all([
    mapLimit(UNIVERSE, 4, async (def) => {
      const [series, news] = await Promise.all([fetchChart(def.yahoo, "1y"), fetchNews(`${def.name} share`, 6)]);
      if (!series) return null;
      return {
        ...def,
        metrics: computeMetrics(series.closes),
        history: { t: series.timestamps, c: series.closes.map((c) => Math.round(c * 100) / 100) },
        news,
      };
    }),
    mapLimit(INDICES, 4, async (idx) => {
      const s = await fetchChart(idx.yahoo, "5d");
      if (!s) return null;
      const last = s.closes[s.closes.length - 1];
      const prev = s.closes[s.closes.length - 2];
      return { ...idx, value: last, changePct: prev ? last / prev - 1 : 0, marketState: s.marketState };
    }),
  ]);

  const okStocks = stocks.filter((s) => s !== null);
  const body = {
    updatedAt: new Date().toISOString(),
    source: "Yahoo Finance (BSE listings, delayed)",
    stocks: okStocks,
    indices: indices.filter((i) => i !== null),
    failed: UNIVERSE.length - okStocks.length,
  };

  return Response.json(body, {
    status: okStocks.length ? 200 : 503,
    headers: {
      // Cache at Vercel's edge for 10 minutes so we don't hammer the data source.
      "Cache-Control": okStocks.length ? "public, s-maxage=600, stale-while-revalidate=1800" : "no-store",
    },
  });
}
