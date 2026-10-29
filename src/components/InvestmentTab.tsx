import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Info, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import stockData from '../data/stocks.json';
import type { InvestmentMonthly, MarketQuote, Stock } from '../types';
import { useAppStore } from '../store';
import { addMonths, isValidMonth, todayDate } from '../lib/calendar';
import { investmentMoney, isTracked, percentLabel, previousMonthChange, profitColor, returnRate, summarizeCurrency, summarizePortfolio } from '../lib/investments';
import { fetchCurrentPrice } from '../utils/financeApi';
import {codeKind} from '../lib/categoryCodes';
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
  const investmentCodes = useAppStore(s => s.budgetCodes).filter(code => codeKind(code) === 'INVESTMENT');
  const [categoryId, setCategoryId] = useState(investment?.codeId ?? '');
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
        codeId: categoryId || undefined,
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
      <label className="field-label" htmlFor="invest-category">투자 카테고리</label>
      <select id="invest-category" className="standalone-input" value={categoryId} disabled={busy} onChange={event => setCategoryId(event.target.value)}><option value="">미지정</option>{investmentCodes.map(code => <option key={code.codeId} value={code.codeId}>{code.categoryName}</option>)}</select>
      <p className="mt-3 text-xs text-slate-500">평균 매수 단가: {stock && Number.isFinite(average) && average > 0 ? investmentMoney(average, stock.currency) : '—'}</p>
      <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">미국 종목의 원금은 달러로 입력해 주세요. 원금과 수량으로 평균 매수 단가를 계산하며, 배당·세금·환율 변동은 수익률에 포함하지 않아요.</p>
      <p role="alert" className="mt-3 text-sm text-rose-500">{error}</p>
      <p role="status" className="mt-2 text-xs text-forest">{busy ? 'Yahoo Finance 시세를 조회하고 있어요…' : ''}</p>
      <div className="mt-5 flex gap-2"><button type="button" className="button-secondary flex-1" onClick={onClose}>취소</button><button type="submit" disabled={busy} className="button-primary flex-1 disabled:opacity-50">{busy ? <RefreshCw size={16} className="animate-spin"/> : <Plus size={16}/>}저장하기</button></div>
    </form>
  </Dialog>;
}

const quantityLabel = (value: number) => new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 8}).format(value);
const PAGE_SIZE = 10;

