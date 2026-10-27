import stockData from '../src/data/stocks.json';
import legacyStocks from '../src/stocks.json';
import {parseYahooQuote} from '../src/utils/financeApi';

const allowedTickers = new Set([
  ...stockData.map(stock => stock.ticker),
  ...Object.values(legacyStocks).flat().map(stock => stock.ticker),
  'KRW=X',
]);
const cache = new Map<string, {payload: unknown; expiresAt: number}>();
const CACHE_MS = 30_000;

export async function financeQuote(req: Request): Promise<Response> {
  const ticker = new URL(req.url).searchParams.get('ticker')?.trim().toUpperCase() ?? '';
  const headers = {'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff'};
  if (!allowedTickers.has(ticker)) return new Response(JSON.stringify({error: '지원하지 않는 종목코드예요.'}), {status: 400, headers});
  const existing = cache.get(ticker);
  if (existing && existing.expiresAt > Date.now()) {
    return new Response(JSON.stringify(existing.payload), {status: 200, headers: {...headers, 'Cache-Control': 'public, s-maxage=30'}});
  }
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
      const upstream = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0'}, signal: AbortSignal.timeout(5_000)});
      if (!upstream.ok) continue;
      const payload: unknown = await upstream.json();
      parseYahooQuote(payload, ticker);
      cache.set(ticker, {payload, expiresAt: Date.now() + CACHE_MS});
      return new Response(JSON.stringify(payload), {status: 200, headers: {...headers, 'Cache-Control': 'public, s-maxage=30'}});
    } catch { /* Try the alternate Yahoo host before reporting an unavailable quote. */ }
  }
  return new Response(JSON.stringify({error: '시세를 가져오지 못했어요.'}), {status: 502, headers: {...headers, 'Cache-Control': 'no-store'}});
}
