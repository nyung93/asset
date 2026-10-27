import {useState} from 'react';
import {Check} from 'lucide-react';
import {CHARACTER_CHOICES} from '../data/characterChoices';
import {useAppStore} from '../store';
import type {CharacterImageId} from '../types';
import CharacterAvatar from './CharacterAvatar';

export default function CharacterPicker({onSelected}: {onSelected?:(id:CharacterImageId)=>void}) {
  const character=useAppStore(state=>state.character);
  const selectCharacter=useAppStore(state=>state.selectCharacter);
  const [notice,setNotice]=useState('');
  const selected=character.selectedCharacterId ?? (!character.isCustomized ? 'default' : null);
  function choose(id:CharacterImageId) {
    if (selected!==id || !character.selectedCharacterId) selectCharacter(id);
    setNotice(`${CHARACTER_CHOICES.find(choice=>choice.id===id)?.label} 캐릭터를 선택했어요.`);
    onSelected?.(id);
  }
  return <>
    <p className="mb-4 text-xs leading-5 text-slate-500">마음에 드는 캐릭터를 누르면 바로 저장돼요. 마이룸과 가계부에도 같은 모습이 보여요.</p>
    {character.isCustomized && !character.selectedCharacterId && <p className="mb-4 rounded-lg bg-[#f7fafc] p-3 text-xs text-slate-600">이전에 만든 캐릭터를 사용 중이에요. 아래 5개 중 하나를 선택하면 새 모습으로 바뀌어요.</p>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="group" aria-label="캐릭터 선택">
      {CHARACTER_CHOICES.map(choice=>{
        const active=selected===choice.id;
        return <button key={choice.id} type="button" aria-label={`${choice.label} 선택`} aria-pressed={active} data-testid={`character-choice-${choice.id}`}
          onClick={()=>choose(choice.id)} className={`relative overflow-hidden rounded-2xl border p-3 text-left transition-colors ${active ? 'border-forest bg-[#eaf4fb] ring-1 ring-forest' : 'border-slate-200 bg-white hover:border-[#8a9ba6]'}`}>
          {active && <span className="absolute right-2 top-2 z-10 rounded-full bg-forest p-1 text-white"><Check size={13}/></span>}
          <span className="mb-2 flex h-36 items-end justify-center overflow-hidden rounded-xl bg-[#eaf4fb] sm:h-40">
            <CharacterAvatar avatar={character.avatar} characterId={choice.id} className="h-full w-full" aria-hidden="true"/>
          </span>
          <span className="block text-sm font-bold text-[#27343e]">{choice.label}</span>
          <span className="mt-1 block text-xs leading-4 text-slate-500">{choice.description}</span>
          {active && <span className="mt-2 block text-xs font-bold text-forest">현재 캐릭터</span>}
        </button>;
      })}
    </div>
    {notice && <p className="mt-3 text-xs text-forest" role="status" aria-live="polite">{notice}</p>}
  </>;
}
