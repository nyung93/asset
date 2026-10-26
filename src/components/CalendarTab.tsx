import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Camera, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { BudgetCode, Transaction } from '../types';
import { useAppStore } from '../store';
import { addDays, addMonths, dateLabel, isValidDate, monthDates, todayDate, weekDates } from '../lib/calendar';
import { signedAmount, summarize, transactionStyle, transactionTypes } from '../lib/finance';
import Dialog from './Dialog';
import ReceiptImportSheet from './ReceiptImportSheet';
import { resolveReceiptCode, type ParseResult } from '../utils/receiptParser';
import CharacterAvatar from './CharacterAvatar';
import { getCharacterMood } from '../lib/characterMood';

type View = 'monthly' | 'weekly' | 'daily';
const compactWon = new Intl.NumberFormat('ko-KR', {notation: 'compact', maximumFractionDigits: 1});
const views: {id: View; label: string}[] = [
  {id: 'monthly', label: '월간 Monthly'},
  {id: 'weekly', label: '주간 Weekly'},
  {id: 'daily', label: '일간 Daily'},
];

function DailyTotals({transactions}: {transactions: Transaction[]}) {
  const totals = summarize(transactions);
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
    {transactionTypes.map(type => <span key={type} className={transactionStyle[type].text}>
      {transactionStyle[type].label} {signedAmount(type, totals[type])}
    </span>)}
  </div>;
}

function TransactionList({transactions, codes, onDelete}: {
  transactions: Transaction[]; codes: BudgetCode[]; onDelete: (tx: Transaction) => void;
}) {
  if (!transactions.length) return <p className="py-6 text-sm text-stone-500">기록이 없어요. 오늘의 첫 기록을 남겨 보세요.</p>;
  return <ul className="mt-3 divide-y divide-stone-100">
    {transactions.map(tx => {
      const style = transactionStyle[tx.type];
      const category = codes.find(code => code.codeId === tx.codeId)?.categoryName ?? style.label;
      return <li key={tx.txId} className="flex items-center gap-2 py-4 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-1 text-[10px] font-semibold ${style.background} ${style.text}`}>{style.label}</span>
            <span className="text-xs font-semibold">{category}</span>
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">{tx.codeId}</span>
          </div>
          <p className="mt-2 break-words text-sm text-stone-500">{tx.memo || '메모 없음'}</p>
        </div>
        <span className={`shrink-0 text-right text-xs font-semibold tabular-nums sm:text-sm ${style.text}`}>{signedAmount(tx.type, tx.amount)}</span>
        <button className="icon-button shrink-0 hover:!text-rose-500" aria-label={`${tx.memo || category} ${signedAmount(tx.type, tx.amount)} 삭제`} onClick={() => onDelete(tx)}><Trash2 size={16}/></button>
      </li>;
    })}
  </ul>;
}

