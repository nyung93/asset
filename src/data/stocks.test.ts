import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Stock } from '../types';

const stocks = JSON.parse(readFileSync(new URL('./stocks.json', import.meta.url), 'utf8')) as Stock[];
const byTicker = new Map(stocks.map(stock => [stock.ticker, stock]));

test('search catalog has 45 unique tickers and 27 KRW-listed ETFs', () => {
  assert.equal(stocks.length, 45);
  assert.equal(byTicker.size, stocks.length, 'ticker must be unique');
  assert.equal(stocks.filter(stock => stock.market === 'ETF' && stock.currency === 'KRW').length, 27);

  for (const stock of stocks) {
    assert.ok(stock.name.trim(), `${stock.ticker} needs a name`);
    assert.ok(Array.isArray(stock.aliases), `${stock.ticker} needs aliases`);
    if (stock.ticker.endsWith('.KS')) {
      assert.match(stock.ticker, /^[0-9A-Z]{6}\.KS$/);
      assert.equal(stock.currency, 'KRW', stock.ticker);
    } else {
      assert.match(stock.ticker, /^[A-Z]+$/);
      assert.equal(stock.currency, 'USD', stock.ticker);
    }
  }
});

test('domestic ETF names match all requested six-character codes', () => {
  const expected = [
    ['KODEX 미국S&P500', '379800.KS'],
    ['ACE 미국S&P500', '360200.KS'],
    ['RISE 미국S&P500', '379780.KS'],
    ['TIGER 미국나스닥100', '133690.KS'],
    ['KODEX 미국나스닥100', '379810.KS'],
    ['ACE 미국나스닥100', '367380.KS'],
    ['RISE 미국나스닥100', '368590.KS'],
    ['TIGER 미국배당다우존스', '458730.KS'],
    ['KODEX 미국배당다우존스', '489250.KS'],
    ['ACE 미국배당다우존스', '402970.KS'],
    ['SOL 미국배당다우존스', '446720.KS'],
    ['ACE KRX금현물', '411060.KS'],
    ['TIGER KRX금현물', '0072R0.KS'],
    ['SOL AI반도체TOP2플러스', '0167A0.KS'],
    ['KODEX AI반도체TOP2플러스', '395160.KS'],
    ['ACE K반도체TOP2+', '0210A0.KS'],
    ['TIGER 반도체TOP10', '396500.KS'],
    ['TIGER 미국필라델피아반도체나스닥', '381180.KS'],
    ['KODEX TRF3070', '329650.KS'],
    ['KODEX TRF5050', '329660.KS'],
    ['KODEX TRF7030', '329670.KS'],
    ['KODEX 고배당주', '279530.KS'],
    ['PLUS 고배당주', '161510.KS'],
    ['KODEX 국고채3년', '114260.KS'],
    ['KODEX CD금리액티브(합성)', '459580.KS'],
  ] as const;

  for (const [name, ticker] of expected) {
    assert.equal(byTicker.get(ticker)?.name, name, ticker);
    assert.equal(byTicker.get(ticker)?.market, 'ETF', ticker);
  }
  assert.equal(byTicker.get('360750.KS')?.name, 'TIGER 미국S&P500');
  assert.equal(byTicker.get('069500.KS')?.name, 'KODEX 200');
});

test('TOP2 aliases are searchable and gold ETFs keep their trading currencies', () => {
  const searchable = (stock: Stock, query: string) => {
    const keyword = query.toLocaleLowerCase().replace(/\s/g, '');
    return [stock.name, stock.ticker, ...stock.aliases]
      .some(text => text.toLocaleLowerCase().replace(/\s/g, '').includes(keyword));
  };
  assert.ok(searchable(byTicker.get('0167A0.KS')!, 'SOL TOP2'));
  assert.ok(searchable(byTicker.get('395160.KS')!, '코덱스 반도체 TOP2'));
  assert.ok(searchable(byTicker.get('0072R0.KS')!, '0072R0'));
  assert.equal(byTicker.get('411060.KS')?.currency, 'KRW');
  assert.equal(byTicker.get('0072R0.KS')?.currency, 'KRW');
  assert.equal(byTicker.get('GLD')?.currency, 'USD');
});
