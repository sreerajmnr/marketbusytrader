import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarketBusyTrader · BSE stock recommendations",
  description: "Analyse BSE stocks using price history and market news, get ranked buy recommendations, and paper trade.",
};

export const viewport: Viewport = { themeColor: "#0F172A" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
