import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCurrentPrice, parseYahooQuote } from './financeApi';
const originalFetch = globalThis.fetch;
afterEach(() => {globalThis.fetch = originalFetch;});
const payload = (symbol: string, price = 200, currency = 'USD') => ({chart:{error:null,result:[{meta:{symbol,currency,regularMarketPrice:price,regularMarketTime:Math.floor(Date.now()/1000)}}]}});
test('valid Yahoo price, currency and actual quote time are parsed', () => {
 const quote=parseYahooQuote(payload('AAPL'), 'AAPL');
 assert.equal(quote.price,200);assert.equal(quote.currency,'USD');assert.equal(quote.ticker,'AAPL');
 assert.ok(Number.isFinite(Date.parse(quote.marketTime)));
 for(const body of [null,{},payload('WRONG'),payload('AAPL',0),payload('AAPL',NaN),payload('AAPL',200,'EUR'),{chart:{error:{description:'Not Found'}}}]) assert.throws(()=>parseYahooQuote(body,'AAPL'));
});
test('uses encoded public proxy URL and falls back to the wrapped response', async () => {
 const urls:string[]=[];
 globalThis.fetch=async input=>{
  const url=String(input);urls.push(url);
  if(url.includes('/raw?')) return new Response('error',{status:502});
  return Response.json({contents:JSON.stringify(payload('005930.KS',70000,'KRW')),status:{http_code:200}});
 };
 const result=await fetchCurrentPrice('005930.KS',{includeMetadata:true,force:true});
 assert.equal(result?.price,70000);assert.equal(result?.currency,'KRW');assert.equal(urls.length,2);
 assert.ok(urls.every(url=>url.startsWith('https://api.allorigins.win/')));
 assert.equal(new URL(new URL(urls[0]).searchParams.get('url')!).pathname,'/v8/finance/chart/005930.KS');
});
test('deduplicates concurrent requests and returns numeric price by default', async () => {
 let count=0;
 globalThis.fetch=async()=>{count++;return Response.json(payload('MSFT',400));};
 const results=await Promise.all([fetchCurrentPrice('MSFT'),fetchCurrentPrice('MSFT'),fetchCurrentPrice('MSFT')]);
 assert.deepEqual(results,[400,400,400]);assert.equal(count,1);
 assert.equal(await fetchCurrentPrice('MSFT'),400);assert.equal(count,1);
});
test('network, malformed JSON and HTTP errors yield null, never a fake price', async () => {
 let count=0;
 globalThis.fetch=async()=>{count++;throw new Error('network');};
 assert.equal(await fetchCurrentPrice('TSLA',{force:true}),null);assert.equal(count,2);
 globalThis.fetch=async()=>new Response('<html>upstream error</html>');
 assert.equal(await fetchCurrentPrice('NVDA',{force:true}),null);
 globalThis.fetch=async()=>Response.json({contents:JSON.stringify(payload('META')),status:{http_code:429}});
 assert.equal(await fetchCurrentPrice('META',{force:true}),null);
 assert.equal(await fetchCurrentPrice('../../private'),null);
});
test('forced refresh failure does not return old cached quotes as fresh', async () => {
 globalThis.fetch=async()=>Response.json(payload('SPY',500));
 assert.equal(await fetchCurrentPrice('SPY',{force:true}),500);
 globalThis.fetch=async()=>new Response('',{status:503});
 assert.equal(await fetchCurrentPrice('SPY',{force:true}),null);
});
