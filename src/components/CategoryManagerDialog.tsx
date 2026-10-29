import {useState, type FormEvent} from 'react';
import {Pencil, Plus, Trash2} from 'lucide-react';
import {useAppStore} from '../store';
import {codeKind} from '../lib/categoryCodes';
import type {BudgetCode, BudgetCodeKind} from '../types';
import Dialog from './Dialog';

const kinds: {id:BudgetCodeKind;label:string}[] = [
  {id:'EXPENSE',label:'지출'}, {id:'INCOME',label:'수입'},
  {id:'SAVING',label:'저축'}, {id:'INVESTMENT',label:'투자'},
];
const won = (value:number) => new Intl.NumberFormat('ko-KR').format(value);

export default function CategoryManagerDialog({onClose}: {onClose:()=>void}) {
  const codes = useAppStore(s => s.budgetCodes);
  const create = useAppStore(s => s.createBudgetCode);
  const save = useAppStore(s => s.saveBudgetCode);
  const remove = useAppStore(s => s.deleteBudgetCode);
  const [kind,setKind] = useState<BudgetCodeKind>('EXPENSE');
  const [editing,setEditing] = useState<BudgetCode|null|undefined>(undefined);
  const [deleting,setDeleting] = useState<BudgetCode|null>(null);
  const [name,setName] = useState('');
  const [limit,setLimit] = useState('0');
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const selected = codes.filter(code => codeKind(code) === kind);

  function choose(next:BudgetCodeKind) {
    setKind(next);setEditing(undefined);setDeleting(null);setMessage('');setError('');
  }
  function edit(code:BudgetCode|null) {
    setEditing(code);setName(code?.categoryName ?? '');setLimit(String(code?.monthlyLimit ?? 0));
    setDeleting(null);setError('');setMessage('');
  }
  function submit(event:FormEvent) {
    event.preventDefault();setError('');
    try {
      const monthlyLimit = kind === 'EXPENSE' ? Number(limit) : 0;
      if (!name.trim() || name.trim().length > 30) throw new Error('카테고리명을 1~30자로 입력해 주세요.');
      if (!Number.isSafeInteger(monthlyLimit) || monthlyLimit < 0) throw new Error('월 예산은 0 이상의 정수로 입력해 주세요.');
      if (editing) save({...editing,categoryName:name,monthlyLimit},editing.codeId);
      else create({kind,categoryName:name,monthlyLimit});
      setMessage(`${name.trim()} 카테고리를 저장했어요.`);setEditing(undefined);
    } catch(cause) {setError(cause instanceof Error ? cause.message : '카테고리를 저장하지 못했어요.');}
  }
  function confirmDelete() {
    if (!deleting) return;
    try {remove(deleting.codeId);setMessage(`${deleting.categoryName} 카테고리를 삭제했어요.`);setError('');setDeleting(null);}
    catch(cause) {setError(cause instanceof Error ? cause.message : '카테고리를 삭제하지 못했어요.');setDeleting(null);}
  }
  return <Dialog title="카테고리 관리" onClose={onClose} className="!max-w-[540px]">
    <p className="mt-2 text-xs leading-5 text-[#647784]">거래 유형별 이름을 관리해요. 내부 식별자는 자동으로 만들어져 화면에 표시되지 않아요.</p>
    <div role="tablist" aria-label="카테고리 유형" className="mt-5 flex gap-2 border-b border-[#dce7ee]">
      {kinds.map(item => <button key={item.id} type="button" role="tab" aria-selected={kind===item.id} onClick={()=>choose(item.id)} className={`min-h-10 border-b-2 px-3 text-sm font-semibold ${kind===item.id?'border-[#176897] text-[#176897]':'border-transparent text-[#647784]'}`}>{item.label}</button>)}
    </div>
    <div role="tabpanel" aria-label={`${kinds.find(item=>item.id===kind)?.label} 카테고리`} className="mt-3">
      <ul className="max-h-60 divide-y divide-[#eaf4fb] overflow-y-auto">
        {selected.map(code => <li key={code.codeId} className="flex items-center gap-2 py-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{code.categoryName}</span>
          {kind==='EXPENSE' && <span className="shrink-0 text-xs tabular-nums text-[#647784]">{won(code.monthlyLimit)}원/월</span>}
          <button type="button" className="icon-button" aria-label={`${code.categoryName} 수정`} onClick={()=>edit(code)}><Pencil size={16}/></button>
          <button type="button" className="icon-button" aria-label={`${code.categoryName} 삭제`} onClick={()=>{setDeleting(code);setEditing(undefined);setError('');}}><Trash2 size={16}/></button>
        </li>)}
      </ul>
      {!selected.length && <p className="py-6 text-center text-sm text-[#647784]">등록된 카테고리가 없어요.</p>}
      {deleting && <div className="mt-4 rounded-lg border border-[#dce7ee] bg-[#f7fafc] p-4 text-sm"><p>‘{deleting.categoryName}’을 삭제할까요? 사용 중인 항목은 삭제할 수 없어요.</p><div className="mt-3 flex gap-2"><button type="button" className="button-secondary" onClick={()=>setDeleting(null)}>취소</button><button type="button" className="button-primary" onClick={confirmDelete}>삭제</button></div></div>}
      {editing === undefined ? <button type="button" className="button-secondary mt-4 w-full" onClick={()=>edit(null)}><Plus size={16}/>카테고리 추가</button> :
        <form onSubmit={submit} className="mt-4 border-t border-[#dce7ee] pt-4">
          <h3 className="text-sm font-bold">{editing ? '카테고리 수정' : '새 카테고리'}</h3>
          <label className="field-label !mt-3" htmlFor="category-name">이름</label>
          <input id="category-name" className="standalone-input" autoFocus required maxLength={30} value={name} onChange={event=>setName(event.target.value)} placeholder={kind==='EXPENSE'?'예: 카페':'예: 월급'}/>
          {kind==='EXPENSE' && <><label className="field-label !mt-3" htmlFor="category-limit">월 예산 한도 (원)</label><input id="category-limit" className="standalone-input" type="number" min="0" step="1" required value={limit} onChange={event=>setLimit(event.target.value)}/></>}
          <div className="mt-4 flex gap-2"><button type="button" className="button-secondary flex-1" onClick={()=>setEditing(undefined)}>취소</button><button type="submit" className="button-primary flex-1">저장</button></div>
        </form>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-[#176897]">{message}</p>}
    </div>
  </Dialog>;
}
