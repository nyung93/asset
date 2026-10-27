import {useEffect,useRef,useState} from 'react';
import {Home,CalendarDays,ChartNoAxesCombined,TrendingUp,Settings2,UserRound,ShieldCheck,LogOut} from 'lucide-react';
import GoalsAndSettingsTab from './components/GoalsAndSettingsTab';
import InvestmentTab from './components/InvestmentTab';
import CalendarTab from './components/CalendarTab';
import StatisticsTab from './components/StatisticsTab';
import HomeTab from './components/HomeTab';
import CharacterAvatar from './components/CharacterAvatar';
import { useAppStore } from './store';
import { progression } from './lib/progression';
import { getCharacterMood } from './lib/characterMood';
import { todayDate } from './lib/calendar';
import {accountApi,AccountApiError,type AccountSession,type AccountUser} from './lib/accountApi';
import {AccountSync} from './lib/accountSync';
import {initialData,migrateAppData} from './store';
import AuthShell from './components/AuthShell';
import MyPage from './components/MyPage';
import AdminPage from './components/AdminPage';
const tabs = [
  {name: '홈', sub: '마이룸', icon: Home},
  {name: '캘린더', sub: '가계부', icon: CalendarDays},
  {name: '통계', sub: '리포트', icon: ChartNoAxesCombined},
  {name: '투자', sub: '포트폴리오', icon: TrendingUp},
  {name: '목표 & 설정', sub: '나의 계획', icon: Settings2},
];
function GameShell({session,onLogout,onImpersonate,onStopImpersonation,onProfileUpdated,syncError,onRetrySync,legacyOffer,onImportLegacy,onDismissLegacy}: {
  session?:AccountSession;onLogout?:()=>Promise<void>;onImpersonate?:(userId:string)=>Promise<void>;
  onStopImpersonation?:()=>Promise<void>;onProfileUpdated?:(user:AccountUser)=>void;
  syncError?:string;onRetrySync?:()=>void;legacyOffer?:boolean;onImportLegacy?:()=>void;onDismissLegacy?:()=>void;
}) {
  const [tab, setTab] = useState(0);
  const [page,setPage]=useState<'main'|'mypage'|'admin'>('main');
  const state = useAppStore();
  const character = state.character;
  const mood = getCharacterMood(state, todayDate());
  const growth = progression(character.totalXp);
  const navigate=(index:number)=>{setTab(index);setPage('main');};
  return <div className="min-h-screen bg-cream">
    <header className="topbar"><div className="topbar-inner">
      <a href="#" onClick={event => {event.preventDefault();navigate(0);}} className="brand">부자할미 타이쿤</a>
      <div className="profile"><span className="text-xs font-bold text-forest">Lv.{character.level}</span><CharacterAvatar avatar={character.avatar} expression={mood.expression} useDefaultArtwork={!character.isCustomized} characterId={character.selectedCharacterId} portrait className="h-10 w-10 rounded-full bg-[#eaf4fb]"/>{session ? <button type="button" onClick={()=>setPage('mypage')} className="hidden text-sm font-semibold sm:inline">{session.user.name} 님</button> : <span className="hidden text-sm sm:inline">{character.houseStage === 5 ? '돈 많은 할미' : '미래의 부자할미'}</span>}{session?.user.role==='ADMIN' && !session.impersonating && <button type="button" onClick={()=>setPage('admin')} className="rounded-lg bg-[#eaf4fb] px-2 py-1.5 text-xs font-bold text-[#647784]">관리자</button>}{session && <button type="button" aria-label="마이페이지" onClick={()=>setPage('mypage')} className="text-[#647784] sm:hidden"><UserRound size={20}/></button>}</div>
    </div></header>
    {session?.impersonating && <div className="flex items-center justify-center gap-3 bg-[#f7fafc] px-4 py-2 text-xs font-semibold text-[#647784]"><ShieldCheck size={15}/> 관리자 {session.adminName} 님이 {session.user.name} 회원 계정을 보고 있어요. <button type="button" onClick={()=>void onStopImpersonation?.()} className="rounded-md border border-[#8a9ba6] px-2 py-1">관리자로 돌아가기</button></div>}
    {legacyOffer && <div className="flex flex-wrap items-center justify-center gap-3 bg-[#eaf4fb] px-4 py-2 text-xs text-[#647784]">이 기기에 로그인 전 가계부 기록이 남아 있어요.<button type="button" onClick={onImportLegacy} className="font-bold underline">내 계정으로 가져오기</button><button type="button" onClick={onDismissLegacy} className="text-[#647784]">나중에</button></div>}
    {syncError && <div role="alert" className="flex flex-wrap items-center justify-center gap-3 bg-[#f7fafc] px-4 py-2 text-xs text-[#a14f49]">가계부 저장에 실패했어요: {syncError}<button type="button" onClick={onRetrySync} className="font-bold underline">다시 저장</button></div>}
    <div className="app-shell">
      <aside className="sidebar"><p className="eyebrow mb-4 px-4">메뉴</p>
        <nav aria-label="메인 메뉴">{tabs.map((item, index) => <button key={item.name} onClick={() => navigate(index)} className={`side-tab ${page==='main' && index === tab ? 'active' : ''}`} aria-current={page==='main' && index === tab ? 'page' : undefined}><item.icon size={20}/><span>{item.name}<small>{item.sub}</small></span></button>)}{session && <button onClick={()=>setPage('mypage')} className={`side-tab ${page==='mypage'?'active':''}`}><UserRound size={20}/><span>마이페이지<small>내 정보</small></span></button>}{session?.user.role==='ADMIN' && !session.impersonating && <button onClick={()=>setPage('admin')} className={`side-tab ${page==='admin'?'active':''}`}><ShieldCheck size={20}/><span>관리자<small>회원 및 통계</small></span></button>}</nav>
        <div className="journey"><p>나의 성장</p><small>다음 레벨까지</small><div className="mt-4 h-1.5 rounded bg-slate-200"><div className="h-full rounded bg-forest" style={{width: `${character.currentXp / growth.levelSpan * 100}%`}}/></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>LEVEL {character.level}</span><span>{character.currentXp} / {growth.levelSpan} XP</span></div></div>
        {session && <button onClick={()=>void onLogout?.()} className="mt-6 flex items-center gap-2 px-4 text-xs font-semibold text-[#9e6b62]"><LogOut size={15}/> 로그아웃</button>}
      </aside>
      <main className="main-content" key={`${page}-${tab}`}>
        {page==='mypage' && session && onLogout && onProfileUpdated ? <MyPage user={session.user} onUpdated={onProfileUpdated} onLogout={onLogout} onBack={()=>navigate(0)}/> : page==='admin' && session?.user.role==='ADMIN' && onImpersonate ? <AdminPage onBack={()=>navigate(0)} onImpersonate={onImpersonate}/> : tab === 0 ? <HomeTab onNavigate={navigate}/> : tab === 1 ? <CalendarTab/> : tab === 2 ? <StatisticsTab/> : tab === 3 ? <InvestmentTab/> : <GoalsAndSettingsTab/>}
      </main>
    </div>
    <nav className="bottom-nav" aria-label="하단 탭">{tabs.map((item, index) => <button key={item.name} onClick={() => navigate(index)} aria-current={page==='main' && tab === index ? 'page' : undefined} className={page==='main' && tab === index ? 'selected' : ''}><item.icon size={20}/><span>{item.name}</span></button>)}</nav>
  </div>;
}

