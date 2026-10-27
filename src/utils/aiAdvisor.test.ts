import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMonthlyAdvice, parseAdvisorResponse, summarizeMonthForAdvisor } from './aiAdvisor';
import type { BudgetCode, Transaction } from '../types';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const budgetCodes: BudgetCode[] = [{codeId: 'FO01', categoryName: '식비', monthlyLimit: 100000}];
const transactions: Transaction[] = [
  {txId: 'one', txDate: '2026-10-01', type: 'EXPENSE', codeId: 'FO01', amount: 120000, memo: '개인적인 가맹점 메모'},
  {txId: 'two', txDate: '2026-09-30', type: 'EXPENSE', codeId: 'FO01', amount: 50000, memo: '지난달 메모'},
];
const input = {transactions, budgetCodes, investments: []};

test('advisor aggregates only the selected month and never includes transaction memos', () => {
  const summary = summarizeMonthForAdvisor(input, '2026-10');
  assert.equal(summary.totalBudget, 100000);
  assert.equal(summary.totalExpenses, 120000);
  assert.deepEqual(summary.topCategory, {categoryName: '식비', codeId: 'FO01', amount: 120000});
  assert.deepEqual(summary.investmentReturns, []);
  assert.doesNotMatch(JSON.stringify(summary), /가맹점 메모|지난달 메모/);
});

test('three Korean feedback lines work without final punctuation', () => {
  assert.equal(parseAdvisorResponse('👵🏻 이번 달은 조금 썼구나\n💸 식비를 살펴보렴\n📈 투자는 차근차근 해보자').text,
    '👵🏻 이번 달은 조금 썼구나\n💸 식비를 살펴보렴\n📈 투자는 차근차근 해보자');
  assert.equal(parseAdvisorResponse('총평이야. 식비를 줄여보렴. 투자 기록도 살펴보자.').text,
    '총평이야.\n식비를 줄여보렴.\n투자 기록도 살펴보자.');
  assert.throws(() => parseAdvisorResponse('한 문장뿐이야'), /답변/);
});

test('advisor sends only monthly aggregates to authenticated same-origin API', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/index?action=ai-advice');
    assert.equal(init?.credentials, 'same-origin');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.summary.totalExpenses, 120000);
    assert.doesNotMatch(JSON.stringify(body), /개인적인 가맹점 메모/);
    return Response.json({text:'👵🏻 총평이야\n💸 식비를 아껴보렴\n📈 투자도 살펴보자'});
  };
  const result = await generateMonthlyAdvice(input, '2026-10');
  assert.match(result.text, /식비를 아껴보렴/);
  assert.equal(result.text.split('\n').length, 3);
});

test('server diagnostics, malformed replies and stalled requests remain actionable', async () => {
  globalThis.fetch = async () => Response.json({error:'Gemini 프로젝트의 키 상태를 확인해 주세요.'}, {status:503});
  await assert.rejects(generateMonthlyAdvice(input, '2026-10'), /키 상태/);
  globalThis.fetch = async () => Response.json({text:'한 문장뿐이야'});
  await assert.rejects(generateMonthlyAdvice(input, '2026-10'), /답변/);
  globalThis.fetch = () => new Promise(() => {});
  await assert.rejects(generateMonthlyAdvice(input, '2026-10', {timeoutMs: 15}), /오래 살펴보고/);
});
