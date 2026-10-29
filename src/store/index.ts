import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { characterAtXp, HOUSE_STAGES } from '../lib/progression';
import { getSettlementMissions, type BonusRewardType } from '../lib/XpSettlementEngine';
import { applyQuotes, carryInvestmentsForward } from '../lib/investments';
import { isValidDate, todayDate } from '../lib/calendar';
import { DEFAULT_AVATAR_CONFIG } from '../lib/avatar';
import {validYearMonth} from '../lib/recurringExpenses';
import type { AppData, AvatarConfig, BudgetCode, CharacterImageId, Goal, InvestmentMonthly, MarketQuote, RecurringExpense, Transaction, XpLog } from '../types';
export const HOUSE_NAMES = HOUSE_STAGES.map(stage => stage.name);
export const initialData: AppData = {
  character: { totalXp: 0, level: 1, currentXp: 0, houseStage: 1, avatar: {...DEFAULT_AVATAR_CONFIG}, isCustomized: false },
  budgetCodes: [ {codeId:'FO01',categoryName:'식비',monthlyLimit:400000}, {codeId:'SH01',categoryName:'쇼핑/뷰티',monthlyLimit:200000}, {codeId:'HO01',categoryName:'고정주거비',monthlyLimit:600000}, {codeId:'TR01',categoryName:'교통',monthlyLimit:100000}, {codeId:'LE01',categoryName:'문화/여가',monthlyLimit:150000} ],
  transactions: [], goals: [], investments: [], xpLogs: [], recurringExpenses: [], recurringExpensePayments: [],
};
function nonnegative(n: number) { return Number.isFinite(n) && n >= 0; }
const validDate = isValidDate;
function validateTransaction(tx: Transaction, codes: BudgetCode[]) {
  if (!validDate(tx.txDate) || !tx.txId || !Number.isSafeInteger(tx.amount) || tx.amount <= 0 || !['INCOME','EXPENSE','SAVING'].includes(tx.type)) throw new Error('거래 날짜와 금액을 확인해 주세요.');
  if (!(codes.some(c => c.codeId === tx.codeId) || (tx.type === 'INCOME' && tx.codeId === 'INCOME') || (tx.type === 'SAVING' && tx.codeId === 'SAVING'))) throw new Error('유효한 예산 코드를 선택해 주세요.');
}
function growCharacter(character: AppData['character'], xp: number): AppData['character'] {
  return characterAtXp(character, character.totalXp + xp);
}
export function migrateAppData(saved: Partial<AppData>, version: number): AppData {
  const data = {...structuredClone(initialData), ...saved};
  data.recurringExpenses = Array.isArray(saved.recurringExpenses) ? saved.recurringExpenses : [];
  data.recurringExpensePayments = Array.isArray(saved.recurringExpensePayments) ? saved.recurringExpensePayments : [];
  const character = {...initialData.character, ...saved.character};
  const loggedXp = data.xpLogs.reduce((sum, log) => sum + (Number.isSafeInteger(log.xpAmount) && log.xpAmount > 0 ? log.xpAmount : 0), 0);
  // Version 1 used level × 100 XP per level; recover all previously earned XP.
  const legacyXp = version < 2 ? 100 * (character.level - 1) * character.level / 2 + character.currentXp : character.totalXp;
  data.character = characterAtXp(character, Math.max(0, loggedXp, Number.isSafeInteger(legacyXp) ? legacyXp : 0));
  return data;
}
export interface SettlementResult {
  awarded: boolean; message: string; xpAmount: number; leveledUp: boolean; houseUpgraded: boolean;
}
interface Actions {
  replaceAppData: (data: AppData) => void;
  resetAppData: () => void;
  saveBudgetCode: (code: BudgetCode, originalId?: string) => void;
  deleteBudgetCode: (codeId: string) => void;
  saveGoal: (goal: Goal) => void;
  saveRecurringExpense: (expense: RecurringExpense) => void;
  deleteRecurringExpense: (id: string) => void;
  toggleRecurringExpensePaid: (id: string, yearMonth: string) => void;
  saveTransaction: (tx: Transaction) => void;
  saveTransactionWithDailyReward: (tx: Transaction) => boolean;
  deleteTransaction: (id: string) => void;
  saveInvestment: (investment: InvestmentMonthly) => void;
  deleteInvestment: (id: string) => void;
  ensureInvestmentMonth: () => void;
  updateInvestmentQuotes: (yearMonth: string, quotes: MarketQuote[]) => void;
  customizeAvatar: (avatar: AvatarConfig) => void;
  selectCharacter: (id: CharacterImageId) => void;
  awardXp: (log: XpLog) => boolean;
  claimSettlement: (type: BonusRewardType) => SettlementResult;
}
// The live app loads/saves this snapshot through authenticated server APIs. Browser
// persistence remains enabled only for the existing isolated unit/E2E fixtures.
const fixtureStorage = typeof window === 'undefined' || (import.meta.env?.DEV && import.meta.env?.VITE_E2E_AUTH_BYPASS === '1');
const storage = fixtureStorage ? createJSONStorage<AppData>(() => localStorage) : {
  getItem: () => null, setItem: () => undefined, removeItem: () => undefined,
};
export const useAppStore = create<AppData & Actions>()(persist((set, get) => ({
  ...structuredClone(initialData),
  replaceAppData: data => set(migrateAppData(data,2)),
  resetAppData: () => set(structuredClone(initialData)),
  saveBudgetCode: (input, originalId) => {
    const code = {...input, codeId: input.codeId.trim().toUpperCase(), categoryName: input.categoryName.trim()};
    if (!/^[A-Z][A-Z0-9]{1,11}$/.test(code.codeId) || ['INCOME','SAVING'].includes(code.codeId)) throw new Error('코드는 영문으로 시작하는 영문·숫자 2~12자로 입력해 주세요.');
    if (!code.categoryName || !Number.isSafeInteger(code.monthlyLimit) || !nonnegative(code.monthlyLimit)) throw new Error('카테고리명과 0 이상의 정수 예산을 입력해 주세요.');
    if (originalId && !get().budgetCodes.some(c => c.codeId === originalId)) throw new Error('수정할 코드가 없습니다.');
    if (get().budgetCodes.some(c => c.codeId === code.codeId && c.codeId !== originalId)) throw new Error('이미 사용 중인 코드입니다.');
    set(s => ({ budgetCodes: originalId ? s.budgetCodes.map(c => c.codeId === originalId ? code : c) : [...s.budgetCodes, code], transactions: s.transactions.map(t => t.codeId === originalId ? {...t, codeId: code.codeId} : t), recurringExpenses:s.recurringExpenses.map(item=>item.codeId===originalId ? {...item,codeId:code.codeId} : item) }));
  },
  deleteBudgetCode: codeId => {
    if (get().transactions.some(t => t.codeId === codeId) || get().recurringExpenses.some(item=>item.codeId===codeId)) throw new Error('가계부 또는 정기 지출에 사용된 코드는 삭제할 수 없습니다.');
    set(s => ({budgetCodes:s.budgetCodes.filter(c => c.codeId !== codeId)}));
  },
  saveGoal: goal => {
    if (!Number.isInteger(goal.year) || goal.year < 1900 || goal.year > 9999 || !Number.isInteger(goal.month) || goal.month < 0 || goal.month > 12 || !Number.isSafeInteger(goal.targetSavingAmount) || !nonnegative(goal.targetSavingAmount) || !Number.isFinite(goal.targetInvestReturnRate) || goal.targetInvestReturnRate < -100) throw new Error('저축액은 0 이상의 정수, 수익률은 -100% 이상으로 입력해 주세요.');
    set(s => ({goals:[...s.goals.filter(g => !(g.year === goal.year && g.month === goal.month)), {...goal}]}));
  },
  saveRecurringExpense: input => {
    const expense={...input,name:input.name.trim()};
    if(!expense.id || expense.id.length>64 || !expense.name || expense.name.length>40 || !Number.isInteger(expense.day) || expense.day<1 || expense.day>31 || !Number.isSafeInteger(expense.amount) || expense.amount<=0 || !validYearMonth(expense.startMonth) || !get().budgetCodes.some(code=>code.codeId===expense.codeId)) throw new Error('이름·납부일·금액·카테고리를 확인해 주세요.');
    set(s=>({recurringExpenses:[...s.recurringExpenses.filter(item=>item.id!==expense.id),expense]}));
  },
  deleteRecurringExpense: id => set(s=>({
    recurringExpenses:s.recurringExpenses.filter(item=>item.id!==id),
    recurringExpensePayments:s.recurringExpensePayments.filter(item=>item.expenseId!==id),
  })),
  toggleRecurringExpensePaid: (id,yearMonth) => {
    const expense=get().recurringExpenses.find(item=>item.id===id);
    if(!expense || !validYearMonth(yearMonth) || yearMonth<expense.startMonth) throw new Error('정기 지출과 조회 월을 확인해 주세요.');
    set(s=>{
      const paid=s.recurringExpensePayments.some(item=>item.expenseId===id && item.yearMonth===yearMonth);
      return {recurringExpensePayments:paid
        ? s.recurringExpensePayments.filter(item=>!(item.expenseId===id && item.yearMonth===yearMonth))
        : [...s.recurringExpensePayments,{expenseId:id,yearMonth,paidOn:todayDate()}]};
    });
  },
  saveTransaction: tx => {
    validateTransaction(tx, get().budgetCodes);
    set(s => ({transactions:[...s.transactions.filter(t => t.txId !== tx.txId), {...tx}]}));
  },
  saveTransactionWithDailyReward: tx => {
    validateTransaction(tx, get().budgetCodes);
    let awarded = false;
    // Commit the transaction, reward history and character in a single persisted update.
    set(s => {
      awarded = !s.xpLogs.some(log => log.rewardType === 'DAILY_LOG' && log.referencePeriod === tx.txDate);
      const transactions = [...s.transactions.filter(t => t.txId !== tx.txId), {...tx}];
      if (!awarded) return {transactions};
      const log: XpLog = {logId: `daily:${tx.txDate}`, earnedDate: todayDate(), rewardType: 'DAILY_LOG', referencePeriod: tx.txDate, xpAmount: 10};
      return {transactions, xpLogs: [...s.xpLogs, log], character: growCharacter(s.character, 10)};
    });
    return awarded;
  },
  deleteTransaction: id => set(s => ({transactions:s.transactions.filter(t => t.txId !== id)})),
  saveInvestment: inv => {
    if (!inv.invId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(inv.yearMonth) || !inv.tickerName.trim() || !nonnegative(inv.investedPrincipal) || !nonnegative(inv.currentValuation)) throw new Error('투자 정보를 확인해 주세요.');
    let investment = {...inv};
    if (inv.ticker !== undefined) {
      if (!/^[A-Z0-9^][A-Z0-9.^=\-]{0,29}$/.test(inv.ticker) || !['KRW','USD'].includes(inv.currency ?? '') || !Number.isFinite(inv.quantity) || inv.quantity! <= 0 || inv.investedPrincipal <= 0 || inv.investedPrincipal > Number.MAX_SAFE_INTEGER || inv.quantity! > Number.MAX_SAFE_INTEGER) throw new Error('종목, 통화, 원금과 보유 수량을 확인해 주세요.');
      if (get().investments.some(i => i.invId !== inv.invId && i.ticker === inv.ticker && i.yearMonth === inv.yearMonth)) throw new Error('이번 달에 등록된 종목입니다. 기존 종목을 수정해 주세요.');
      const purchasePrice = inv.investedPrincipal / inv.quantity!;
      if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) throw new Error('평균 매수 단가를 계산할 수 없습니다.');
      investment = {...investment, purchasePrice};
    }
    set(s => ({investments:[...s.investments.filter(i => i.invId !== inv.invId), investment]}));
  },
  ensureInvestmentMonth: () => {
    const month = todayDate().slice(0, 7);
    const investments = carryInvestmentsForward(get().investments, month);
    if (investments !== get().investments) set({investments});
  },
  updateInvestmentQuotes: (yearMonth, quotes) => {
    // Live prices must never rewrite historical snapshots, including at a month boundary.
    if (yearMonth !== todayDate().slice(0, 7)) return;
    set(s => ({investments: applyQuotes(s.investments, yearMonth, quotes)}));
  },
  deleteInvestment: id => set(s => ({investments:s.investments.filter(i => i.invId !== id)})),
  customizeAvatar: avatar => {
    const baseKeys = ['hair','eyes','face','skin','top','bottom','shoes'];
    const optionalKeys = ['baseCharacter','outfit','accessory','faceExpression','headAccessory','handAccessory'];
    const validBase = baseKeys.every(key => Number.isInteger(avatar[key as keyof AvatarConfig]) && Number(avatar[key as keyof AvatarConfig]) >= 1 && Number(avatar[key as keyof AvatarConfig]) <= (key === 'shoes' ? 3 : 5));
    const validOptional = Object.entries(avatar).every(([key, value]) => {
      if (!optionalKeys.includes(key)) return baseKeys.includes(key);
      if (key === 'baseCharacter') return value === 'carrot' || value === 'piggybank';
      if (key === 'faceExpression') return ['neutral','happy','stoic','frowning','crying','sad'].includes(String(value));
      if (key === 'headAccessory') return Number.isInteger(value) && [0,1,3].includes(Number(value));
      if (key === 'handAccessory') return Number.isInteger(value) && [0,2,4,5].includes(Number(value));
      if (key === 'accessory') return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5;
      return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;
    });
    if (!validBase || !validOptional) throw new Error('아바타 설정이 올바르지 않습니다.');
    set(s => ({character:{...s.character,avatar:{...avatar},isCustomized:true,selectedCharacterId:undefined}}));
  },
  selectCharacter: id => {
    if (!['default','saver','crying','duck','pink'].includes(id)) throw new Error('선택할 수 없는 캐릭터예요.');
    set(s => ({character:{...s.character,selectedCharacterId:id,isCustomized:true}}));
  },
  claimSettlement: type => {
    const date = todayDate();
    let result: SettlementResult = {awarded: false, message: '아직 목표를 달성하지 못했어요.', xpAmount: 0, leveledUp: false, houseUpgraded: false};
    set(s => {
      const mission = getSettlementMissions(s, date).find(item => item.type === type);
      if (!mission) return s;
      if (mission.claimed) {result.message = '이미 받은 보상이에요.';return s;}
      if (!mission.eligible) return s;
      const character = growCharacter(s.character, mission.xpAmount);
      const log: XpLog = {logId: `${type}:${mission.period}`, earnedDate: date, rewardType: type, referencePeriod: mission.period, xpAmount: mission.xpAmount};
      result = {awarded: true, message: `${mission.title}! +${mission.xpAmount} XP 획득!`, xpAmount: mission.xpAmount, leveledUp: character.level > s.character.level, houseUpgraded: character.houseStage > s.character.houseStage};
      return {character, xpLogs: [...s.xpLogs, log]};
    });
    return result;
  },
  awardXp: log => {
    const patterns = {DAILY_LOG:/^\d{4}-\d{2}-\d{2}$/, MONTHLY_BUDGET:/^\d{4}-(0[1-9]|1[0-2])$/, MONTHLY_SAVING:/^\d{4}-(0[1-9]|1[0-2])$/, MONTHLY_INVEST:/^\d{4}-(0[1-9]|1[0-2])$/, ANNUAL_GOAL:/^\d{4}$/};
    if (!log.logId || !validDate(log.earnedDate) || !Number.isSafeInteger(log.xpAmount) || log.xpAmount <= 0 || !patterns[log.rewardType]?.test(log.referencePeriod)) throw new Error('XP 지급 정보가 올바르지 않습니다.');
    if (get().xpLogs.some(l => l.logId === log.logId || (l.rewardType === log.rewardType && l.referencePeriod === log.referencePeriod))) return false;
    set(s => {
      return {xpLogs:[...s.xpLogs,{...log}],character:growCharacter(s.character, log.xpAmount)};
    }); return true;
  },
}), {name:'rich-grandma-tycoon-v1',version:2,storage,migrate: (saved, version) => migrateAppData(saved as Partial<AppData>, version),merge: (saved, current) => ({...current, ...migrateAppData((saved ?? {}) as Partial<AppData>, 2)}),partialize: s => ({character:s.character,budgetCodes:s.budgetCodes,transactions:s.transactions,goals:s.goals,investments:s.investments,xpLogs:s.xpLogs,recurringExpenses:s.recurringExpenses,recurringExpensePayments:s.recurringExpensePayments})}));
