import {useState, type FormEvent} from 'react';
import CharacterAvatar from './CharacterAvatar';
import {DEFAULT_AVATAR_CONFIG} from '../lib/avatar';
import {accountApi, AccountApiError, type AccountSession} from '../lib/accountApi';

export default function AuthShell({onAuthenticated, setupError}: {onAuthenticated:(session:AccountSession)=>Promise<void>; setupError?:string}) {
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [form, setForm] = useState({name:'', birthDate:'', phone:'', username:'', password:''});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const set = (key:keyof typeof form, value:string) => setForm(previous => ({...previous, [key]:value}));
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSubmitted(true);
    if (mode === 'register' && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9\s]).{8,128}$/.test(form.password)) {
      setError('비밀번호는 8자 이상, 영문 대문자·소문자·특수문자를 포함해야 해요.'); return;
    }
    setBusy(true);
    try {
      const session = mode === 'register' ? await accountApi.register(form) : await accountApi.login({username:form.username, password:form.password});
      await onAuthenticated(session);
    } catch (cause) {
      setError(cause instanceof AccountApiError && cause.code === 'setup_required'
        ? 'Firebase 연결이 아직 완료되지 않았어요. 서버 설정 후 다시 시도해 주세요.'
        : cause instanceof Error ? cause.message : '다시 시도해 주세요.');
    } finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-cream text-ink">
    <header className="mx-auto max-w-6xl px-6 py-6 sm:py-8"><div className="text-lg font-bold tracking-tight">부자할미 타이쿤</div></header>
    <main className="mx-auto grid max-w-6xl gap-8 px-6 pb-16 pt-2 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:gap-16 lg:pt-10">
      <section className="relative flex min-h-[340px] flex-col justify-between overflow-hidden rounded-lg bg-[#eaf4fb] px-6 pt-8 sm:min-h-[560px] sm:px-12 sm:pt-12">
        <div className="relative z-10"><p className="eyebrow">작은 기록, 달라지는 내일</p><h1 className="mt-4 max-w-lg !text-[clamp(2rem,4vw,3.25rem)] leading-[1.2]">오늘 쓴 가계부가<br/><span className="text-forest">다음 집의 시작이에요.</span></h1><p className="mt-5 max-w-sm text-sm leading-7 text-[#526b7b]">수입과 지출을 기록하고, 목표를 지키며 내 자산이 자라는 과정을 확인해 보세요.</p></div>
        <div className="relative mt-4 flex justify-center sm:mt-0"><CharacterAvatar avatar={DEFAULT_AVATAR_CONFIG} useDefaultArtwork className="h-44 w-44 sm:h-72 sm:w-72"/></div>
      </section>
      <section className="mx-auto w-full max-w-md" aria-label={mode === 'login' ? '로그인' : '회원가입'}>
        <div className="mb-8 flex border-b border-[#dce7ee]" role="tablist" aria-label="계정 이용">
          {(['login', 'register'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => {setMode(value); setError(''); setSubmitted(false);}} className={`-mb-px flex-1 border-b-2 py-3 text-sm font-semibold ${mode === value ? 'border-forest text-forest' : 'border-transparent text-[#647784]'}`}>{value === 'login' ? '로그인' : '회원가입'}</button>)}
        </div>
        <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-bold">{mode === 'login' ? '내 마이룸에 들어가기' : '새 계정 만들기'}</h2>
        <p className="mt-2 text-sm text-[#647784]">{mode === 'login' ? '아이디와 비밀번호를 입력해 주세요.' : '기본 정보를 입력하면 바로 시작할 수 있어요.'}</p>
        <form onSubmit={submit} className="mt-8 space-y-5" aria-busy={busy}>
          {mode === 'register' && <><label className="block text-sm font-semibold">이름<input required maxLength={40} autoComplete="name" value={form.name} onChange={e => set('name', e.target.value)} className="auth-input" placeholder="이름을 입력해 주세요"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">생년월일<input required type="date" autoComplete="bday" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} className="auth-input"/></label><label className="block text-sm font-semibold">휴대폰 번호<input required type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className="auth-input" placeholder="010-1234-5678"/></label></div></>}
          <label className="block text-sm font-semibold">아이디<input required autoComplete="username" maxLength={20} value={form.username} onChange={e => set('username', e.target.value)} className="auth-input" placeholder="영문으로 시작하는 4~20자"/></label>
          <label className="block text-sm font-semibold">비밀번호<input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} value={form.password} onChange={e => set('password', e.target.value)} className="auth-input" placeholder="비밀번호를 입력해 주세요"/></label>
          {mode === 'register' && <p className="text-xs leading-5 text-[#647784]">8자 이상 · 영문 대문자·소문자·특수문자 포함</p>}
          <button disabled={busy} type="submit" className="button-primary mt-2 w-full !py-3.5 disabled:opacity-60">{busy ? '확인하고 있어요...' : mode === 'login' ? '로그인하고 시작하기' : '회원가입하고 시작하기'}</button>
          {(error || setupError) && <p role={submitted ? 'alert' : 'status'} className="rounded-md bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{error || setupError}</p>}
        </form>
        <p className="mt-8 border-t border-[#dce7ee] pt-5 text-xs text-[#647784]">내 정보와 가계부는 계정별로 보관돼요.</p>
      </section>
    </main>
  </div>;
}
