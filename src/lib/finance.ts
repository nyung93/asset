import type { BudgetCode, Transaction } from '../types';
export const transactionTypes = ['INCOME', 'EXPENSE', 'SAVING'] as const;
export const transactionStyle = {
  INCOME: {label: '수입', text: 'text-emerald-600', bar: 'bg-emerald-500', background: 'bg-emerald-50', sign: '+'},
  EXPENSE: {label: '지출', text: 'text-rose-500', bar: 'bg-rose-500', background: 'bg-rose-50', sign: '-'},
  SAVING: {label: '저축', text: 'text-indigo-600', bar: 'bg-indigo-500', background: 'bg-indigo-50', sign: ''},
};
export const formatWon = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);
export const signedAmount = (type: Transaction['type'], amount: number) => `${transactionStyle[type].sign}${formatWon(amount)}원`;
export function summarize(transactions: Transaction[]) {
  return transactions.reduce((totals, tx) => {
    totals[tx.type] += tx.amount;
    return totals;
  }, {INCOME: 0, EXPENSE: 0, SAVING: 0});
}
export function monthlyTransactions(transactions: Transaction[], yearMonth: string) {
  return transactions.filter(tx => tx.txDate.slice(0, 7) === yearMonth);
}
export function budgetUsage(codes: BudgetCode[], transactions: Transaction[]) {
  return codes.map(code => {
    const spent = transactions.filter(tx => tx.type === 'EXPENSE' && tx.codeId === code.codeId).reduce((sum, tx) => sum + tx.amount, 0);
    const exceeded = spent > code.monthlyLimit;
    const percent = code.monthlyLimit > 0 ? spent / code.monthlyLimit * 100 : null;
    return {...code, spent, exceeded, percent, barPercent: percent === null ? (spent > 0 ? 100 : 0) : Math.min(100, percent)};
  });
}
