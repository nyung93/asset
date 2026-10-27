import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import stockData from '../data/stocks.json';
import type { InvestmentMonthly, MarketQuote, Stock } from '../types';
import { useAppStore } from '../store';
import { addMonths, isValidMonth, todayDate } from '../lib/calendar';
import { investmentMoney, isTracked, percentLabel, previousMonthChange, profitColor, returnRate, summarizeCurrency, summarizePortfolio } from '../lib/investments';
import { fetchCurrentPrice } from '../utils/financeApi';
import Dialog from './Dialog';

const stocks = stockData as Stock[];
const timestampLabel = (value?: string) => value ? new Intl.DateTimeFormat('ko-KR', {dateStyle: 'short', timeStyle: 'short'}).format(new Date(value)) : '미조회';

function StockAutocomplete({value, onChange, disabled = false}: {
  value: Stock | null; onChange: (stock: Stock | null) => void; disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState(value ? `${value.name} (${value.ticker})` : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase().replace(/\s/g, '');
    return stocks.filter(stock => [stock.name, stock.ticker, ...stock.aliases].some(text => text.toLocaleLowerCase().replace(/\s/g, '').includes(keyword))).slice(0, 8);
  }, [query]);
  function choose(stock: Stock) {
    onChange(stock); setQuery(`${stock.name} (${stock.ticker})`); setOpen(false);
  }
  return <div className="relative">
    <label className="field-label" htmlFor={`${id}-search`}>종목 검색</label>
    <div className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={16}/><input
      id={`${id}-search`} role="combobox" aria-autocomplete="list" aria-controls={`${id}-list`} aria-expanded={open} aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
      className="standalone-input !pl-10 disabled:text-slate-500" autoComplete="off" autoFocus disabled={disabled} placeholder="애플, AAPL, 삼성전자, 금…" value={query}
      onChange={event => {setQuery(event.target.value);onChange(null);setActive(0);setOpen(true);}}
      onFocus={() => {if (!value) setOpen(true);}}
      onBlur={() => setOpen(false)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();setOpen(true);
          setActive(index => matches.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : 0);
        } else if (event.key === 'Enter' && open) {
          event.preventDefault();if (matches[active]) choose(matches[active]);
        } else if (event.key === 'Escape' && open) {event.preventDefault();event.stopPropagation();setOpen(false);}
      }}/></div>
    {open && <ul id={`${id}-list`} role="listbox" aria-label="종목 검색 결과" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
      {matches.map((stock, index) => <li key={stock.ticker} id={`${id}-option-${index}`} role="option" aria-selected={index === active}
        className={`cursor-pointer px-4 py-3 ${index === active ? 'bg-[#eaf4fb]' : 'hover:bg-slate-50'}`}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(stock)}>
        <span className="block text-sm font-semibold">{stock.name}</span><span className="text-xs text-slate-500">{stock.ticker} · {stock.market} · {stock.currency}</span>
      </li>)}
      {!matches.length && <li className="px-4 py-4 text-xs text-slate-500">검색 결과가 없어요. 종목명이나 6자리 종목코드로 다시 검색해 주세요.</li>}
    </ul>}
  </div>;
}