function HoldingsTable({records, currency, onDetails}: {
  records: InvestmentMonthly[]; currency: 'KRW' | 'USD'; onDetails: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({overflow: false, start: true, end: true, progress: 0, thumb: 1});
  const measure = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
    setScroll({overflow: maximum > 2, start: element.scrollLeft <= 2, end: element.scrollLeft >= maximum - 2,
      progress: maximum ? element.scrollLeft / maximum : 0, thumb: element.scrollWidth ? element.clientWidth / element.scrollWidth : 1});
  }, []);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const table = element.querySelector('table');
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [records.length, measure]);
  const move = (direction: -1 | 1) => {
    const element = scrollRef.current;
    if (element) element.scrollBy({left: direction * Math.max(220, element.clientWidth * .75), behavior: 'smooth'});
  };
  return <div className="mt-3 min-w-0 overflow-hidden rounded-lg border border-[#dce7ee] bg-white">
    <div ref={scrollRef} tabIndex={0} onScroll={measure} role="region" aria-label={`${currency === 'KRW' ? '국내' : '해외'} 보유 종목 표 가로 스크롤`} className="portfolio-scroll overflow-x-auto overscroll-x-contain">
      <table className="portfolio-table">
        <thead><tr><th scope="col">종목</th><th scope="col">평가금액</th><th scope="col">수량</th><th scope="col">원금</th><th scope="col">단가</th><th scope="col">수익률</th></tr></thead>
        <tbody>{records.map(item => {
          const rate = returnRate(item);
          const status = item.valuationSource === 'principal' ? '시세 미확인' : undefined;
          return <tr key={item.invId}>
            <th scope="row"><button type="button" className="portfolio-name" onClick={() => onDetails(item.invId)} aria-label={`${item.tickerName} 상세 보기`}><span className="portfolio-name-text" title={item.tickerName}>{item.tickerName}</span><span className="block text-[11px] font-normal text-[#8a9ba6]">{item.ticker}</span></button></th>
            <td title={investmentMoney(item.currentValuation, currency)} className="font-semibold">{investmentMoney(item.currentValuation, currency)}{status && <span className="block text-[10px] font-normal text-amber-700">{status}</span>}</td>
            <td title={`${quantityLabel(item.quantity!)}주`}>{quantityLabel(item.quantity!)}주</td>
            <td title={investmentMoney(item.investedPrincipal, currency)}>{investmentMoney(item.investedPrincipal, currency)}</td>
            <td title={investmentMoney(item.purchasePrice!, currency)}>{investmentMoney(item.purchasePrice!, currency)}</td>
            <td className={`font-semibold ${profitColor(rate)}`}>{percentLabel(rate)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {scroll.overflow && <div className="flex items-center gap-3 border-t border-[#eaf4fb] px-3 py-1.5 text-[11px] text-[#647784]">
      <span className="shrink-0">좌우로 밀어 확인하세요</span>
      <div aria-hidden="true" className="portfolio-scroll-track"><span className="portfolio-scroll-thumb" style={{width: `${Math.max(14, scroll.thumb * 100)}%`, left: `${scroll.progress * (100 - Math.max(14, scroll.thumb * 100))}%`}}/></div>
      <div className="flex gap-1"><button type="button" aria-label="표 왼쪽으로 이동" disabled={scroll.start} onClick={() => move(-1)} className="portfolio-scroll-button"><ArrowLeft size={16}/></button><button type="button" aria-label="표 오른쪽으로 이동" disabled={scroll.end} onClick={() => move(1)} className="portfolio-scroll-button"><ArrowRight size={16}/></button></div>
    </div>}
  </div>;
}

function HoldingDetails({investment, investments, notUpdated, historic, onClose, onEdit}: {
  investment: InvestmentMonthly; investments: InvestmentMonthly[]; notUpdated: boolean; historic: boolean; onClose: () => void; onEdit: () => void;
}) {
  const currency = investment.currency!;
  const category = useAppStore(s => s.budgetCodes).find(code => code.codeId === investment.codeId)?.categoryName;
  const change = previousMonthChange(investment, investments);
  return <Dialog title="종목 상세" onClose={onClose} className="portfolio-detail-dialog">
    <div className="mt-3"><h3 className="text-base font-bold">{investment.tickerName}</h3><p className="mt-1 text-xs text-[#647784]">{investment.ticker} · {currency}{category ? ` · ${category}` : ''}</p></div>
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#eaf4fb] py-4 text-sm">
      <div><dt className="text-xs text-[#8a9ba6]">평가금액</dt><dd className="mt-1 font-semibold">{investmentMoney(investment.currentValuation,currency)}</dd></div>
      <div><dt className="text-xs text-[#8a9ba6]">수익률</dt><dd className={`mt-1 font-semibold ${profitColor(returnRate(investment))}`}>{percentLabel(returnRate(investment))}</dd></div>
      <div><dt className="text-xs text-[#8a9ba6]">매수 원금</dt><dd className="mt-1 font-semibold">{investmentMoney(investment.investedPrincipal,currency)}</dd></div>
      <div><dt className="text-xs text-[#8a9ba6]">수량</dt><dd className="mt-1 font-semibold">{quantityLabel(investment.quantity!)}주</dd></div>
      <div><dt className="text-xs text-[#8a9ba6]">평균 매수 단가</dt><dd className="mt-1 font-semibold">{investmentMoney(investment.purchasePrice!,currency)}</dd></div>
      <div><dt className="text-xs text-[#8a9ba6]">현재가</dt><dd className="mt-1 font-semibold">{investment.lastPrice ? investmentMoney(investment.lastPrice,currency) : '시세 대기'}</dd></div>
      <div><dt className="text-xs text-[#8a9ba6]">전월 대비</dt><dd className={`mt-1 font-semibold ${profitColor(change)}`}>{percentLabel(change,'%p')}</dd></div>
    </dl>
    <div className="mt-4 space-y-1 text-xs leading-5 text-[#647784]"><p>시세 기준 {timestampLabel(investment.quoteTime)}</p><p>마지막 조회 {timestampLabel(investment.fetchedAt)}</p>
      {investment.valuationSource === 'principal' && <p className="text-amber-700">시세를 확인하지 못해 입력 원금을 평가금액으로 임시 표시합니다.</p>}
      {notUpdated && <p className="text-amber-700">시세 갱신에 실패해 저장된 평가금액을 유지했습니다.</p>}
    </div>
    {!historic && <button type="button" className="button-primary mt-5 w-full" onClick={onEdit}><Pencil size={15}/>종목 수정</button>}
  </Dialog>;
}

export default function InvestmentTab() {
  const investments = useAppStore(s => s.investments);
  const currentMonth = todayDate().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [editing, setEditing] = useState<InvestmentMonthly | null | undefined>(undefined);
  const [market, setMarket] = useState<'KRW' | 'USD'>(() => {
    const records = useAppStore.getState().investments.filter(i => isTracked(i) && i.yearMonth <= currentMonth);
    if (records.some(i => i.yearMonth === currentMonth && i.currency === 'KRW')) return 'KRW';
    if (records.some(i => i.yearMonth === currentMonth && i.currency === 'USD')) return 'USD';
    return records.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))[0]?.currency === 'USD' ? 'USD' : 'KRW';
  });
  const [page, setPage] = useState(0);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxQuote, setFxQuote] = useState<MarketQuote | null>(null);
  const [fxError, setFxError] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => {
    if (!message || message.includes('실패') || message.includes('유지')) return;
    const timer = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [message]);
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
    let quote = await fetchCurrentPrice('KRW=X', {includeMetadata: true, force});
    if (!quote && fxRun.current === id) {
      // A single cold-start or upstream failure should recover without user action.
      await new Promise(resolve => setTimeout(resolve, 700));
      if (fxRun.current !== id) return;
      quote = await fetchCurrentPrice('KRW=X', {includeMetadata: true, force: true});
    }
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
  const selectedRecords = market === 'KRW' ? domestic : overseas;
  const selectedTotals = summarizeCurrency(selectedRecords);
  const pageCount = Math.max(1, Math.ceil(selectedRecords.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleRecords = selectedRecords.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE);
  const details = tracked.find(item => item.invId === detailsId);
  const previous = investments.filter(i => i.yearMonth === previousMonth && isTracked(i));
  const currentTotals = summarizePortfolio(tracked, fxQuote?.price ?? null);
  const priorTotals = summarizePortfolio(previous, fxQuote?.price ?? null);
  const costChange = previous.length && currentTotals.principal !== null && priorTotals.principal !== null ? currentTotals.principal - priorTotals.principal : null;
  const valueChange = previous.length && currentTotals.valuation !== null && priorTotals.valuation !== null ? currentTotals.valuation - priorTotals.valuation : null;
  const rateChange = currentTotals.returnRate !== null && priorTotals.returnRate !== null ? currentTotals.returnRate - priorTotals.returnRate : null;
  const historic = month !== currentMonth;
  const moneyOrDash = (amount: number | null) => amount === null ? '—' : investmentMoney(amount, 'KRW');
  const deltaLabel = (amount: number | null, unit: '%' | '%p' = '%') => amount === null ? '비교 기록 없음' : unit === '%p' ? percentLabel(amount, '%p') : `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${investmentMoney(Math.abs(amount), 'KRW')}`;
  const selectMarket = (next: 'KRW' | 'USD') => {setMarket(next);setPage(0);setDetailsId(null);};
  const selectMonth = (next: string) => {setMonth(next);setPage(0);setDetailsId(null);};
  return <>
    <div className="eyebrow">포트폴리오</div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <h1>투자 포트폴리오</h1>
      <button type="button" className="button-primary" onClick={() => setEditing(null)}><Plus size={16}/>종목 추가</button>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><label className="text-xs text-[#647784]">조회 월 <input className="month-picker" aria-label="투자 조회 월" type="month" max={currentMonth} value={month} onChange={event => {if (isValidMonth(event.target.value) && event.target.value <= currentMonth) selectMonth(event.target.value);}}/></label><button type="button" className="text-button" onClick={() => selectMonth(currentMonth)}>이번 달</button></div>
      <div className="flex items-center gap-2"><button type="button" className="button-secondary disabled:opacity-50" disabled={loading || fxLoading || historic || !tracked.length} onClick={() => {void refresh(true);void refreshFx(true);}}><RefreshCw size={15} className={loading || fxLoading ? 'animate-spin' : ''}/>{loading || fxLoading ? '조회 중' : '시세 새로고침'}</button><button type="button" className="text-button !text-xs" onClick={() => setShowHelp(true)}><Info size={15}/>계산 기준</button></div>
    </div>
    <div className="mt-5 flex items-center justify-between gap-3"><h2 className="text-sm font-bold">전체 자산 · 원화</h2><button type="button" className="text-button !text-xs" onClick={() => setShowSummary(true)}>전월 상세</button></div>
    <section aria-label="전체 자산 요약" className="portfolio-summary mt-2">
      <article className="portfolio-summary-cost"><p className="portfolio-summary-label">총 매수 원금</p><p className="portfolio-summary-number">{moneyOrDash(currentTotals.principal)}</p><p className="portfolio-summary-delta">전월 대비 {deltaLabel(costChange)}</p></article>
      <article className="portfolio-summary-value"><p className="portfolio-summary-label">현재 총 평가금액</p><p className="portfolio-summary-number">{moneyOrDash(currentTotals.valuation)}</p><p className="portfolio-summary-delta">전월 대비 {deltaLabel(valueChange)}</p></article>
      <article className="portfolio-summary-rate"><p className="portfolio-summary-label">총 누적 수익률</p><p className={`portfolio-summary-number ${profitColor(currentTotals.returnRate)}`}>{percentLabel(currentTotals.returnRate)}</p><p className={`portfolio-summary-delta ${profitColor(rateChange)}`}>전월 대비 {deltaLabel(rateChange, '%p')}</p></article>
    </section>
    <div className="mt-2 text-xs leading-5 text-[#647784]" role="status" aria-live="polite">
      {needsFx && (fxQuote ? <>적용 환율 1 USD = {investmentMoney(fxQuote.price, 'KRW')} · {timestampLabel(fxQuote.marketTime)}{fxError ? ' · 마지막 확인 환율 사용' : ''}</> : fxLoading ? 'USD/KRW 환율을 조회하고 있어요…' : '환율을 조회하지 못해 원화 합계를 표시할 수 없어요.')}
      {needsFx && fxError && !fxLoading && <button type="button" className="ml-2 font-semibold text-[#176897] underline" onClick={() => void refreshFx(true)}>환율 다시 조회</button>}
      {currentTotals.unpriced > 0 && <p className="text-amber-700">시세 미확인 {currentTotals.unpriced}개 종목은 원금으로 임시 표시하고 총 수익률에서 제외해요.</p>}
      {historic && <p>과거 월의 저장 기록입니다.</p>}
    </div>
    {message && <p role="status" aria-live="polite" className="mt-2 text-xs text-[#526b7b]">{message}</p>}
    <section className="mt-6 min-w-0" aria-label="보유 투자 종목">
      <div role="tablist" aria-label="투자 시장" className="flex gap-5 border-b border-[#dce7ee]">
        {(['KRW','USD'] as const).map(currency => <button key={currency} type="button" role="tab" id={`portfolio-tab-${currency}`} aria-selected={market === currency} aria-controls="portfolio-market-panel" onClick={() => selectMarket(currency)} className={`border-b-2 px-1 pb-2.5 text-sm font-semibold ${market === currency ? 'border-[#176897] text-[#176897]' : 'border-transparent text-[#8a9ba6]'}`}>{currency === 'KRW' ? '국내 주식' : '해외 주식'} <span className="font-normal">{currency === 'KRW' ? domestic.length : overseas.length}</span></button>)}
      </div>
      <div id="portfolio-market-panel" role="tabpanel" aria-labelledby={`portfolio-tab-${market}`} className="min-w-0 pt-3">
        {selectedRecords.length > 0 ? <>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#526b7b]"><span>매수 <strong className="text-[#27343e]">{investmentMoney(selectedTotals.principal!, market)}</strong></span><span>평가 <strong className="text-[#27343e]">{investmentMoney(selectedTotals.valuation!, market)}</strong></span><span>수익률 <strong className={profitColor(selectedTotals.returnRate)}>{percentLabel(selectedTotals.returnRate)}</strong></span></div>
          <HoldingsTable key={`${month}-${market}-${visiblePage}`} records={visibleRecords} currency={market} onDetails={setDetailsId}/>
          {pageCount > 1 && <nav aria-label="종목 페이지" className="mt-3 flex items-center justify-center gap-3 text-xs text-[#647784]"><button type="button" className="button-secondary !min-h-9 !px-3" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>이전</button><span>{visiblePage + 1} / {pageCount}</span><button type="button" className="button-secondary !min-h-9 !px-3" disabled={visiblePage === pageCount - 1} onClick={() => setPage(visiblePage + 1)}>다음</button></nav>}
        </> : <div className="rounded-lg border border-dashed border-[#dce7ee] px-4 py-6 text-center text-sm text-[#647784]"><p>이 달의 {market === 'KRW' ? '국내' : '해외'} 보유 종목이 없어요.</p>{!historic && <button type="button" className="text-button mx-auto mt-3 !text-sm" onClick={() => setEditing(null)}><Plus size={15}/>첫 종목 추가하기</button>}</div>}
      </div>
    </section>
    {legacy.length > 0 && <details className="mt-5 rounded-lg border border-[#eaf4fb] px-4 py-3 text-xs text-[#647784]"><summary className="cursor-pointer font-semibold">기존 투자 기록 {legacy.length}개</summary><p className="mt-2">티커·통화·수량이 없는 기록은 자동 조회와 통화별 합산에서 제외해요.</p>{legacy.map(item => <p key={item.invId} className="mt-2">{item.tickerName} · 저장 평가금액 {item.currentValuation.toLocaleString('ko-KR')} (통화 미지정)</p>)}</details>}
    {showHelp && <Dialog title="계산 기준" onClose={() => setShowHelp(false)} className="portfolio-detail-dialog"><div className="mt-4 space-y-4 text-sm leading-6 text-[#526b7b]">
      <p>전체 자산은 국내 종목의 원화 금액과 해외 종목의 달러 금액을 같은 USD/KRW 환율로 환산해 더해요. 환율은 <a className="text-[#176897] underline" href="https://finance.yahoo.com/quote/KRW%3DX/" target="_blank" rel="noopener noreferrer">Yahoo Finance USD/KRW</a>의 지연 시세일 수 있어요.</p>
      <p>누적 수익률은 평가금액 합계 ÷ 매수 원금 합계 − 1로 계산해요. 시세를 확인하지 못한 종목이 있으면 해당 합계의 수익률을 표시하지 않아요.</p>
      <p>전월 금액은 두 달 모두 현재 적용 환율로 환산한 저장값의 차이예요. 종목 추가·수정도 금액 차이에 포함돼요. 수익률 변화는 퍼센트포인트(%p)로 표시해요.</p>
      <p>배당·세금·매수 당시 환율과 환차손익은 수익률에 반영하지 않아요. 휴장일에는 마지막 거래 시세가 표시될 수 있어요.</p>
    </div></Dialog>}
    {showSummary && <Dialog title="전월 비교 상세" onClose={() => setShowSummary(false)} className="portfolio-detail-dialog"><dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-xs text-[#8a9ba6]">이번 달 매수 원금</dt><dd className="mt-1 font-semibold">{moneyOrDash(currentTotals.principal)}</dd></div><div><dt className="text-xs text-[#8a9ba6]">전월 매수 원금</dt><dd className="mt-1 font-semibold">{previous.length ? moneyOrDash(priorTotals.principal) : '기록 없음'}</dd></div>
      <div><dt className="text-xs text-[#8a9ba6]">이번 달 평가금액</dt><dd className="mt-1 font-semibold">{moneyOrDash(currentTotals.valuation)}</dd></div><div><dt className="text-xs text-[#8a9ba6]">전월 평가금액</dt><dd className="mt-1 font-semibold">{previous.length ? moneyOrDash(priorTotals.valuation) : '기록 없음'}</dd></div>
      <div><dt className="text-xs text-[#8a9ba6]">이번 달 수익률</dt><dd className={`mt-1 font-semibold ${profitColor(currentTotals.returnRate)}`}>{percentLabel(currentTotals.returnRate)}</dd></div><div><dt className="text-xs text-[#8a9ba6]">전월 수익률</dt><dd className="mt-1 font-semibold">{previous.length ? percentLabel(priorTotals.returnRate) : '기록 없음'}</dd></div>
    </dl><p className="mt-4 text-xs leading-5 text-[#647784]">종목 추가·수정은 금액 차이에 포함돼요. 두 달의 달러 금액은 같은 환율로 비교합니다.</p></Dialog>}
    {details && <HoldingDetails investment={details} investments={investments} notUpdated={!historic && failed.includes(details.ticker!)} historic={historic} onClose={() => setDetailsId(null)} onEdit={() => {setDetailsId(null);setEditing(details);}}/>}
    {editing !== undefined && <InvestmentForm investment={editing} onClose={() => setEditing(undefined)} onSaved={(notice, ticker, quoted) => {if (quoted) setFailed(items => items.filter(item => item !== ticker));selectMonth(todayDate().slice(0, 7));const currency = stocks.find(item => item.ticker === ticker)?.currency;if (currency) selectMarket(currency);setEditing(undefined);setMessage(notice);}}/>}
  </>;
}
