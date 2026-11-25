// Universe of large-cap BSE stocks scanned by the recommendation engine.
// `yahoo` is the Yahoo Finance symbol (".BO" = BSE listing), `code` is the BSE scrip code.
export type StockDef = {
  yahoo: string;
  symbol: string;
  name: string;
  code: string;
  sector: string;
};

export const UNIVERSE: StockDef[] = [
  { yahoo: "RELIANCE.BO", symbol: "RELIANCE", name: "Reliance Industries", code: "500325", sector: "Energy" },
  { yahoo: "TCS.BO", symbol: "TCS", name: "Tata Consultancy Services", code: "532540", sector: "IT" },
  { yahoo: "HDFCBANK.BO", symbol: "HDFCBANK", name: "HDFC Bank", code: "500180", sector: "Banking" },
  { yahoo: "INFY.BO", symbol: "INFY", name: "Infosys", code: "500209", sector: "IT" },
  { yahoo: "ICICIBANK.BO", symbol: "ICICIBANK", name: "ICICI Bank", code: "532174", sector: "Banking" },
  { yahoo: "HINDUNILVR.BO", symbol: "HINDUNILVR", name: "Hindustan Unilever", code: "500696", sector: "FMCG" },
  { yahoo: "ITC.BO", symbol: "ITC", name: "ITC", code: "500875", sector: "FMCG" },
  { yahoo: "SBIN.BO", symbol: "SBIN", name: "State Bank of India", code: "500112", sector: "Banking" },
  { yahoo: "BHARTIARTL.BO", symbol: "BHARTIARTL", name: "Bharti Airtel", code: "532454", sector: "Telecom" },
  { yahoo: "KOTAKBANK.BO", symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", code: "500247", sector: "Banking" },
  { yahoo: "LT.BO", symbol: "LT", name: "Larsen & Toubro", code: "500510", sector: "Infrastructure" },
  { yahoo: "AXISBANK.BO", symbol: "AXISBANK", name: "Axis Bank", code: "532215", sector: "Banking" },
  { yahoo: "ASIANPAINT.BO", symbol: "ASIANPAINT", name: "Asian Paints", code: "500820", sector: "Consumer" },
  { yahoo: "MARUTI.BO", symbol: "MARUTI", name: "Maruti Suzuki", code: "532500", sector: "Auto" },
  { yahoo: "SUNPHARMA.BO", symbol: "SUNPHARMA", name: "Sun Pharma", code: "524715", sector: "Pharma" },
  { yahoo: "TITAN.BO", symbol: "TITAN", name: "Titan Company", code: "500114", sector: "Consumer" },
  { yahoo: "BAJFINANCE.BO", symbol: "BAJFINANCE", name: "Bajaj Finance", code: "500034", sector: "Financials" },
  { yahoo: "ULTRACEMCO.BO", symbol: "ULTRACEMCO", name: "UltraTech Cement", code: "532538", sector: "Materials" },
  { yahoo: "NESTLEIND.BO", symbol: "NESTLEIND", name: "Nestlé India", code: "500790", sector: "FMCG" },
  { yahoo: "WIPRO.BO", symbol: "WIPRO", name: "Wipro", code: "507685", sector: "IT" },
  { yahoo: "HCLTECH.BO", symbol: "HCLTECH", name: "HCL Technologies", code: "532281", sector: "IT" },
  { yahoo: "TATASTEEL.BO", symbol: "TATASTEEL", name: "Tata Steel", code: "500470", sector: "Materials" },
  { yahoo: "POWERGRID.BO", symbol: "POWERGRID", name: "Power Grid Corp", code: "532898", sector: "Utilities" },
  { yahoo: "NTPC.BO", symbol: "NTPC", name: "NTPC", code: "532555", sector: "Utilities" },
];

export const INDICES = [
  { yahoo: "^BSESN", name: "BSE SENSEX" },
  { yahoo: "BSE-100.BO", name: "BSE 100" },
  { yahoo: "BSE-MIDCAP.BO", name: "BSE MidCap" },
  { yahoo: "BSE-SMLCAP.BO", name: "BSE SmallCap" },
];