function InvestmentForm({investment, onClose, onSaved}: {
  investment: InvestmentMonthly | null; onClose: () => void; onSaved: (message: string, ticker: string, quoted: boolean) => void;
}) {
  const [stock, setStock] = useState<Stock | null>(() => stocks.find(item => item.ticker === investment?.ticker) ?? null);
  const [principal, setPrincipal] = useState(investment ? String(investment.investedPrincipal) : '');
  const [quantity, setQuantity] = useState(investment?.quantity ? String(investment.quantity) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const submitting = useRef(false);
  useEffect(() => {alive.current = true;return () => {alive.current = false;};}, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!stock) {setError('검색 결과에서 종목을 선택해 주세요.');return;}
    const cost = Number(principal); const shares = Number(quantity);
    if (!Number.isFinite(cost) || cost <= 0 || cost > Number.MAX_SAFE_INTEGER || !Number.isFinite(shares) || shares <= 0 || shares > Number.MAX_SAFE_INTEGER || !Number.isFinite(cost / shares)) {
      setError('원금과 보유 수량은 0보다 큰 유효한 숫자로 입력해 주세요.');return;
    }
    submitting.current = true;setBusy(true);setError('');
    try {
      const quote = await fetchCurrentPrice(stock.ticker, {includeMetadata: true, force: true});
      if (!alive.current) return;
      const validQuote = quote?.currency === stock.currency ? quote : null;
      const lastPrice = validQuote?.price ?? investment?.lastPrice;
      const valuation = lastPrice ? lastPrice * shares : cost;
      if (!Number.isFinite(valuation) || valuation > Number.MAX_SAFE_INTEGER) throw new Error('평가금액이 지원 범위를 초과합니다.');
      const yearMonth = todayDate().slice(0, 7);
      const record: InvestmentMonthly = {
        invId: investment?.yearMonth === yearMonth ? investment.invId : crypto.randomUUID(), yearMonth,
        tickerName: stock.name, ticker: stock.ticker, currency: stock.currency,
        investedPrincipal: cost, quantity: shares, purchasePrice: cost / shares,
        currentValuation: valuation, lastPrice,
        quoteTime: validQuote?.marketTime ?? investment?.quoteTime,
        fetchedAt: validQuote?.fetchedAt ?? investment?.fetchedAt,
        valuationSource: lastPrice ? 'market' : 'principal',
      };
      useAppStore.getState().saveInvestment(record);
      onSaved(validQuote ? '종목과 현재 평가금액을 저장했어요.' : '종목을 저장했어요. 시세 조회에 실패해 기존 시세 또는 입력 원금을 유지합니다.', stock.ticker, Boolean(validQuote));
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : '저장에 실패했어요. 다시 시도해 주세요.');
    } finally {
      submitting.current = false;if (alive.current) setBusy(false);
    }
  }
  const average = Number(quantity) > 0 ? Number(principal) / Number(quantity) : 0;
  return <Dialog title={investment ? '투자 종목 수정' : '투자 종목 추가'} onClose={onClose}>
    <form onSubmit={submit}>
      <StockAutocomplete value={stock} onChange={setStock} disabled={Boolean(investment) || busy}/>
      {stock && <p className="mt-3 flex items-center gap-1 text-xs text-forest"><Check size={14}/>{stock.ticker} · {stock.currency}{stock.market === 'GOLD' ? ' · 금 가격을 추종하는 ETF' : ''}</p>}
      <label className="field-label" htmlFor="invest-principal">매수 원금 ({stock?.currency === 'KRW' ? '원' : stock?.currency === 'USD' ? '미국 달러' : '종목의 거래 통화'})</label>
      <input className="standalone-input" id="invest-principal" type="number" required min="0.01" step="any" max={Number.MAX_SAFE_INTEGER} value={principal} disabled={busy} onChange={event => setPrincipal(event.target.value)} placeholder={stock?.currency === 'KRW' ? '예: 1000000' : '예: 2000'}/>
      <label className="field-label" htmlFor="invest-quantity">보유 수량 (주)</label>
      <input className="standalone-input" id="invest-quantity" type="number" required min="0.00000001" step="any" max={Number.MAX_SAFE_INTEGER} value={quantity} disabled={busy} onChange={event => setQuantity(event.target.value)} placeholder="소수점 수량도 입력할 수 있어요"/>
      <p className="mt-3 text-xs text-slate-500">평균 매수 단가: {stock && Number.isFinite(average) && average > 0 ? investmentMoney(average, stock.currency) : '—'}</p>
      <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">미국 종목의 원금은 달러로 입력해 주세요. 원금과 수량으로 평균 매수 단가를 계산하며, 배당·세금·환율 변동은 수익률에 포함하지 않아요.</p>
      <p role="alert" className="mt-3 text-sm text-rose-500">{error}</p>
      <p role="status" className="mt-2 text-xs text-forest">{busy ? 'Yahoo Finance 시세를 조회하고 있어요…' : ''}</p>
      <div className="mt-5 flex gap-2"><button type="button" className="button-secondary flex-1" onClick={onClose}>취소</button><button type="submit" disabled={busy} className="button-primary flex-1 disabled:opacity-50">{busy ? <RefreshCw size={16} className="animate-spin"/> : <Plus size={16}/>}저장하기</button></div>
    </form>
  </Dialog>;
}

