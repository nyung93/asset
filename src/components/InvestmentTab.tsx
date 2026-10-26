import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Coins, Pencil, Plus, RefreshCw, Search, TrendingUp } from 'lucide-react';
import stockData from '../data/stocks.json';
import type { InvestmentCurrency, InvestmentMonthly, MarketQuote, Stock } from '../types';
import { useAppStore } from '../store';
import { isValidMonth, todayDate } from '../lib/calendar';
import { investmentMoney, isTracked, percentLabel, previousMonthChange, profitColor, returnRate } from '../lib/investments';
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
    <div className="relative"><Search className="absolute left-3 top-3.5 text-stone-400" size={16}/><input
      id={`${id}-search`} role="combobox" aria-autocomplete="list" aria-controls={`${id}-list`} aria-expanded={open} aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
      className="standalone-input !pl-10 disabled:text-stone-500" autoComplete="off" autoFocus disabled={disabled} placeholder="애플, AAPL, 삼성전자, 금…" value={query}
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
    {open && <ul id={`${id}-list`} role="listbox" aria-label="종목 검색 결과" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
      {matches.map((stock, index) => <li key={stock.ticker} id={`${id}-option-${index}`} role="option" aria-selected={index === active}
        className={`cursor-pointer px-4 py-3 ${index === active ? 'bg-[#edf1e5]' : 'hover:bg-stone-50'}`}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(stock)}>
        <span className="block text-sm font-semibold">{stock.name}</span><span className="text-xs text-stone-500">{stock.ticker} · {stock.market} · {stock.currency}</span>
      </li>)}
      {!matches.length && <li className="px-4 py-4 text-xs text-stone-500">검색 결과가 없어요. 샘플 20개 종목에서 선택해 주세요.</li>}
    </ul>}
  </div>;
}

