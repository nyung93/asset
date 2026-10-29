import {useState,type FormEvent} from 'react';
import {ArrowLeft,LogOut,Save} from 'lucide-react';
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
      const result=await accountApi.updateProfile({userId:user.id,birthDate,phone,currentPassword,newPassword});
      onUpdated(result.user);setCurrentPassword('');setNewPassword('');setNotice('내 정보를 저장했어요.');
    } catch(error) {setNotice(error instanceof Error?error.message:'저장하지 못했어요.');}
    finally {setBusy(false);}
  }
  return <div className="mx-auto max-w-2xl space-y-6"><button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-[#647784]"><ArrowLeft size={16}/> 마이룸으로 돌아가기</button><div><p className="eyebrow">내 계정</p><h1 className="mt-2">마이페이지</h1><p className="mt-2 text-sm text-[#647784]">내 정보를 확인하고 필요한 항목을 수정해요.</p></div>
    <section className="card" aria-labelledby="character-picker-title"><div className="mb-4"><p className="eyebrow">캐릭터</p><h2 id="character-picker-title" className="mt-2 text-lg font-bold">캐릭터 고르기</h2></div><CharacterPicker/></section>
    <form onSubmit={save} className="card space-y-5"><div className="mb-2"><h2 className="text-lg font-bold">기본 정보</h2><p className="mt-1 text-xs text-[#647784]">이름과 아이디는 변경할 수 없어요.</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">이름<input readOnly value={user.name} className="auth-input mt-2 bg-[#f7fafc] text-[#647784]"/></label><label className="block text-xs font-semibold">아이디<input readOnly value={user.username} className="auth-input mt-2 bg-[#f7fafc] text-[#647784]"/></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">생년월일<input required type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} className="auth-input mt-2"/></label><label className="block text-xs font-semibold">휴대폰 번호<input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="auth-input mt-2"/></label></div>
      <div className="border-t border-[#dce7ee] pt-5"><div className="mb-4 font-bold">비밀번호 변경</div><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">현재 비밀번호<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} className="auth-input mt-2" placeholder="변경할 때 입력"/></label><label className="block text-xs font-semibold">새 비밀번호<input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="auth-input mt-2" placeholder="대소문자·특수문자 포함 8자 이상"/></label></div></div>
      {notice && <p role="status" className="text-xs text-[#647784]">{notice}</p>}<button disabled={busy} className="button-primary" type="submit"><Save size={16}/>{busy?'저장 중...':'내 정보 저장'}</button>
    </form><button onClick={()=>void onLogout()} className="inline-flex items-center gap-2 text-xs font-semibold text-[#a65d57]"><LogOut size={16}/> 로그아웃</button>
  </div>;
}
