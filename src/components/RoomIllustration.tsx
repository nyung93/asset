import { useId } from 'react';
import type { AvatarConfig, CharacterExpression, FiveVariant } from '../types';
import CharacterAvatar from './CharacterAvatar';
import { HOUSE_STAGES } from '../lib/progression';

function Plant({x, y, scale = 1, golden = false}: {x: number; y: number; scale?: number; golden?: boolean}) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M0 10V-74m0 44-22-24m22 8 23-23" stroke="#6b8152" strokeWidth="4" fill="none"/>
    <ellipse cx="-15" cy="-63" rx="10" ry="25" fill="#8ca472" transform="rotate(-35 -15 -63)"/>
    <ellipse cx="16" cy="-75" rx="11" ry="26" fill="#b0bf8c" transform="rotate(30 16 -75)"/>
    <ellipse cx="-17" cy="-35" rx="12" ry="23" fill="#a1b680" transform="rotate(-50 -17 -35)"/>
    <ellipse cx="19" cy="-45" rx="11" ry="24" fill="#7d9563" transform="rotate(45 19 -45)"/>
    <path d="M-22 0h44l-5 39h-34Z" fill={golden ? '#c4aa6c' : '#ce9d83'}/><path d="M-24 0h48v8h-48Z" fill={golden ? '#e2cd94' : '#e4b89d'}/>
  </g>;
}

