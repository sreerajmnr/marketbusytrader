"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PriceChart from "./PriceChart";
import {
  computeScores,
  horizonFor,
  reasonsFor,
  riskLabel,
  signalFor,
  type RiskProfile,
} from "@/lib/analysis";
import { STARTING_CASH, type MarketResponse, type PaperAccount, type StockData } from "@/lib/types";

const inr = (v: number, d = 2) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
const tone = (v: number) => (v >= 0 ? "text-emerald-700" : "text-orange-700");

const STORE_KEY = "mbt-account-v1";
const PROFILE_KEY = "mbt-profile";
const freshAccount = (): PaperAccount => ({ cash: STARTING_CASH, holdings: {}, orders: [], watchlist: [] });

function useAccount() {
  const [acct, setAcct] = useState<PaperAccount>(freshAccount);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      // Hydrate from browser storage after mount (not available during server render).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setAcct(JSON.parse(raw));
    } catch {}
  }, []);
  const save = useCallback((next: PaperAccount) => {
    setAcct(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {}
  }, []);
  return [acct, save] as const;
}

type Ranked = StockData & {
  scores: ReturnType<typeof computeScores>;
  signal: ReturnType<typeof signalFor>;
  horizon: ReturnType<typeof horizonFor>;
  risk: ReturnType<typeof riskLabel>;
  reasons: string[];
};

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-slate-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-slate-800" style={{ width: `${value}%` }} />
      </div>
      <span className="w-7 text-right tabular-nums text-slate-700">{value}</span>
    </div>
  );
}

