// Technical + sentiment analysis used to rank stocks.
// Pure functions so they run the same on the server and in tests.

export type NewsItem = {
  title: string;
  publisher: string;
  link: string;
  time: number; // unix seconds
  sentiment: number; // -1..1
};

export type Metrics = {
  price: number;
  prevClose: number;
  changePct: number;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  ret1y: number | null;
  volatility: number | null; // annualised, fraction
  maxDrawdown: number | null; // fraction, positive
  high52: number;
  low52: number;
};

export type Scores = {
  trend: number;
  momentum: number;
  risk: number; // higher = safer
  sentiment: number;
  composite: number;
};

export type RiskProfile = "conservative" | "moderate" | "aggressive";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const lerpScore = (v: number, lo: number, hi: number) => clamp(((v - lo) / (hi - lo)) * 100);

export function sma(values: number[], n: number, end = values.length): number | null {
  if (end < n) return null;
  let s = 0;
  for (let i = end - n; i < end; i++) s += values[i];
  return s / n;
}

export function rsi(values: number[], n = 14): number | null {
  if (values.length <= n) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / n;
  let avgL = loss / n;
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (n - 1) + Math.max(d, 0)) / n;
    avgL = (avgL * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function ret(values: number[], days: number): number | null {
  if (values.length <= days) return null;
  const past = values[values.length - 1 - days];
  return past > 0 ? values[values.length - 1] / past - 1 : null;
}

export function computeMetrics(closes: number[], prevClose?: number): Metrics {
  const price = closes[closes.length - 1];
  const prev = prevClose ?? closes[closes.length - 2] ?? price;
  const logRets: number[] = [];
  for (let i = 1; i < closes.length; i++) logRets.push(Math.log(closes[i] / closes[i - 1]));
  let volatility: number | null = null;
  if (logRets.length > 20) {
    const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
    const variance = logRets.reduce((a, b) => a + (b - mean) ** 2, 0) / (logRets.length - 1);
    volatility = Math.sqrt(variance) * Math.sqrt(252);
  }
  let peak = -Infinity;
  let mdd = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    mdd = Math.max(mdd, 1 - c / peak);
  }
  return {
    price,
    prevClose: prev,
    changePct: prev ? price / prev - 1 : 0,
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes),
    ret1m: ret(closes, 21),
    ret3m: ret(closes, 63),
    ret6m: ret(closes, 126),
    ret1y: ret(closes, closes.length - 1),
    volatility,
    maxDrawdown: closes.length > 20 ? mdd : null,
    high52: Math.max(...closes),
    low52: Math.min(...closes),
  };
}

// Very small finance-news lexicon. Headline sentiment is a rough research signal, not a verdict.
const POS = ["surge", "jump", "rally", "gain", "rise", "soar", "beat", "record", "profit", "upgrade", "buy", "outperform", "growth", "strong", "bullish", "high", "wins", "order", "expands", "boost", "approval", "dividend", "upside"];
const NEG = ["fall", "drop", "plunge", "slump", "decline", "loss", "miss", "downgrade", "sell", "underperform", "weak", "bearish", "low", "probe", "penalty", "fraud", "cut", "concern", "risk", "lawsuit", "slow", "crash", "fine"];

export function headlineSentiment(title: string): number {
  const words = title.toLowerCase().split(/[^a-z]+/);
  let s = 0;
  for (const w of words) {
    if (POS.some((p) => w.startsWith(p))) s += 1;
    if (NEG.some((n) => w.startsWith(n))) s -= 1;
  }
  return Math.max(-1, Math.min(1, s / 2));
}