function AccountApp() {
  const [session,setSession]=useState<AccountSession|null>(null);
  const [loading,setLoading]=useState(true);
  const [setupError,setSetupError]=useState('');
  const [syncError,setSyncError]=useState('');
  const [legacyOffer,setLegacyOffer]=useState(false);
  const sync=useRef<AccountSync|null>(null);
  async function adopt(next:AccountSession) {
    sync.current?.dispose();sync.current=null;
    const result=await accountApi.data();
    useAppStore.getState().replaceAppData(result.data ?? structuredClone(initialData));
    sync.current=new AccountSync(result.version,setSyncError);
    setLegacyOffer(!result.data && !!localStorage.getItem('rich-grandma-tycoon-v1'));
    setSession(next);setSyncError('');setSetupError('');
  }
  useEffect(()=>{
    let alive=true;
    accountApi.status().then(async next=>{if(alive)await adopt(next);}).catch(error=>{
      if(alive && error instanceof AccountApiError && error.status!==401) setSetupError(error.message);
    }).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;sync.current?.dispose();};
  },[]);
  async function logout() {
    if(sync.current && !await sync.current.flush()) return;
    await accountApi.logout();sync.current?.dispose();sync.current=null;
    useAppStore.getState().resetAppData();setSession(null);setSyncError('');
  }
  async function impersonate(userId:string) {
    if(sync.current && !await sync.current.flush()) throw new Error('현재 가계부 저장을 마친 뒤 다시 시도해 주세요.');
    const next=await accountApi.impersonate(userId);
    await adopt(next);
  }
  async function stopImpersonation() {
    if(sync.current && !await sync.current.flush()) return;
    try {const next=await accountApi.stopImpersonation();await adopt(next);}
    catch(error){setSyncError(error instanceof Error?error.message:'관리자 계정으로 돌아가지 못했어요.');}
  }
  async function importLegacy() {
    try {
      const raw=localStorage.getItem('rich-grandma-tycoon-v1');
      if(!raw) {setLegacyOffer(false);return;}
      const saved=JSON.parse(raw) as {state?:unknown;version?:number};
      if(!saved.state || typeof saved.state!=='object') throw new Error('이전 가계부를 읽지 못했어요.');
      useAppStore.getState().replaceAppData(migrateAppData(saved.state, saved.version ?? 2));
      if(!await sync.current?.flush()) return;
      localStorage.removeItem('rich-grandma-tycoon-v1');setLegacyOffer(false);
    } catch(error) {setSyncError(error instanceof Error?error.message:'이전 가계부를 가져오지 못했어요.');}
  }
  if(loading) return <div className="grid min-h-screen place-items-center bg-[#f7fafc] text-sm font-semibold text-[#647784]" role="status">할미가 마이룸 문을 열고 있어요...</div>;
  if(!session) return <AuthShell setupError={setupError} onAuthenticated={adopt}/>;
  return <GameShell key={`${session.user.id}:${session.impersonating}`} session={session} onLogout={logout} onImpersonate={impersonate} onStopImpersonation={stopImpersonation}
    onProfileUpdated={user=>setSession(previous=>previous?{...previous,user}:previous)} syncError={syncError} onRetrySync={()=>void sync.current?.retry()}
    legacyOffer={legacyOffer} onImportLegacy={()=>void importLegacy()} onDismissLegacy={()=>setLegacyOffer(false)}/>;
}

export default function App() {
  // Only the local Playwright dev server can enable the legacy fixture path.
  if(import.meta.env.DEV && import.meta.env.VITE_E2E_AUTH_BYPASS==='1') return <GameShell/>;
  return <AccountApp/>;
}
