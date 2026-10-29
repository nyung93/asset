import type { AppData, InvestmentMonthly, XpLog } from '../types';
import {codeKind} from './categoryCodes';
import { isValidDate } from './calendar';
import { isTracked } from './investments';

export type BonusRewardType = Exclude<XpLog['rewardType'], 'DAILY_LOG'>;
export interface XpMission {
  type: BonusRewardType;
  period: string;
  title: string;
  xpAmount: number;
  eligible: boolean;
  claimed: boolean;
  description: string;
}
const amount = (value: number) => new Intl.NumberFormat('ko-KR').format(value);

/** Never adds KRW to USD. Every held currency must meet the same percentage target. */
export function portfolioGoalStatus(records: InvestmentMonthly[], target: number) {
  if (!records.length) return {achieved: false, detail: '투자 기록이 필요해요.'};
  if (records.some(record => !isTracked(record) || record.valuationSource !== 'market' || !Number.isFinite(record.currentValuation) || record.currentValuation < 0)) {
    return {achieved: false, detail: '모든 종목의 티커·수량·시세를 확인해 주세요.'};
  }
  const groups = new Map<string, {principal: number; valuation: number}>();
  for (const record of records) {
    const group = groups.get(record.currency!) ?? {principal: 0, valuation: 0};
    group.principal += record.investedPrincipal;group.valuation += record.currentValuation;
    groups.set(record.currency!, group);
  }
  const rates = [...groups].map(([currency, group]) => ({currency, rate: (group.valuation / group.principal - 1) * 100}));
  return {
    achieved: rates.every(item => Number.isFinite(item.rate) && item.rate + 1e-9 >= target),
    detail: rates.map(item => `${item.currency} ${item.rate.toFixed(2)}%`).join(' · ') + ` / 목표 ${target}%`,
  };
}

/** Annual holdings use each ticker's latest snapshot; monthly valuations are not summed. */
export function latestAnnualInvestments(investments: InvestmentMonthly[], year: string, currentMonth: string) {
  const latest = new Map<string, InvestmentMonthly>();
  for (const record of investments) {
    if (!record.yearMonth.startsWith(`${year}-`) || record.yearMonth > currentMonth) continue;
    const key = record.ticker ? `${record.ticker}:${record.currency}` : `legacy:${record.invId}`;
    if (!latest.has(key) || latest.get(key)!.yearMonth < record.yearMonth) latest.set(key, record);
  }
  return [...latest.values()];
}

/** Pure eligibility engine. The claim action re-evaluates it against the latest state. */
export function getSettlementMissions(data: AppData, date: string): XpMission[] {
  if (!isValidDate(date)) throw new Error('정산 날짜가 올바르지 않습니다.');
  const year = date.slice(0, 4); const period = date.slice(0, 7);
  const transactions = data.transactions.filter(tx => tx.txDate <= date);
  const monthly = transactions.filter(tx => tx.txDate.startsWith(`${period}-`));
  const spent = monthly.filter(tx => tx.type === 'EXPENSE').reduce((sum, tx) => sum + tx.amount, 0);
  const saving = monthly.filter(tx => tx.type === 'SAVING').reduce((sum, tx) => sum + tx.amount, 0);
  const yearSaving = transactions.filter(tx => tx.txDate.startsWith(`${year}-`) && tx.type === 'SAVING').reduce((sum, tx) => sum + tx.amount, 0);
  const expenseCodes = data.budgetCodes.filter(code => codeKind(code) === 'EXPENSE');
  const budget = expenseCodes.reduce((sum, code) => sum + code.monthlyLimit, 0);
  const monthlyGoal = data.goals.find(goal => goal.year === Number(year) && goal.month === Number(period.slice(5)));
  const annualGoal = data.goals.find(goal => goal.year === Number(year) && goal.month === 0);
  const monthlyInvestment = portfolioGoalStatus(data.investments.filter(record => record.yearMonth === period), monthlyGoal?.targetInvestReturnRate ?? 0);
  const annualInvestment = portfolioGoalStatus(latestAnnualInvestments(data.investments, year, period), annualGoal?.targetInvestReturnRate ?? 0);
  const missions = [
    {type: 'MONTHLY_BUDGET' as const, period, title: '이번 달 예산 지킴이', xpAmount: 150,
      eligible: expenseCodes.length > 0 && spent <= budget,
      description: expenseCodes.length ? `지출 ${amount(spent)}원 / 예산 ${amount(budget)}원` : '목표 & 설정에서 지출 카테고리를 추가해 주세요.'},
    {type: 'MONTHLY_SAVING' as const, period, title: '차곡차곡 저축 달성', xpAmount: 200,
      eligible: Boolean(monthlyGoal && saving >= monthlyGoal.targetSavingAmount),
      description: monthlyGoal ? `저축 ${amount(saving)}원 / 목표 ${amount(monthlyGoal.targetSavingAmount)}원` : '이번 달 저축 목표를 먼저 저장해 주세요.'},
    {type: 'MONTHLY_INVEST' as const, period, title: '이번 달 투자 목표 달성', xpAmount: 200,
      eligible: Boolean(monthlyGoal && monthlyInvestment.achieved),
      description: monthlyGoal ? monthlyInvestment.detail : '이번 달 투자 목표를 먼저 저장해 주세요.'},
    {type: 'ANNUAL_GOAL' as const, period: year, title: '올해의 부자 습관 완성', xpAmount: 1000,
      eligible: Boolean(annualGoal && yearSaving >= annualGoal.targetSavingAmount && annualInvestment.achieved),
      description: annualGoal ? `연간 저축 ${amount(yearSaving)} / ${amount(annualGoal.targetSavingAmount)}원 · ${annualInvestment.detail}` : '올해 저축·투자 목표를 먼저 저장해 주세요.'},
  ];
  return missions.map(mission => ({...mission, claimed: data.xpLogs.some(log => log.rewardType === mission.type && log.referencePeriod === mission.period)}));
}
