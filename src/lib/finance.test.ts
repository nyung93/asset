import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetUsage, monthlyTransactions, signedAmount, summarize } from './finance';
import type { Transaction } from '../types';
const transactions: Transaction[] = [
  {txId:'1',txDate:'2026-10-01',type:'INCOME',codeId:'INCOME',amount:3000000,memo:''},
  {txId:'2',txDate:'2026-10-31',type:'EXPENSE',codeId:'FO01',amount:150000,memo:''},
  {txId:'3',txDate:'2026-10-21',type:'SAVING',codeId:'FO01',amount:500000,memo:''},
  {txId:'4',txDate:'2026-11-01',type:'EXPENSE',codeId:'FO01',amount:200000,memo:''},
  {txId:'5',txDate:'2025-10-01',type:'INCOME',codeId:'INCOME',amount:1000000,memo:''},
];
test('monthly totals include only the selected year/month and keep saving separate', () => {
  const month = monthlyTransactions(transactions, '2026-10');
  assert.equal(month.length, 3);
  assert.deepEqual(summarize(month), {INCOME:3000000,EXPENSE:150000,SAVING:500000});
  assert.deepEqual(summarize([]), {INCOME:0,EXPENSE:0,SAVING:0});
  assert.equal(signedAmount('INCOME', 1000), '+1,000원');
  assert.equal(signedAmount('EXPENSE', 1000), '-1,000원');
});
test('budget gauges cap overflow, handle zero limits and exclude savings', () => {
  const month = monthlyTransactions(transactions, '2026-10');
  const [over, unused] = budgetUsage([{codeId:'FO01',categoryName:'식비',monthlyLimit:100000},{codeId:'HO01',categoryName:'주거',monthlyLimit:0}], month);
  assert.equal(over.spent, 150000);assert.equal(over.percent,150);assert.equal(over.barPercent,100);assert.equal(over.exceeded,true);
  assert.equal(unused.percent,null);assert.equal(unused.barPercent,0);assert.equal(unused.exceeded,false);
  const [zero] = budgetUsage([{codeId:'FO01',categoryName:'식비',monthlyLimit:0}], month);
  assert.equal(zero.barPercent,100);assert.equal(zero.exceeded,true);
  const [exact] = budgetUsage([{codeId:'FO01',categoryName:'식비',monthlyLimit:150000}], month);
  assert.equal(exact.percent,100);assert.equal(exact.exceeded,false);
});
