import {useState, type FormEvent} from 'react';
import {ArrowRight, LockKeyhole, ShieldCheck, Sparkles, Sprout, TrendingUp, Wallet} from 'lucide-react';
import CharacterAvatar from './CharacterAvatar';
import {DEFAULT_AVATAR_CONFIG} from '../lib/avatar';
import {accountApi, AccountApiError, type AccountSession} from '../lib/accountApi';

export default function AuthShell({onAuthenticated,setupError}: {onAuthenticated:(session:AccountSession)=>Promise<void>;setupError?:string}) {
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [form,setForm]=useState({name:'',birthDate:'',phone:'',username:'',password:''});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [submitted,setSubmitted]=useState(false);
  const set=(key:keyof typeof form,value:string)=>setForm(previous=>({...previous,[key]:value}));
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError('');setSubmitted(true);
    if(mode==='register' && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9\s]).{8,128}$/.test(form.password)) {
      setError('비밀번호는 8자 이상, 영문 대문자·소문자·특수문자를 포함해야 해요.');return;
    }
    setBusy(true);
    try {
      const session=mode==='register' ? await accountApi.register(form) : await accountApi.login({username:form.username,password:form.password});
      await onAuthenticated(session);
    } catch(error) {
      setError(error instanceof AccountApiError && error.code==='setup_required'
        ? '로그인 요청을 확인했지만 데이터베이스 설정이 완료되지 않았어요. 테스트 계정은 DB 연결 후 생성해야 해요.'
        : error instanceof Error ? error.message : '다시 시도해 주세요.');
    }
    finally {setBusy(false);}
  }
  return <div className="min-h-screen bg-[#f7f6ef] text-[#30392c]">
    <header className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-6"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e9eee2] text-[#526b48]"><Sprout size={24}/></span><div className="text-lg font-bold tracking-tight">부자할미 타이쿤<span className="block text-[9px] font-semibold tracking-[.22em] text-[#899380]">RICH GRANDMA TYCOON</span></div></header>
    <main className="mx-auto grid max-w-6xl gap-5 px-6 pb-16 pt-4 sm:gap-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:gap-16 lg:pt-12">
      <section className="relative overflow-hidden rounded-[28px] bg-[#e8eddf] p-5 sm:rounded-[32px] sm:p-12 lg:min-h-[620px]">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#dce6d0]"/><div className="absolute -bottom-24 -left-12 h-72 w-72 rounded-full bg-[#f5dfcd]"/>
        <div className="relative"><p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 text-[10px] font-semibold text-[#5d7452] sm:mb-4 sm:px-4 sm:py-2 sm:text-[11px]"><Sparkles size={14}/> 오늘의 기록이 내일의 집이 돼요</p><h1 className="max-w-lg text-[27px] font-extrabold leading-tight tracking-[-.06em] sm:text-[48px]">돈 모으는 하루,<br/><span className="text-[#65845b]">할미와 함께 시작해요.</span></h1><p className="mt-5 hidden max-w-md text-sm leading-7 text-[#6c7966] sm:block">가계부를 쓰고 목표를 이루며 나만의 캐릭터와 집을 키워보세요. 작은 기록 하나에도 성장의 재미를 담았어요.</p></div>
        <div className="relative mt-3 flex items-end justify-center rounded-[22px] border border-white/60 bg-gradient-to-b from-[#fdfbf0] to-[#e5d7c3] pt-1 shadow-[0_20px_55px_#526b4820] sm:mt-8 sm:rounded-[28px] sm:pt-5"><div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[#6b795e] shadow-sm sm:left-7 sm:top-7 sm:px-3 sm:py-2 sm:text-[11px]"><Wallet size={14}/> 오늘도 +10 XP</div><CharacterAvatar avatar={DEFAULT_AVATAR_CONFIG} useDefaultArtwork className="h-36 w-36 sm:h-80 sm:w-80"/><span className="absolute bottom-3 right-3 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[#6b795e] shadow-sm sm:bottom-5 sm:right-5 sm:px-3 sm:py-2 sm:text-[11px]">🌱 Lv.1부터 차근차근</span></div>
        <div className="relative mt-7 hidden grid-cols-2 gap-3 text-xs font-semibold text-[#5e7157] sm:grid"><span className="flex items-center gap-2"><TrendingUp size={16}/> 목표를 달성하며 성장</span><span className="flex items-center gap-2"><ShieldCheck size={16}/> 내 계정으로 안전하게 기록</span></div>
      </section>
      <section className="rounded-[28px] border border-[#e5e9dc] bg-white p-7 shadow-[0_24px_65px_#526b4812] sm:p-10" aria-label={mode==='login'?'로그인':'회원가입'}>
        <div className="mb-8 flex rounded-xl bg-[#f3f5ee] p-1" role="tablist" aria-label="계정 이용"><button type="button" role="tab" aria-selected={mode==='login'} onClick={()=>{setMode('login');setError('');setSubmitted(false);}} className={`flex-1 rounded-lg py-2.5 text-sm font-bold ${mode==='login'?'bg-white text-[#4e6948] shadow-sm':'text-[#8c9586]'}`}>로그인</button><button type="button" role="tab" aria-selected={mode==='register'} onClick={()=>{setMode('register');setError('');setSubmitted(false);}} className={`flex-1 rounded-lg py-2.5 text-sm font-bold ${mode==='register'?'bg-white text-[#4e6948] shadow-sm':'text-[#8c9586]'}`}>회원가입</button></div>
        <div className="mb-7"><span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf2e7] text-[#5d7854]"><LockKeyhole size={19}/></span><h2 className="text-2xl font-bold tracking-tight">{mode==='login'?'다시 만나 반가워요!':'할미와 첫날을 시작해요'}</h2><p className="mt-2 text-sm text-[#8a9386]">{mode==='login'?'아이디와 비밀번호로 내 마이룸에 들어가세요.':'필요한 정보만 입력하면 바로 시작할 수 있어요.'}</p></div>
        <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
          {mode==='register' && <><label className="block text-xs font-semibold">이름<input required maxLength={40} autoComplete="name" value={form.name} onChange={e=>set('name',e.target.value)} className="auth-input mt-2" placeholder="이름을 입력해 주세요"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">생년월일<input required type="date" autoComplete="bday" value={form.birthDate} onChange={e=>set('birthDate',e.target.value)} className="auth-input mt-2"/></label><label className="block text-xs font-semibold">휴대폰 번호<input required type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e=>set('phone',e.target.value)} className="auth-input mt-2" placeholder="010-1234-5678"/></label></div></>}
          <label className="block text-xs font-semibold">아이디<input required autoComplete="username" maxLength={20} value={form.username} onChange={e=>set('username',e.target.value)} className="auth-input mt-2" placeholder="영문으로 시작하는 4~20자"/></label>
          <label className="block text-xs font-semibold">비밀번호<input required type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='register'?8:undefined} value={form.password} onChange={e=>set('password',e.target.value)} className="auth-input mt-2" placeholder="비밀번호를 입력해 주세요"/></label>
          {mode==='register' && <p className="text-[11px] leading-5 text-[#8a9386]">영문 대문자·소문자·특수문자를 포함해 8자 이상 입력해 주세요.</p>}
          <button disabled={busy} type="submit" className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#58714e] px-5 py-3.5 text-sm font-bold text-white hover:bg-[#47623d] disabled:opacity-60">{busy?'확인하고 있어요...':mode==='login'?'로그인하고 시작하기':'회원가입하고 시작하기'}<ArrowRight size={16}/></button>
          {(error || setupError) && <p role={submitted?'alert':'status'} className="rounded-xl bg-[#fff2f0] px-4 py-3 text-xs leading-5 text-[#b6534d]">{error || setupError}</p>}
        </form>
        <p className="mt-7 text-center text-xs text-[#9ca398]">내 정보와 가계부는 계정별로 보관돼요.</p>
      </section>
    </main>
  </div>;
}