function StockCard({investment, investments, historic, notUpdated, onEdit}: {
  investment: InvestmentMonthly; investments: InvestmentMonthly[]; historic: boolean; notUpdated: boolean; onEdit: () => void;
}) {
  const rate = returnRate(investment);
  const change = previousMonthChange(investment, investments);
  return <article className="card !p-4 sm:!p-5 min-w-0">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><p className="truncate text-[11px] font-medium text-slate-500">{investment.ticker} · {investment.currency}</p><h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug">{investment.tickerName}</h3></div>
      {!historic && <button className="icon-button !h-8 !w-8 shrink-0" aria-label={`${investment.tickerName} 수정`} onClick={onEdit}><Pencil size={14}/></button>}
    </div>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-x-2 gap-y-1"><div><p className="text-[11px] text-slate-500">평가금액</p><p className="mt-1 break-all text-base font-bold">{investmentMoney(investment.currentValuation, investment.currency!)}</p></div><p className={`text-sm font-bold ${profitColor(rate)}`}>{percentLabel(rate)}</p></div>
    <div className="mt-3 flex flex-wrap justify-between gap-x-2 gap-y-1 border-t border-slate-100 pt-3 text-xs"><span className="text-slate-500">매수 {investmentMoney(investment.investedPrincipal, investment.currency!)}</span><span className={profitColor(change)}>전월 {change === null ? '—' : <>{percentLabel(change, '%p')} {change > 0 ? <ArrowUpRight className="inline" size={13}/> : change < 0 ? <ArrowDownRight className="inline" size={13}/> : null}</>}</span></div>
    <details className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500"><summary className="cursor-pointer select-none">거래·시세 상세</summary><div className="mt-2 space-y-1 leading-relaxed"><p>보유 {new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 8}).format(investment.quantity!)}주 · 평균 매수가 {investmentMoney(investment.purchasePrice!, investment.currency!)}</p><p>현재가 {investment.lastPrice ? investmentMoney(investment.lastPrice, investment.currency!) : '시세 대기'}</p><p>{investment.valuationSource === 'principal' ? '시세 미확인 · 평가금액은 입력 원금으로 임시 표시합니다.' : `시세 기준 ${timestampLabel(investment.quoteTime)} · 조회 ${timestampLabel(investment.fetchedAt)}`}{notUpdated ? ' · 갱신 실패, 저장값 유지' : ''}</p></div></details>
    {(notUpdated || investment.valuationSource === 'principal') && <p className="mt-2 text-[11px] text-amber-700">{notUpdated ? '시세 갱신 실패 · 저장값 유지' : '시세 미확인 · 원금 임시 표시'}</p>}
  </article>;
}

