import {useEffect,useState,type FormEvent} from 'react';
import {ArrowLeft,ChartNoAxesCombined,Search,ShieldCheck,UsersRound,Wallet} from 'lucide-react';
import {accountApi,type AdminDashboardData,type AdminMember} from '../lib/accountApi';

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
  const cards=[
    {label:'전체 회원',value:number(dashboard?.users.total_users),icon:UsersRound},
    {label:'이번 달 가입',value:number(dashboard?.users.new_users_this_month),icon:ShieldCheck},
    {label:'최근 30일 접속',value:number(dashboard?.users.active_users_30d),icon:ChartNoAxesCombined},
    {label:'전체 가계부 기록',value:number(dashboard?.data.transaction_count),icon:Wallet},
  ];
  return <div className="space-y-7"><button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-[#69815f]"><ArrowLeft size={16}/> 마이룸으로 돌아가기</button><div><p className="eyebrow">ADMIN ONLY</p><h1 className="mt-2">관리자 대시보드</h1><p className="mt-2 text-sm text-[#8a9386]">회원 현황과 서비스 이용 기록을 확인해요.</p></div>
    {error && <p role="alert" className="rounded-xl bg-[#fff0ee] p-4 text-sm text-[#ae5d58]">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(item=><div key={item.label} className="card flex items-start justify-between"><div><p className="text-xs text-[#8d9786]">{item.label}</p><strong className="mt-3 block text-2xl text-[#4c6744]">{loading?'…':item.value}</strong></div><item.icon size={20} className="text-[#8a9f7e]"/></div>)}</div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="card"><p className="text-xs text-[#8d9786]">전체 지출 기록 합계</p><strong className="mt-2 block text-lg">{number(dashboard?.data.total_expense)}원</strong></div><div className="card"><p className="text-xs text-[#8d9786]">전체 저축 기록 합계</p><strong className="mt-2 block text-lg">{number(dashboard?.data.total_saving)}원</strong></div><div className="card"><p className="text-xs text-[#8d9786]">획득한 총 XP</p><strong className="mt-2 block text-lg">{number(dashboard?.data.total_xp)} XP</strong></div></div>
    <section className="overflow-hidden rounded-2xl border border-[#e4e8df] bg-white"><div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="font-bold">회원 조회</h2><p className="mt-1 text-xs text-[#919a8d]">이름 일부 또는 아이디 전체로 검색할 수 있어요.</p></div><form onSubmit={submit} className="flex w-full max-w-sm gap-2"><input aria-label="회원 검색" value={search} onChange={e=>setSearch(e.target.value)} placeholder="이름 또는 아이디" className="auth-input min-w-0 flex-1"/><button className="button-secondary" type="submit"><Search size={15}/> 검색</button></form></div>
      <div className="overflow-x-auto"><table className="min-w-[590px]"><thead><tr><th>사용자명</th><th>아이디</th><th>최근 접속일</th><th>계정 접속</th></tr></thead><tbody>{members.map(member=><tr key={member.id}><td className="text-sm font-semibold">{member.name}</td><td className="text-xs text-[#6e786b]">{member.username}</td><td className="text-xs text-[#6e786b]">{date(member.lastLoginAt)}</td><td><button disabled={member.role==='ADMIN'||!!busyId} onClick={()=>void open(member.id)} className="rounded-lg bg-[#edf2e7] px-3 py-2 text-xs font-semibold text-[#59754e] disabled:opacity-40">{busyId===member.id?'접속 중...':member.role==='ADMIN'?'관리자 계정':'계정 접속'}</button></td></tr>)}</tbody></table>{!loading && members.length===0 && <p className="p-8 text-center text-sm text-[#98a193]">검색된 회원이 없어요.</p>}</div>
      <div className="flex items-center justify-between border-t border-[#eef0ea] px-5 py-3"><p className="text-[11px] text-[#939d8f]">회원 계정 접속과 수정은 관리자 이력에 기록돼요.</p><div className="flex gap-2"><button disabled={offset===0||loading} onClick={()=>setOffset(Math.max(0,offset-50))} className="text-xs text-[#5d7654] disabled:opacity-40">이전</button><button disabled={!hasMore||loading} onClick={()=>setOffset(offset+50)} className="text-xs text-[#5d7654] disabled:opacity-40">다음</button></div></div>
    </section>
  </div>;
}
