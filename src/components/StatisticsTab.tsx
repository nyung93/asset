import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartNoAxesCombined, ChevronLeft, ChevronRight, LoaderCircle, Sparkles, Wallet } from 'lucide-react';
import { useAppStore } from '../store';
import { addMonths, isValidMonth, todayDate } from '../lib/calendar';
import { budgetUsage, formatWon, monthlyTransactions, signedAmount, summarize, transactionStyle, transactionTypes } from '../lib/finance';
import { generateMonthlyAdvice } from '../utils/aiAdvisor';
import CharacterAvatar from './CharacterAvatar';

export default function StatisticsTab() {
  const transactions = useAppStore(s => s.transactions);
  const codes = useAppStore(s => s.budgetCodes);
  const investments = useAppStore(s => s.investments);
  const avatar = useAppStore(s => s.character.avatar);
  const isCustomized = useAppStore(s => s.character.isCustomized);
  const characterId = useAppStore(s => s.character.selectedCharacterId);
  const [yearMonth, setYearMonth] = useState(() => todayDate().slice(0, 7));
  const [advice, setAdvice] = useState<{period: string; text: string} | null>(null);
  const [adviceError, setAdviceError] = useState('');
  const [adviceBusy, setAdviceBusy] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const monthly = useMemo(() => monthlyTransactions(transactions, yearMonth), [transactions, yearMonth]);
  const totals = useMemo(() => summarize(monthly), [monthly]);
  const usage = useMemo(() => budgetUsage(codes, monthly), [codes, monthly]);
  const maximum = Math.max(...Object.values(totals), 1);
  const totalBudget = codes.reduce((sum, code) => sum + code.monthlyLimit, 0);
  const exceededCount = usage.filter(code => code.exceeded).length;
  const unassigned = monthly.filter(tx => tx.type === 'EXPENSE' && !codes.some(code => code.codeId === tx.codeId)).reduce((sum, tx) => sum + tx.amount, 0);
  function move(direction: number) {
    setMonth(addMonths(`${yearMonth}-01`, direction).slice(0, 7));
  }
  function setMonth(month: string) {
    requestRef.current?.abort();requestRef.current = null;
    setAdvice(null);setAdviceError('');setAdviceBusy(false);setYearMonth(month);
  }
  async function listenToGrandma() {
    if (adviceBusy) return;
    const controller = new AbortController();requestRef.current = controller;
    setAdviceBusy(true);setAdviceError('');setAdvice(null);
    try {
      const result = await generateMonthlyAdvice({transactions, budgetCodes: codes, investments}, yearMonth, {signal: controller.signal});
      if (!controller.signal.aborted) setAdvice({period: yearMonth, text: result.text});
    } catch (error) {
      if (!controller.signal.aborted) setAdviceError(error instanceof Error ? error.message : '피드백을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      if (!controller.signal.aborted) setAdviceBusy(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }
  return <>
    <div className="eyebrow">A CLEARER PICTURE OF YOUR MONEY</div>
    <h1 className="mt-3">통계 리포트<span className="text-forest">.</span></h1>
    <p className="muted mt-2 text-sm">어디에 쓰고, 얼마나 모았는지 한눈에 살펴봐요.</p>
    <section className="card mt-6 !bg-[#f5f3e9]" aria-labelledby="grandma-advice-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><span className="eyebrow">A LITTLE LOVE, A LITTLE TRUTH</span><h2 id="grandma-advice-title" className="mt-2 font-bold">할미의 소비 피드백</h2></div>
        <button type="button" className="button-primary" onClick={listenToGrandma} disabled={adviceBusy}>
          {adviceBusy ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none"/> : <Sparkles size={16}/>}
          {adviceBusy ? '할미가 살펴보는 중' : yearMonth === todayDate().slice(0,7) ? '이번 달 할미의 잔소리 듣기' : `${Number(yearMonth.slice(5))}월 할미의 잔소리 듣기`}
        </button>
      </div>
      {adviceBusy && <p className="mt-4 rounded-xl bg-white/80 p-4 text-sm text-stone-600" role="status">할미가 이번 달 가계부를 꼼꼼히 살펴보고 있어요...</p>}
      {adviceError && <div className="mt-4 rounded-xl bg-[#fff8ee] p-4" role="alert"><p className="text-sm text-stone-600">{adviceError}</p><button type="button" className="text-button mt-3" onClick={listenToGrandma}><Sparkles size={14}/>다시 들어보기</button></div>}
      {advice?.period === yearMonth && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/80 bg-white/85 p-4 sm:gap-5 sm:p-5">
        <CharacterAvatar avatar={avatar} expression="stoic" useDefaultArtwork={!isCustomized} characterId={characterId} className="h-20 w-16 shrink-0 sm:h-24 sm:w-20"/>
        <div className="relative min-w-0 rounded-2xl bg-white p-4 text-sm leading-7 text-stone-700 shadow-sm before:absolute before:-left-2 before:top-6 before:border-y-[8px] before:border-r-[9px] before:border-y-transparent before:border-r-white">{advice.text}</div>
      </div>}
      <p className="mt-3 text-[11px] text-stone-500">개별 거래 내용은 전송하지 않고, {yearMonth}월 합계와 가장 큰 지출 항목, 확인된 투자 수익률만 전달해요.</p>
    </section>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-1">
        <button className="icon-button" aria-label="이전 달" onClick={() => move(-1)}><ChevronLeft size={18}/></button>
        <input type="month" aria-label="통계 기준 월" required className="min-w-0 bg-transparent p-1 text-sm font-semibold" value={yearMonth} onChange={event => {if (isValidMonth(event.target.value)) setMonth(event.target.value);}}/>
        <button className="icon-button" aria-label="다음 달" onClick={() => move(1)}><ChevronRight size={18}/></button>
      </div>
      <button className="button-secondary" onClick={() => setMonth(todayDate().slice(0, 7))}>이번 달</button>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      {transactionTypes.map(type => {
        const style = transactionStyle[type];
        return <article key={type} className="card !p-5">
          <span className={`rounded-md px-2 py-1 text-xs font-semibold ${style.background} ${style.text}`}>총{style.label}</span>
          <p className={`mt-4 break-all text-xl font-bold tabular-nums ${style.text}`}>{signedAmount(type, totals[type])}</p>
          <p className="mt-2 text-xs text-stone-400">{monthly.filter(tx => tx.type === type).length}건의 기록</p>
        </article>;
      })}
    </div>
    <section className="card mt-5" aria-labelledby="comparison-title">
      <h2 id="comparison-title" className="flex items-center gap-2 font-bold"><ChartNoAxesCombined size={19} className="text-forest"/>월간 자금 흐름</h2>
      <p className="mt-2 text-xs text-stone-500">{Number(yearMonth.slice(0, 4))}년 {Number(yearMonth.slice(5))}월 · 금액을 같은 비율로 비교해요.</p>
      <figure className="mt-7 space-y-6" aria-label={`${yearMonth} 수입, 지출, 저축 비교 막대그래프`}>
        {transactionTypes.map(type => {
          const style = transactionStyle[type];
          return <div key={type}>
            <div className="mb-2 flex justify-between gap-3 text-sm"><span className="font-medium">{style.label}</span><span className={`font-semibold tabular-nums ${style.text}`}>{signedAmount(type, totals[type])}</span></div>
            <div className="h-7 overflow-hidden rounded-md bg-stone-100" aria-hidden="true"><div className={`h-full rounded-md transition-[width] duration-300 motion-reduce:transition-none ${style.bar}`} style={{width: `${totals[type] / maximum * 100}%`}}/></div>
          </div>;
        })}
        <figcaption className="text-xs text-stone-400">단위: 원 · 저축은 지출과 별도로 집계해요.</figcaption>
      </figure>
      {!monthly.length && <p role="status" className="mt-5 rounded-lg bg-stone-50 p-4 text-sm text-stone-500">이 달에는 아직 기록이 없어요. 캘린더에서 첫 기록을 남겨 보세요.</p>}
    </section>
    <section className="mt-8" aria-labelledby="budget-title">
      <div className="section-title"><h2 id="budget-title" className="flex items-center gap-2"><Wallet size={19}/>예산 코드별 지출 현황</h2><span className={`text-xs ${exceededCount ? 'text-rose-500' : 'text-forest'}`}>{exceededCount ? `${exceededCount}개 예산 초과` : '나의 소비 페이스'}</span></div>
      <div className="card">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 pb-5">
          <div><p className="text-xs text-stone-500">이번 달 총지출 / 설정 예산</p><p className="mt-2 text-lg font-bold"><span className="text-rose-500">{formatWon(totals.EXPENSE)}</span><span className="text-sm font-normal text-stone-400"> / {formatWon(totalBudget)}원</span></p></div>
          <p className="text-xs text-stone-400">현재 설정된 월 한도 기준</p>
        </div>
        <div className="space-y-7">
          {usage.map(code => <article key={code.codeId}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{code.categoryName}<span className="ml-2 rounded bg-stone-100 px-1.5 py-1 text-[10px] font-normal text-stone-500">{code.codeId}</span></h3>
              <p className="text-xs"><span className={code.exceeded ? 'font-semibold text-rose-500' : 'font-semibold'}>{formatWon(code.spent)}원</span><span className="text-stone-400"> / {formatWon(code.monthlyLimit)}원</span></p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label={`${code.categoryName} 예산 사용률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={code.barPercent} aria-valuetext={`${formatWon(code.spent)}원 / ${formatWon(code.monthlyLimit)}원${code.exceeded ? ', 예산 초과' : ''}`}>
              <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${code.exceeded ? 'bg-rose-500' : 'bg-forest'}`} style={{width: `${code.barPercent}%`}}/>
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px]">
              <span className="text-stone-500">{code.percent === null ? '한도 0원' : `${new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 1}).format(code.percent)}% 사용`}</span>
              <span className={code.exceeded ? 'font-semibold text-rose-500' : 'text-stone-500'}>{code.exceeded ? `${formatWon(code.spent - code.monthlyLimit)}원 초과` : `${formatWon(code.monthlyLimit - code.spent)}원 남았어요`}</span>
            </div>
          </article>)}
          {!codes.length && <p className="py-3 text-sm text-stone-500">목표 & 설정에서 예산 코드를 추가하면 사용률을 확인할 수 있어요.</p>}
          {unassigned > 0 && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-500">등록된 코드가 없는 지출 {formatWon(unassigned)}원도 총지출에 포함되어 있어요.</p>}
        </div>
      </div>
    </section>
  </>;
}
