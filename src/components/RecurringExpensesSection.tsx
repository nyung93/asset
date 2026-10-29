import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Pencil,Plus,Trash2,X} from 'lucide-react';
import {useAppStore} from '../store';
import {recurringMonthSummary} from '../lib/recurringExpenses';
import type {RecurringExpense} from '../types';

const won=(value:number)=>new Intl.NumberFormat('ko-KR').format(value);

function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog ref={ref} aria-labelledby={title} onCancel={onClose} className="modal">{children}</dialog>;
}

function ExpenseForm({period,editing,onClose}:{period:string;editing:RecurringExpense|null;onClose:()=>void}) {
  const codes=useAppStore(s=>s.budgetCodes);
  const save=useAppStore(s=>s.saveRecurringExpense);
  const [name,setName]=useState(editing?.name??'');
  const [day,setDay]=useState(String(editing?.day??1));
  const [amount,setAmount]=useState(editing ? String(editing.amount) : '');
  const [codeId,setCodeId]=useState(editing?.codeId??codes.find(item=>item.codeId==='HO01')?.codeId??codes[0]?.codeId??'');
  const [error,setError]=useState('');
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      save({id:editing?.id??crypto.randomUUID(),name,day:Number(day),amount:Number(amount),codeId,startMonth:editing?.startMonth??period});
      onClose();
    } catch(cause) {setError(cause instanceof Error?cause.message:'정기 지출을 저장하지 못했어요.');}
  }
  return <Dialog title="recurring-form-title" onClose={onClose}>
    <div className="flex items-center justify-between gap-3"><h3 id="recurring-form-title" className="text-lg font-bold">정기 지출 {editing?'수정':'추가'}</h3><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><X size={18}/></button></div>
    <p className="muted mt-2 text-xs">{editing ? `${editing.startMonth}부터 반복되는 지출이에요.` : `${period}부터 매월 반복돼요.`}</p>
    <form onSubmit={submit}>
      <label className="field-label" htmlFor="recurring-name">지출 이름</label>
      <input id="recurring-name" autoFocus required maxLength={40} className="standalone-input" placeholder="예: 월세, 통신비, 구독료" value={name} onChange={e=>setName(e.target.value)}/>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="field-label" htmlFor="recurring-day">매월 납부일</label><input id="recurring-day" className="standalone-input" type="number" min="1" max="31" step="1" required value={day} onChange={e=>setDay(e.target.value)}/></div>
        <div><label className="field-label" htmlFor="recurring-amount">예정 금액 (원)</label><input id="recurring-amount" className="standalone-input" type="number" min="1" step="1" required value={amount} onChange={e=>setAmount(e.target.value)}/></div>
      </div>
      <label className="field-label" htmlFor="recurring-category">예산 카테고리</label>
      <select id="recurring-category" className="standalone-input" required value={codeId} onChange={e=>setCodeId(e.target.value)}>{codes.map(code=><option key={code.codeId} value={code.codeId}>{code.categoryName} ({code.codeId})</option>)}</select>
      <p className="muted mt-3 text-xs leading-5">31일이 없는 달은 마지막 날을 납부일로 표시해요.</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-5 flex gap-2"><button type="button" className="button-secondary flex-1" onClick={onClose}>취소</button><button className="button-primary flex-1" type="submit">저장하기</button></div>
    </form>
  </Dialog>;
}