export default function InvestmentTab() {
  const investments = useAppStore(s => s.investments);
  const currentMonth = todayDate().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [editing, setEditing] = useState<InvestmentMonthly | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxQuote, setFxQuote] = useState<MarketQuote | null>(null);
  const [fxError, setFxError] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState<string[]>([]);
  const run = useRef(0);
  const fxRun = useRef(0);
  const currentSignature = investments.filter(i => i.yearMonth === currentMonth && isTracked(i)).map(i => i.ticker).sort().join(',');
  const previousMonth = addMonths(`${month}-01`, -1).slice(0, 7);
  const needsFx = investments.some(i => (i.yearMonth === month || i.yearMonth === previousMonth) && isTracked(i) && i.currency === 'USD');
  useEffect(() => {useAppStore.getState().ensureInvestmentMonth();}, [currentMonth]);
  const refresh = useCallback(async (force = false) => {
    const id = ++run.current;
    const records = useAppStore.getState().investments.filter(i => i.yearMonth === currentMonth && isTracked(i));
    const tickers = [...new Set(records.map(i => i.ticker!))];
    if (!tickers.length) {setLoading(false);return;}
    setLoading(true);
    const results = await Promise.all(tickers.map(async ticker => ({ticker, quote: await fetchCurrentPrice(ticker, {includeMetadata: true, force})})));
    if (run.current !== id) return;
    const accepted: MarketQuote[] = [];
    const failures: string[] = [];
    for (const result of results) {
      const existing = records.find(i => i.ticker === result.ticker)!;
      if (result.quote && result.quote.currency === existing.currency && (!existing.quoteTime || result.quote.marketTime >= existing.quoteTime)) accepted.push(result.quote);
      else failures.push(result.ticker);
    }
    useAppStore.getState().updateInvestmentQuotes(currentMonth, accepted);
    setFailed(failures);setLoading(false);
    setMessage(failures.length ? `${failures.length}개 종목의 시세를 갱신하지 못했어요. 저장된 평가금액을 유지합니다.` : `${accepted.length}개 종목의 시세를 확인했어요.`);
  }, [currentMonth]);
  useEffect(() => {
    void refresh();
    return () => {run.current++;};
  }, [refresh, currentSignature]);
  const refreshFx = useCallback(async (force = false) => {
    if (!needsFx) return;
    const id = ++fxRun.current;
    setFxLoading(true);
    const quote = await fetchCurrentPrice('KRW=X', {includeMetadata: true, force});
    if (fxRun.current !== id) return;
    if (quote?.currency === 'KRW' && quote.ticker === 'KRW=X') {setFxQuote(quote);setFxError(false);}
    else setFxError(true);
    setFxLoading(false);
  }, [needsFx]);
  useEffect(() => {
    void refreshFx();
    return () => {fxRun.current++;};
  }, [refreshFx]);
  const monthly = investments.filter(i => i.yearMonth === month);
  const tracked = monthly.filter(isTracked);
  const legacy = monthly.filter(i => !isTracked(i));
  const domestic = tracked.filter(i => i.currency === 'KRW');
  const overseas = tracked.filter(i => i.currency === 'USD');
  const previous = investments.filter(i => i.yearMonth === previousMonth && isTracked(i));
  const currentTotals = summarizePortfolio(tracked, fxQuote?.price ?? null);
  const priorTotals = summarizePortfolio(previous, fxQuote?.price ?? null);
  const costChange = previous.length && currentTotals.principal !== null && priorTotals.principal !== null ? currentTotals.principal - priorTotals.principal : null;
  const valueChange = previous.length && currentTotals.valuation !== null && priorTotals.valuation !== null ? currentTotals.valuation - priorTotals.valuation : null;
  const rateChange = currentTotals.returnRate !== null && priorTotals.returnRate !== null ? currentTotals.returnRate - priorTotals.returnRate : null;
  const historic = month !== currentMonth;
  const moneyOrDash = (amount: number | null) => amount === null ? '—' : investmentMoney(amount, 'KRW');
  const deltaLabel = (amount: number | null, unit: '%' | '%p' = '%') => amount === null ? '비교 기록 없음' : unit === '%p' ? percentLabel(amount, '%p') : `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${investmentMoney(Math.abs(amount), 'KRW')}`;
  return <>
    <div className="eyebrow">포트폴리오</div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
      <div><h1>투자 포트폴리오</h1><p className="muted mt-2 text-sm">보유 종목의 평가금액과 수익률을 확인해요.</p></div>
      <button className="button-primary" onClick={() => setEditing(null)}><Plus size={16}/>종목 추가</button>
    </div>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <label className="text-xs text-slate-500">조회 월 <input className="month-picker" aria-label="투자 조회 월" type="month" max={currentMonth} value={month} onChange={event => {if (isValidMonth(event.target.value) && event.target.value <= currentMonth) setMonth(event.target.value);}}/></label>
      <div className="flex items-center gap-2"><button className="text-button" onClick={() => setMonth(currentMonth)}>이번 달</button><button className="button-secondary disabled:opacity-50" disabled={loading || fxLoading || historic || !tracked.length} onClick={() => {void refresh(true);void refreshFx(true);}}><RefreshCw size={15} className={loading || fxLoading ? 'animate-spin' : ''}/>{loading || fxLoading ? '조회 중' : '시세 새로고침'}</button></div>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">전체 자산 · 원화</h2><span className="text-xs text-slate-500">국내 + 해외 {tracked.length}개 종목</span></div>
    <div className="summary-grid mt-3 grid sm:grid-cols-3">
      <article className="card !p-5"><p className="text-xs text-slate-500">총 매수 원금</p><p className="mt-4 break-all text-xl font-bold">{moneyOrDash(currentTotals.principal)}</p><p className="mt-2 text-xs text-slate-500">전월 {previous.length ? moneyOrDash(priorTotals.principal) : '기록 없음'}</p><p className="text-xs text-slate-500">전월 대비 <span className="text-slate-700">{deltaLabel(costChange)}</span></p></article>
      <article className="card !p-5"><p className="text-xs text-slate-500">현재 총 평가금액</p><p className="mt-4 break-all text-xl font-bold">{moneyOrDash(currentTotals.valuation)}</p><p className="mt-2 text-xs text-slate-500">전월 {previous.length ? moneyOrDash(priorTotals.valuation) : '기록 없음'}</p><p className="text-xs text-slate-500">전월 대비 <span className="text-slate-700">{deltaLabel(valueChange)}</span></p></article>
      <article className="card !p-5"><p className="text-xs text-slate-500">총 누적 수익률</p><p className={`mt-4 text-xl font-bold ${profitColor(currentTotals.returnRate)}`}>{percentLabel(currentTotals.returnRate)}</p><p className="mt-2 text-xs text-slate-500">전월 {previous.length ? percentLabel(priorTotals.returnRate) : '기록 없음'}</p><p className="text-xs text-slate-500">전월 대비 <span className={profitColor(rateChange)}>{deltaLabel(rateChange, '%p')}</span></p></article>
    </div>
    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-600" role="status" aria-live="polite">
      {needsFx ? fxQuote ? <>적용 환율 1 USD = {investmentMoney(fxQuote.price, 'KRW')} · 시세 기준 {timestampLabel(fxQuote.marketTime)}{fxError ? ' · 갱신 실패, 마지막 확인 환율 사용' : ''}</> : fxLoading ? 'USD/KRW 환율을 조회하고 있어요…' : '환율을 조회하지 못해 원화 합계를 표시할 수 없어요.' : '달러 보유 종목이 없어 환율 환산이 필요하지 않아요.'}
      {currentTotals.unpriced > 0 && <span className="block mt-1 text-amber-700">시세 미확인 {currentTotals.unpriced}개 종목은 원금으로 임시 표시하며 총 수익률 계산에서 제외해요.</span>}
      <span className="block mt-1 text-slate-500">전월 비교는 두 달 모두 위의 동일한 환율로 환산한 월별 저장값의 차이예요. 종목 추가·수정은 금액 차이에 포함되며, 매수 당시 환율·환차손익은 반영하지 않아요.</span>
    </div>
    <div role="status" aria-live="polite" className="mt-4 min-h-5 text-xs text-forest">{message}</div>
    {historic && <p className="mt-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-500">과거 월의 저장 기록입니다. 오늘의 시세로 과거 기록을 변경하지 않아요.</p>}
    <section className="mt-7 space-y-7" aria-label="보유 투자 종목">
      {(['KRW', 'USD'] as const).map(groupCurrency => {
        const records = groupCurrency === 'KRW' ? domestic : overseas;
        const totals = summarizeCurrency(records);
        return <section key={groupCurrency} aria-label={groupCurrency === 'KRW' ? '국내 주식' : '해외 주식'}>
          <div className="flex items-baseline justify-between gap-3"><h2 className="text-base font-bold">{groupCurrency === 'KRW' ? '국내 주식' : '해외 주식'}</h2><span className="text-xs text-slate-500">{records.length}개 · {groupCurrency}</span></div>
          {records.length > 0 && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-[#f2f7fb] px-4 py-3 text-xs text-slate-700"><span>매수 <strong>{investmentMoney(totals.principal!, groupCurrency)}</strong></span><span>평가 <strong>{investmentMoney(totals.valuation!, groupCurrency)}</strong></span><span>수익률 <strong className={profitColor(totals.returnRate)}>{percentLabel(totals.returnRate)}</strong></span></div>}
          {records.length ? <div className="mt-3 grid grid-cols-2 gap-3">{records.map(investment => <StockCard key={investment.invId} investment={investment} investments={investments} historic={historic} notUpdated={!historic && failed.includes(investment.ticker!)} onEdit={() => setEditing(investment)}/>)}</div> : <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-4 py-5 text-xs text-slate-500">이 달의 {groupCurrency === 'KRW' ? '국내' : '해외'} 보유 종목이 없어요.</p>}
        </section>;
      })}
    </section>
    {legacy.length > 0 && <section className="card mt-5"><h2 className="text-sm font-bold">기존 투자 기록</h2><p className="mt-2 text-xs text-slate-500">티커·통화·수량이 없는 이전 기록은 자동 조회 및 통화별 합산에서 제외했어요.</p>{legacy.map(item => <p key={item.invId} className="mt-3 text-sm">{item.tickerName} · 저장 평가금액 {item.currentValuation.toLocaleString('ko-KR')} (통화 미지정)</p>)}</section>}
    <p className="mt-6 text-xs leading-relaxed text-slate-400">Yahoo Finance 정규장 최신 제공 시세이며 지연될 수 있어요. 휴장일에는 마지막 거래 시세가 표시됩니다. 전월 대비는 직전 달에 마지막으로 저장한 수익률과의 차이(%p)예요.</p>
    {editing !== undefined && <InvestmentForm investment={editing} onClose={() => setEditing(undefined)} onSaved={(notice, ticker, quoted) => {if (quoted) setFailed(items => items.filter(item => item !== ticker));setMonth(todayDate().slice(0, 7));setEditing(undefined);setMessage(notice);}}/>}
  </>;
}
