import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, Crown, Gift, House, LockKeyhole, PiggyBank, Shirt, Sparkles, Sprout, TrendingUp, Wallet } from 'lucide-react';
import { useAppStore } from '../store';
import { HOUSE_STAGES, progression } from '../lib/progression';
import { getSettlementMissions, type BonusRewardType } from '../lib/XpSettlementEngine';
import { getCharacterMood } from '../lib/characterMood';
import { todayDate } from '../lib/calendar';
import { formatWon } from '../lib/finance';
import CharacterPicker from './CharacterPicker';
import Dialog from './Dialog';
import RoomIllustration from './RoomIllustration';

const missionIcons = {MONTHLY_BUDGET: Wallet, MONTHLY_SAVING: PiggyBank, MONTHLY_INVEST: TrendingUp, ANNUAL_GOAL: Crown};

function Confetti({id}: {id: number}) {
  const colors = ['#b2c08d', '#deb980', '#e3b3ab', '#b5c8cc', '#bdaac6'];
  return <div key={id} className="confetti-layer" aria-hidden="true">{Array.from({length: 32}, (_, index) => <span key={index} style={{'--dx': `${Math.cos(index * 2.4) * (90 + index * 5)}px`, '--dy': `${-80 - (index % 7) * 32}px`, '--turn': `${index * 67}deg`, '--delay': `${index % 5 * 35}ms`, background: colors[index % colors.length]} as CSSProperties}/>)}</div>;
}