export default function RecurringExpensesSection({period}:{period:string}) {
  const expenses=useAppStore(s=>s.recurringExpenses);
  const payments=useAppStore(s=>s.recurringExpensePayments);
  const codes=useAppStore(s=>s.budgetCodes);
  const remove=useAppStore(s=>s.deleteRecurringExpense);
  const togglePaid=useAppStore(s=>s.toggleRecurringExpensePaid);
  const [editing,setEditing]=useState<RecurringExpense|null|undefined>(undefined);
  const [deleting,setDeleting]=useState<RecurringExpense|null>(null);
  const [notice,setNotice]=useState('');
  const {rows,total,paid,remaining}=recurringMonthSummary(expenses,payments,period);
  const [year,month]=period.split('-').map(Number);
  return <section className="mt-9" aria-labelledby="recurring-title">
    <div className="section-title"><div><h2 id="recurring-title">정기 지출</h2><p className="muted mt-1 text-xs">{year}년 {month}월 · 매월 반복되는 납부 내역</p></div><button type="button" className="text-button shrink-0" disabled={!codes.length} onClick={()=>setEditing(null)}><Plus size={16}/>지출 추가</button></div>
    <div className="card !p-0 overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-[#eaf4fb] border-b border-[#eaf4fb] bg-[#f7fafc] px-2 py-4 text-center sm:px-5">
        <div><p className="muted text-xs">이번 달 예정</p><p className="mt-1 text-sm font-bold tabular-nums sm:text-base">{won(total)}원</p></div>
        <div><p className="muted text-xs">납부 확인</p><p className="mt-1 text-sm font-bold text-[#176897] tabular-nums sm:text-base">{won(paid)}원</p></div>
        <div><p className="muted text-xs">남은 예정액</p><p className="mt-1 text-sm font-bold tabular-nums sm:text-base">{won(remaining)}원</p></div>
      </div>
      {rows.length ? <ul className="divide-y divide-[#edf3f7]">{rows.map(item=>{
        const category=codes.find(code=>code.codeId===item.codeId)?.categoryName??item.codeId;
        return <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="w-14 shrink-0 text-center"><strong className="block text-sm text-[#176897]">{Number(item.dueDate.slice(8))}일</strong><span className="muted text-[10px]">{item.day!==Number(item.dueDate.slice(8))?'월말 납부':'매월 납부'}</span></div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="muted mt-0.5 text-xs">{category}</p></div>
          <div className="min-w-[88px] text-right"><p className="text-sm font-bold tabular-nums">{won(item.amount)}원</p><p className="muted mt-0.5 text-[11px]">{item.payment ? `${item.payment.paidOn} 확인` : '납부 확인 전'}</p></div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#526b7b]"><input type="checkbox" aria-label={`${item.name} ${period} 납부 완료`} checked={!!item.payment} onChange={()=>{try{togglePaid(item.id,period);setNotice('');}catch(cause){setNotice(cause instanceof Error?cause.message:'납부 상태를 변경하지 못했어요.');}}} className="h-4 w-4 accent-[#176897]"/>납부 완료</label>
            <div className="flex shrink-0"><button type="button" className="icon-button" aria-label={`${item.name} 수정`} onClick={()=>setEditing(item)}><Pencil size={15}/></button><button type="button" className="icon-button" aria-label={`${item.name} 삭제`} onClick={()=>setDeleting(item)}><Trash2 size={15}/></button></div>
          </div>
        </li>;
      })}</ul> : <p className="muted px-6 py-8 text-center text-sm">이 달에 예정된 정기 지출이 없어요. 지출을 추가해 관리해 보세요.</p>}
      <p className="table-note">납부 체크는 월별로 저장돼요. 실제 지출은 가계부에 별도로 기록해 주세요.</p>
    </div>
    {notice && <p role="alert" className="mt-2 text-sm text-rose-600">{notice}</p>}
    {editing!==undefined && <ExpenseForm key={editing?.id??'new'} period={period} editing={editing} onClose={()=>setEditing(undefined)}/>}
    {deleting && <Dialog title="recurring-delete-title" onClose={()=>setDeleting(null)}><h3 id="recurring-delete-title" className="text-lg font-bold">‘{deleting.name}’ 지출을 삭제할까요?</h3><p className="muted mt-3 text-sm">기록된 월별 납부 체크도 함께 삭제돼요.</p><div className="mt-6 flex gap-2"><button type="button" className="button-secondary flex-1" onClick={()=>setDeleting(null)}>취소</button><button type="button" className="button-primary flex-1" onClick={()=>{remove(deleting.id);setDeleting(null);}}>삭제하기</button></div></Dialog>}
  </section>;
}
