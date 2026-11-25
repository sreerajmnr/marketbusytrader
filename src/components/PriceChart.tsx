"use client";

import { useMemo, useState } from "react";

const RANGES = [
  { label: "1M", days: 21 },
  { label: "3M", days: 63 },
  { label: "6M", days: 126 },
  { label: "1Y", days: 400 },
];

function movingAvg(c: number[], n: number) {
  const out: (number | null)[] = [];
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    s += c[i];
    if (i >= n) s -= c[i - n];
    out.push(i >= n - 1 ? s / n : null);
  }
  return out;
}

export default function PriceChart({ t, c }: { t: number[]; c: number[] }) {
  const [range, setRange] = useState("6M");
  const [hover, setHover] = useState<number | null>(null);

  const view = useMemo(() => {
    const days = RANGES.find((r) => r.label === range)!.days;
    const ma50 = movingAvg(c, 50);
    const ma200 = movingAvg(c, 200);
    const start = Math.max(0, c.length - days);
    return {
      t: t.slice(start),
      c: c.slice(start),
      ma50: ma50.slice(start),
      ma200: ma200.slice(start),
    };
  }, [t, c, range]);

  const W = 800;
  const H = 280;
  const P = { l: 8, r: 56, t: 12, b: 24 };
  const all = [...view.c, ...view.ma50.filter((x): x is number => x != null), ...view.ma200.filter((x): x is number => x != null)];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const x = (i: number) => P.l + (i / Math.max(1, view.c.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / (max - min || 1)) * (H - P.t - P.b);
  const path = (arr: (number | null)[]) =>
    arr.reduce<string>((d, v, i) => (v == null ? d : d + `${d === "" || arr[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), "");

  const up = view.c[view.c.length - 1] >= view.c[0];
  const stroke = up ? "#0B7A4B" : "#C2410C";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);
  const hi = hover ?? view.c.length - 1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: stroke }} />Price</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-sky-600" />50-day avg</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-slate-400" />200-day avg</span>
        <div className="ml-auto flex gap-1" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              aria-pressed={range === r.label}
              className={`h-9 min-w-11 rounded-md border px-2 font-medium ${range === r.label ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label="Price history chart"
          onPointerMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            const i = Math.round(((px - P.l) / (W - P.l - P.r)) * (view.c.length - 1));
            setHover(Math.max(0, Math.min(view.c.length - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#E2E8F0" />
              <text x={W - P.r + 6} y={y(v) + 4} fontSize="11" fill="#64748B">{v.toFixed(0)}</text>
            </g>
          ))}
          <path d={path(view.ma200)} fill="none" stroke="#94A3B8" strokeWidth="1.5" />
          <path d={path(view.ma50)} fill="none" stroke="#0284C7" strokeWidth="1.5" />
          <path d={path(view.c)} fill="none" stroke={stroke} strokeWidth="2" />
          <line x1={x(hi)} x2={x(hi)} y1={P.t} y2={H - P.b} stroke="#94A3B8" strokeDasharray="3 3" />
          <circle cx={x(hi)} cy={y(view.c[hi])} r="4" fill={stroke} />
          <text x={P.l} y={H - 6} fontSize="11" fill="#64748B">{new Date(view.t[0] * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</text>
          <text x={W - P.r} y={H - 6} fontSize="11" fill="#64748B" textAnchor="end">{new Date(view.t[view.t.length - 1] * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</text>
        </svg>
        <div className="pointer-events-none absolute left-2 top-1 rounded bg-white/90 px-2 py-1 text-xs text-slate-700 shadow-sm">
          {new Date(view.t[hi] * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ₹{view.c[hi].toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  );
}