function InvestmentForm({investment, onClose, onSaved}: {
  investment: InvestmentMonthly | null; onClose: () => void; onSaved: (currency: InvestmentCurrency, message: string, ticker: string, quoted: boolean) => void;
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
      onSaved(stock.currency, validQuote ? '종목과 현재 평가금액을 저장했어요.' : '종목을 저장했어요. 시세 조회에 실패해 기존 시세 또는 입력 원금을 유지합니다.', stock.ticker, Boolean(validQuote));
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
      <p className="mt-3 text-xs text-stone-500">평균 매수 단가: {stock && Number.isFinite(average) && average > 0 ? investmentMoney(average, stock.currency) : '—'}</p>
      <p className="mt-4 rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-stone-500">미국 종목의 원금은 달러로 입력해 주세요. 원금과 수량으로 평균 매수 단가를 계산하며, 배당·세금·환율 변동은 수익률에 포함하지 않아요.</p>
      <p role="alert" className="mt-3 text-sm text-rose-500">{error}</p>
      <p role="status" className="mt-2 text-xs text-forest">{busy ? 'Yahoo Finance 시세를 조회하고 있어요…' : ''}</p>
      <div className="mt-5 flex gap-2"><button type="button" className="button-secondary flex-1" onClick={onClose}>취소</button><button type="submit" disabled={busy} className="button-primary flex-1 disabled:opacity-50">{busy ? <RefreshCw size={16} className="animate-spin"/> : <Plus size={16}/>}저장하기</button></div>
    </form>
  </Dialog>;
}

export default function InvestmentTab() {
  const investments = useAppStore(s => s.investments);
  const currentMonth = todayDate().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [currency, setCurrency] = useState<InvestmentCurrency>(() => {
    const existing = useAppStore.getState().investments.filter(isTracked);
    return existing.length && !existing.some(item => item.currency === 'KRW') ? 'USD' : 'KRW';
  });
  const [editing, setEditing] = useState<InvestmentMonthly | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState<string[]>([]);
  const run = useRef(0);
  const currentSignature = investments.filter(i => i.yearMonth === currentMonth && isTracked(i)).map(i => i.ticker).sort().join(',');
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
  const monthly = investments.filter(i => i.yearMonth === month);
  const tracked = monthly.filter(isTracked);
  const legacy = monthly.filter(i => !isTracked(i));
  const selected = tracked.filter(i => i.currency === currency);
  const principal = selected.reduce((sum, i) => sum + i.investedPrincipal, 0);
  const valuation = selected.reduce((sum, i) => sum + i.currentValuation, 0);
  const pendingCount = selected.filter(i => i.valuationSource === 'principal').length;
  const totalReturn = principal > 0 && !pendingCount ? (valuation / principal - 1) * 100 : null;
  const historic = month !== currentMonth;
  return <>
    <div className="eyebrow">LET YOUR MONEY GROW</div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
      <div><h1>투자 포트폴리오<span className="text-forest">.</span></h1><p className="muted mt-2 text-sm">내 자산이 자라는 과정을 차근차근 살펴봐요.</p></div>
      <button className="button-primary" onClick={() => setEditing(null)}><Plus size={16}/>종목 추가</button>
    </div>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <label className="text-xs text-stone-500">조회 월 <input className="month-picker" aria-label="투자 조회 월" type="month" max={currentMonth} value={month} onChange={event => {if (isValidMonth(event.target.value) && event.target.value <= currentMonth) setMonth(event.target.value);}}/></label>
      <div className="flex items-center gap-2"><button className="text-button" onClick={() => setMonth(currentMonth)}>이번 달</button><button className="button-secondary disabled:opacity-50" disabled={loading || historic || !tracked.length} onClick={() => void refresh(true)}><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>{loading ? '조회 중' : '시세 새로고침'}</button></div>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-bold"><Coins size={18} className="text-forest"/>포트폴리오 요약</h2><label className="text-xs text-stone-500">합산 통화 <select aria-label="요약 통화" className="ml-2 rounded-md border border-stone-200 bg-white p-2 text-stone-700" value={currency} onChange={event => setCurrency(event.target.value as InvestmentCurrency)}><option value="KRW">KRW · 원화</option><option value="USD">USD · 미국 달러</option></select></label></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <article className="card !p-5"><p className="text-xs text-stone-500">총 매수 원금 · {currency}</p><p className="mt-4 break-all text-xl font-bold">{investmentMoney(principal, currency)}</p><p className="mt-2 text-xs text-stone-400">{selected.length}개 종목</p></article>
      <article className="card !p-5"><p className="text-xs text-stone-500">현재 총 평가금액 · {currency}</p><p className="mt-4 break-all text-xl font-bold">{investmentMoney(valuation, currency)}</p><p className="mt-2 text-xs text-stone-400">{pendingCount ? `${pendingCount}개 미조회 종목은 원금 기준` : historic ? '해당 월에 마지막으로 저장한 평가액' : '마지막으로 확인한 시세 기준'}</p></article>
      <article className="card !p-5"><p className="text-xs text-stone-500">총 누적 수익률 · {currency}</p><p className={`mt-4 text-xl font-bold ${profitColor(totalReturn)}`}>{percentLabel(totalReturn)}</p><p className="mt-2 text-xs text-stone-400">{pendingCount ? '모든 종목의 시세 확인 후 계산' : '원금 가중 수익률 · 환율 효과 제외'}</p></article>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-stone-500">원화와 달러는 통화별로 합산해요. 아래 종목 목록에는 모든 통화의 보유 종목이 표시됩니다.</p>
    <div role="status" aria-live="polite" className="mt-4 min-h-5 text-xs text-forest">{message}</div>
    {historic && <p className="mt-2 rounded-lg bg-stone-100 p-3 text-xs text-stone-500">과거 월의 저장 기록입니다. 오늘의 시세로 과거 기록을 변경하지 않아요.</p>}
    <section className="mt-5 space-y-4" aria-label="보유 투자 종목">
      {tracked.map(investment => {
        const rate = returnRate(investment);
        const change = previousMonthChange(investment, investments);
        const notUpdated = !historic && failed.includes(investment.ticker);
        return <article key={investment.invId} className="card">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="text-[10px] font-semibold tracking-wider text-stone-400">{investment.ticker} · {investment.currency}</span><h3 className="mt-1 break-words text-base font-bold">{investment.tickerName}</h3></div>{!historic && <button className="icon-button shrink-0" aria-label={`${investment.tickerName} 수정`} onClick={() => setEditing(investment)}><Pencil size={16}/></button>}</div>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <div><p className="text-[11px] text-stone-500">평균 매수 단가</p><p className="mt-1 break-all text-sm font-semibold">{investmentMoney(investment.purchasePrice, investment.currency)}</p></div>
            <div><p className="text-[11px] text-stone-500">현재가 · 정규장</p><p className="mt-1 break-all text-sm font-semibold">{investment.lastPrice ? investmentMoney(investment.lastPrice, investment.currency) : '시세 대기'}</p></div>
            <div><p className="text-[11px] text-stone-500">평가금액</p><p className="mt-1 break-all text-sm font-semibold">{investmentMoney(investment.currentValuation, investment.currency)}</p></div>
            <div><p className="text-[11px] text-stone-500">수익률</p><p className={`mt-1 text-sm font-bold ${profitColor(rate)}`}>{percentLabel(rate)}</p></div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-4 text-xs"><span className="text-stone-500">보유 {new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 8}).format(investment.quantity)}주</span><span className={`flex items-center gap-1 ${profitColor(change)}`}>전월 대비 {change === null ? '비교 기록 없음' : <>{percentLabel(change, '%p')} {change > 0 ? <ArrowUpRight aria-label="상승" size={14}/> : change < 0 ? <ArrowDownRight aria-label="하락" size={14}/> : null}</>}</span></div>
          <p className={`mt-3 text-[10px] leading-relaxed ${notUpdated || investment.valuationSource === 'principal' ? 'text-amber-700' : 'text-stone-400'}`}>
            {investment.valuationSource === 'principal' ? '시세 미확인 · 평가금액은 입력 원금으로 임시 표시합니다.' : `시세 기준 ${timestampLabel(investment.quoteTime)} · 조회 ${timestampLabel(investment.fetchedAt)}`}{notUpdated ? ' · 갱신 실패, 저장값 유지' : ''}
          </p>
        </article>;
      })}
      {!tracked.length && <div className="card py-10 text-center"><TrendingUp size={30} className="mx-auto text-forest"/><h3 className="mt-4 font-bold">{historic ? '이 달의 투자 기록이 없어요' : '나만의 포트폴리오를 시작해요'}</h3><p className="mt-2 text-sm text-stone-500">{historic ? '저장한 월만 조회할 수 있어요.' : '종목을 선택하고 원금과 보유 수량을 입력해 주세요.'}</p></div>}
    </section>
    {legacy.length > 0 && <section className="card mt-5"><h2 className="text-sm font-bold">기존 투자 기록</h2><p className="mt-2 text-xs text-stone-500">티커·통화·수량이 없는 이전 기록은 자동 조회 및 통화별 합산에서 제외했어요.</p>{legacy.map(item => <p key={item.invId} className="mt-3 text-sm">{item.tickerName} · 저장 평가금액 {item.currentValuation.toLocaleString('ko-KR')} (통화 미지정)</p>)}</section>}
    <p className="mt-6 text-[11px] leading-relaxed text-stone-400">Yahoo Finance 정규장 최신 제공 시세이며 지연될 수 있어요. 휴장일에는 마지막 거래 시세가 표시됩니다. 전월 대비는 직전 달에 마지막으로 저장한 수익률과의 차이(%p)예요.</p>
    {editing !== undefined && <InvestmentForm investment={editing} onClose={() => setEditing(undefined)} onSaved={(nextCurrency, notice, ticker, quoted) => {if (quoted) setFailed(items => items.filter(item => item !== ticker));setCurrency(nextCurrency);setMonth(todayDate().slice(0, 7));setEditing(undefined);setMessage(notice);}}/>}
  </>;
}