function Spark({ c }: { c: number[] }) {
  const pts = c.slice(-126);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * 200).toFixed(1)},${(48 - ((v - min) / (max - min || 1)) * 44).toFixed(1)}`).join("");
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg viewBox="0 0 200 50" className="h-12 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke={up ? "#0B7A4B" : "#C2410C"} strokeWidth="2" />
    </svg>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<RiskProfile>("moderate");
  const [horizon, setHorizon] = useState<"All" | "Short term" | "Long term">("All");
  const [sector, setSector] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [acct, saveAcct] = useAccount();

  const fetchMarket = useCallback(() => {
    return fetch("/api/market")
      .then(async (res) => {
        const json = (await res.json()) as MarketResponse;
        if (!res.ok || !json.stocks?.length) throw new Error("Market data source is unavailable right now.");
        setData(json);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load market data."))
      .finally(() => setLoading(false));
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchMarket();
  };

  useEffect(() => {
    fetchMarket();
    try {
      const p = localStorage.getItem(PROFILE_KEY) as RiskProfile | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (p) setProfile(p);
    } catch {}
  }, [fetchMarket]);

  const changeProfile = (p: RiskProfile) => {
    setProfile(p);
    try {
      localStorage.setItem(PROFILE_KEY, p);
    } catch {}
  };

  const ranked: Ranked[] = useMemo(() => {
    if (!data) return [];
    return data.stocks
      .map((s) => {
        const scores = computeScores(s.metrics, s.news, profile);
        return {
          ...s,
          scores,
          signal: signalFor(scores.composite),
          horizon: horizonFor(s.metrics, scores),
          risk: riskLabel(s.metrics),
          reasons: reasonsFor(s.metrics, scores, s.news),
        };
      })
      .sort((a, b) => b.scores.composite - a.scores.composite);
  }, [data, profile]);

  const bySymbol = useMemo(() => Object.fromEntries(ranked.map((r) => [r.symbol, r])), [ranked]);
  const sectors = useMemo(() => ["All", ...Array.from(new Set(ranked.map((r) => r.sector))).sort()], [ranked]);

  const recs = ranked
    .filter((r) => r.signal === "Strong buy" || r.signal === "Buy")
    .filter((r) => horizon === "All" || r.horizon === horizon)
    .filter((r) => sector === "All" || r.sector === sector)
    .slice(0, 6);

  const current = (selected && bySymbol[selected]) || recs[0] || ranked[0];

  const holdingsValue = Object.entries(acct.holdings).reduce((s, [sym, h]) => s + h.qty * (bySymbol[sym]?.metrics.price ?? h.avg), 0);
  const dayPnl = Object.entries(acct.holdings).reduce((s, [sym, h]) => {
    const m = bySymbol[sym]?.metrics;
    return m ? s + h.qty * (m.price - m.prevClose) : s;
  }, 0);
  const total = acct.cash + holdingsValue;

  const searchHits = query.trim()
    ? ranked.filter((r) => (r.symbol + r.name + r.code).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  const toggleWatch = (sym: string) => {
    const w = acct.watchlist.includes(sym) ? acct.watchlist.filter((s) => s !== sym) : [...acct.watchlist, sym];
    saveAcct({ ...acct, watchlist: w });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>
            MarketBusyTrader
          </div>
          <div className="relative ml-auto w-full sm:w-80">
            <label htmlFor="search" className="sr-only">Search BSE stocks</label>
            <input
              id="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stock name or BSE code"
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-900"
            />
            {searchHits.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {searchHits.map((h) => (
                  <li key={h.symbol}>
                    <button
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                      onClick={() => {
                        setSelected(h.symbol);
                        setQuery("");
                        document.getElementById("detail")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      <span><b>{h.symbol}</b> <span className="text-slate-500">· {h.code}</span></span>
                      <span className="tabular-nums">{inr(h.metrics.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-100">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-sm sm:px-6">
            {data?.indices.map((i) => (
              <span key={i.yahoo} className="whitespace-nowrap">
                <b className="font-semibold">{i.name}</b>{" "}
                <span className="tabular-nums">{i.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>{" "}
                <span className={`tabular-nums ${tone(i.changePct)}`}>{i.changePct >= 0 ? "▲" : "▼"} {pct(i.changePct)}</span>
              </span>
            ))}
            {data && (
              <span className="ml-auto text-xs text-slate-600">
                {data.source} · updated {new Date(data.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
        {loading && !data && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">Analysing {""}BSE stocks — fetching a year of price history and recent news…</div>
        )}
        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
            {error}
            <button onClick={load} className="ml-auto h-10 rounded-lg border border-orange-400 bg-white px-4 font-medium">Retry</button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Paper trading account">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Portfolio value</div>
            <div className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{inr(total, 0)}</div>
            <div className={`text-sm tabular-nums ${tone(dayPnl)}`}>Day P&amp;L {dayPnl >= 0 ? "+" : "−"}{inr(Math.abs(dayPnl), 0)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Total return</div>
            <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${tone(total - STARTING_CASH)}`}>{pct(total / STARTING_CASH - 1)}</div>
            <div className="text-sm text-slate-600">on {inr(STARTING_CASH, 0)} virtual capital</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Available cash</div>
            <div className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{inr(acct.cash, 0)}</div>
            <button onClick={() => confirmReset() && saveAcct(freshAccount())} className="text-sm text-slate-600 underline underline-offset-2">Reset account</button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label htmlFor="profile" className="text-xs font-medium uppercase tracking-wide text-slate-600">Risk profile</label>
            <select
              id="profile"
              value={profile}
              onChange={(e) => changeProfile(e.target.value as RiskProfile)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-base font-semibold"
            >
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
            <div className="mt-1 text-xs text-slate-600">Changes how scores are weighted</div>
          </div>
        </section>

        {data && (
          <section className="rounded-xl border-2 border-slate-900 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold">Recommended shares to buy</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{ranked.length} BSE stocks analysed</span>
              <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
                {(["All", "Short term", "Long term"] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    aria-pressed={horizon === h}
                    className={`h-10 rounded-full border px-4 text-sm ${horizon === h ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
                  >
                    {h}
                  </button>
                ))}
                <label htmlFor="sector" className="sr-only">Sector</label>
                <select id="sector" value={sector} onChange={(e) => setSector(e.target.value)} className="h-10 rounded-full border border-slate-300 bg-white px-3 text-sm">
                  {sectors.map((s) => <option key={s} value={s}>{s === "All" ? "All sectors" : s}</option>)}
                </select>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Ranked by combining price history (trend vs 50/200-day averages, 3–6 month momentum, RSI), risk (volatility, drawdown) and market research (tone of recent news headlines), weighted for a <b>{profile}</b> investor.
            </p>

            {recs.length === 0 ? (
              <div className="mt-4 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-600">No stocks currently meet the buy threshold for these filters. That is a signal too: the model sees no clear opportunity right now.</div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recs.map((r) => (
                  <article key={r.symbol} className={`flex flex-col gap-3 rounded-xl border p-4 ${current?.symbol === r.symbol ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold">{r.name}</div>
                        <div className="text-xs text-slate-600">BSE {r.code} · {r.symbol} · {r.sector}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold tabular-nums leading-none">{r.scores.composite}</div>
                        <div className={`mt-1 text-xs font-semibold ${r.signal === "Strong buy" ? "text-emerald-700" : "text-slate-700"}`}>{r.signal}</div>
                      </div>
                    </div>
                    <Spark c={r.history.c} />
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-slate-600">Price</div><div className="font-semibold tabular-nums">{inr(r.metrics.price)}</div></div>
                      <div><div className="text-slate-600">Today</div><div className={`font-semibold tabular-nums ${tone(r.metrics.changePct)}`}>{pct(r.metrics.changePct)}</div></div>
                      <div><div className="text-slate-600">To 52W high</div><div className="font-semibold tabular-nums">{pct(r.metrics.high52 / r.metrics.price - 1)}</div></div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Bar label="Trend" value={r.scores.trend} />
                      <Bar label="Momentum" value={r.scores.momentum} />
                      <Bar label="Low risk" value={r.scores.risk} />
                      <Bar label="News tone" value={r.scores.sentiment} />
                    </div>
                    <ul className="list-disc space-y-0.5 rounded-lg bg-slate-50 py-2 pl-7 pr-3 text-xs leading-relaxed text-slate-700">
                      {r.reasons.slice(0, 3).map((x) => <li key={x}>{x}</li>)}
                    </ul>
                    <div className="flex gap-3 text-xs text-slate-600"><span>Risk: <b className="text-slate-800">{r.risk}</b></span><span>Horizon: <b className="text-slate-800">{r.horizon}</b></span></div>
                    <div className="mt-auto flex gap-2">
                      <button
                        onClick={() => {
                          setSelected(r.symbol);
                          document.getElementById("detail")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="h-11 flex-1 rounded-lg bg-slate-900 font-semibold text-white hover:bg-slate-800"
                      >
                        Analyse &amp; trade
                      </button>
                      <button
                        onClick={() => toggleWatch(r.symbol)}
                        aria-label={acct.watchlist.includes(r.symbol) ? `Remove ${r.symbol} from watchlist` : `Add ${r.symbol} to watchlist`}
                        className="h-11 w-11 rounded-lg border border-slate-300 text-lg"
                      >
                        {acct.watchlist.includes(r.symbol) ? "★" : "☆"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs leading-relaxed text-slate-600">
              Educational tool, not investment advice. Scores are produced by a simple rules-based model on delayed public data; past performance does not guarantee future returns. Trades here use virtual money only. Consult a SEBI-registered investment adviser before investing.
            </p>
          </section>
        )}

        {current && <Detail key={current.symbol} s={current} acct={acct} saveAcct={saveAcct} />}

        {data && (
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 lg:col-span-2">
              <h2 className="mb-3 font-bold">All analysed stocks</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-600">
                      <th className="py-2 pr-2">Stock</th><th className="pr-2 text-right">Price</th><th className="pr-2 text-right">Today</th><th className="pr-2 text-right">3M</th><th className="pr-2 text-right">RSI</th><th className="pr-2 text-right">Score</th><th className="text-right">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((r) => (
                      <tr key={r.symbol} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 pr-2">
                          <button className="text-left font-semibold underline-offset-2 hover:underline" onClick={() => { setSelected(r.symbol); document.getElementById("detail")?.scrollIntoView({ behavior: "smooth" }); }}>{r.symbol}</button>
                          <div className="text-xs text-slate-500">{r.sector}</div>
                        </td>
                        <td className="pr-2 text-right tabular-nums">{inr(r.metrics.price)}</td>
                        <td className={`pr-2 text-right tabular-nums ${tone(r.metrics.changePct)}`}>{pct(r.metrics.changePct)}</td>
                        <td className={`pr-2 text-right tabular-nums ${tone(r.metrics.ret3m ?? 0)}`}>{r.metrics.ret3m != null ? pct(r.metrics.ret3m) : "—"}</td>
                        <td className="pr-2 text-right tabular-nums">{r.metrics.rsi14?.toFixed(0) ?? "—"}</td>
                        <td className="pr-2 text-right font-semibold tabular-nums">{r.scores.composite}</td>
                        <td className="text-right text-xs font-medium">{r.signal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="flex flex-col gap-5">
              <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <h2 className="mb-2 font-bold">Holdings</h2>
                {Object.keys(acct.holdings).length === 0 ? (
                  <p className="text-sm text-slate-600">No holdings yet. Pick a recommendation and place a paper trade.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {Object.entries(acct.holdings).map(([sym, h]) => {
                      const p = bySymbol[sym]?.metrics.price ?? h.avg;
                      const pl = (p - h.avg) * h.qty;
                      return (
                        <li key={sym} className="flex items-center justify-between py-2">
                          <button className="text-left" onClick={() => setSelected(sym)}><b>{sym}</b><div className="text-xs text-slate-600">{h.qty} @ {inr(h.avg)}</div></button>
                          <div className="text-right tabular-nums"><div>{inr(p * h.qty, 0)}</div><div className={`text-xs ${tone(pl)}`}>{pl >= 0 ? "+" : "−"}{inr(Math.abs(pl), 0)}</div></div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <h2 className="mb-2 font-bold">Watchlist</h2>
                {acct.watchlist.length === 0 ? (
                  <p className="text-sm text-slate-600">Tap ☆ on a stock to watch it.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {acct.watchlist.map((sym) => {
                      const m = bySymbol[sym]?.metrics;
                      return (
                        <li key={sym} className="flex items-center justify-between py-2">
                          <button className="font-semibold" onClick={() => setSelected(sym)}>{sym}</button>
                          {m && <span className="tabular-nums">{inr(m.price)} <span className={tone(m.changePct)}>{pct(m.changePct)}</span></span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}

        <footer className="pb-6 text-center text-xs text-slate-500">MarketBusyTrader · BSE data via Yahoo Finance, delayed · Paper trading only</footer>
      </main>
    </div>
  );
}

function confirmReset() {
  // Inline confirmation keeps the UI free of blocking dialogs on most paths; fall back to true when unavailable.
  try {
    return window.confirm("Reset your paper trading account to ₹10,00,000?");
  } catch {
    return true;
  }
}

function Detail({ s, acct, saveAcct }: { s: Ranked; acct: PaperAccount; saveAcct: (a: PaperAccount) => void }) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const m = s.metrics;
  const held = acct.holdings[s.symbol]?.qty ?? 0;
  const amount = qty * m.price;
  const charges = Math.round(amount * 0.0012 * 100) / 100; // approximate brokerage + STT + exchange fees

  const place = () => {
    if (!Number.isInteger(qty) || qty <= 0) return setMsg("Enter a whole-number quantity.");
    const h = acct.holdings[s.symbol] ?? { qty: 0, avg: 0 };
    const holdings = { ...acct.holdings };
    let cash = acct.cash;
    if (side === "BUY") {
      if (amount + charges > cash) return setMsg("Not enough virtual cash for this order.");
      const newQty = h.qty + qty;
      holdings[s.symbol] = { qty: newQty, avg: (h.avg * h.qty + amount) / newQty };
      cash -= amount + charges;
    } else {
      if (qty > h.qty) return setMsg(`You hold only ${h.qty} shares.`);
      const left = h.qty - qty;
      if (left === 0) delete holdings[s.symbol];
      else holdings[s.symbol] = { ...h, qty: left };
      cash += amount - charges;
    }
    const order = { id: crypto.randomUUID(), time: Date.now(), symbol: s.symbol, side, qty, price: m.price };
    saveAcct({ ...acct, cash, holdings, orders: [order, ...acct.orders].slice(0, 50) });
    setMsg(`${side === "BUY" ? "Bought" : "Sold"} ${qty} ${s.symbol} at ${inr(m.price)} (paper trade).`);
  };

  return (
    <div id="detail" className="grid scroll-mt-4 gap-5 lg:grid-cols-3">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-bold">{s.name}</h2>
          <span className="text-sm text-slate-600">BSE {s.code} · {s.sector}</span>
          <span className="ml-auto text-xl font-bold tabular-nums">{inr(m.price)}</span>
          <span className={`text-sm font-semibold tabular-nums ${tone(m.changePct)}`}>{pct(m.changePct)}</span>
        </div>
        <PriceChart t={s.history.t} c={s.history.c} />
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-600">52W high / low</dt><dd className="font-semibold tabular-nums">{m.high52.toFixed(0)} / {m.low52.toFixed(0)}</dd></div>
          <div><dt className="text-xs text-slate-600">1Y return</dt><dd className={`font-semibold tabular-nums ${tone(m.ret1y ?? 0)}`}>{m.ret1y != null ? pct(m.ret1y) : "—"}</dd></div>
          <div><dt className="text-xs text-slate-600">Volatility (ann.)</dt><dd className="font-semibold tabular-nums">{m.volatility != null ? `${(m.volatility * 100).toFixed(0)}%` : "—"}</dd></div>
          <div><dt className="text-xs text-slate-600">Max drawdown</dt><dd className="font-semibold tabular-nums">{m.maxDrawdown != null ? `−${(m.maxDrawdown * 100).toFixed(0)}%` : "—"}</dd></div>
        </dl>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Analysis · score {s.scores.composite} ({s.signal})</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Market research &amp; news</h3>
            {s.news.length === 0 ? (
              <p className="text-sm text-slate-600">No recent headlines found.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.news.slice(0, 5).map((n) => (
                  <li key={n.link}>
                    <a href={n.link} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-900 underline-offset-2 hover:underline">{n.title}</a>
                    <div className="text-xs text-slate-600">{n.publisher} · {new Date(n.time * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · tone {n.sentiment > 0 ? "positive" : n.sentiment < 0 ? "negative" : "neutral"}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-bold">Paper trade {s.symbol}</h2>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Order side">
          {(["BUY", "SELL"] as const).map((x) => (
            <button
              key={x}
              onClick={() => setSide(x)}
              aria-pressed={side === x}
              className={`h-11 rounded-lg border font-semibold ${side === x ? (x === "BUY" ? "border-emerald-800 bg-emerald-800 text-white" : "border-orange-700 bg-orange-700 text-white") : "border-slate-300 bg-white"}`}
            >
              {x}
            </button>
          ))}
        </div>
        <label className="text-sm text-slate-600">
          Quantity
          <input
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(Math.floor(Number(e.target.value)))}
            className="mt-1 block h-11 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-900"
          />
        </label>
        <div className="text-sm text-slate-600">Market order at <b className="text-slate-900">{inr(m.price)}</b> · You hold {held}</div>
        <div className="space-y-1 border-t border-dashed border-slate-300 pt-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Order value</span><span className="tabular-nums">{inr(amount)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Est. charges</span><span className="tabular-nums">{inr(charges)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Cash available</span><span className="tabular-nums">{inr(acct.cash, 0)}</span></div>
        </div>
        <button onClick={place} className="h-12 rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-800">
          Place {side.toLowerCase()} order
        </button>
        {msg && <p className="text-sm text-slate-700" role="status">{msg}</p>}
        {acct.orders.length > 0 && (
          <div>
            <h3 className="mb-1 mt-2 text-sm font-semibold">Recent orders</h3>
            <ul className="space-y-1 text-xs text-slate-700">
              {acct.orders.slice(0, 5).map((o) => (
                <li key={o.id} className="flex justify-between">
                  <span><b className={o.side === "BUY" ? "text-emerald-700" : "text-orange-700"}>{o.side}</b> {o.qty} {o.symbol}</span>
                  <span className="tabular-nums">{inr(o.price)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-slate-500">Virtual money only. No real orders are sent to BSE or any broker.</p>
      </section>
    </div>
  );
}