export function computeScores(m: Metrics, news: NewsItem[], profile: RiskProfile): Scores {
  // Trend: where price sits relative to its moving averages.
  let trend = 0;
  if (m.sma50 != null && m.price > m.sma50) trend += 30;
  if (m.sma200 != null && m.price > m.sma200) trend += 30;
  if (m.sma50 != null && m.sma200 != null && m.sma50 > m.sma200) trend += 25;
  const offHigh = 1 - m.price / m.high52;
  trend += lerpScore(-offHigh, -0.3, 0) * 0.15;

  // Momentum: medium-term returns, tempered by RSI extremes.
  const r3 = m.ret3m ?? 0;
  const r6 = m.ret6m ?? r3;
  let momentum = lerpScore(r3, -0.15, 0.2) * 0.5 + lerpScore(r6, -0.25, 0.35) * 0.5;
  if (m.rsi14 != null) {
    if (m.rsi14 > 75) momentum -= 15; // overbought
    else if (m.rsi14 < 30) momentum -= 10; // falling knife
    else if (m.rsi14 >= 50 && m.rsi14 <= 65) momentum += 5;
  }
  momentum = clamp(momentum);

  // Risk (safety): lower volatility and drawdown = higher score.
  const vol = m.volatility ?? 0.3;
  const dd = m.maxDrawdown ?? 0.2;
  const risk = clamp(lerpScore(-vol, -0.5, -0.15) * 0.6 + lerpScore(-dd, -0.45, -0.05) * 0.4);

  // Sentiment: average headline tone, recent news weighted more.
  let sentiment = 50;
  if (news.length) {
    const now = Date.now() / 1000;
    let w = 0;
    let s = 0;
    for (const n of news) {
      const ageDays = Math.max(0, (now - n.time) / 86400);
      const weight = 1 / (1 + ageDays / 7);
      w += weight;
      s += n.sentiment * weight;
    }
    // Shrink toward neutral when there are only a few headlines.
    const confidence = news.length / (news.length + 3);
    sentiment = clamp(50 + (s / w) * 40 * confidence);
  }

  const weights = {
    conservative: { trend: 0.3, momentum: 0.15, risk: 0.4, sentiment: 0.15 },
    moderate: { trend: 0.3, momentum: 0.3, risk: 0.2, sentiment: 0.2 },
    aggressive: { trend: 0.25, momentum: 0.45, risk: 0.1, sentiment: 0.2 },
  }[profile];

  const composite =
    trend * weights.trend + momentum * weights.momentum + risk * weights.risk + sentiment * weights.sentiment;

  return {
    trend: Math.round(trend),
    momentum: Math.round(momentum),
    risk: Math.round(risk),
    sentiment: Math.round(sentiment),
    composite: Math.round(composite),
  };
}

export type Signal = "Strong buy" | "Buy" | "Hold" | "Avoid";

export function signalFor(score: number): Signal {
  if (score >= 70) return "Strong buy";
  if (score >= 58) return "Buy";
  if (score >= 42) return "Hold";
  return "Avoid";
}

export function horizonFor(m: Metrics, s: Scores): "Short term" | "Long term" {
  return s.trend >= 70 && s.risk >= 50 ? "Long term" : "Short term";
}

export function riskLabel(m: Metrics): "Low" | "Medium" | "High" {
  const v = m.volatility ?? 0.3;
  if (v < 0.22) return "Low";
  if (v < 0.32) return "Medium";
  return "High";
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

export function reasonsFor(m: Metrics, s: Scores, news: NewsItem[]): string[] {
  const r: string[] = [];
  if (m.sma50 != null && m.sma200 != null) {
    if (m.price > m.sma50 && m.sma50 > m.sma200) r.push("Uptrend: price above 50-day and 200-day averages (golden-cross setup)");
    else if (m.price < m.sma50 && m.sma50 < m.sma200) r.push("Downtrend: price below 50-day and 200-day averages");
    else if (m.price > m.sma200) r.push("Holding above its 200-day average");
    else r.push("Trading below its 200-day average");
  }
  if (m.ret3m != null) r.push(`3-month return ${pct(m.ret3m)}${m.ret6m != null ? `, 6-month ${pct(m.ret6m)}` : ""}`);
  if (m.rsi14 != null) {
    if (m.rsi14 > 75) r.push(`RSI ${m.rsi14.toFixed(0)}: overbought, consider waiting for a pullback`);
    else if (m.rsi14 < 30) r.push(`RSI ${m.rsi14.toFixed(0)}: oversold`);
    else r.push(`RSI ${m.rsi14.toFixed(0)}: healthy range`);
  }
  if (m.volatility != null) r.push(`Annualised volatility ${(m.volatility * 100).toFixed(0)}%`);
  const offHigh = 1 - m.price / m.high52;
  r.push(offHigh < 0.03 ? "Near its 52-week high" : `${(offHigh * 100).toFixed(1)}% below 52-week high`);
  if (news.length) {
    const tone = s.sentiment >= 60 ? "positive" : s.sentiment <= 40 ? "negative" : "mixed";
    r.push(`News tone ${tone} across ${news.length} recent headlines`);
  }
  return r;
}
