import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Check, Download, Pencil, Plus, Trash2, Target, Wallet, Sprout, X, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../store';
import type { BudgetCode, Goal } from '../types';
import { downloadTransactionsCsv } from '../utils/exportCsv';
function Modal({title, onClose, children}: {title:string; onClose:()=>void; children:ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {const dialog = ref.current!; dialog.showModal(); return () => dialog.close();}, []);
  return <dialog ref={ref} aria-labelledby={title} onCancel={onClose} className="modal">{children}</dialog>;
}
export const won = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
function GoalForm({year, month}: {year:number; month:number}) {
  const goal = useAppStore(s => s.goals.find(g => g.year === year && g.month === month));
  const saveGoal = useAppStore(s => s.saveGoal);
  const [saving, setSaving] = useState(goal ? String(goal.targetSavingAmount) : '');
  const [rate, setRate] = useState(goal ? String(goal.targetInvestReturnRate) : '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const annual = month === 0;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!saving.trim() || !rate.trim()) throw new Error('두 목표를 모두 입력해 주세요.');
      const data: Goal = {year,month,targetSavingAmount:Number(saving),targetInvestReturnRate:Number(rate)};
      saveGoal(data); setError(false); setMessage('목표가 저장되었어요. 한 걸음씩 함께해요!');
    } catch(e) {setError(true);setMessage((e as Error).message);}
  }
  return <form onSubmit={submit} className="card goal-card">
    <div className="flex items-center justify-between"><span className={`icon-box ${annual ? 'green' : 'peach'}`}>{annual ? <Target size={21}/> : <Sprout size={21}/>}</span><span className="tag">{annual ? `${year} YEARLY` : `${String(month).padStart(2,'0')} MONTHLY`}</span></div>
    <h3 className="mt-5 text-lg font-bold">{annual ? '올해의 큰 그림' : '이번 달의 작은 실천'}</h3><p className="muted mt-1 text-sm">{annual ? '미래의 나에게 선물할 든든한 목표' : '차곡차곡 쌓이면 큰 변화가 될 거예요'}</p>
    <label className="field-label" htmlFor={`saving-${month}`}>목표 저축액</label><div className="input-wrap"><input required id={`saving-${month}`} type="number" min="0" step="1" placeholder="0" value={saving} onChange={e => {setSaving(e.target.value);setMessage('');}}/><span>원</span></div>
    <label className="field-label" htmlFor={`return-${month}`}>목표 투자 수익률</label><div className="input-wrap"><input required id={`return-${month}`} type="number" min="-100" step="any" placeholder="0" value={rate} onChange={e => {setRate(e.target.value);setMessage('');}}/><span>%</span></div>
    <button className={`mt-6 w-full ${annual ? 'button-primary' : 'button-secondary'}`} type="submit"><Check size={16}/>{annual ? '연간 목표 저장' : '월간 목표 저장'}</button>
    <p className={`mt-2 min-h-5 text-xs ${error ? 'text-red-700' : 'text-forest'}`} role="status">{message || (goal ? '저장된 목표를 불러왔어요.' : '나에게 맞는 목표를 정해 보세요.')}</p>
  </form>;
}
export default function GoalsAndSettingsTab() {
  const codes = useAppStore(s => s.budgetCodes);
  const transactions = useAppStore(s => s.transactions);
  const save = useAppStore(s => s.saveBudgetCode);
  const remove = useAppStore(s => s.deleteBudgetCode);
  const [editing, setEditing] = useState<BudgetCode | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<BudgetCode | null>(null);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth()+1;
  const [period, setPeriod] = useState(`${year}-${String(month).padStart(2,'0')}`);
  const [selectedYear, selectedMonth] = period.split('-').map(Number);
  function saveCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    try {save({codeId:String(form.get('codeId')),categoryName:String(form.get('categoryName')),monthlyLimit:Number(form.get('monthlyLimit'))},editing?.codeId);setEditing(undefined);setNotice('예산 코드를 저장했어요.');} catch(e) {setFormError((e as Error).message);}
  }
  function downloadBackup() {
    try {
      downloadTransactionsCsv(transactions, codes);
      setNotice(transactions.length ? `가계부 ${transactions.length}건을 CSV로 백업했어요.` : '거래 내역은 없지만, 백업용 CSV 파일을 내려받았어요.');
    } catch {
      setNotice('CSV 파일을 만들지 못했어요. 브라우저 다운로드 설정을 확인해 주세요.');
    }
  }
  return <>
    <div className="eyebrow">MY FINANCIAL BLUEPRINT</div><div className="heading-row"><div><h1>목표 & 설정<span className="text-forest">.</span></h1><p className="muted mt-2">부자 할미가 되는 여정, 나만의 속도로 준비해요.</p></div><span className="date-pill">{year}년 {month}월</span></div>
    <section className="intro-banner"><div><span className="eyebrow">SMALL STEPS, RICH FUTURE</span><h2>오늘의 계획이<br/>내일의 대저택이 돼요.</h2><p>작은 목표부터 시작해요. 꾸준함이 가장 큰 자산이니까요.</p></div><div className="house-art" aria-hidden="true"><span className="spark s1">✦</span><span className="spark s2">✧</span><div className="tree">♣</div><div className="roof"/><div className="house-body"><div className="window"/><div className="door"/></div><div className="ground"/></div></section>
    <section className="mt-9"><div className="section-title"><div className="flex items-center gap-2"><Target size={19}/><h2>나의 자산 목표</h2></div><label className="muted text-xs">목표 기간 <input aria-label="목표 기간" className="month-picker" type="month" min="1900-01" max="9999-12" required value={period} onChange={e => {if(e.target.value)setPeriod(e.target.value);}}/></label></div><div className="grid gap-5 md:grid-cols-2"><GoalForm key={`${selectedYear}-annual`} year={selectedYear} month={0}/><GoalForm key={period} year={selectedYear} month={selectedMonth}/></div></section>
    <section className="mt-9"><div className="section-title"><div className="flex items-center gap-2"><Wallet size={19}/><h2>월 예산 관리</h2><span className="count">{codes.length}</span></div><button className="text-button" onClick={() => {setFormError('');setEditing(null);}}><Plus size={16}/>예산 코드 추가</button></div><div className="card overflow-hidden !p-0"><div className="budget-summary"><div><span className="muted text-xs">매월 계획한 총 예산</span><p className="mt-1 text-2xl font-bold tracking-tight">{won(codes.reduce((a,c) => a+c.monthlyLimit,0))}<span className="ml-1 text-sm font-normal">원</span></p></div><span className="muted hidden text-xs sm:block">내 소비에 맞게 자유롭게 조정해요 <ArrowUpRight size={13} className="inline"/></span></div><div className="overflow-x-auto"><table><thead><tr><th>카테고리 / 코드</th><th className="text-right">월 예산 한도</th><th className="text-right">관리</th></tr></thead><tbody>{codes.map((code,i) => <tr key={code.codeId}><td><div className="flex items-center gap-3"><span className={`category-icon c${i%5}`}>{['🍚','🛍️','🏠','🚌','🎨'][i%5]}</span><div><strong className="text-sm font-semibold">{code.categoryName}</strong><span className="block text-[10px] tracking-wider text-stone-400">{code.codeId}</span></div></div></td><td className="text-right text-sm font-semibold whitespace-nowrap">{won(code.monthlyLimit)} <span className="font-normal text-stone-400">원</span></td><td><div className="flex justify-end gap-1"><button className="icon-button" aria-label={`${code.categoryName} 수정`} onClick={() => {setFormError('');setEditing(code);}}><Pencil size={15}/></button><button className="icon-button hover:!text-red-700" aria-label={`${code.categoryName} 삭제`} onClick={() => setDeleting(code)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>{!codes.length && <p className="p-8 text-center muted">첫 예산 코드를 추가해 주세요.</p>}<p className="table-note"><ShieldCheck size={14}/>설정한 예산은 매월 반복 적용돼요.</p></div></section>
    <section className="mt-9" aria-labelledby="backup-title"><div className="section-title"><div className="flex items-center gap-2"><ShieldCheck size={19}/><h2 id="backup-title">소중한 기록 보관</h2></div></div><div className="card flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><h3 className="text-sm font-semibold">가계부 CSV 백업</h3><p className="muted mt-1 text-xs">거래 {transactions.length}건을 날짜순으로 내려받아요.</p><p className="mt-2 text-[11px] leading-relaxed text-stone-400">날짜, 구분, 카테고리, 금액, 메모가 포함돼요.</p></div><button type="button" className="button-secondary shrink-0" onClick={downloadBackup}><Download size={16}/>가계부 데이터 백업하기 (CSV)</button></div></section>
    <p role="status" className="mt-3 text-sm text-forest">{notice}</p><div className="footer-note"><Sprout size={16}/><span>서두르지 않아도 괜찮아요. 우리는 결국 부자 할미가 될 테니까.</span></div>
    {editing !== undefined && <Modal title="code-title" onClose={() => setEditing(undefined)}><div className="flex items-center justify-between"><h2 id="code-title" className="text-xl font-bold">예산 코드 {editing ? '수정' : '추가'}</h2><button className="icon-button" aria-label="닫기" onClick={() => setEditing(undefined)}><X size={20}/></button></div><form onSubmit={saveCode}><label className="field-label" htmlFor="codeId">코드</label><input autoFocus className="standalone-input uppercase" id="codeId" name="codeId" required maxLength={12} defaultValue={editing?.codeId} placeholder="예: FO01"/><label className="field-label" htmlFor="categoryName">카테고리명</label><input className="standalone-input" id="categoryName" name="categoryName" required maxLength={30} defaultValue={editing?.categoryName}/><label className="field-label" htmlFor="monthlyLimit">월 예산 한도 (원)</label><input className="standalone-input" id="monthlyLimit" name="monthlyLimit" type="number" min="0" step="1" required defaultValue={editing?.monthlyLimit ?? 0}/><p role="alert" className="mt-3 text-sm text-red-700">{formError}</p><div className="mt-5 flex gap-2"><button className="button-secondary flex-1" type="button" onClick={() => setEditing(undefined)}>취소</button><button className="button-primary flex-1">저장하기</button></div></form></Modal>}
    {deleting && <Modal title="delete-title" onClose={() => setDeleting(null)}><h2 id="delete-title" className="text-lg font-bold">‘{deleting.categoryName}’ 코드를 삭제할까요?</h2><p className="muted mt-3 text-sm">거래에 사용된 코드는 삭제할 수 없어요.</p><div className="mt-6 flex gap-2"><button className="button-secondary flex-1" onClick={() => setDeleting(null)}>취소</button><button className="button-primary flex-1" onClick={() => {try {remove(deleting.codeId);setNotice('예산 코드를 삭제했어요.');} catch(e) {setNotice((e as Error).message);}setDeleting(null);}}>삭제하기</button></div></Modal>}
  </>;
}
