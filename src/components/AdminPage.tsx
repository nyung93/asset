import {useEffect,useState,type FormEvent} from 'react';
import {ArrowLeft,Search} from 'lucide-react';
import {accountApi,type AdminDashboardData,type AdminMember} from '../lib/accountApi';
import Dialog from './Dialog';

function number(value:number|string|undefined) {return new Intl.NumberFormat('ko-KR').format(Number(value ?? 0));}
function date(value:string|null) {return value ? new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '접속 기록 없음';}

export default function AdminPage({onBack,onImpersonate}: {onBack:()=>void;onImpersonate:(userId:string)=>Promise<void>}) {
  const [dashboard,setDashboard]=useState<AdminDashboardData|null>(null);
  const [members,setMembers]=useState<AdminMember[]>([]);
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  const [offset,setOffset]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [confirmReset,setConfirmReset]=useState(false);
  const [resetting,setResetting]=useState(false);
  const selected=members.find(member=>member.id===selectedId);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    Promise.all([accountApi.dashboard(),accountApi.members(query,offset)]).then(([summary,list])=>{
      if(!active)return;setDashboard(summary);setMembers(list.members);setHasMore(list.hasMore);setError('');
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'관리자 데이터를 불러오지 못했어요.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[query,offset]);
  function submit(event:FormEvent) {event.preventDefault();setOffset(0);setQuery(search.trim());}
  async function open(userId:string) {
    setBusyId(userId);setError('');
    try {await onImpersonate(userId);}
    catch(reason){setError(reason instanceof Error?reason.message:'회원 계정을 열지 못했어요.');}
    finally{setBusyId('');}
  }
  async function resetScore() {
    if (!selected || selected.role!=='USER' || resetting) return;
    const userId=selected.id;
    setResetting(true);setError('');
    try {
      await accountApi.resetMemberXp(userId);
      const [summary,list]=await Promise.all([accountApi.dashboard(),accountApi.members(query,offset)]);
      setDashboard(summary);setMembers(list.members);setHasMore(list.hasMore);
      setConfirmReset(false);setNotice(`${selected.name} 회원의 XP가 초기화됐어요.`);
    } catch(reason) {setError(reason instanceof Error?reason.message:'점수를 초기화하지 못했어요.');}
    finally {setResetting(false);}
  }
  const cards=[
    {label:'전체 회원',value:number(dashboard?.users.total_users)},
    {label:'이번 달 가입',value:number(dashboard?.users.new_users_this_month)},
    {label:'최근 30일 접속',value:number(dashboard?.users.active_users_30d)},
    {label:'전체 가계부 기록',value:number(dashboard?.data.transaction_count)},
  ];
  return <div className="space-y-7"><button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-[#647784]"><ArrowLeft size={16}/> 마이룸으로 돌아가기</button><div><p className="eyebrow">관리</p><h1 className="mt-2">관리자 대시보드</h1><p className="mt-2 text-sm text-[#647784]">회원 현황과 서비스 이용 기록을 확인해요.</p></div>
    {error && <p role="alert" className="rounded-xl bg-[#f7fafc] p-4 text-sm text-[#ae5d58]">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-[#eaf4fb] p-4 text-sm text-[#176897]">{notice}</p>}
    <div className="summary-grid grid sm:grid-cols-2 xl:grid-cols-4">{cards.map(item=><div key={item.label} className="card"><p className="text-xs text-[#647784]">{item.label}</p><strong className="mt-3 block text-2xl text-[#27343e]">{loading?'…':item.value}</strong></div>)}</div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="card"><p className="text-xs text-[#647784]">전체 지출 기록 합계</p><strong className="mt-2 block text-lg">{number(dashboard?.data.total_expense)}원</strong></div><div className="card"><p className="text-xs text-[#647784]">전체 저축 기록 합계</p><strong className="mt-2 block text-lg">{number(dashboard?.data.total_saving)}원</strong></div><div className="card"><p className="text-xs text-[#647784]">획득한 총 XP</p><strong className="mt-2 block text-lg">{number(dashboard?.data.total_xp)} XP</strong></div></div>
    <section className="overflow-hidden rounded-2xl border border-[#eaf4fb] bg-white"><div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="font-bold">회원 조회</h2><p className="mt-1 text-xs text-[#8a9ba6]">이름 일부 또는 아이디 전체로 검색할 수 있어요.</p></div><form onSubmit={submit} className="flex w-full max-w-sm gap-2"><input aria-label="회원 검색" value={search} onChange={e=>setSearch(e.target.value)} placeholder="이름 또는 아이디" className="auth-input min-w-0 flex-1"/><button className="button-secondary" type="submit"><Search size={15}/> 검색</button></form></div>
      <div className="overflow-x-auto"><table className="min-w-[760px]"><thead><tr><th>사용자명</th><th>아이디</th><th>최근 접속일</th><th className="text-right">XP</th><th className="text-right">등급</th><th className="text-right">관리</th></tr></thead><tbody>{members.map(member=><tr key={member.id}><td className="text-sm font-semibold">{member.name}</td><td className="text-xs text-[#647784]">{member.username}</td><td className="text-xs text-[#647784]">{date(member.lastLoginAt)}</td><td className="text-right text-sm tabular-nums">{number(member.totalXp)}</td><td className="text-right text-xs">Lv.{member.level} · {member.houseName}</td><td><div className="flex justify-end gap-2"><button type="button" onClick={()=>{setSelectedId(member.id);setConfirmReset(false);setError('');}} className="text-xs font-semibold text-[#176897]">정보 보기</button><button type="button" disabled={member.role==='ADMIN'||!!busyId} onClick={()=>void open(member.id)} className="rounded-lg bg-[#eaf4fb] px-3 py-2 text-xs font-semibold text-[#176897] disabled:opacity-40">{busyId===member.id?'접속 중…':member.role==='ADMIN'?'관리자':'계정 접속'}</button></div></td></tr>)}</tbody></table>{!loading && members.length===0 && <p className="p-8 text-center text-sm text-[#8a9ba6]">검색된 회원이 없어요.</p>}</div>
      <div className="flex items-center justify-between border-t border-[#eaf4fb] px-5 py-3"><p className="text-xs text-[#8a9ba6]">회원 계정 접속과 수정은 관리자 이력에 기록돼요.</p><div className="flex gap-2"><button disabled={offset===0||loading} onClick={()=>setOffset(Math.max(0,offset-50))} className="text-xs text-[#647784] disabled:opacity-40">이전</button><button disabled={!hasMore||loading} onClick={()=>setOffset(offset+50)} className="text-xs text-[#647784] disabled:opacity-40">다음</button></div></div>
    </section>
    {selected && <Dialog title={`${selected.name} 회원 정보`} onClose={()=>{setSelectedId(null);setConfirmReset(false);}}>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="muted text-xs">이름</dt><dd className="mt-1 font-semibold">{selected.name}</dd></div>
        <div><dt className="muted text-xs">아이디</dt><dd className="mt-1 font-semibold">{selected.username}</dd></div>
        <div><dt className="muted text-xs">생년월일</dt><dd className="mt-1">{selected.birthDate}</dd></div>
        <div><dt className="muted text-xs">휴대폰</dt><dd className="mt-1">{selected.phone}</dd></div>
        <div><dt className="muted text-xs">가입일</dt><dd className="mt-1">{date(selected.createdAt)}</dd></div>
        <div><dt className="muted text-xs">최근 접속</dt><dd className="mt-1">{date(selected.lastLoginAt)}</dd></div>
        <div><dt className="muted text-xs">점수</dt><dd className="mt-1 font-bold">{number(selected.totalXp)} XP</dd></div>
        <div><dt className="muted text-xs">등급</dt><dd className="mt-1 font-bold">Lv.{selected.level} · {selected.houseName}</dd></div>
      </dl>
      {selected.role==='USER' && <div className="mt-6 border-t border-[#eaf4fb] pt-4">
        {!confirmReset ? <div className="flex gap-2"><button type="button" className="button-primary flex-1" onClick={()=>void open(selected.id)} disabled={!!busyId}>비밀번호 없이 계정 접속</button><button type="button" className="button-secondary" onClick={()=>setConfirmReset(true)}>점수 초기화</button></div> :
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3"><p className="text-sm font-semibold text-rose-700">{selected.name} 회원의 XP와 보상 기록을 0으로 초기화할까요?</p><p className="mt-1 text-xs text-rose-600">가계부·투자 기록은 유지되고, 이 작업은 되돌릴 수 없어요.</p><div className="mt-3 flex gap-2"><button type="button" className="button-secondary flex-1" onClick={()=>setConfirmReset(false)} disabled={resetting}>취소</button><button type="button" className="button-primary flex-1 !bg-rose-600" onClick={()=>void resetScore()} disabled={resetting}>{resetting?'초기화 중…':'XP 초기화 확인'}</button></div></div>}
      </div>}
    </Dialog>}
  </div>;
}
