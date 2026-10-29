import {useState, type FormEvent} from 'react';
import {Check, Download, Settings2} from 'lucide-react';
import {useAppStore} from '../store';
import {codeKind} from '../lib/categoryCodes';
import type {Goal} from '../types';
import {downloadTransactionsCsv} from '../utils/exportCsv';
import RecurringExpensesSection from './RecurringExpensesSection';
import CategoryManagerDialog from './CategoryManagerDialog';

export const won = (value:number) => new Intl.NumberFormat('ko-KR').format(value);

function GoalForm({year,month}:{year:number;month:number}) {
  const goal = useAppStore(s => s.goals.find(item => item.year===year && item.month===month));
  const saveGoal = useAppStore(s => s.saveGoal);
  const [saving,setSaving] = useState(goal ? String(goal.targetSavingAmount) : '');
  const [rate,setRate] = useState(goal ? String(goal.targetInvestReturnRate) : '');
  const [message,setMessage] = useState('');
  const [error,setError] = useState(false);
  const annual = month===0;
  function submit(event:FormEvent) {
    event.preventDefault();
    try {
      if (!saving.trim() || !rate.trim()) throw new Error('두 목표를 모두 입력해 주세요.');
      const data:Goal = {year,month,targetSavingAmount:Number(saving),targetInvestReturnRate:Number(rate)};
      saveGoal(data);setError(false);setMessage('목표가 저장되었어요.');
    } catch(cause) {setError(true);setMessage(cause instanceof Error ? cause.message : '목표를 저장하지 못했어요.');}
  }
  return <form onSubmit={submit} className="card goal-card">
    <div className="tag">{annual ? `${year}년 연간 목표` : `${month}월 목표`}</div>
    <h3 className="mt-3 text-lg font-bold">{annual?'올해의 목표':'이번 달 목표'}</h3>
    <p className="muted mt-1 text-sm">저축액과 투자 수익률을 설정해요.</p>
    <label className="field-label" htmlFor={`saving-${month}`}>목표 저축액</label>
    <div className="input-wrap"><input required id={`saving-${month}`} type="number" min="0" step="1" placeholder="0" value={saving} onChange={event=>{setSaving(event.target.value);setMessage('');}}/><span>원</span></div>
    <label className="field-label" htmlFor={`return-${month}`}>목표 투자 수익률</label>
    <div className="input-wrap"><input required id={`return-${month}`} type="number" min="-100" step="any" placeholder="0" value={rate} onChange={event=>{setRate(event.target.value);setMessage('');}}/><span>%</span></div>
    <button className={`mt-6 w-full ${annual?'button-primary':'button-secondary'}`} type="submit"><Check size={16}/>{annual?'연간 목표 저장':'월간 목표 저장'}</button>
    <p className={`mt-2 min-h-5 text-xs ${error?'text-rose-600':'text-[#176897]'}`} role="status">{message || (goal?'저장된 목표를 불러왔어요.':'나에게 맞는 목표를 정해 보세요.')}</p>
  </form>;
}

export default function GoalsAndSettingsTab() {
  const codes = useAppStore(s => s.budgetCodes);
  const transactions = useAppStore(s => s.transactions);
  const [managerOpen,setManagerOpen] = useState(false);
  const [notice,setNotice] = useState('');
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth()+1;
  const [period,setPeriod] = useState(`${year}-${String(month).padStart(2,'0')}`);
  const [selectedYear,selectedMonth] = period.split('-').map(Number);
  const expenseCodes = codes.filter(code => codeKind(code)==='EXPENSE');
  const totalBudget = expenseCodes.reduce((sum,code)=>sum+code.monthlyLimit,0);
  function downloadBackup() {
    try {
      downloadTransactionsCsv(transactions,codes);
      setNotice(transactions.length ? `가계부 ${transactions.length}건을 CSV로 백업했어요.` : '거래 내역은 없지만 백업용 CSV 파일을 내려받았어요.');
    } catch {setNotice('CSV 파일을 만들지 못했어요. 브라우저 다운로드 설정을 확인해 주세요.');}
  }
  return <>
    <div className="eyebrow">계획</div>
    <div className="heading-row"><div><h1>목표 & 설정</h1><p className="muted mt-2">내 목표와 월 예산을 관리해요.</p></div><span className="date-pill">{year}년 {month}월</span></div>
    <section className="mt-10"><div className="section-title"><h2>나의 자산 목표</h2><label className="muted text-xs">조회 월 <input aria-label="목표 및 정기 지출 조회 월" className="month-picker" type="month" min="1900-01" max="9999-12" required value={period} onChange={event=>{if(event.target.value)setPeriod(event.target.value);}}/></label></div>
      <div className="grid gap-5 md:grid-cols-2"><GoalForm key={`${selectedYear}-annual`} year={selectedYear} month={0}/><GoalForm key={period} year={selectedYear} month={selectedMonth}/></div>
    </section>
    <RecurringExpensesSection period={period}/>
    <section className="mt-9" aria-labelledby="budget-title"><div className="section-title"><h2 id="budget-title">월 지출 예산</h2></div>
      <div className="card flex flex-wrap items-center justify-between gap-4"><div><p className="muted text-xs">매월 계획한 총 예산</p><p className="mt-1 text-2xl font-bold tabular-nums">{won(totalBudget)}<span className="ml-1 text-sm font-normal">원</span></p><p className="muted mt-1 text-xs">지출 카테고리 {expenseCodes.length}개 · 수입·저축·투자 카테고리도 관리할 수 있어요.</p></div>
        <button type="button" className="button-secondary shrink-0" onClick={()=>setManagerOpen(true)}><Settings2 size={16}/>카테고리 관리</button>
      </div>
    </section>
    <section className="mt-9" aria-labelledby="backup-title"><div className="section-title"><h2 id="backup-title">소중한 기록 보관</h2></div><div className="card flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><h3 className="text-sm font-semibold">가계부 CSV 백업</h3><p className="muted mt-1 text-xs">거래 {transactions.length}건을 날짜순으로 내려받아요.</p><p className="mt-2 text-xs leading-relaxed text-slate-400">날짜, 구분, 카테고리, 금액, 메모가 포함돼요.</p></div><button type="button" className="button-secondary shrink-0" onClick={downloadBackup}><Download size={16}/>가계부 데이터 백업하기 (CSV)</button></div></section>
    <p role="status" className="mt-3 text-sm text-[#176897]">{notice}</p>
    {managerOpen && <CategoryManagerDialog onClose={()=>setManagerOpen(false)}/>}
  </>;
}
