import {afterEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from './handler';

const originalFetch = globalThis.fetch;
afterEach(() => {globalThis.fetch = originalFetch;});
const quote = (ticker: string, currency: string) => ({chart:{error:null,result:[{meta:{symbol:ticker,currency,regularMarketPrice: ticker === 'KRW=X' ? 1370 : 220,regularMarketTime:Math.floor(Date.now()/1000)}}]}});
const request = (ticker: string) => new Request(`https://example.com/api/index?action=finance-quote&ticker=${encodeURIComponent(ticker)}`);

test('public same-origin quote accepts catalog tickers and caches a validated price without Firebase', async () => {
 let calls = 0;
 globalThis.fetch = async () => {calls++;return Response.json(quote('AAPL','USD'));};
 const first = await handleRequest(request('AAPL'));
 assert.equal(first.status,200);
 assert.equal((await first.json()).chart.result[0].meta.regularMarketPrice,220);
 const second = await handleRequest(request('AAPL'));
 assert.equal(second.status,200);
 assert.equal(calls,1);
 const invalid = await handleRequest(request('https://attacker.example/'));
 assert.equal(invalid.status,400);
 assert.equal(calls,1);
 globalThis.fetch = async () => Response.json(quote('AVGO','USD'));
 assert.equal((await handleRequest(request('AVGO'))).status,200);
});

test('quote relay retries the second Yahoo host and preserves a real KRW exchange quote', async () => {
 const hosts:string[]=[];
 globalThis.fetch = async input => {
  hosts.push(new URL(String(input)).host);
  return hosts.length === 1 ? new Response('',{status:502}) : Response.json(quote('KRW=X','KRW'));
 };
 const result = await handleRequest(request('KRW=X'));
 assert.equal(result.status,200);
 assert.equal((await result.json()).chart.result[0].meta.regularMarketPrice,1370);
 assert.deepEqual(hosts,['query1.finance.yahoo.com','query2.finance.yahoo.com']);
});

test('quote relay returns an error if both upstream hosts fail', async () => {
 globalThis.fetch = async () => new Response('',{status:503});
 const result = await handleRequest(request('MSFT'));
 assert.equal(result.status,502);
 assert.equal(result.headers.get('cache-control'),'no-store');
});
