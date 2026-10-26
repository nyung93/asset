import { useState } from 'react';
import { Check, Dice5, RotateCcw } from 'lucide-react';
import type { AvatarConfig } from '../types';
import { useAppStore } from '../store';
import { AVATAR_PARTS, referenceOptions, selectedReference, type AvatarPart, type ReferenceValue } from '../data/avatarReferences';
import { resolveAvatar } from '../lib/avatar';
import AvatarReferencePreview from './AvatarReferencePreview';
import CharacterAvatar from './CharacterAvatar';
import Dialog from './Dialog';

export default function CharacterCreator({onClose, onSaved}: {onClose: () => void; onSaved: () => void}) {
  const avatar = useAppStore(s => s.character.avatar);
  const isCustomized = useAppStore(s => s.character.isCustomized);
  const customize = useAppStore(s => s.customizeAvatar);
  const [draft, setDraft] = useState<AvatarConfig>(() => resolveAvatar(avatar));
  const [part, setPart] = useState<AvatarPart>('hair');
  const [backdrop, setBackdrop] = useState('#e9efe2');
  const [error, setError] = useState('');
  const current = AVATAR_PARTS.find(item => item.key === part)!;
  const options = referenceOptions(part);
  const selected = selectedReference(draft, part);
  function choose(value: ReferenceValue) {
    setDraft(previous => ({...previous, [part]: value} as AvatarConfig));
    setError('');
  }
  function randomize() {
    setDraft(previous => {
      let next = {...previous};
      for (const {key} of AVATAR_PARTS) {
        const choices = referenceOptions(key);
        next = {...next, [key]: choices[Math.floor(Math.random() * choices.length)].value};
      }
      return next;
    });
  }
  function save() {
    try {customize(draft);onSaved();} catch (error) {setError(error instanceof Error ? error.message : '선택을 저장하지 못했어요.');}
  }
  return <Dialog title={isCustomized ? '내 캐릭터 옷장' : '나만의 캐릭터 만들기'} onClose={onClose} className="character-dialog">
    <p className="mt-2 text-xs leading-relaxed text-stone-500">헤어부터 손에 든 작은 소품까지, 고르는 순간 나만의 캐릭터가 완성돼요.</p>
    <div className="mt-5 grid items-start gap-5 sm:grid-cols-[220px_1fr]">
      <figure className="overflow-hidden rounded-2xl border border-[#e4e8dc] bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-2 text-[10px]"><span className="font-semibold tracking-wider text-forest">MY LITTLE ME</span><span className="text-stone-400">실시간 미리보기</span></div>
        <div className="rounded-xl transition-colors" style={{backgroundColor:backdrop}} data-testid="avatar-backdrop">
          <CharacterAvatar avatar={draft} className="h-64 w-full sm:h-80" data-testid="character-preview"/>
        </div>
        <div className="mt-3 flex justify-center gap-2" role="group" aria-label="배경 미리보기">
          {[['연두','#e9efe2'],['살구','#f8e2cf'],['밤하늘','#354a60']].map(([label,color])=><button key={color} type="button" aria-label={`${label} 배경`} aria-pressed={backdrop===color} onClick={()=>setBackdrop(color)} className={`h-6 w-6 rounded-full border border-black/10 ${backdrop===color ? 'ring-2 ring-forest ring-offset-2' : ''}`} style={{backgroundColor:color}}/>)}
        </div>
        <figcaption className="mt-3 border-t border-stone-100 pt-3 text-center text-xs font-semibold" aria-live="polite">{current.label} · {selected.label}</figcaption>
      </figure>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="커스터마이징 파츠">
          {AVATAR_PARTS.map(item => <button type="button" key={item.key} onClick={() => setPart(item.key)} aria-pressed={part === item.key}
            className={`rounded-lg px-3 py-2 text-xs ${part === item.key ? 'bg-forest font-semibold text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}>{item.label}</button>)}
        </div>
        <div className="mb-3 mt-5 flex items-center justify-between"><h3 className="text-sm font-semibold">{current.label} 선택</h3><span className="text-[10px] text-stone-400">{options.findIndex(item => item.id === selected.id) + 1} / {options.length}</span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label={`${current.label} 옵션`}>
          {options.map((reference, index) => {
            const isSelected = reference.id === selected.id;
            return <button type="button" key={reference.id} aria-label={`${current.label} ${index + 1}: ${reference.label}`} aria-pressed={isSelected}
              onClick={() => choose(reference.value)}
              className={`relative flex min-h-32 flex-col items-center gap-2 overflow-hidden rounded-xl border p-2 ${isSelected ? 'border-forest bg-[#f2f5ec] ring-1 ring-forest' : 'border-stone-200 bg-white hover:border-stone-400'}`}>
              <AvatarReferencePreview reference={reference} decorative className="h-24 w-full"/>
              <span className="text-center text-[10px] font-medium leading-tight">{reference.label}</span>
              {isSelected && <Check size={14} className="absolute right-1.5 top-1.5 rounded-full bg-white text-forest"/>}
            </button>;
          })}
        </div>
      </div>
    </div>
    <p className="mt-4 rounded-lg bg-[#f5f6ef] px-3 py-2 text-xs leading-relaxed text-stone-600">의상에는 어울리는 신발이 함께해요. 머리 장식과 손 소품을 함께 착용할 수 있어요. 저장한 모습은 마이룸과 가계부에도 적용돼요.</p>
    <p role="alert" className="mt-3 min-h-5 text-sm text-rose-500">{error}</p>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
      <div className="flex flex-wrap gap-3"><button type="button" className="text-button" onClick={() => setDraft(resolveAvatar(avatar))}><RotateCcw size={14}/>저장한 선택으로 되돌리기</button><button type="button" className="text-button" onClick={randomize}><Dice5 size={14}/>랜덤 꾸미기</button></div>
      <div className="flex gap-2"><button type="button" className="button-secondary" onClick={onClose}>취소</button><button type="button" className="button-primary" onClick={save}><Check size={16}/>{isCustomized ? '캐릭터 저장' : '캐릭터 완성하기'}</button></div>
    </div>
  </Dialog>;
}
