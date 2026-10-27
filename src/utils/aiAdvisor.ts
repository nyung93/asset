import type { BudgetCode, InvestmentMonthly, Transaction } from '../types';
import { isTracked, returnRate } from '../lib/investments';

export interface MonthlyAdvisorInput {
  transactions: Transaction[];
  budgetCodes: BudgetCode[];
  investments: InvestmentMonthly[];
}
export interface MonthlyAdvisorSummary {
  yearMonth: string;
  totalBudget: number;
  totalExpenses: number;
  topCategory: {categoryName: string; codeId: string; amount: number} | null;
  investmentReturns: {currency: 'KRW' | 'USD'; rate: number}[];
}
export interface AdvisorResult {text: string}
interface AdvisorOptions {signal?: AbortSignal; timeoutMs?: number}

export const ADVISOR_SYSTEM_PROMPT = `너는 2030 여성들에게 재테크를 가르쳐주는 '돈 많은 할머니' 캐릭터야. 다정하면서도 뼈 때리는 조언을 해주는 컨셉이야.
다음 데이터를 보고 이번 달 소비와 투자에 대한 피드백을 딱 3문장으로 작성해줘. 첫 문장은 총평, 두 번째 문장은 가장 지출이 큰 카테고리에 대한 조언, 세 번째 문장은 투자 수익률에 대한 격려나 조언이야. 이모지(👵🏻, 💸, 📈 등)를 적절히 섞어 친근한 반말(예: ~했구나, ~하렴, ~어때?)로 대답해. 마크다운 없이 순수 텍스트로만 반환해.
각 문장은 한 줄에 하나씩 정확히 세 줄로 작성해. 투자 기록이 없거나 시세를 확인하지 못했으면 수익률을 추측하지 말고, 기록을 살펴보자고 다정하게 말해.`;

const money = (value: number) => `${new Intl.NumberFormat('ko-KR').format(value)}원`;

/** Build a privacy-minimized, deterministic monthly summary for the prompt. */
export function summarizeMonthForAdvisor(input: MonthlyAdvisorInput, yearMonth: string): MonthlyAdvisorSummary {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) throw new Error('통계 기준 월이 올바르지 않습니다.');
  const transactions = input.transactions.filter(tx => tx.txDate.startsWith(`${yearMonth}-`));
  const expenses = transactions.filter(tx => tx.type === 'EXPENSE');
  const categorySpend = new Map<string, number>();
  for (const transaction of expenses) categorySpend.set(transaction.codeId, (categorySpend.get(transaction.codeId) ?? 0) + transaction.amount);
  const categories = [...categorySpend].map(([codeId, amount]) => ({
    codeId,
    categoryName: input.budgetCodes.find(code => code.codeId === codeId)?.categoryName ?? '미분류',
    amount,
  })).sort((left, right) => right.amount - left.amount || left.codeId.localeCompare(right.codeId));
  const records = input.investments.filter(investment => investment.yearMonth === yearMonth);
  const currencyGroups = new Map<'KRW' | 'USD', InvestmentMonthly[]>();
  const fullyPriced = records.length > 0 && records.every(investment => isTracked(investment) && investment.valuationSource === 'market' && returnRate(investment) !== null);
  if (fullyPriced) for (const investment of records) {
    if (!isTracked(investment)) continue;
    const group = currencyGroups.get(investment.currency) ?? [];
    group.push(investment);currencyGroups.set(investment.currency, group);
  }
  const investmentReturns = [...currencyGroups].map(([currency, holdings]) => {
    const principal = holdings.reduce((sum, holding) => sum + holding.investedPrincipal, 0);
    const valuation = holdings.reduce((sum, holding) => sum + holding.currentValuation, 0);
    return {currency, rate: (valuation / principal - 1) * 100};
  }).filter(item => Number.isFinite(item.rate));
  return {
    yearMonth,
    totalBudget: input.budgetCodes.reduce((sum, code) => sum + code.monthlyLimit, 0),
    totalExpenses: expenses.reduce((sum, transaction) => sum + transaction.amount, 0),
    topCategory: categories[0] ?? null,
    investmentReturns,
  };
}

export function advisorDataPrompt(summary: MonthlyAdvisorSummary): string {
  const category = summary.topCategory
    ? `${summary.topCategory.categoryName}(${summary.topCategory.codeId}) ${money(summary.topCategory.amount)}`
    : '지출 기록 없음';
  const returns = summary.investmentReturns.length
    ? summary.investmentReturns.map(item => `${item.currency} ${item.rate > 0 ? '+' : ''}${item.rate.toFixed(2)}%`).join(' · ')
    : '시세 확인된 투자 기록 없음';
  return `다음은 ${summary.yearMonth}의 집계 데이터야. 이 숫자만으로 세 문장을 작성해줘.\n예산: ${money(summary.totalBudget)}, 지출: ${money(summary.totalExpenses)}, 최대 지출 카테고리: ${category}, 투자 수익률: ${returns}`;
}

/** Accept the requested three-line answer even when Korean sentences omit final punctuation. */
export function parseAdvisorResponse(value: string): AdvisorResult {
  const plain = value.trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '');
  const clean = (line: string) => line.trim().replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, '').replace(/\*\*/g, '').trim();
  let lines = plain.split(/\r?\n/).map(clean).filter(Boolean);
  if (lines.length !== 3) lines = plain.split(/(?<=[.!?。！？])\s+/u).map(clean).filter(Boolean);
  if (lines.length !== 3) throw new Error('답변이 조금 엉켰어요. 다시 눌러 주면 새로 살펴볼게.');
  return {text: lines.join('\n')};
}

/** Uses only aggregates, never sends transaction memos or account identifiers. */
export async function generateMonthlyAdvice(input: MonthlyAdvisorInput, yearMonth: string, options: AdvisorOptions = {}): Promise<AdvisorResult> {
  const summary = summarizeMonthForAdvisor(input, yearMonth);
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  options.signal?.addEventListener('abort', relayAbort, {once: true});
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  let stopWaiting: (() => void) | undefined;
  try {
    if (options.signal?.aborted) controller.abort();
    if (controller.signal.aborted) throw new Error('advisor-aborted');
    const aborted = new Promise<never>((_, reject) => {
      stopWaiting = () => reject(new Error('advisor-aborted'));
      controller.signal.addEventListener('abort', stopWaiting, {once: true});
    });
    const response = await Promise.race([fetch('/api/index?action=ai-advice', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({summary}), signal: controller.signal,
    }), aborted]);
    const data = await response.json().catch(() => ({})) as {text?: string; error?: string};
    if (!response.ok) throw new Error(data.error || 'AI 피드백을 불러오지 못했어요. 다시 시도해 주세요.');
    if (typeof data.text !== 'string') throw new Error('할미의 답변을 정리하지 못했어요. 다시 눌러 주세요.');
    return parseAdvisorResponse(data.text);
  } catch (error) {
    if (controller.signal.aborted) {
      if (options.signal?.aborted) throw new Error('피드백 요청을 취소했어요.');
      throw new Error('할미가 오래 살펴보고 있네요. 잠시 뒤 다시 눌러 주세요.');
    }
    if (error instanceof Error && error.message !== 'Failed to fetch' && !(error instanceof TypeError)) throw error;
    throw new Error('연결이 잠시 불안정해요. 네트워크를 확인하고 다시 눌러 주세요.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', relayAbort);
    if (stopWaiting) controller.signal.removeEventListener('abort', stopWaiting);
  }
}