function TransactionForm({date, onClose, onSaved}: {
  date: string; onClose: () => void; onSaved: (date: string, rewarded: boolean) => void;
}) {
  const codes = useAppStore(s => s.budgetCodes);
  const save = useAppStore(s => s.saveTransactionWithDailyReward);
  const [type, setType] = useState<Transaction['type']>('EXPENSE');
  const [codeId, setCodeId] = useState(codes[0]?.codeId ?? '');
  const [error, setError] = useState('');
  const [txDate, setTxDate] = useState(date);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const submitted = useRef(false);
  function applyReceipt(data: NonNullable<ParseResult['data']>) {
    const mappedCode = resolveReceiptCode(data.recommendedCodeId, codes);
    setType('EXPENSE');setCodeId(mappedCode ?? '');
    if (data.txDate) setTxDate(data.txDate);
    if (data.amount !== undefined) setAmount(String(data.amount));
    if (data.memo) setMemo(data.memo);
    const missing = [!data.txDate && '날짜', !data.memo && '사용처', !mappedCode && '예산 코드'].filter(Boolean);
    setImportNotice(missing.length ? `확인된 내용을 채웠어요. ${missing.join(' · ')}는 직접 확인해 주세요. 읽지 못한 날짜와 메모는 기존 입력을 유지했어요.` : '결제 내용을 채웠어요. 날짜·금액·사용처·예산 코드를 확인한 후 저장해 주세요.');
    setError('');setReceiptOpen(false);
  }
  function changeType(next: Transaction['type']) {
    setType(next);
    setCodeId(next === 'EXPENSE' ? codes[0]?.codeId ?? '' : next);
    setError('');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.current) return;
    const data = new FormData(event.currentTarget);
    try {
      submitted.current = true;
      const tx: Transaction = {
        txId: crypto.randomUUID(), txDate: String(data.get('date')), type, codeId,
        amount: Number(data.get('amount')), memo: String(data.get('memo')).trim(),
      };
      const rewarded = save(tx);
      onSaved(tx.txDate, rewarded);
    } catch (error) {
      submitted.current = false;
      setError(error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해 주세요.');
    }
  }
  return <Dialog title="가계부 기록하기" onClose={onClose}>
    <p className="mt-2 text-xs text-stone-500">날짜별 첫 기록에 10 XP를 드려요.</p>
    <button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#dce3cf] bg-[#edf1e4] px-4 py-3 text-sm font-semibold text-forest" onClick={() => setReceiptOpen(true)}><Camera size={18}/>영수증 캡처로 입력하기</button>
    {importNotice && <p role="status" className="mt-3 rounded-lg bg-[#faf4e9] p-3 text-xs leading-relaxed text-stone-600">{importNotice}</p>}
    <form onSubmit={submit}>
      <label className="field-label" htmlFor="tx-date">날짜</label>
      <input autoFocus className="standalone-input" id="tx-date" name="date" type="date" required value={txDate} onChange={event => setTxDate(event.target.value)}/>
      <label className="field-label" htmlFor="tx-type">구분</label>
      <select className="standalone-input" id="tx-type" value={type} onChange={event => changeType(event.target.value as Transaction['type'])}>
        {transactionTypes.map(value => <option key={value} value={value}>{transactionStyle[value].label}</option>)}
      </select>
      <label className="field-label" htmlFor="tx-code">예산 코드</label>
      <select className="standalone-input" id="tx-code" required value={codeId} onChange={event => setCodeId(event.target.value)}>
        <option value="" disabled>예산 코드를 선택해 주세요</option>
        {type !== 'EXPENSE' && <option value={type}>{type} · 기본 {transactionStyle[type].label}</option>}
        {codes.map(code => <option key={code.codeId} value={code.codeId}>{code.codeId} · {code.categoryName}</option>)}
      </select>
      {type === 'EXPENSE' && !codes.length && <p className="mt-2 text-xs text-rose-500">목표 & 설정에서 예산 코드를 먼저 추가해 주세요.</p>}
      <label className="field-label" htmlFor="tx-amount">금액 (원)</label>
      <input className="standalone-input" id="tx-amount" name="amount" type="number" inputMode="numeric" required min="1" max={Number.MAX_SAFE_INTEGER} step="1" placeholder="0" value={amount} onChange={event => setAmount(event.target.value)}/>
      <label className="field-label" htmlFor="tx-memo">메모 <span className="font-normal text-stone-400">선택</span></label>
      <textarea className="standalone-input resize-y" id="tx-memo" name="memo" rows={2} maxLength={300} placeholder="어떤 기록인가요?" value={memo} onChange={event => setMemo(event.target.value)}/>
      <p role="alert" className="mt-3 text-sm text-rose-500">{error}</p>
      <div className="mt-5 flex gap-2">
        <button type="button" className="button-secondary flex-1" onClick={onClose}>취소</button>
        <button type="submit" disabled={type === 'EXPENSE' && !codes.length} className="button-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50">기록 저장</button>
      </div>
    </form>
    {receiptOpen && <ReceiptImportSheet onClose={() => setReceiptOpen(false)} onApply={applyReceipt}/>}
  </Dialog>;
}

