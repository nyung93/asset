export type FiveVariant = 1 | 2 | 3 | 4 | 5;
export interface AvatarConfig {
  hair: FiveVariant; eyes: FiveVariant; face: FiveVariant; skin: FiveVariant; top: FiveVariant; bottom: FiveVariant; shoes: 1 | 2 | 3;
  /** New clay-asset selections are optional so existing persisted SVG avatars remain readable. */
  baseCharacter?: 'carrot' | 'piggybank';
  outfit?: FiveVariant;
  accessory?: 0 | 1 | 2 | 3 | 4 | 5;
  headAccessory?: 0 | 1 | 3;
  handAccessory?: 0 | 2 | 4 | 5;
  faceExpression?: CharacterExpression;
}
export interface CharacterState { totalXp: number; level: number; currentXp: number; houseStage: FiveVariant; avatar: AvatarConfig; isCustomized: boolean }
export interface BudgetCode { codeId: string; categoryName: string; monthlyLimit: number }
export interface Transaction { txId: string; txDate: string; type: 'INCOME' | 'EXPENSE' | 'SAVING'; codeId: string; amount: number; memo: string }
export interface Goal { year: number; month: number; targetSavingAmount: number; targetInvestReturnRate: number }
export interface InvestmentMonthly {
  invId: string;
  yearMonth: string;
  tickerName: string;
  investedPrincipal: number;
  currentValuation: number;
  // Optional fields keep existing Phase 1 snapshots readable without inventing quantities.
  ticker?: string;
  currency?: InvestmentCurrency;
  quantity?: number;
  purchasePrice?: number;
  lastPrice?: number;
  quoteTime?: string;
  fetchedAt?: string;
  valuationSource?: 'market' | 'principal';
}
export interface XpLog { logId: string; earnedDate: string; rewardType: 'DAILY_LOG' | 'MONTHLY_BUDGET' | 'MONTHLY_SAVING' | 'MONTHLY_INVEST' | 'ANNUAL_GOAL'; referencePeriod: string; xpAmount: number }
export interface AppData { character: CharacterState; budgetCodes: BudgetCode[]; transactions: Transaction[]; goals: Goal[]; investments: InvestmentMonthly[]; xpLogs: XpLog[] }

export type InvestmentCurrency = 'KRW' | 'USD';
export interface Stock {
  name: string;
  ticker: string;
  market: string;
  currency: InvestmentCurrency;
  aliases: string[];
}
export interface MarketQuote {
  ticker: string;
  price: number;
  currency: InvestmentCurrency;
  marketTime: string;
  fetchedAt: string;
}

export type CharacterExpression = 'neutral' | 'happy' | 'stoic' | 'frowning' | 'crying' | 'sad';
