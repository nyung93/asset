import type { InvestmentMonthly, MarketQuote } from '../types';
import { addMonths } from './calendar';
export function isTracked(investment: InvestmentMonthly): investment is InvestmentMonthly & {
  ticker: string; currency: 'KRW' | 'USD'; quantity: number; purchasePrice: number;
} {
  return Boolean(investment.ticker && ['KRW','USD'].includes(investment.currency ?? '') && Number.isFinite(investment.quantity) && investment.quantity! > 0 && Number.isFinite(investment.purchasePrice) && investment.purchasePrice! > 0);
}
export function returnRate(investment: InvestmentMonthly): number | null {
  if (investment.investedPrincipal <= 0 || investment.valuationSource === 'principal') return null;
  return (investment.currentValuation / investment.investedPrincipal - 1) * 100;
}
export function previousMonthChange(investment: InvestmentMonthly, investments: InvestmentMonthly[]): number | null {
  if (!investment.ticker) return null;
  const previousMonth = addMonths(`${investment.yearMonth}-01`, -1).slice(0, 7);
  const previous = investments.find(i => i.yearMonth === previousMonth && i.ticker === investment.ticker && i.currency === investment.currency);
  const currentRate = returnRate(investment);
  const previousRate = previous ? returnRate(previous) : null;
  return currentRate === null || previousRate === null ? null : currentRate - previousRate;
}
export function carryInvestmentsForward(investments: InvestmentMonthly[], month: string): InvestmentMonthly[] {
  const latest = new Map<string, InvestmentMonthly>();
  for (const investment of investments) {
    if (!isTracked(investment) || investment.yearMonth > month) continue;
    const prior = latest.get(investment.ticker);
    if (!prior || prior.yearMonth < investment.yearMonth) latest.set(investment.ticker, investment);
  }
  const additions = [...latest.values()].filter(i => i.yearMonth < month).map(i => ({...i, invId: `${i.ticker}:${month}`, yearMonth: month}));
  return additions.length ? [...investments, ...additions] : investments;
}
export function applyQuotes(investments: InvestmentMonthly[], month: string, quotes: MarketQuote[]): InvestmentMonthly[] {
  const byTicker = new Map(quotes.map(quote => [quote.ticker, quote]));
  return investments.map(investment => {
    if (investment.yearMonth !== month || !isTracked(investment)) return investment;
    const quote = byTicker.get(investment.ticker);
    if (!quote || quote.currency !== investment.currency || !Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(Date.parse(quote.marketTime)) || !Number.isFinite(Date.parse(quote.fetchedAt))) return investment;
    if (investment.quoteTime && quote.marketTime < investment.quoteTime) return investment;
    const currentValuation = quote.price * investment.quantity;
    if (!Number.isFinite(currentValuation) || currentValuation > Number.MAX_SAFE_INTEGER) return investment;
    return {...investment, currentValuation, lastPrice: quote.price, quoteTime: quote.marketTime, fetchedAt: quote.fetchedAt, valuationSource: 'market'};
  });
}
export const profitColor = (value: number | null) => value === null || value === 0 ? 'text-stone-500' : value > 0 ? 'text-rose-500' : 'text-blue-500';
export const percentLabel = (value: number | null, unit = '%') => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}${unit}`;
export const investmentMoney = (value: number, currency: 'KRW' | 'USD') => new Intl.NumberFormat('ko-KR', {style: 'currency', currency, maximumFractionDigits: currency === 'KRW' ? 0 : 2}).format(value);