export default function RoomIllustration({stage, avatar, expression = 'neutral'}: {stage: FiveVariant; avatar: AvatarConfig; expression?: CharacterExpression}) {
  const uid = useId();
  const window = stage === 1 ? {x: 88, y: 69, width: 210, height: 85} : stage === 2 ? {x: 72, y: 48, width: 290, height: 180}
    : stage === 3 ? {x: 58, y: 33, width: 410, height: 196} : stage === 4 ? {x: 44, y: 28, width: 572, height: 207} : {x: 64, y: 23, width: 672, height: 220};
  const floor = ['#d4b89a', '#d9c2a4', '#dbc9b5', '#e5dbcb', '#eee4d5'][stage - 1];
  return <svg viewBox="0 0 800 460" role="img" aria-labelledby={`${uid}-title`} className="room-illustration block h-full w-full" data-testid="my-room" data-stage={stage}>
    <title id={`${uid}-title`}>{HOUSE_STAGES[stage - 1].name}과 나의 캐릭터</title>
    <defs>
      <linearGradient id={`${uid}-wall`} x2="0" y2="1"><stop stopColor={stage >= 4 ? '#f8f1e2' : '#f1ecdf'}/><stop offset="1" stopColor={stage >= 4 ? '#e8e6da' : '#e5e6d7'}/></linearGradient>
      <linearGradient id={`${uid}-sky`} x2="0" y2="1"><stop stopColor={stage === 4 ? '#bfd5d8' : '#d9e4d8'}/><stop offset="1" stopColor="#f9efcd"/></linearGradient>
      <clipPath id={`${uid}-window`}><rect {...window} rx={stage === 5 ? 80 : 9}/></clipPath>
      <pattern id={`${uid}-rug`} width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12 12 0M-6 6 6-6m0 24 12-12" stroke="#e4ded0" strokeWidth="1"/></pattern>
    </defs>
    <rect width="800" height="460" fill={`url(#${uid}-wall)`}/>
    <path d="M0 0h45v300L0 343Z" fill="#e2e1d2" opacity=".6"/>
    {stage >= 3 && <g stroke="#d6d5c4" fill="none" strokeWidth="2"><path d="M22 18h756v269H22Z"/><path d="M32 27h736v250H32Z"/></g>}
    <path d="M0 298h800v162H0Z" fill={floor}/>
    <path d="M0 298h800v9H0Z" fill="#b5af98" opacity=".55"/>
    {stage < 4 ? <g stroke="#c4aa8c" strokeWidth="1.5" opacity=".5"><path d="M0 351h800M0 406h800M100 298 18 460m242-162-48 162m208-162v162m160-162 52 162m108-162 75 162"/></g> : <g stroke="#ccc5b9" fill="none" opacity=".5"><path d="m0 400 410-98 390 98m-800 50 410-120 390 120M70 460l340-120 340 120"/></g>}
    <rect x={window.x - 9} y={window.y - 9} width={window.width + 18} height={window.height + 18} rx={stage === 5 ? 88 : 13} fill={stage >= 4 ? '#c6b482' : '#b6b49b'}/>
    <g clipPath={`url(#${uid}-window)`}>
      <rect {...window} fill={`url(#${uid}-sky)`}/>
      <circle cx={window.x + window.width - 50} cy={window.y + 42} r="26" fill="#fff4ce"/>
      <path d={`M${window.x + 20} ${window.y + 40}q25-22 48 0q22-12 38 5h-86Z`} fill="#fffdf2" opacity=".8"/>
      {stage === 1 ? <><path d="M80 127h235v40H80Z" fill="#b0b89f"/><path d="M86 135h230m-210-7v30m45-30v30m45-30v30m45-30v30" stroke="#919e87" strokeWidth="2"/><path d="m109 127 4-16 5 16m12 0 7-20 2 20m131 0 4-21 7 21" fill="#849570"/></> : stage < 4 ? <>
        {[0,1,2,3,4,5].map((i) => <g key={i} transform={`translate(${window.x + i * 72} ${window.y + 95 - i % 3 * 15})`}><path d={`M0 0h55v145H0Z`} fill={i % 2 ? '#b4c5bc' : '#c2cfc0'}/><path d="M12 15h8v13h-8zm20 0h8v13h-8zm-20 27h8v13h-8zm20 0h8v13h-8z" fill="#e9ead2"/></g>)}
        {stage === 3 && <><path d="M40 204h450v13H40Z" fill="#8b9f97"/><rect x="107" y="185" width="157" height="22" rx="8" fill="#e6e8d7"/>{[125,153,181,209,237].map(x => <rect key={x} x={x} y="190" width="16" height="9" rx="2" fill="#9caeac"/>)}</>}
      </> : stage === 4 ? <>
        <path d="M35 151h590v93H35Z" fill="#a4c5c6"/>
        <path d="M35 135h45v-45h26v38h31v-60h31v59h20v-31h36v42h54v-55h27v44h32v-62h35v69h31v-31h27v34h43v-39h27v41h58v-68h29v61h69v28H35Z" fill="#adbbb9"/>
        <path d="M80 169h510m-470 0q70-65 140 0q70-65 140 0q70-65 140 0" fill="none" stroke="#e9e6d3" strokeWidth="4"/>
        <path d="M260 128v57m140-57v57m140-57v57M70 207h140m155 7h110m53-18h80" stroke="#d4e4db" strokeWidth="3"/>
      </> : <>
        <path d="M55 155q180-65 350 0q180-65 345 0v100H55Z" fill="#b1c496"/>
        {[95,185,620,710].map((x, i) => <g key={x}><path d={`M${x} 160v-75`} stroke="#a19770" strokeWidth="9"/><ellipse cx={x} cy={85 + i % 2 * 15} rx="38" ry="50" fill={i % 2 ? '#9db383' : '#a5bb8d'}/><circle cx={x - 15} cy={80 + i % 2 * 15} r="21" fill="#bbcea3"/></g>)}
        <path d="M379 169h42l60 86H319Z" fill="#efe2be"/><ellipse cx="400" cy="175" rx="45" ry="12" fill="#e5dfc5"/><ellipse cx="400" cy="172" rx="35" ry="7" fill="#adcbd0"/><path d="M400 171v-31m-20 14q20-40 40 0" fill="none" stroke="#d6e7df" strokeWidth="3"/>
        {[115,163,650,690].map(x => <g key={x}><path d={`M${x} 218v-25`} stroke="#78965c" strokeWidth="2"/><circle cx={x} cy="193" r="6" fill="#d39b9e"/></g>)}
      </>}
    </g>
    <g stroke={stage >= 4 ? '#c6b482' : '#b6b49b'} strokeWidth={stage === 5 ? 7 : 5}><path d={`M${window.x + window.width / 2} ${window.y}v${window.height}`}/>{stage >= 3 && <path d={`M${window.x + window.width / 4} ${window.y}v${window.height}m${window.width / 2} 0v-${window.height}`}/>}</g>
    <path d={`M${window.x - 15} ${window.y + window.height + 11}h${window.width + 30}`} stroke="#f9f3df" strokeWidth="10" strokeLinecap="round"/>
    {stage < 4 && <g transform={`translate(${stage === 1 ? 543 : stage === 2 ? 480 : 651} 87)`}><rect x="0" y="0" width="83" height="102" rx="4" fill="#b1a083"/><rect x="6" y="6" width="71" height="90" fill="#faf1dc"/><circle cx="42" cy="40" r="19" fill="#d6b58c"/><path d="M10 89 35 53 53 76 69 57 77 96H6Z" fill="#9eae8a"/></g>}
    {stage === 1 ? <g><rect x="492" y="279" width="222" height="69" rx="12" fill="#beb9a0"/><path d="M501 345v14m203-14v14" stroke="#968269" strokeWidth="8"/><rect x="492" y="278" width="222" height="43" rx="10" fill="#eeead9"/><path d="M595 279h119v48H595Z" fill="#a9b8a3"/><rect x="510" y="282" width="68" height="27" rx="10" fill="#d9cebd"/></g> : <g data-testid="room-sofa">
      <path d="M492 354v16m231-16v16" stroke="#8b795b" strokeWidth="8"/>
      <rect x="483" y="263" width="250" height="90" rx="20" fill={stage >= 4 ? '#9aaa8b' : '#b8b89e'}/>
      <path d="M492 315h231v41H492Z" fill={stage >= 4 ? '#b3bea1' : '#d2ceb2'}/>
      <rect x="474" y="295" width="25" height="63" rx="9" fill="#a2ad8d"/><rect x="720" y="295" width="25" height="63" rx="9" fill="#a2ad8d"/>
      <rect x="513" y="279" width="44" height="39" rx="7" fill="#e8d4b2" transform="rotate(-10 535 299)"/><rect x="654" y="279" width="44" height="39" rx="7" fill="#d8b3a1" transform="rotate(10 675 299)"/>
      {stage >= 3 && <path d="M575 315v36m65-36v36" stroke="#98a586" strokeWidth="2"/>}
    </g>}
    <ellipse cx="371" cy="397" rx={stage >= 3 ? 184 : 137} ry={stage >= 3 ? 42 : 33} fill={stage >= 4 ? '#f7efdb' : '#e8dfc9'}/>
    <ellipse cx="371" cy="397" rx={stage >= 3 ? 175 : 128} ry={stage >= 3 ? 35 : 27} fill={`url(#${uid}-rug)`}/>
    <g transform="translate(135 278)"><path d="M-45 30v49m93-49v49" stroke="#a58b68" strokeWidth="7"/><rect x="-52" y="8" width="109" height="35" rx="4" fill="#bea887"/><path d="M-45 22h94" stroke="#e4d1af" strokeWidth="2"/><circle cx="4" cy="28" r="3" fill="#8a785b"/><path d="M-34 2h30v6h-30z" fill="#8b9e86"/><path d="M-30-3h30v5h-30z" fill="#d3b6a0"/><path d="M25 6v-35" stroke="#9b8967" strokeWidth="4"/><path d="M10-29h30l9 25H0Z" fill="#f6e6bf"/><ellipse cx="25" cy="7" rx="12" ry="3" fill="#a28f6b"/></g>
    <Plant x={stage === 1 ? 84 : 66} y={stage === 1 ? 272 : 301} scale={stage === 1 ? .6 : 1} golden={stage >= 4}/>
    {stage >= 3 && <Plant x={758} y={272} scale={.8} golden={stage >= 4}/>}
    {stage >= 4 && <g data-testid="room-chandelier" stroke="#c6ad70" fill="none" strokeWidth="3"><path d="M400 0v39m-37 15q0 30 37 30t37-30m-18-9q0 16-19 24t-19-24m19-6v48"/>{[363,381,400,419,437].map((x, i) => <g key={x}><path d={`M${x} ${i === 2 ? 75 : i % 2 ? 44 : 54}v-15`}/><ellipse cx={x} cy={i === 2 ? 58 : i % 2 ? 27 : 37} rx="4" ry="7" fill="#fff3c8" stroke="none"/></g>)}<path d="m388 84 12 22 12-22Z" fill="#e1d5ae" strokeWidth="1"/></g>}
    {stage >= 3 && <g transform="translate(592 371)"><path d="m-34 0-12 36m79-36 12 36" stroke="#a5906a" strokeWidth="6"/><ellipse rx="66" ry="19" fill={stage === 5 ? '#f8f3e5' : '#c7b28b'}/><ellipse cx="-15" cy="-4" rx="13" ry="4" fill="#9aab8c"/><path d="M-25-5v-12h20v12" fill="#f3ecd6"/><path d="M-5-14q10 0 5 8" fill="none" stroke="#f3ecd6" strokeWidth="3"/><rect x="13" y="-7" width="28" height="7" rx="2" fill="#b59890"/></g>}
    <CharacterAvatar avatar={avatar} expression={expression} x="289" y="137" width="204" height="295" data-testid="room-avatar"/>
    <g fill="#fff9df" opacity=".7"><path d="m247 269 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"/>{stage >= 4 && <path d="m458 235 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"/>}</g>
  </svg>;
}