export default function CalendarTab() {
  const appState = useAppStore();
  const transactions = useAppStore(s => s.transactions);
  const codes = useAppStore(s => s.budgetCodes);
  const remove = useAppStore(s => s.deleteTransaction);
  const [view, setView] = useState<View>('monthly');
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [formDate, setFormDate] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [toast, setToast] = useState<{text: string; id: number} | null>(null);
  const yearMonth = selectedDate.slice(0, 7);
  const mood = getCharacterMood(appState, todayDate());
  const dates = useMemo(() => monthDates(yearMonth), [yearMonth]);
  const week = useMemo(() => weekDates(selectedDate), [selectedDate]);
  const byDate = useMemo(() => {
    const grouped = new Map<string, Transaction[]>();
    for (const tx of transactions) grouped.set(tx.txDate, [...(grouped.get(tx.txDate) ?? []), tx]);
    return grouped;
  }, [transactions]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  function notify(text: string) { setToast({text, id: Date.now()}); }
  function move(direction: number) {
    setSelectedDate(date => view === 'monthly' ? addMonths(date, direction) : addDays(date, direction * (view === 'weekly' ? 7 : 1)));
  }
  const heading = view === 'monthly' ? `${Number(yearMonth.slice(0, 4))}년 ${Number(yearMonth.slice(5))}월`
    : view === 'weekly' ? `${week[0]} ~ ${week[6]}` : `${selectedDate.slice(0, 4)}년 ${dateLabel(selectedDate)}`;
  const selectedTransactions = byDate.get(selectedDate) ?? [];
  return <>
    <div className="eyebrow">ONE RECORD, ONE STEP CLOSER</div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><CharacterAvatar avatar={appState.character.avatar} expression={mood.expression} useDefaultArtwork={!appState.character.isCustomized} characterId={appState.character.selectedCharacterId} portrait className="h-14 w-14 shrink-0 rounded-full bg-[#f4ede0]"/><div><h1>캘린더<span className="text-forest">.</span></h1><p className="muted mt-2 text-sm">작은 기록이 모여, 든든한 내일이 돼요.</p></div></div>
      <button className="button-primary" onClick={() => setFormDate(selectedDate)}><Plus size={16}/>기록하기</button>
    </div>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-lg bg-stone-200/50 p-1" role="group" aria-label="캘린더 보기 방식">
        {views.map(item => <button key={item.id} aria-pressed={view === item.id} className={`rounded-md px-3 py-2 text-xs sm:px-4 ${view === item.id ? 'bg-white font-semibold text-forest shadow-sm' : 'text-stone-500'}`} onClick={() => setView(item.id)}>{item.label}</button>)}
      </div>
      <button className="button-secondary" onClick={() => setSelectedDate(todayDate())}>오늘</button>
    </div>
    <section className="card mt-4 !p-0" aria-label="가계부 캘린더">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <button className="icon-button" aria-label="이전 기간" onClick={() => move(-1)}><ChevronLeft size={18}/></button>
          <h2 className="text-sm font-bold sm:text-base">{heading}</h2>
          <button className="icon-button" aria-label="다음 기간" onClick={() => move(1)}><ChevronRight size={18}/></button>
        </div>
        <input aria-label="선택 날짜" className="rounded-md border border-stone-200 bg-transparent p-2 text-xs" type="date" value={selectedDate} onChange={event => {if (isValidDate(event.target.value)) setSelectedDate(event.target.value);}}/>
      </div>
      <div className="flex flex-wrap gap-4 px-5 py-3 text-[11px]">
        {transactionTypes.map(type => <span key={type} className={transactionStyle[type].text}>{transactionStyle[type].sign} {transactionStyle[type].label}</span>)}
        <span className="text-stone-400">단위: 원</span>
      </div>
      {view === 'monthly' && <div className="overflow-hidden rounded-b-xl" aria-label="월간 달력">
        <div className="grid grid-cols-7">
          {['일','월','화','수','목','금','토'].map((day, index) => <div key={day} className={`bg-stone-50 py-3 text-center text-xs ${index === 0 ? 'text-rose-500' : 'text-stone-500'}`}>{day}</div>)}
          {dates.map(date => {
            const totals = summarize(byDate.get(date) ?? []);
            const selected = date === selectedDate;
            return <button key={date} aria-label={`${date}, 수입 ${signedAmount('INCOME', totals.INCOME)}, 지출 ${signedAmount('EXPENSE', totals.EXPENSE)}, 저축 ${signedAmount('SAVING', totals.SAVING)}`} aria-pressed={selected}
              onClick={() => setSelectedDate(date)} className={`flex min-h-24 min-w-0 flex-col border-t border-r border-stone-100 p-1 text-left sm:min-h-28 sm:p-2 hover:bg-stone-50 ${selected ? 'bg-[#edf1e5] ring-1 ring-inset ring-forest' : date.startsWith(yearMonth) ? 'bg-white' : 'bg-stone-50 text-stone-400'}`}>
              <span className={`mb-3 flex h-6 w-6 items-center justify-center rounded-full text-xs ${date === todayDate() ? 'bg-forest font-bold text-white' : ''}`}>{Number(date.slice(8))}</span>
              <div className="mt-auto w-full space-y-0.5">
                {transactionTypes.map(type => <span key={type} title={signedAmount(type, totals[type])} className={`block truncate text-[10px] font-medium tabular-nums ${transactionStyle[type].text}`}><span className="hidden sm:inline">{signedAmount(type, totals[type])}</span><span className="sm:hidden">{transactionStyle[type].sign}{compactWon.format(totals[type])}</span></span>)}
              </div>
            </button>;
          })}
        </div>
      </div>}
      {view === 'weekly' && <div className="divide-y divide-stone-100">
        {week.map(date => <article key={date} className={`px-5 py-5 ${date === selectedDate ? 'bg-stone-50/70' : ''}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <button className="text-sm font-bold text-forest underline-offset-4 hover:underline" onClick={() => {setSelectedDate(date);setView('daily');}}>{dateLabel(date)} <span className="ml-1 text-xs font-normal text-stone-400">{date}</span></button>
            <button className="text-button" onClick={() => setFormDate(date)}><Plus size={14}/>기록</button>
          </div>
          <DailyTotals transactions={byDate.get(date) ?? []}/>
          <TransactionList transactions={byDate.get(date) ?? []} codes={codes} onDelete={setDeleting}/>
        </article>)}
      </div>}
      {view === 'daily' && <div className="px-5 pb-4"><DailyTotals transactions={selectedTransactions}/><TransactionList transactions={selectedTransactions} codes={codes} onDelete={setDeleting}/></div>}
    </section>
    {view === 'monthly' && <section className="card mt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-bold"><CalendarDays size={17}/>{dateLabel(selectedDate)}의 기록</h2><button className="text-button" onClick={() => setView('daily')}>일간 보기 <ChevronRight size={14}/></button></div>
      <DailyTotals transactions={selectedTransactions}/>
      <TransactionList transactions={selectedTransactions} codes={codes} onDelete={setDeleting}/>
    </section>}
    <p className="mt-4 text-xs text-stone-500">기록을 삭제해도 이미 받은 일일 XP는 유지되며, 같은 날짜에는 다시 지급되지 않아요.</p>
    <div role="status" aria-live="polite" aria-atomic="true">{toast && <div key={toast.id} className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl bg-[#34462d] px-5 py-4 text-sm text-white shadow-xl"><Sparkles size={20} className="shrink-0"/>{toast.text}</div>}</div>
    {formDate && <TransactionForm date={formDate} onClose={() => setFormDate(null)} onSaved={(date, rewarded) => {
      setSelectedDate(date); setFormDate(null);
      notify(rewarded ? '오늘의 가계부 기록 완료! +10 XP 획득!' : '가계부 기록을 저장했어요.');
    }}/>}
    {deleting && <Dialog title="이 기록을 삭제할까요?" onClose={() => setDeleting(null)}>
      <p className="mt-4 text-sm">{deleting.txDate} · <span className={transactionStyle[deleting.type].text}>{signedAmount(deleting.type, deleting.amount)}</span></p>
      <p className="mt-2 break-words text-sm text-stone-500">{deleting.memo || '메모 없음'}</p>
      <div className="mt-6 flex gap-2"><button className="button-secondary flex-1" onClick={() => setDeleting(null)}>취소</button><button className="button-primary flex-1" onClick={() => {remove(deleting.txId);setDeleting(null);notify('기록을 삭제했어요.');}}>삭제하기</button></div>
    </Dialog>}
  </>;
}
