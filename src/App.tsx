import { useState } from 'react';
import { Home, CalendarDays, ChartNoAxesCombined, TrendingUp, Settings2, Sprout, ChevronRight } from 'lucide-react';
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
const tabs = [
  {name: '홈', sub: '마이룸', icon: Home},
  {name: '캘린더', sub: '가계부', icon: CalendarDays},
  {name: '통계', sub: '리포트', icon: ChartNoAxesCombined},
  {name: '투자', sub: '포트폴리오', icon: TrendingUp},
  {name: '목표 & 설정', sub: '나의 계획', icon: Settings2},
];
export default function App() {
  const [tab, setTab] = useState(0);
  const state = useAppStore();
  const character = state.character;
  const mood = getCharacterMood(state, todayDate());
  const growth = progression(character.totalXp);
  return <div className="min-h-screen bg-cream">
    <header className="topbar"><div className="topbar-inner">
      <a href="#" onClick={event => {event.preventDefault();setTab(0);}} className="brand"><span className="brand-icon"><Sprout size={23}/></span><div>부자할미 타이쿤<span>RICH GRANDMA TYCOON</span></div></a>
      <div className="profile"><span className="text-xs font-bold text-forest">Lv.{character.level}</span><CharacterAvatar avatar={character.avatar} expression={mood.expression} className="h-10 w-10 rounded-full bg-[#eeeadd]"/><span className="hidden text-sm sm:inline">{character.houseStage === 5 ? '돈 많은 할미' : '미래의 부자할미'}</span></div>
    </div></header>
    <div className="app-shell">
      <aside className="sidebar"><p className="eyebrow mb-4 px-4">MY LITTLE WEALTH</p>
        <nav aria-label="메인 메뉴">{tabs.map((item, index) => <button key={item.name} onClick={() => setTab(index)} className={`side-tab ${index === tab ? 'active' : ''}`} aria-current={index === tab ? 'page' : undefined}><item.icon size={20}/><span>{item.name}<small>{item.sub}</small></span>{index === tab && <ChevronRight size={15} className="ml-auto"/>}</button>)}</nav>
        <div className="journey"><span>🌱</span><p>차근차근, 부자의 습관</p><small>오늘도 나의 미래를 가꾸는 중</small><div className="mt-4 h-1.5 rounded bg-stone-200"><div className="h-full rounded bg-forest" style={{width: `${character.currentXp / growth.levelSpan * 100}%`}}/></div><div className="mt-2 flex justify-between text-[10px] text-stone-500"><span>LEVEL {character.level}</span><span>{character.currentXp} / {growth.levelSpan} XP</span></div></div>
      </aside>
      <main className="main-content" key={tab}>
        {tab === 0 ? <HomeTab onNavigate={setTab}/> : tab === 1 ? <CalendarTab/> : tab === 2 ? <StatisticsTab/> : tab === 3 ? <InvestmentTab/> : <GoalsAndSettingsTab/>}
      </main>
    </div>
    <nav className="bottom-nav" aria-label="하단 탭">{tabs.map((item, index) => <button key={item.name} onClick={() => setTab(index)} aria-current={tab === index ? 'page' : undefined} className={tab === index ? 'selected' : ''}><item.icon size={20}/><span>{item.name}</span></button>)}</nav>
  </div>;
}
