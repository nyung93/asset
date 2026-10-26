import {useState,type FormEvent} from 'react';
import {ArrowLeft,LockKeyhole,LogOut,Save,UserRound} from 'lucide-react';
import {accountApi,type AccountUser} from '../lib/accountApi';
import CharacterPicker from './CharacterPicker';

export default function MyPage({user,onUpdated,onLogout,onBack}: {user:AccountUser;onUpdated:(user:AccountUser)=>void;onLogout:()=>Promise<void>;onBack:()=>void}) {
  const [birthDate,setBirthDate]=useState(user.birthDate);
  const [phone,setPhone]=useState(user.phone);
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  async function save(event:FormEvent) {
    event.preventDefault();setBusy(true);setNotice('');
    try {
      const result=await accountApi.updateProfile({birthDate,phone,currentPassword,newPassword});
      onUpdated(result.user);setCurrentPassword('');setNewPassword('');setNotice('내 정보를 저장했어요.');
    } catch(error) {setNotice(error instanceof Error?error.message:'저장하지 못했어요.');}
    finally {setBusy(false);}
  }
  return <div className="mx-auto max-w-2xl space-y-6"><button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-[#69815f]"><ArrowLeft size={16}/> 마이룸으로 돌아가기</button><div><p className="eyebrow">MY ACCOUNT</p><h1 className="mt-2">마이페이지</h1><p className="mt-2 text-sm text-[#8a9386]">내 정보를 확인하고 필요한 항목을 수정해요.</p></div>
    <section className="card" aria-labelledby="character-picker-title"><div className="mb-4"><p className="eyebrow">MY CHARACTER</p><h2 id="character-picker-title" className="mt-2 text-lg font-bold">캐릭터 고르기</h2></div><CharacterPicker/></section>
    <form onSubmit={save} className="card space-y-5"><div className="mb-2 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf1e7] text-[#58714e]"><UserRound size={20}/></span><div><h2 className="font-bold">기본 정보</h2><p className="text-xs text-[#9aa395]">이름과 아이디는 변경할 수 없어요.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">이름<input readOnly value={user.name} className="auth-input mt-2 bg-[#f5f6f1] text-[#8c9587]"/></label><label className="block text-xs font-semibold">아이디<input readOnly value={user.username} className="auth-input mt-2 bg-[#f5f6f1] text-[#8c9587]"/></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">생년월일<input required type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} className="auth-input mt-2"/></label><label className="block text-xs font-semibold">휴대폰 번호<input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="auth-input mt-2"/></label></div>
      <div className="border-t border-[#edf0e8] pt-5"><div className="mb-4 flex items-center gap-2 font-bold"><LockKeyhole size={17} className="text-[#69815f]"/> 비밀번호 변경</div><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">현재 비밀번호<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} className="auth-input mt-2" placeholder="변경할 때 입력"/></label><label className="block text-xs font-semibold">새 비밀번호<input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="auth-input mt-2" placeholder="대소문자·특수문자 포함 8자 이상"/></label></div></div>
      {notice && <p role="status" className="text-xs text-[#667f59]">{notice}</p>}<button disabled={busy} className="button-primary" type="submit"><Save size={16}/>{busy?'저장 중...':'내 정보 저장'}</button>
    </form><button onClick={()=>void onLogout()} className="inline-flex items-center gap-2 text-xs font-semibold text-[#a65d57]"><LogOut size={16}/> 로그아웃</button>
  </div>;
}
