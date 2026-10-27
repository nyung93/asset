import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyQuotes, carryInvestmentsForward, previousMonthChange, returnRate, summarizeCurrency, summarizePortfolio } from './investments';
import type { InvestmentMonthly, MarketQuote } from '../types';
const base:InvestmentMonthly={invId:'a',yearMonth:'2026-09',tickerName:'Apple',ticker:'AAPL',currency:'USD',quantity:10,purchasePrice:100,investedPrincipal:1000,currentValuation:1075,valuationSource:'market',quoteTime:'2026-09-20T12:00:00Z'};
const quote:MarketQuote={ticker:'AAPL',currency:'USD',price:110,marketTime:'2026-10-21T12:00:00Z',fetchedAt:'2026-10-21T12:10:00Z'};
test('valuation uses price × shares and compares percentage points with exact prior month',()=>{
 const current={...base,invId:'b',yearMonth:'2026-10'};
 const updated=applyQuotes([base,current],'2026-10',[quote]);
 assert.equal(updated[0],base);assert.equal(updated[1].currentValuation,1100);
 assert.ok(Math.abs(returnRate(updated[1])!-10)<1e-10);
 assert.ok(Math.abs(previousMonthChange(updated[1],updated)!-2.5)<1e-10);
 assert.equal(previousMonthChange({...current,yearMonth:'2026-11'},[base]),null);
 assert.equal(returnRate({...current,valuationSource:'principal'}),null);
 assert.equal(returnRate({...current,investedPrincipal:0}),null);
});
test('rolls latest known holdings forward once without fabricating missing monthly history',()=>{
 const all=carryInvestmentsForward([base],'2026-11');
 assert.equal(all.length,2);assert.equal(all[0],base);
 assert.equal(all[1].yearMonth,'2026-11');assert.equal(all[1].quantity,10);
 assert.equal(previousMonthChange(all[1],all),null);
 assert.equal(carryInvestmentsForward(all,'2026-11'),all);
 assert.equal(carryInvestmentsForward([{...base,yearMonth:'2027-01'}],'2026-11').length,1);
});
test('failed, mismatched currency and older quotes preserve valuation',()=>{
 const current={...base,yearMonth:'2026-10'};
 assert.equal(applyQuotes([current],'2026-10',[])[0],current);
 assert.equal(applyQuotes([current],'2026-10',[{...quote,currency:'KRW'}])[0],current);
 assert.equal(applyQuotes([current],'2026-10',[{...quote,marketTime:'2026-08-01T00:00:00Z'}])[0],current);
 assert.equal(applyQuotes([current],'2026-10',[{...quote,price:NaN}])[0],current);
 assert.equal(applyQuotes([current],'2026-10',[{...quote,price:-1}])[0],current);
});
test('combines KRW and USD holdings using the same FX quote and never invents a missing rate',()=>{
 const samsung:InvestmentMonthly={...base,invId:'s',tickerName:'Samsung',ticker:'005930.KS',currency:'KRW',quantity:10,purchasePrice:50000,investedPrincipal:500000,currentValuation:550000};
 const apple={...base,invId:'a',investedPrincipal:2000,currentValuation:2200,purchasePrice:200};
 const all=[samsung,apple];
 assert.equal(summarizePortfolio(all,null).principal,null);
 assert.equal(summarizePortfolio(all,0).valuation,null);
 const totals=summarizePortfolio(all,1300);
 assert.equal(totals.principal,3100000);
 assert.equal(totals.valuation,3410000);
 assert.ok(Math.abs(totals.returnRate! - 10) < 1e-10);
 assert.equal(summarizeCurrency([apple]).valuation,2200);
 assert.equal(summarizeCurrency([samsung]).valuation,550000);
 assert.equal(summarizePortfolio([samsung],null).valuation,550000);
 assert.equal(summarizePortfolio([{...apple,valuationSource:'principal'}],1300).returnRate,null);
});
