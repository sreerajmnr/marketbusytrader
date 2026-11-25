# MarketBusyTrader

A Next.js dashboard for BSE (Bombay Stock Exchange) shares. It analyses a year of price history and recent news for 24 large-cap BSE stocks, ranks them, recommends which to buy, and lets you paper trade with ₹10,00,000 in virtual money.

> Educational tool, not investment advice. Data is delayed. No real orders are placed.

## How recommendations work

For every stock, `/api/market` pulls one year of daily BSE closes (`.BO` symbols) and recent headlines from Yahoo Finance. `src/lib/analysis.ts` then calculates:

| Score | Inputs |
| --- | --- |
| Trend | Price vs 50- and 200-day averages, golden-cross setup, distance from 52-week high |
| Momentum | 3- and 6-month returns, adjusted for RSI(14) extremes |
| Low risk | Annualised volatility and 1-year max drawdown |
| News tone | Keyword sentiment of recent headlines, weighted by recency |

The scores are combined with weights that depend on your risk profile (conservative, moderate or aggressive). A composite score of 70 or more is a **Strong buy**, 58 or more is a **Buy**, 42 or more is **Hold**, and anything lower is **Avoid**.

## Features

- Index bar showing SENSEX and other BSE indices
- Recommendation cards, filterable by horizon and sector, each showing why the stock was picked
- Interactive price chart with 50- and 200-day moving averages
- Paper trading with holdings, P&L and a watchlist, saved in browser localStorage
- Search by name or BSE scrip code

## Run locally

```bash
npm install
npm run dev
```

## Deploy

The app is deployed on Vercel. API responses are cached at the edge for 10 minutes (`s-maxage=600`).

Change the list of stocks in `src/lib/universe.ts`.