export default function HomeTab({onNavigate}: {onNavigate: (tab: number) => void}) {
  const state = useAppStore();
  const {character, budgetCodes, transactions, xpLogs, claimSettlement} = state;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [celebration, setCelebration] = useState<{id: number; title: string} | null>(null);
  const [today, setToday] = useState(todayDate);
  useEffect(() => {const timer = window.setInterval(() => setToday(todayDate()), 30_000);return () => window.clearInterval(timer);}, []);
  useEffect(() => {if (!celebration) return;const timer = window.setTimeout(() => setCelebration(null), 4500);return () => window.clearTimeout(timer);}, [celebration]);
  const month = today.slice(0, 7);
  const growth = progression(character.totalXp);
  const nextHouse = HOUSE_STAGES.find(house => house.stage === character.houseStage + 1);
  const missions = useMemo(() => getSettlementMissions(state, today), [state, today]);
  const mood = useMemo(() => getCharacterMood(state, today), [state, today]);
  const availableXp = missions.filter(mission => mission.eligible && !mission.claimed).reduce((sum, mission) => sum + mission.xpAmount, 0);
  const budget = budgetCodes.reduce((sum, code) => sum + code.monthlyLimit, 0);
  const expenses = transactions.filter(tx => tx.type === 'EXPENSE' && tx.txDate.startsWith(`${month}-`) && tx.txDate <= today).reduce((sum, tx) => sum + tx.amount, 0);
  const remaining = budget - expenses;
  const dailyClaimed = xpLogs.some(log => log.rewardType === 'DAILY_LOG' && log.referencePeriod === today);
  function claim(type: BonusRewardType) {
    const result = claimSettlement(type);setNotice(result.message);
    if (result.awarded && result.leveledUp) {
      const next = useAppStore.getState().character;
      setCelebration({id: Date.now(), title: result.houseUpgraded ? `새 집으로 이사했어요! Lv.${next.level}` : `레벨 업! Lv.${next.level}`});
    }
  }
  return <>
    <div className="eyebrow">GROW A LITTLE, DREAM A LITTLE BIGGER</div>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><h1>나의 마이룸<span className="text-forest">.</span></h1><p className="mt-2 text-sm text-stone-500">오늘의 작은 실천으로, 내일의 집을 키워요.</p></div><span className="rounded-full border border-[#dce3cc] bg-[#edf1e4] px-3 py-1.5 text-[11px] font-semibold text-forest">누적 {formatWon(character.totalXp)} XP</span></div>
    <section className="card mt-6 !p-0 overflow-hidden" aria-labelledby="house-title">
      <div className="px-5 pb-4 pt-5 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="house-title" className="text-base font-bold sm:text-lg"><span className="mr-2 text-forest">Lv.{character.level}</span>{growth.house.name}</h2><span className="text-[9px] font-semibold tracking-[2px] text-stone-400">STAGE 0{character.houseStage}</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="다음 집 업그레이드 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={growth.houseProgress} aria-valuetext={growth.remainingHouseXp ? `다음 집까지 ${growth.remainingHouseXp} XP` : '최고 단계 대저택 달성'}><div className="h-full rounded-full bg-[#8ca174] transition-[width] duration-500 motion-reduce:transition-none" style={{width: `${growth.houseProgress}%`}}/></div>
        <p className="mt-2 text-right text-[10px] text-stone-500">{growth.remainingHouseXp ? <>{nextHouse?.name}까지 <strong className="text-forest">{formatWon(growth.remainingHouseXp)} XP</strong></> : '돈 많은 할머니 달성! 나의 이야기는 계속돼요.'}</p>
      </div>
      <div className="relative bg-[#ebe9dc]">
        <div className="room-speech"><Sprout size={13}/><span>{celebration ? '야호! 오늘의 실천으로 한 뼘 더 자랐어!' : mood.message}</span></div>
        <RoomIllustration stage={character.houseStage} avatar={character.avatar} isCustomized={character.isCustomized} characterId={character.selectedCharacterId} expression={celebration ? 'happy' : mood.expression}/>
        {celebration && <><Confetti id={celebration.id}/><div className="level-celebration" role="status"><Sparkles size={20}/><span>{celebration.title}</span></div></>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><span className="text-xs text-stone-500">마음에 드는 캐릭터를 골라 언제든 바꿀 수 있어요.</span><button className="button-secondary" onClick={() => setPickerOpen(true)}><Shirt size={16}/>캐릭터 고르기</button></div>
    </section>
    <div className="mt-4 grid grid-cols-5 gap-1.5" aria-label="집 성장 단계">
      {HOUSE_STAGES.map(house => <div key={house.stage} aria-current={house.stage === character.houseStage ? 'step' : undefined} className={`rounded-lg border px-1 py-3 text-center ${house.stage <= character.houseStage ? 'border-[#dce3cf] bg-[#eef2e6]' : 'border-stone-200 bg-white text-stone-400'}`}>
        {house.stage <= character.houseStage ? <House size={16} className="mx-auto text-forest"/> : <LockKeyhole size={14} className="mx-auto"/>}<p className="mt-1.5 text-[9px] font-semibold">{['원룸','오피스텔','투룸 아파트','펜트하우스','대저택'][house.stage - 1]}</p><p className="mt-1 text-[8px] text-stone-400">{formatWon(house.minXp)} XP</p>
      </div>)}
    </div>
    <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="이번 달 활동 요약">
      <div className="card !p-5"><div className="flex items-center justify-between text-xs text-stone-500"><span>{Number(month.slice(5))}월 {remaining >= 0 ? '남은 예산' : '초과한 예산'}</span><Wallet size={17} className="text-forest"/></div><p className={`mt-3 text-2xl font-bold ${remaining < 0 ? 'text-rose-500' : ''}`}>{formatWon(Math.abs(remaining))}<span className="ml-1 text-sm font-normal">원</span></p><p className="mt-2 text-[10px] text-stone-400">지출 {formatWon(expenses)}원 / 설정 예산 {formatWon(budget)}원</p><button className="text-button mt-4" onClick={() => onNavigate(1)}>가계부 기록하기 <ArrowRight size={13}/></button></div>
      <div className="card !p-5 !bg-[#edf1e3]"><div className="flex items-center justify-between text-xs text-forest"><span>지금 받을 수 있는 보상</span><Gift size={17}/></div><p className="mt-3 text-2xl font-bold text-forest">+{formatWon(availableXp)}<span className="ml-1 text-sm font-normal">XP</span></p><p className="mt-2 text-[10px] text-stone-500">달성한 미션의 보상을 아래에서 받아요.</p><a href="#xp-missions" className="text-button mt-4">내 미션 확인하기 <ArrowRight size={13}/></a></div>
    </section>
    <section id="xp-missions" className="mt-8 scroll-mt-5" aria-labelledby="mission-title"><div className="section-title"><h2 id="mission-title" className="flex items-center gap-2"><Sparkles size={18}/>이번 달 / 올해 목표 달성 XP</h2><span className="text-[10px] text-stone-400">{month}</span></div>
      <div className="card !p-0 overflow-hidden divide-y divide-stone-100">
        <article className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="flex items-center gap-3"><span className="icon-box green"><Check size={18}/></span><div><h3 className="text-sm font-semibold">매일 가계부 한 줄</h3><p className="mt-1 text-[10px] text-stone-500">첫 기록을 저장하면 자동으로 +10 XP</p></div></div>{dailyClaimed ? <span className="mission-claimed"><Check size={13}/>오늘 수령 완료</span> : <button className="button-secondary" onClick={() => onNavigate(1)}>기록하러 가기</button>}</article>
        {missions.map(mission => {
          const Icon = missionIcons[mission.type];
          return <article key={mission.type} className="px-5 py-5" aria-label={mission.title}>
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className={`icon-box shrink-0 ${mission.type === 'ANNUAL_GOAL' ? 'peach' : 'green'}`}><Icon size={19}/></span><div className="min-w-0"><h3 className="text-sm font-semibold">{mission.title}</h3><p className="mt-1.5 break-words text-[11px] leading-relaxed text-stone-500">{mission.description}</p></div></div><span className="shrink-0 text-xs font-bold text-forest">+{formatWon(mission.xpAmount)} XP</span></div>
            <div className="mt-3 flex items-center justify-between gap-3 pl-[52px]"><span className="text-[10px] text-stone-400">{mission.period} · 1회 지급</span><button className={`min-h-9 rounded-lg px-3 py-2 text-[11px] font-semibold ${mission.claimed ? 'bg-stone-100 text-stone-400' : mission.eligible ? 'bg-forest text-white hover:bg-[#465d3e]' : 'bg-stone-100 text-stone-400'} disabled:cursor-default`} disabled={!mission.eligible || mission.claimed} onClick={() => claim(mission.type)} aria-label={`${mission.title} ${mission.claimed ? '수령 완료' : 'XP 받기'}`}>{mission.claimed ? '수령 완료' : mission.eligible ? 'XP 받기' : '목표 진행 중'}</button></div>
          </article>;
        })}
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-forest">{notice}</p>
      <details className="mt-2 rounded-lg border border-stone-200 bg-white p-4 text-[11px] leading-relaxed text-stone-500"><summary className="cursor-pointer font-semibold">보상은 어떻게 계산하나요?</summary><div className="mt-3 space-y-2"><p>오늘까지 입력한 기록과 현재 설정한 예산·목표로 달성을 확인해요. 예산 보상은 현재 지출이 한도 이하면 받을 수 있고, 수령 후 지출이 늘어도 회수하지 않아요. 같은 월·연도의 보상은 한 번만 지급해요.</p><p>투자는 통화별 원금 가중 수익률이 각각 목표를 충족해야 해요. 시세가 미확인인 종목이 있으면 보류해요. 연간 투자는 올해 종목별 최신 저장 평가액의 매수 원금 대비 수익률을 사용하며 월별 평가액을 더하지 않아요.</p><p>미설정 목표에는 보상을 지급하지 않아요. 직접 저장한 0원 목표는 0원 기준으로 판정해요. 다음 집은 누적 500 · 2,000 · 5,000 · 10,000 XP에 열려요.</p></div></details>
      <button className="text-button mt-4" onClick={() => onNavigate(4)}>목표와 예산 설정하기 <ArrowRight size={13}/></button>
    </section>
    {pickerOpen && <Dialog title="캐릭터 고르기" onClose={()=>setPickerOpen(false)} className="character-dialog"><div className="mt-5"><CharacterPicker onSelected={()=>{setPickerOpen(false);setNotice('내 캐릭터를 바꿨어요. 새로운 모습으로 함께해요!');}}/></div></Dialog>}
  </>;
}
