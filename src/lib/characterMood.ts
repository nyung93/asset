import type { AppData, CharacterExpression } from '../types';
import { addMonths, isValidDate } from './calendar';
import { isTracked } from './investments';
import { portfolioGoalStatus } from './XpSettlementEngine';

export const EXPRESSIONS: {value: CharacterExpression; label: string}[] = [
  {value: 'neutral', label: '기본'}, {value: 'happy', label: '웃음'},
  {value: 'stoic', label: '덤덤'}, {value: 'frowning', label: '찡그림'},
  {value: 'crying', label: '울음'},
];
export interface CharacterMood {expression: CharacterExpression; message: string}

/** Facial reactions are derived, not saved as permanent avatar customization. */
export function getCharacterMood(data: AppData, date: string): CharacterMood {
  if (!isValidDate(date)) throw new Error('표정 기준 날짜가 올바르지 않습니다.');
  const month = date.slice(0, 7);
  const current = data.transactions.filter(tx => tx.txDate.startsWith(`${month}-`) && tx.txDate <= date);
  const expenses = current.filter(tx => tx.type === 'EXPENSE').reduce((sum, tx) => sum + tx.amount, 0);
  const budget = data.budgetCodes.reduce((sum, code) => sum + code.monthlyLimit, 0);
  if (data.budgetCodes.length && expenses > budget) return {expression: 'frowning', message: '예산을 살짝 넘었네. 우리 다음 소비는 한 번 더 생각해 볼까?'};
  if (data.xpLogs.some(log => log.earnedDate === date)) return {expression: 'happy', message: '오늘도 한 걸음 자랐어! 작은 실천이 모이면 큰 자산이 돼.'};
  const goal = data.goals.find(item => item.year === Number(month.slice(0, 4)) && item.month === Number(month.slice(5)));
  const savings = current.filter(tx => tx.type === 'SAVING').reduce((sum, tx) => sum + tx.amount, 0);
  if (goal && ((goal.targetSavingAmount > 0 && savings >= goal.targetSavingAmount) || portfolioGoalStatus(data.investments.filter(item => item.yearMonth === month), goal.targetInvestReturnRate).achieved)) {
    return {expression: 'happy', message: '목표에 도착했어! 오늘의 나에게 칭찬 한 스푼.'};
  }
  const previous = addMonths(`${month}-01`, -1).slice(0, 7);
  const pastGoal = data.goals.find(item => item.year === Number(previous.slice(0, 4)) && item.month === Number(previous.slice(5)));
  if (pastGoal) {
    const pastSaving = data.transactions.filter(tx => tx.type === 'SAVING' && tx.txDate.startsWith(`${previous}-`)).reduce((sum, tx) => sum + tx.amount, 0);
    const pastInvestments = data.investments.filter(item => item.yearMonth === previous);
    const priced = pastInvestments.length > 0 && pastInvestments.every(item => isTracked(item) && item.valuationSource === 'market');
    if (pastSaving < pastGoal.targetSavingAmount || (priced && !portfolioGoalStatus(pastInvestments, pastGoal.targetInvestReturnRate).achieved)) {
      return {expression: 'crying', message: '지난달 기록은 목표에 조금 못 미쳤네. 괜찮아, 이번 달은 같이 다시 시작하자!'};
    }
  }
  if (current.length) return {expression: 'stoic', message: '차분히 기록하는 중. 서두르지 않아도 괜찮아.'};
  return {expression: 'neutral', message: '어서 와! 오늘도 우리만의 속도로 부자가 되어 보자.'};
}
