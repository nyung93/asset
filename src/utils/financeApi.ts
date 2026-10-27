import type { MarketQuote } from '../types';

const cache = new Map<string, MarketQuote>();
const inFlight = new Map<string, Promise<MarketQuote | null>>();
const CACHE_MS = 30_000;
// A cold serverless start plus two upstream Yahoo hosts can take over 12 seconds.
const TIMEOUT_MS = 18_000;
interface PriceOptions { includeMetadata?: boolean; force?: boolean }

/** Validates the unofficial Yahoo chart response; never treats a missing price as zero. */
export function parseYahooQuote(payload: unknown, ticker: string): MarketQuote {
  const data = payload as {chart?: {error?: unknown; result?: Array<{meta?: Record<string, unknown>}>}} | null;
  const meta = data?.chart?.result?.[0]?.meta;
  if (data?.chart?.error || !meta) throw new Error('Yahoo 시세 응답이 없습니다.');
  const price = meta.regularMarketPrice;
  const timestamp = meta.regularMarketTime;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) throw new Error('유효한 현재가가 없습니다.');
  if (meta.symbol !== ticker || !['KRW', 'USD'].includes(String(meta.currency))) throw new Error('종목 또는 통화가 일치하지 않습니다.');
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) throw new Error('시세 기준 시간이 없습니다.');
  const date = new Date(timestamp * 1000);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300_000) throw new Error('시세 기준 시간이 올바르지 않습니다.');
  return {ticker, price, currency: meta.currency as MarketQuote['currency'], marketTime: date.toISOString(), fetchedAt: new Date().toISOString()};
}

async function requestQuote(ticker: string): Promise<MarketQuote | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // The same-origin server reads only a catalog ticker. Holdings never leave the browser.
    const response = await fetch(`/api/index?action=finance-quote&ticker=${encodeURIComponent(ticker)}`, {
      signal: controller.signal, credentials: 'same-origin', cache: 'no-store',
    });
    if (!response.ok) return null;
    const quote = parseYahooQuote(await response.json(), ticker);
    cache.set(ticker, quote);
    return quote;
  } catch {return null;}
  finally {clearTimeout(timeout);}
}

/** Returns RegularMarketPrice, or null on failure. No fabricated fallback prices. */
export function fetchCurrentPrice(ticker: string): Promise<number | null>;
/** Metadata variant exposes currency and actual market time for accurate portfolio valuation. */
export function fetchCurrentPrice(ticker: string, options: PriceOptions & {includeMetadata: true}): Promise<MarketQuote | null>;
export function fetchCurrentPrice(ticker: string, options: PriceOptions): Promise<number | null>;
export async function fetchCurrentPrice(ticker: string, options: PriceOptions = {}): Promise<number | MarketQuote | null> {
  const symbol = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9^][A-Z0-9.^=\-]{0,29}$/.test(symbol)) return null;
  const cached = cache.get(symbol);
  let quote: MarketQuote | null;
  if (!options.force && cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_MS) {
    quote = cached;
  } else {
    let pending = inFlight.get(symbol);
    if (!pending) {
      pending = requestQuote(symbol);
      inFlight.set(symbol, pending);
    }
    try { quote = await pending; }
    finally { if (inFlight.get(symbol) === pending) inFlight.delete(symbol); }
  }
  return options.includeMetadata ? quote : quote?.price ?? null;
}
