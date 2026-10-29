import {useState,type FormEvent} from 'react';
import {accountApi} from '../lib/accountApi';

export default function AdminSetupPage() {
  const [setupToken,setSetupToken]=useState('');
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false);
  const [complete,setComplete]=useState(false);
  const [error,setError]=useState('');

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError('');
    if (password!==confirmation) {setError('비밀번호 확인이 일치하지 않아요.');return;}
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9\s]).{8,128}$/.test(password)) {
      setError('비밀번호는 8자 이상, 영문 대문자·소문자·특수문자를 포함해야 해요.');return;
    }
    setBusy(true);
    try {
      await accountApi.setupAdmin({setupToken,password});
      setSetupToken('');setPassword('');setConfirmation('');setComplete(true);
    } catch(cause) {setError(cause instanceof Error ? cause.message : '관리자 계정을 설정하지 못했어요.');}
    finally {setBusy(false);}
  }

  return <div className="min-h-screen bg-[#f7fafc] px-5 py-12 text-[#203744]">
    <main className="mx-auto max-w-md rounded-xl border border-[#dce7ee] bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold text-[#176897]">부자할미 타이쿤</p>
      <h1 className="mt-3 text-2xl font-bold">관리자 계정 설정</h1>
      {complete ? <div role="status" className="mt-6 space-y-4 text-sm leading-6">
        <p>관리자 계정 설정이 완료됐어요. 아이디 <strong>admin</strong>과 방금 지정한 비밀번호로 로그인해 주세요.</p>
        <p className="text-[#647784]">설정 코드는 한 번만 사용할 수 있어요. Vercel에 등록한 <code>ADMIN_SETUP_TOKEN</code>은 삭제해 주세요.</p>
        <a href="/" className="button-primary inline-flex">로그인 화면으로 이동</a>
      </div> : <>
        <p className="mt-3 text-sm leading-6 text-[#647784]">이 페이지는 관리자 설정 코드가 있어야 사용할 수 있으며, 계정 생성 후에는 다시 사용할 수 없어요.</p>
        <form onSubmit={submit} className="mt-6 space-y-5" aria-busy={busy}>
          <label className="block text-sm font-semibold">관리자 아이디<input className="auth-input" value="admin" readOnly aria-readonly="true"/></label>
          <label className="block text-sm font-semibold">관리자 설정 코드<input className="auth-input" type="password" autoComplete="off" required value={setupToken} onChange={event=>setSetupToken(event.target.value)} placeholder="Vercel에 설정한 코드"/></label>
          <label className="block text-sm font-semibold">새 비밀번호<input className="auth-input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={event=>setPassword(event.target.value)} placeholder="대문자·소문자·특수문자 포함, 8자 이상"/></label>
          <label className="block text-sm font-semibold">비밀번호 확인<input className="auth-input" type="password" autoComplete="new-password" required value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label>
          {error && <p role="alert" className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={busy} className="button-primary w-full !py-3 disabled:opacity-60">{busy?'설정하고 있어요...':'관리자 계정 만들기'}</button>
        </form>
        <a href="/" className="mt-6 inline-block text-sm text-[#647784] underline">로그인 화면으로 돌아가기</a>
      </>}
    </main>
  </div>;
}
