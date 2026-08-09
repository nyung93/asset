import './style.css';
import { fetchAccounts, saveAccount, deleteAccount, fetchUserData, saveUserData } from './db.js';

const GROUPS = ['수입', '저축/투자', '고정지출', '변동지출', '이쁜이'];
const GC = {
  '수입':    { c:'#12864f', bg:'#e6f5ed', fg:'#0d6b40' },
  '저축/투자':{ c:'#1a57d6', bg:'#e4ecfc', fg:'#134aad' },
  '고정지출': { c:'#4b4fc4', bg:'#ecedfb', fg:'#3a3ea8' },
  '변동지출': { c:'#b5720d', bg:'#fbf2e3', fg:'#8f5a08' },
  '이쁜이':  { c:'#c24a7a', bg:'#fbecf2', fg:'#a63c66' }
};
const AT = {
  '현금':  { c:'#1a57d6', bg:'#e4ecfc', fg:'#134aad' },
  '적금':  { c:'#4b4fc4', bg:'#ecedfb', fg:'#3a3ea8' },
  '예금':  { c:'#0f7d78', bg:'#e5f4f3', fg:'#0c6864' },
  '연금':  { c:'#c24a7a', bg:'#fbecf2', fg:'#a63c66' },
  '주식':  { c:'#d33f3f', bg:'#fdeceb', fg:'#b23333' },
  '청약':  { c:'#12864f', bg:'#e6f5ed', fg:'#0d6b40' },
  '대출':  { c:'#9aa3b0', bg:'#eceff5', fg:'#6b7482' }
};
const AT_ORDER = ['현금','적금','예금','연금','주식','청약','대출'];
const DEF_CATS = [
  {name:'고정수입',group:'수입'},{name:'부수입',group:'수입'},
  {name:'연금저축',group:'저축/투자'},{name:'적금',group:'저축/투자'},
  {name:'ETF',group:'저축/투자'},{name:'청약',group:'저축/투자'},
  {name:'통신/구독',group:'고정지출'},{name:'관리비',group:'고정지출'},
  {name:'보험',group:'고정지출'},{name:'계모임',group:'고정지출'},
  {name:'취미',group:'변동지출'},{name:'쇼핑',group:'변동지출'},
  {name:'점심식대',group:'변동지출'},{name:'경조사',group:'변동지출'},
  {name:'이쁜이약값',group:'이쁜이'},{name:'이쁜이병원',group:'이쁜이'},
  {name:'이쁜이사료',group:'이쁜이'}
];
const QPOOL = [
  '어릴 때 살던 동네 이름은?','기억에 남는 선생님 성함은?','처음 키운 반려동물 이름은?',
  '가장 좋아하는 음식은?','부모님이 태어난 도시는?','첫 직장 이름은?'
];
const INACTIVITY_MS = 30 * 60 * 1000; // 30분 비활동 자동 로그아웃

const hashFn = s => { let h=5381,t=String(s); for(let i=0;i<t.length;i++) h=(((h<<5)+h)^t.charCodeAt(i))>>>0; return 'sha·'+h.toString(36)+t.length.toString(36); };
const won   = n => '₩'+Math.round(n).toLocaleString('ko-KR');
const short = n => { const a=Math.abs(n); if(a>=1e8) return (n/1e8).toFixed(a>=1e9?0:1).replace(/\.0$/,'')+'억'; if(a>=1e4) return Math.round(n/1e4).toLocaleString('ko-KR')+'만'; return n.toLocaleString('ko-KR'); };
const pct   = n => (Math.round(n*10)/10).toFixed(n%1===0?0:1)+'%';
const num   = v => { const n=parseInt(String(v).replace(/[^0-9-]/g,''),10); return isNaN(n)?0:n; };
const digits    = v => String(v).replace(/[^0-9]/g,'');
const maskPhone = p => p&&p.length>=10 ? p.slice(0,3)+'-****-'+p.slice(-4) : (p||'—');
const gc = g => GC[g]||{c:'#9aa3b0',bg:'#eceff5',fg:'#6b7482'};
const at = t => AT[t]||{c:'#9aa3b0',bg:'#eceff5',fg:'#6b7482'};
const todayStr = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };

// ── STATE ──
const state = {
  screen:'landing', tab:'dash',
  year:String(new Date().getFullYear()),
  mon:String(new Date().getMonth()+1).padStart(2,'0'),
  profile:{name:'',age:'',photo:null},
  goal:{name:'목표 설정',target:'0'},
  txs:[], assets:[], budgets:{},
  groups:GROUPS.slice(), cats:DEF_CATS.slice(), openGroups:{},
  authId:null,
  accounts:[{id:'test1',name:'테스트',phone:'',pw:hashFn('1234'),qs:[{q:QPOOL[0],a:hashFn('test')}],createdAt:todayStr()}],
  drafts:[], signupQs:[], findMode:'id', findQIdx:0,
  newAssetType:'현금', seq:100,
  editingTx:null, editingTxData:null,
  _editProfilePhoto:undefined   // undefined = not changed; null = remove; string = new photo
};
function nid() { return ++state.seq; }

// ── LOADING ──
function setLoading(v) { const el=document.getElementById('loading-overlay'); if(el) el.style.display=v?'flex':'none'; }

// ── COMPUTED ──
function monthKey()    { return state.year+state.mon; }
function currentKeys() { return [state.year+state.mon]; }
function prevKeys()    { const p=Number(state.mon)-1; return p>=1?[state.year+String(p).padStart(2,'0')]:[String(Number(state.year)-1)+'12']; }
function groupSum(keys,g) { return state.txs.filter(t=>keys.includes(t.date.replace(/-/g,'').slice(0,6))&&t.group===g).reduce((s,t)=>s+num(t.amount),0); }
function spendGroups()    { return state.groups.filter(g=>g!=='수입'&&g!=='저축/투자'); }
function spendTotal(keys) { return spendGroups().reduce((s,g)=>s+groupSum(keys,g),0); }
function assetTotal()     { return state.assets.filter(a=>a.type!=='대출').reduce((s,a)=>s+num(a.amount),0); }
function debtTotal()      { return state.assets.filter(a=>a.type==='대출').reduce((s,a)=>s+num(a.amount),0); }
function netWorth()       { return assetTotal()-debtTotal(); }
function budgetFor(key)   { return state.budgets[key]||{}; }
function monthTxs(keys)   { return state.txs.filter(t=>keys.includes(t.date.replace(/-/g,'').slice(0,6))).sort((a,b)=>a.date<b.date?1:-1); }
function snapshotData()   { return {txs:state.txs.slice(),assets:state.assets.slice(),budgets:{...state.budgets},cats:state.cats.slice(),groups:state.groups.slice(),profile:{...state.profile},goal:{...state.goal}}; }

// ── SESSION CACHE ──
function cacheAccounts()       { try{sessionStorage.setItem('gb_accounts',JSON.stringify(state.accounts));}catch(e){} }
function cacheUserData(id,d)   { try{sessionStorage.setItem('gb_ud_'+id,JSON.stringify(d));}catch(e){} }
function getCachedAccounts()   { try{const s=sessionStorage.getItem('gb_accounts');return s?JSON.parse(s):null;}catch(e){return null;} }
function getCachedUserData(id) { try{const s=sessionStorage.getItem('gb_ud_'+id);return s?JSON.parse(s):null;}catch(e){return null;} }

// ── AUTH PERSISTENCE (localStorage) ──
function storeAuth(id)   { try{localStorage.setItem('gb_auth',id);}catch(e){} }
function clearAuth()     { try{localStorage.removeItem('gb_auth');}catch(e){} }
function getStoredAuth() { try{return localStorage.getItem('gb_auth');}catch(e){return null;} }

// ── INACTIVITY TIMER ──
function resetActivity()  { try{localStorage.setItem('gb_act',String(Date.now()));}catch(e){} }
function lastActivity()   { try{return Number(localStorage.getItem('gb_act'))||0;}catch(e){return 0;} }
function checkInactivity() {
  if(!state.authId) return;
  if(Date.now()-lastActivity() > INACTIVITY_MS) {
    showToast('30분 동안 활동이 없어 자동 로그아웃 되었습니다.');
    setTimeout(logout, 300); // toast 잠깐 보여준 후 로그아웃
  }
}

// ── BG SAVE ──
function bgSave() {
  if(!state.authId) return;
  const d=snapshotData();
  cacheUserData(state.authId,d);
  saveUserData(state.authId,d).catch(console.error);
}

// ── APPLY USER DATA ──
function applyUserData(d,id) {
  if(d) {
    state.txs=JSON.parse(JSON.stringify(d.txs||[]));
    state.assets=JSON.parse(JSON.stringify(d.assets||[]));
    state.budgets=JSON.parse(JSON.stringify(d.budgets||{}));
    state.cats=(d.cats||DEF_CATS).slice();
    state.groups=(d.groups||GROUPS).slice();
    state.profile={...(d.profile||{name:id,age:'',photo:null})};
    state.goal={...(d.goal||{name:'목표 설정',target:'0'})};
  } else {
    state.txs=[];state.assets=[];state.budgets={};
    state.cats=DEF_CATS.slice();state.groups=GROUPS.slice();
    const acct=state.accounts.find(a=>a.id===id);
    state.profile={name:acct?acct.name:id,age:'',photo:null};
    state.goal={name:'목표 설정',target:'0'};
  }
}

// ── NAVIGATION ──
function go(screen, extra) {
  if(screen==='find')   { state.findMode=extra||'id'; setFindMode(state.findMode); }
  if(screen==='signup') { shuffleQs(); }
  state.screen=screen;
  history.pushState({screen,extra:extra||null,tab:state.tab},'');
  render();
  document.getElementById('scroll-area').scrollTop=0;
}

function switchTab(tab) {
  // 입력 탭 벗어날 때 미저장 초안 초기화
  if(state.tab==='input' && tab!=='input') {
    state.drafts=[{id:nid(),name:'',date:todayStr(),group:'변동지출',cat:'',amount:'',note:''}];
  }
  state.tab=tab;
  if(tab==='input' && state.drafts.length===0) addDraft();
  history.pushState({screen:state.screen,tab},'');
  render();
  document.getElementById('scroll-area').scrollTop=0;
}

function logout() {
  const id=state.authId;
  if(id){const d=snapshotData();cacheUserData(id,d);saveUserData(id,d).catch(console.error);}
  clearAuth();
  state.screen='landing';state.authId=null;state.tab='dash';
  history.pushState({screen:'landing'},'');
  render();
}

// ── AUTH ──
async function doLogin() {
  const id=(document.getElementById('l-id').value||'').trim();
  const pw=document.getElementById('l-pw').value||'';
  if(!id||!pw){showNotice('login-notice','아이디와 비밀번호를 입력하세요.',false);return;}
  if(id==='admin'&&pw==='admin'){go('admin');renderAdmin();return;}
  const acct=state.accounts.find(a=>a.id===id);
  if(!acct||acct.pw!==hashFn(pw)){showNotice('login-notice','아이디 또는 비밀번호가 올바르지 않습니다.',false);return;}
  await loadAccount(id);
}

async function loadAccount(id) {
  const cached=getCachedUserData(id);
  if(cached) {
    applyUserData(cached,id);
    state.authId=id;state.screen='app';state.tab='dash';
    state.drafts=[{id:nid(),name:'',date:todayStr(),group:'변동지출',cat:'',amount:'',note:''}];
    storeAuth(id);
    resetActivity();
    render();
    fetchUserData(id).then(d=>{if(d) cacheUserData(id,d);}).catch(console.error);
    return;
  }
  setLoading(true);
  let d=null;
  try {
    // 5초 타임아웃 — 초과 시 빈 데이터로 진입 후 백그라운드 재시도
    d=await Promise.race([
      fetchUserData(id),
      new Promise(res=>setTimeout(()=>res(null),5000))
    ]);
  } catch(e){console.error('데이터 로드 실패:',e);}
  setLoading(false);
  applyUserData(d,id);
  if(d) cacheUserData(id,d);
  state.authId=id;state.screen='app';state.tab='dash';
  state.drafts=[{id:nid(),name:'',date:todayStr(),group:'변동지출',cat:'',amount:'',note:''}];
  render();
  // 타임아웃으로 빈 데이터 진입한 경우 백그라운드 재동기화
  if(!d) fetchUserData(id).then(d2=>{if(d2){applyUserData(d2,id);cacheUserData(id,d2);render();}}).catch(console.error);
  storeAuth(id);
  resetActivity();
}

async function doSignup() {
  const name=(document.getElementById('su-name').value||'').trim();
  const id=(document.getElementById('su-id').value||'').trim();
  const pw=document.getElementById('su-pw').value||'';
  const pw2=document.getElementById('su-pw2').value||'';
  const phone=digits(document.getElementById('su-phone').value||'');
  if(!name)            {showNotice('signup-notice','이름을 입력하세요.',false);return;}
  if(id.length<4)      {showNotice('signup-notice','아이디는 4자 이상 입력하세요.',false);return;}
  if(state.accounts.some(a=>a.id===id)||id==='admin'){showNotice('signup-notice','이미 사용 중인 아이디입니다.',false);return;}
  if(pw.length<6)      {showNotice('signup-notice','비밀번호는 6자 이상 입력하세요.',false);return;}
  if(pw!==pw2)         {showNotice('signup-notice','비밀번호 확인이 일치하지 않습니다.',false);return;}
  if(phone.length<10)  {showNotice('signup-notice','휴대폰 번호를 정확히 입력하세요.',false);return;}
  const qs=state.signupQs.map((q,i)=>({q,a:(document.getElementById('su-q'+i)||{value:''}).value.trim()}));
  if(qs.some(x=>!x.a)){showNotice('signup-notice','비밀번호 찾기 질문에 답해주세요.',false);return;}
  const acct={id,name,phone,pw:hashFn(pw),qs:qs.map(x=>({q:x.q,a:hashFn(x.a)})),createdAt:todayStr()};
  setLoading(true);
  try {
    await Promise.race([
      (async()=>{
        await saveAccount(acct);
        await saveUserData(id,{txs:[],assets:[],budgets:{},cats:DEF_CATS.slice(),groups:GROUPS.slice(),profile:{name,age:'',photo:null},goal:{name:'목표 설정',target:'0'}});
      })(),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),8000))
    ]);
    state.accounts.push(acct);cacheAccounts();
  } catch(e) {
    setLoading(false);
    showNotice('signup-notice', e.message==='timeout'?'서버 응답이 없습니다. 네트워크를 확인해주세요.':'서버 오류가 발생했습니다.',false);
    return;
  }
  setLoading(false);
  go('login');
  setTimeout(()=>showNotice('login-notice','가입이 완료되었습니다. 로그인해 주세요.',true),50);
}

function shuffleQs() {
  const pool=[...QPOOL],out=[];
  while(out.length<1&&pool.length) out.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  state.signupQs=out; renderSignupQs();
}
function renderSignupQs() {
  const el=document.getElementById('su-qs');if(!el)return;
  el.innerHTML=state.signupQs.map((q,i)=>`
    <div style="background:var(--card);border:1px solid var(--line);border-radius:var(--r-md);padding:12px 13px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:18px;height:18px;border-radius:50%;background:var(--blue-tint);color:var(--blue);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none">${i+1}</span>
        <span style="font-size:12px;font-weight:600;color:var(--ink)">${q}</span>
      </div>
      <input id="su-q${i}" class="inp-sm" placeholder="답변 입력" style="width:100%;margin-top:9px">
    </div>`).join('');
}

function setFindMode(mode) {
  state.findMode=mode;
  document.getElementById('find-id-fields').style.display=mode==='id'?'block':'none';
  document.getElementById('find-pw-fields').style.display=mode==='pw'?'flex':'none';
  const sid=document.getElementById('find-seg-id'),spw=document.getElementById('find-seg-pw');
  if(sid) sid.style.cssText=mode==='id'?'background:var(--card);color:var(--ink)':'';
  if(spw) spw.style.cssText=mode==='pw'?'background:var(--card);color:var(--ink)':'';
  updateFindQ();
}
function updateFindQ() {
  const id=(document.getElementById('f-id')||{value:''}).value.trim();
  const acct=state.accounts.find(a=>a.id===id);
  const q=acct?acct.qs[state.findQIdx%acct.qs.length]:null;
  const el=document.getElementById('find-q-text');
  if(el) el.textContent=q?q.q:'아이디를 먼저 입력하세요';
}
function rotateQ() {
  const id=(document.getElementById('f-id')||{value:''}).value.trim();
  const acct=state.accounts.find(a=>a.id===id);
  if(!acct||acct.qs.length<=1)return;
  state.findQIdx=(state.findQIdx+1)%acct.qs.length; updateFindQ();
}
async function doFind() {
  clearNotice('find-notice');
  if(state.findMode==='id') {
    const phone=digits(document.getElementById('f-phone-id').value||'');
    if(phone.length<10){showNotice('find-notice','휴대폰 번호를 정확히 입력하세요.',false);return;}
    const hits=state.accounts.filter(a=>a.phone===phone);
    if(!hits.length){showNotice('find-notice','해당 번호로 가입된 계정이 없습니다.',false);return;}
    showNotice('find-notice','찾은 아이디: '+hits.map(a=>a.id).join(', '),true);
  } else {
    const id=(document.getElementById('f-id').value||'').trim();
    const phone=digits(document.getElementById('f-phone-pw').value||'');
    const ans=(document.getElementById('f-ans').value||'').trim();
    const npw=document.getElementById('f-npw').value||'';
    const acct=state.accounts.find(a=>a.id===id);
    if(!acct)              {showNotice('find-notice','가입된 아이디가 아닙니다.',false);return;}
    if(acct.phone!==phone) {showNotice('find-notice','휴대폰 번호가 일치하지 않습니다.',false);return;}
    const q=acct.qs[state.findQIdx%acct.qs.length];
    if(!ans)               {showNotice('find-notice','질문에 답해주세요.',false);return;}
    if(q.a!==hashFn(ans))  {showNotice('find-notice','질문 답이 일치하지 않습니다.',false);return;}
    if(npw.length<6)       {showNotice('find-notice','새 비밀번호는 6자 이상 입력하세요.',false);return;}
    acct.pw=hashFn(npw); cacheAccounts(); saveAccount(acct).catch(console.error);
    showNotice('find-notice','비밀번호가 변경되었습니다.',true);
  }
}

// ── PROFILE / GOAL SAVE ──
function saveProfile(field,val) { state.profile[field]=val; bgSave(); }
function saveGoal(field,val) { if(field==='target') val=String(val).replace(/[^0-9]/g,''); state.goal[field]=val; bgSave(); }

// ── ADMIN ──
function renderAdmin() {
  const listEl=document.getElementById('admin-list');if(!listEl)return;
  const q=(document.getElementById('admin-search')||{}).value?.trim().toLowerCase()||'';
  // 통계
  const thisMonth=todayStr().slice(0,7);
  const newThisMonth=state.accounts.filter(a=>a.createdAt&&a.createdAt.startsWith(thisMonth)).length;
  const statsEl=document.getElementById('admin-stats');
  if(statsEl) statsEl.innerHTML=`
    <div style="flex:1;padding:13px 0;text-align:center;border-right:1px solid var(--line)">
      <div style="font-size:20px;font-weight:800;color:var(--blue)">${state.accounts.length}</div>
      <div style="font-size:10.5px;color:var(--faint);margin-top:2px">전체 회원</div>
    </div>
    <div style="flex:1;padding:13px 0;text-align:center;border-right:1px solid var(--line)">
      <div style="font-size:20px;font-weight:800;color:var(--green)">${newThisMonth}</div>
      <div style="font-size:10.5px;color:var(--faint);margin-top:2px">이번달 신규</div>
    </div>
    <div style="flex:1;padding:13px 0;text-align:center">
      <div style="font-size:20px;font-weight:800;color:var(--ink)">${state.accounts.filter(a=>a.phone).length}</div>
      <div style="font-size:10.5px;color:var(--faint);margin-top:2px">전화번호 등록</div>
    </div>`;
  document.getElementById('admin-sub').textContent='총 '+state.accounts.length+'명 · 비밀번호는 해시로만 보관';
  // 검색 필터
  const filtered=q
    ? state.accounts.filter(a=>a.name.toLowerCase().includes(q)||a.id.toLowerCase().includes(q))
    : state.accounts;
  if(!filtered.length){
    listEl.innerHTML=`<div style="text-align:center;padding:32px 0;font-size:13px;color:var(--faint)">${q?`'${q}' 검색 결과가 없습니다.`:'등록된 회원이 없습니다.'}</div>`;
    return;
  }
  // 가입일 역순 정렬
  const sorted=[...filtered].sort((a,b)=>a.createdAt<b.createdAt?1:-1);
  listEl.innerHTML=sorted.map(a=>{
    const initial=(a.name||'?')[0];
    const colors=['#1a57d6','#12864f','#4b4fc4','#c24a7a','#b5720d'];
    const color=colors[a.id.charCodeAt(0)%colors.length];
    return`<div class="card" style="padding:0;overflow:hidden">
      <div style="display:flex;align-items:center;gap:13px;padding:14px 15px">
        <div style="width:42px;height:42px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;flex:none">${initial}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:14.5px;font-weight:700;color:var(--ink)">${a.name}</span>
            <span style="font-size:11px;color:var(--muted);background:var(--track);padding:2px 7px;border-radius:999px">@${a.id}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:7px">
            <span style="font-size:11px;color:var(--faint)">📱 ${maskPhone(a.phone)}</span>
            <span style="font-size:11px;color:var(--faint)">·</span>
            <span style="font-size:11px;color:var(--faint)">가입 ${a.createdAt||'—'}</span>
          </div>
        </div>
        <div onclick="confirmRemoveAccount('${a.id}')" style="width:32px;height:32px;border-radius:var(--r-sm);background:var(--red-tint);color:var(--red);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;font-size:15px">🗑</div>
      </div>
      <div style="border-top:1px solid var(--line);display:flex">
        <div onclick="loadAccount('${a.id}')" style="flex:1;padding:11px 0;text-align:center;font-size:12px;font-weight:600;color:var(--blue);cursor:pointer;border-right:1px solid var(--line)">데이터 보기</div>
        <div onclick="copyAdminInfo('${a.id}')" style="flex:1;padding:11px 0;text-align:center;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer">정보 복사</div>
      </div>
    </div>`;
  }).join('');
}

function confirmRemoveAccount(id) {
  const a=state.accounts.find(x=>x.id===id);
  if(!a)return;
  if(!confirm(`[${a.name}] (@${a.id}) 회원을 삭제하시겠습니까?\n\n• 가입일: ${a.createdAt||'—'}\n• 연락처: ${maskPhone(a.phone)}\n\n삭제 후 복구할 수 없습니다.`))return;
  removeAccount(id);
}

async function removeAccount(id) {
  state.accounts=state.accounts.filter(a=>a.id!==id);
  cacheAccounts();
  try{sessionStorage.removeItem('gb_ud_'+id);localStorage.removeItem('gb_auth');}catch(e){}
  deleteAccount(id).catch(console.error);
  renderAdmin();
}

function copyAdminInfo(id) {
  const a=state.accounts.find(x=>x.id===id);if(!a)return;
  const text=`이름: ${a.name}\n아이디: ${a.id}\n연락처: ${maskPhone(a.phone)}\n가입일: ${a.createdAt||'—'}`;
  navigator.clipboard?.writeText(text).then(()=>showToast('정보를 클립보드에 복사했습니다.')).catch(()=>showToast('복사 실패'));
}

// ── DRAFT (입력 탭) ──
// patchDraft: 텍스트 입력 시 full re-render 없이 state만 업데이트 (포커스 유지)
function patchDraft(id,field,val) {
  state.drafts=state.drafts.map(d=>d.id===id?{...d,[field]:val}:d);
  if(field==='amount') {
    const draft=state.drafts.find(d=>d.id===id);
    const previewEl=document.getElementById('dp-amt-'+id);
    if(previewEl&&draft) {
      const raw=String(val||'').trim();
      const n=num(raw);
      const fmt=raw&&n!==0?won(Math.abs(n)):'—';
      previewEl.textContent=(draft.group==='수입'?'+ ':'- ')+fmt;
    }
  }
  // 저장 버튼 카운트 갱신
  if(field==='name'||field==='amount') {
    const sb=document.getElementById('save-btn');
    if(sb){
      const cnt=state.drafts.filter(d=>d.name.trim()&&d.amount).length;
      sb.textContent=cnt?`${cnt}건 저장`:'항목을 입력하세요';
      sb.style.background=cnt?'var(--blue)':'var(--disabled)';
    }
  }
}

// setDraftGroup: 구분 칩 클릭 시 카테고리 칩 갱신 필요 → renderInput 호출
function setDraftGroup(id,group) {
  state.drafts=state.drafts.map(d=>d.id===id?{...d,group,cat:''}:d);
  renderInput();
}

function addDraft() {
  state.drafts.push({id:nid(),name:'',date:todayStr(),group:'변동지출',cat:'',amount:'',note:''});
  if(state.screen==='app'&&state.tab==='input') renderInput();
}
function removeDraft(id) { state.drafts=state.drafts.filter(d=>d.id!==id); renderInput(); }
function setDraftField(id,field,val) { state.drafts=state.drafts.map(d=>d.id===id?{...d,[field]:val}:d); renderInput(); }
function saveDrafts() {
  const valid=state.drafts.filter(d=>d.name.trim()&&d.amount);
  if(!valid.length){showToast('저장할 항목이 없습니다.');return;}
  valid.forEach(d=>state.txs.push({id:nid(),name:d.name.trim(),date:d.date,group:d.group,cat:d.cat||'미분류',amount:num(d.amount),note:d.note}));
  state.drafts=[{id:nid(),name:'',date:todayStr(),group:'변동지출',cat:'',amount:'',note:''}];
  bgSave();
  showToast(valid.length+'건 저장되었습니다.');
  switchTab('ledger');
}

// ── TRANSACTION EDIT / DELETE ──
function deleteTx(id) {
  if(!confirm('이 거래를 삭제하시겠습니까?'))return;
  state.txs=state.txs.filter(t=>t.id!==id);
  bgSave();render();
}
function openEditTx(id) {
  const t=state.txs.find(t=>t.id===id);if(!t)return;
  state.editingTx=id; state.editingTxData={...t}; renderTxModal();
}
function updateEditTx(field,val) { if(!state.editingTxData)return; state.editingTxData[field]=val; renderTxModal(); }
function saveEditTx() {
  const idx=state.txs.findIndex(t=>t.id===state.editingTx);
  if(idx===-1){closeEditTx();return;}
  const d=state.editingTxData;
  state.txs[idx]={...state.txs[idx],
    name:(document.getElementById('etx-name')||{}).value?.trim()||d.name,
    amount:num((document.getElementById('etx-amount')||{}).value||d.amount),
    date:(document.getElementById('etx-date')||{}).value||d.date,
    group:d.group, cat:d.cat,
    note:(document.getElementById('etx-note')||{}).value||(d.note||'')
  };
  state.editingTx=null;state.editingTxData=null;
  const el=document.getElementById('tx-edit-modal');if(el)el.remove();
  bgSave();render();
}
function closeEditTx() {
  state.editingTx=null;state.editingTxData=null;
  const el=document.getElementById('tx-edit-modal');if(el)el.remove();
}
function renderTxModal() {
  const ex=document.getElementById('tx-edit-modal');if(ex)ex.remove();
  if(!state.editingTx||!state.editingTxData)return;
  const d=state.editingTxData;
  const cats=state.cats.filter(c=>c.group===d.group).map(c=>c.name);
  const gChips=GROUPS.map(g=>`<div class="chip${d.group===g?' sel':''}" onclick="updateEditTx('group','${g}')" style="${d.group===g?'background:'+gc(g).bg+';color:'+gc(g).fg+';border-color:'+gc(g).c:''}">${g}</div>`).join('');
  const cChips=cats.map(c=>`<div class="chip${d.cat===c?' sel':''}" onclick="updateEditTx('cat','${c}')" style="${d.cat===c?'background:'+gc(d.group).bg+';color:'+gc(d.group).fg+';border-color:'+gc(d.group).c:''}">${c}</div>`).join('');
  const modal=document.createElement('div');
  modal.id='tx-edit-modal';modal.className='modal-backdrop';
  modal.innerHTML=`
    <div class="modal-box">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="modal-title" style="margin-bottom:0">거래 수정</div>
        <div onclick="closeEditTx()" style="font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px;line-height:1">×</div>
      </div>
      <div class="lbl">항목명</div>
      <input id="etx-name" class="inp-sm" style="width:100%" value="${d.name.replace(/"/g,'&quot;')}">
      <div style="display:flex;gap:9px;margin-top:11px">
        <div style="flex:1"><div class="lbl">날짜</div><input type="date" id="etx-date" class="inp-sm" style="width:100%" value="${d.date}"></div>
        <div style="flex:1"><div class="lbl">금액</div><input id="etx-amount" class="inp-sm" style="width:100%;text-align:right" inputmode="numeric" value="${d.amount}"></div>
      </div>
      <div class="lbl" style="margin-top:11px">구분</div>
      <div class="chip-group">${gChips}</div>
      ${cats.length?`<div class="lbl" style="margin-top:11px">카테고리</div><div class="chip-group">${cChips}</div>`:''}
      <div class="lbl" style="margin-top:11px">비고</div>
      <input id="etx-note" class="inp-sm" style="width:100%" value="${(d.note||'').replace(/"/g,'&quot;')}">
      <div style="display:flex;gap:9px;margin-top:18px">
        <button onclick="closeEditTx()" class="btn-outline" style="height:44px;font-size:13px;flex:1">취소</button>
        <button onclick="saveEditTx()" class="btn-blue" style="height:44px;font-size:13px;flex:2">저장</button>
      </div>
    </div>`;
  document.getElementById('app').appendChild(modal);
}

// ── ASSETS ──
function addAsset() {
  const name=document.getElementById('new-asset-name').value.trim();
  const amount=num(document.getElementById('new-asset-amount').value);
  if(!name){showToast('자산 이름을 입력하세요.');return;}
  state.assets.push({id:nid(),name,type:state.newAssetType,amount,checked:false});
  document.getElementById('new-asset-name').value='';
  document.getElementById('new-asset-amount').value='';
  renderAssets();bgSave();
}
let _assetTimer;
function setAssetAmount(id,val) {
  state.assets=state.assets.map(a=>a.id===id?{...a,amount:num(val)}:a);
  renderAssetSummary();
  clearTimeout(_assetTimer);_assetTimer=setTimeout(bgSave,800);
}
function toggleAssetCheck(id) { state.assets=state.assets.map(a=>a.id===id?{...a,checked:!a.checked}:a); renderAssets();bgSave(); }
function deleteAsset(id) { if(!confirm('이 자산을 삭제하시겠습니까?'))return; state.assets=state.assets.filter(a=>a.id!==id); bgSave();renderAssets(); }

// ── BUDGET ──
function setBudget(group,val) {
  const mk=monthKey();
  if(!state.budgets[mk]) state.budgets[mk]={};
  state.budgets[mk][group]=Number(String(val).replace(/[^0-9]/g,''))||0;
  bgSave();
}

// ── PROFILE EDIT MODAL ──
function openProfileEdit() {
  state._editProfilePhoto=undefined; // undefined = not changed yet
  renderProfileModal();
}
function closeProfileEdit() {
  state._editProfilePhoto=undefined;
  const el=document.getElementById('profile-edit-modal');if(el)el.remove();
}
function saveProfileEdit() {
  const nameEl=document.getElementById('pe-name');
  const ageEl=document.getElementById('pe-age');
  if(nameEl) state.profile.name=nameEl.value.trim()||state.profile.name;
  if(ageEl)  state.profile.age=ageEl.value;
  if(state._editProfilePhoto!==undefined) state.profile.photo=state._editProfilePhoto||null;
  state._editProfilePhoto=undefined;
  const el=document.getElementById('profile-edit-modal');if(el)el.remove();
  bgSave();renderMypage();
}
function handlePhotoUpload(input) {
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');
      const maxPx=150;
      const scale=Math.min(maxPx/img.width,maxPx/img.height,1);
      canvas.width=Math.round(img.width*scale);
      canvas.height=Math.round(img.height*scale);
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      state._editProfilePhoto=canvas.toDataURL('image/jpeg',0.8);
      // 미리보기 갱신
      const preview=document.getElementById('pe-photo-preview');
      if(preview){
        if(preview.tagName==='IMG'){preview.src=state._editProfilePhoto;}
        else{
          const img2=document.createElement('img');
          img2.id='pe-photo-preview';img2.src=state._editProfilePhoto;
          img2.style.cssText='width:80px;height:80px;border-radius:50%;object-fit:cover;display:block';
          preview.parentNode.replaceChild(img2,preview);
        }
      }
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
function renderProfileModal() {
  const ex=document.getElementById('profile-edit-modal');if(ex)ex.remove();
  const currentPhoto=state._editProfilePhoto!==undefined?state._editProfilePhoto:state.profile.photo;
  const photoHtml=currentPhoto
    ?`<img id="pe-photo-preview" src="${currentPhoto}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;display:block">`
    :`<div id="pe-photo-preview" style="width:80px;height:80px;border-radius:50%;background:var(--blue-tint);display:flex;align-items:center;justify-content:center"><span style="font-size:28px">👤</span></div>`;
  const modal=document.createElement('div');
  modal.id='profile-edit-modal';modal.className='modal-backdrop';
  modal.innerHTML=`
    <div class="modal-box">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div class="modal-title" style="margin-bottom:0">내 정보 수정</div>
        <div onclick="closeProfileEdit()" style="font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px;line-height:1">×</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:20px">
        <div style="position:relative;width:80px;height:80px">
          ${photoHtml}
          <label style="position:absolute;bottom:0;right:0;width:26px;height:26px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px">
            📷<input type="file" accept="image/*" style="display:none" onchange="handlePhotoUpload(this)">
          </label>
        </div>
        <div style="font-size:11px;color:var(--faint)">사진을 눌러 변경</div>
      </div>
      <div class="lbl">이름</div>
      <input id="pe-name" class="inp-sm" style="width:100%;margin-bottom:12px" value="${state.profile.name}">
      <div class="lbl">나이</div>
      <div style="display:flex;align-items:center;gap:8px">
        <input id="pe-age" class="inp-sm" inputmode="numeric" style="width:80px" value="${state.profile.age||''}">
        <span style="font-size:12px;color:var(--faint)">세</span>
      </div>
      <div style="display:flex;gap:9px;margin-top:20px">
        <button onclick="closeProfileEdit()" class="btn-outline" style="height:44px;font-size:13px;flex:1">취소</button>
        <button onclick="saveProfileEdit()" class="btn-blue" style="height:44px;font-size:13px;flex:2">저장</button>
      </div>
    </div>`;
  document.getElementById('app').appendChild(modal);
}

// ── NOTICE / TOAST ──
function showNotice(elId,msg,ok) { const el=document.getElementById(elId);if(!el)return; el.innerHTML=`<div class="notice ${ok?'notice-ok':'notice-err'}">${msg}</div>`; }
function clearNotice(elId) { const el=document.getElementById(elId);if(el) el.innerHTML=''; }
let _toastTimer;
function showToast(msg) { const el=document.getElementById('toast'); el.textContent=msg;el.classList.add('show'); clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>el.classList.remove('show'),2200); }

// ── RENDER ──
function render() {
  ['s-landing','s-login','s-signup','s-find','s-admin','s-app','s-budget-input','s-cat-manage'].forEach(id=>document.getElementById(id).classList.remove('active'));
  const sb=document.getElementById('status-bar'), tb=document.getElementById('tab-bar');
  if(state.screen==='landing') {
    document.getElementById('s-landing').classList.add('active');
    sb.style.background='var(--blue)';sb.style.color='#fff';tb.style.display='none';
  } else if(state.screen==='login') {
    document.getElementById('s-login').classList.add('active');
    sb.style.background='var(--bg)';sb.style.color='var(--ink)';tb.style.display='none';
  } else if(state.screen==='signup') {
    document.getElementById('s-signup').classList.add('active');
    renderSignupQs();
    sb.style.background='var(--bg)';sb.style.color='var(--ink)';tb.style.display='none';
  } else if(state.screen==='find') {
    document.getElementById('s-find').classList.add('active');
    sb.style.background='var(--bg)';sb.style.color='var(--ink)';tb.style.display='none';
  } else if(state.screen==='admin') {
    document.getElementById('s-admin').classList.add('active');
    sb.style.background='var(--blue)';sb.style.color='#fff';tb.style.display='none';
    renderAdmin();
  } else if(state.screen==='budget-input') {
    document.getElementById('s-budget-input').classList.add('active');
    sb.style.background='var(--bg)';sb.style.color='var(--ink)';tb.style.display='none';
    renderBudgetInput();
  } else if(state.screen==='cat-manage') {
    document.getElementById('s-cat-manage').classList.add('active');
    sb.style.background='var(--bg)';sb.style.color='var(--ink)';tb.style.display='none';
    renderCatManage();
  } else if(state.screen==='app') {
    document.getElementById('s-app').classList.add('active');
    tb.style.display='flex';
    ['dash','ledger','input','assets','mypage'].forEach(t=>document.getElementById('tab-'+t).style.display=state.tab===t?'block':'none');
    ['dash','ledger','assets','mypage'].forEach(t=>document.getElementById('tb-'+t).classList.toggle('active',state.tab===t));
    sb.style.background=(state.tab==='dash'||state.tab==='assets')?'var(--blue)':'var(--card)';
    sb.style.color=(state.tab==='dash'||state.tab==='assets')?'#fff':'var(--ink)';
    if(state.tab==='dash')        renderDash();
    else if(state.tab==='ledger') renderLedger();
    else if(state.tab==='input')  renderInput();
    else if(state.tab==='assets') renderAssets();
    else if(state.tab==='mypage') renderMypage();
    if(state.editingTx) renderTxModal();
  }
}

// ── DASHBOARD ──
function renderDash() {
  const keys=currentKeys(),prevK=prevKeys();
  const nw=netWorth(),tot=assetTotal();
  const income=groupSum(keys,'수입'),spend=spendTotal(keys),flow=income-spend;
  const pIncome=groupSum(prevK,'수입'),pSpend=spendTotal(prevK);
  document.getElementById('d-net-worth').textContent=won(nw);
  document.getElementById('d-month-label').textContent=state.year+'년 '+Number(state.mon)+'월';
  document.getElementById('d-net-flow').textContent=(flow>=0?'+ ':'-')+short(Math.abs(flow));
  document.getElementById('d-net-flow').style.color=flow>=0?'rgba(255,255,255,.9)':'rgba(255,255,255,.7)';
  document.getElementById('d-income').textContent=won(income);
  document.getElementById('d-prev-income').textContent='전월 '+won(pIncome);
  document.getElementById('d-spend').textContent=won(spend);
  document.getElementById('d-prev-spend').textContent='전월 '+won(pSpend);
  const types=AT_ORDER.filter(t=>state.assets.some(a=>a.type===t&&a.type!=='대출'));
  const barEl=document.getElementById('d-asset-bar'),legEl=document.getElementById('d-asset-legend');
  if(tot>0){
    barEl.innerHTML=types.map(t=>{const s=state.assets.filter(a=>a.type===t).reduce((x,a)=>x+num(a.amount),0);return`<div class="asset-bar-seg" style="background:${at(t).c};width:${s/tot*100}%"></div>`;}).join('');
    legEl.innerHTML=types.map(t=>{const s=state.assets.filter(a=>a.type===t).reduce((x,a)=>x+num(a.amount),0);return`<div class="legend-item"><div class="legend-dot" style="background:${at(t).c}"></div><span class="legend-label">${t}</span><span class="legend-pct">${pct(s/tot*100)}</span></div>`;}).join('');
  } else {barEl.innerHTML='';legEl.innerHTML='';}
  const top=state.assets.filter(a=>a.type!=='대출').sort((a,b)=>num(b.amount)-num(a.amount)).slice(0,5);
  document.getElementById('d-asset-list').innerHTML=top.length?top.map(a=>`<div class="asset-list-item"><span class="badge" style="background:${at(a.type).bg};color:${at(a.type).fg}">${a.type}</span><span style="font-size:13px;color:var(--ink);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</span><span style="font-size:13px;font-weight:600;color:var(--ink)">${won(num(a.amount))}</span></div>`).join(''):'<div style="padding:22px;text-align:center;font-size:12px;color:var(--faint)">등록된 자산이 없습니다.</div>';
  document.getElementById('d-group-title').textContent=state.year+'년 '+Number(state.mon)+'월 구분별 합계';
  const maxG=Math.max(1,...GROUPS.map(g=>groupSum(keys,g)));
  document.getElementById('d-group-list').innerHTML=GROUPS.map(g=>{const amt=groupSum(keys,g);return`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)"><span style="width:3px;height:16px;border-radius:2px;background:${gc(g).c};flex:none"></span><span style="font-size:12.5px;color:var(--ink);flex:none;width:66px">${g}</span><div class="bar-row" style="flex:1"><div class="bar-fill" style="background:${gc(g).c};width:${amt/maxG*100}%"></div></div><span style="font-size:12.5px;font-weight:500;color:var(--ink);flex:none">${won(amt)}</span></div>`;}).join('');
  const recent=monthTxs(keys).slice(0,4);
  document.getElementById('d-recent-tx').innerHTML=recent.map(t=>`<div class="tx-item"><div class="tx-top"><span class="tx-name">${t.name}</span><span class="tx-amt" style="color:${gc(t.group).c}">${t.group==='수입'?'+ ':'-'}${won(num(t.amount))}</span></div><div class="tx-meta"><span class="badge" style="background:${gc(t.group).bg};color:${gc(t.group).fg}">${t.group}</span><span class="badge" style="background:var(--track);color:var(--muted)">${t.cat}</span><span style="flex:1"></span><span class="tx-day">${t.date.slice(5)}</span></div></div>`).join('')+`<div class="row-link" onclick="switchTab('input')">원자료 입력하기</div>`;
}

// ── LEDGER ──
function renderLedger() {
  const keys=currentKeys(),prevK=prevKeys();
  const income=groupSum(keys,'수입'),spend=spendTotal(keys),flow=income-spend;
  ['ledger-year','my-year'].forEach(id=>{const el=document.getElementById(id);if(!el)return;const cur=Number(state.year);el.innerHTML=[cur-1,cur,cur+1].map(y=>`<option value="${y}" ${y===Number(state.year)?'selected':''}>${y}년</option>`).join('');});
  ['ledger-mon','my-mon'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.innerHTML=[...Array(12)].map((_,i)=>{const m=String(i+1).padStart(2,'0');return`<option value="${m}" ${m===state.mon?'selected':''}>${i+1}월</option>`;}).join('');});
  document.getElementById('ledger-sub-label').textContent=state.year+'년 '+Number(state.mon)+'월';
  document.getElementById('l-income').textContent=won(income);
  document.getElementById('l-spend').textContent=won(spend);
  document.getElementById('l-net').textContent=won(flow);
  const sgNames=spendGroups();let acc=0;
  const stops=sgNames.map(g=>{const amt=groupSum(keys,g);const p=spend?amt/spend*100:0;const s=acc;acc+=p;return`${gc(g).c} ${s}% ${acc}%`;});
  document.getElementById('l-donut').style.background=spend?`conic-gradient(${stops.join(',')})`:'var(--track)';
  document.getElementById('l-donut-val').textContent=short(spend);
  document.getElementById('l-donut-legend').innerHTML=sgNames.map(g=>{const amt=groupSum(keys,g);return`<div style="display:flex;align-items:center;gap:7px"><span style="width:8px;height:8px;border-radius:3px;background:${gc(g).c};flex:none"></span><span style="font-size:11.5px;color:var(--muted);flex:1">${g}</span><span style="font-size:11.5px;font-weight:600;color:var(--ink)">${spend?pct(amt/spend*100):'0%'}</span></div>`;}).join('');
  const maxG=Math.max(1,...GROUPS.map(g=>groupSum(keys,g)));
  document.getElementById('l-groups').innerHTML=GROUPS.map(g=>{
    const amt=groupSum(keys,g),pv=groupSum(prevK,g),d=amt-pv,open=!!state.openGroups[g];
    const cats=state.txs.filter(t=>keys.includes(t.date.replace(/-/g,'').slice(0,6))&&t.group===g);
    const catMap={};cats.forEach(t=>{catMap[t.cat||'미분류']=(catMap[t.cat||'미분류']||0)+num(t.amount);});
    const catRows=Object.keys(catMap).sort((a,b)=>catMap[b]-catMap[a]).map(k=>`<div class="group-body-item"><span style="font-size:12px;color:var(--muted);flex:1">${k}</span><span style="font-size:12.5px;font-weight:500;color:var(--ink)">${won(catMap[k])}</span></div>`).join('');
    return`<div class="group-card"><div class="group-card-header" onclick="toggleGroup('${g}')"><div style="display:flex;align-items:center;gap:9px"><span class="badge" style="background:${gc(g).bg};color:${gc(g).fg}">${g}</span><span style="flex:1"></span><span style="font-size:15px;font-weight:600;color:var(--ink)">${won(amt)}</span><span style="font-size:11px;color:var(--faint);transform:${open?'rotate(180deg)':'none'};display:inline-block">▾</span></div><div style="display:flex;align-items:center;gap:9px;margin-top:10px"><div class="bar-row" style="flex:1"><div class="bar-fill" style="background:${gc(g).c};width:${amt/maxG*100}%"></div></div><span style="font-size:10.5px;color:var(--muted);flex:none">${d===0?'변동 없음':(d>0?'▲ ':'▼ ')+short(Math.abs(d))}</span></div></div>${open?`<div class="group-card-body">${catRows||'<div style="padding:11px 0;font-size:11.5px;color:var(--faint)">내역이 없습니다.</div>'}</div>`:''}</div>`;
  }).join('');
  // 예산 설정 (지출 그룹 항상 표시 + 입력 가능)
  const bud=budgetFor(monthKey());
  document.getElementById('l-budget').innerHTML=spendGroups().map(g=>{
    const b=num(bud[g]||0),a=groupSum(keys,g),r=b?a/b*100:0;
    const rc=r>100?'var(--red)':r>80?'var(--amber)':'var(--green)';
    return`<div class="budget-row"><div style="display:flex;align-items:center;gap:8px"><span class="badge" style="background:${gc(g).bg};color:${gc(g).fg};flex:none">${g}</span><span style="flex:1"></span><input class="inp-sm" inputmode="numeric" style="width:110px;text-align:right;height:34px;font-size:12px" value="${b||''}" placeholder="예산 입력" onchange="setBudget('${g}',this.value)"></div>${b?`<div class="bar-row" style="margin-top:8px"><div class="bar-fill" style="background:${rc};width:${Math.min(100,r)}%"></div></div><div style="font-size:10.5px;color:var(--faint);margin-top:5px">${won(a)} / 예산 ${won(b)} · <span style="color:${rc};font-weight:600">${pct(r)}</span></div>`:`<div style="font-size:10.5px;color:var(--faint);margin-top:5px">이번 달 지출 ${won(a)} · 예산을 입력하면 진행률이 표시됩니다.</div>`}</div>`;
  }).join('');
  // 거래 목록 (수정·삭제)
  const txs=monthTxs(keys);
  document.getElementById('l-tx-title').textContent='원자료 '+txs.length+'건';
  document.getElementById('l-tx-list').innerHTML=txs.length?txs.map(t=>`
    <div style="display:flex;gap:10px;padding:12px 15px;border-bottom:1px solid var(--line)">
      <div style="font-size:10.5px;color:var(--faint);flex:none;width:34px;line-height:1.6">${t.date.slice(5)}</div>
      <div style="flex:1;min-width:0">
        <div class="tx-top"><span class="tx-name">${t.name}</span><span class="tx-amt" style="color:${gc(t.group).c}">${t.group==='수입'?'+ ':'-'}${won(num(t.amount))}</span></div>
        <div class="tx-meta">
          <span class="badge" style="background:${gc(t.group).bg};color:${gc(t.group).fg}">${t.group}</span>
          <span class="badge" style="background:var(--track);color:var(--muted)">${t.cat}</span>
          <span style="flex:1"></span>
          <span onclick="openEditTx(${t.id})" style="font-size:11px;color:var(--blue);cursor:pointer;font-weight:600;padding:2px 6px">수정</span>
          <span style="font-size:11px;color:var(--line)">|</span>
          <span onclick="deleteTx(${t.id})" style="font-size:11px;color:var(--red);cursor:pointer;font-weight:600;padding:2px 6px">삭제</span>
        </div>
      </div>
    </div>`).join(''):'<div style="padding:22px;text-align:center;font-size:12px;color:var(--faint)">이 달의 원자료가 없습니다.<br><span style="color:var(--blue);cursor:pointer" onclick="switchTab(\'input\')">입력하러 가기</span></div>';
}
function toggleGroup(g) { state.openGroups[g]=!state.openGroups[g];renderLedger(); }

// ── INPUT ──
function renderInput() {
  document.getElementById('inp-sub-label').textContent=state.year+'년 '+Number(state.mon)+'월 · 작성 중 '+state.drafts.length+'건';
  const list=document.getElementById('draft-list');
  list.innerHTML=state.drafts.map((d,i)=>{
    const cats=state.cats.filter(c=>c.group===d.group).map(c=>c.name);
    const gChips=GROUPS.map(g=>`<div class="chip ${d.group===g?'sel':''}" onclick="setDraftGroup(${d.id},'${g}')" style="${d.group===g?'background:'+gc(g).bg+';color:'+gc(g).fg+';border-color:'+gc(g).c:''}">${g}</div>`).join('');
    const cChips=cats.map(c=>`<div class="chip ${d.cat===c?'sel':''}" onclick="setDraftField(${d.id},'cat','${c}')" style="${d.cat===c?'background:'+gc(d.group).bg+';color:'+gc(d.group).fg+';border-color:'+gc(d.group).c:''}">${c}</div>`).join('');
    const raw=String(d.amount||'').trim();const n=num(raw);
    const fmtAmt=raw&&n!==0?won(Math.abs(n)):'—';
    return`<div class="draft-card">
      <div class="draft-top"><div class="draft-no">항목 ${i+1}</div><div class="draft-del" onclick="removeDraft(${d.id})">삭제</div></div>
      <div class="lbl">항목명</div>
      <input class="inp-sm" style="width:100%" value="${d.name.replace(/"/g,'&quot;')}" placeholder="예: 이쁜이사료" oninput="patchDraft(${d.id},'name',this.value)">
      <div style="display:flex;gap:9px;margin-top:11px">
        <div style="flex:1"><div class="lbl">날짜</div><input type="date" class="inp-sm" style="width:100%" value="${d.date}" onchange="patchDraft(${d.id},'date',this.value)"></div>
        <div style="flex:1"><div class="lbl">금액</div><input class="inp-sm" style="width:100%;text-align:right" inputmode="numeric" value="${raw}" placeholder="0" oninput="patchDraft(${d.id},'amount',this.value)"></div>
      </div>
      <div class="lbl" style="margin-top:11px">수입지출구분</div>
      <div class="chip-group">${gChips}</div>
      ${cats.length?`<div class="lbl" style="margin-top:11px">카테고리</div><div class="chip-group">${cChips}</div>`:''}
      <div class="lbl" style="margin-top:11px">비고</div>
      <input class="inp-sm" style="width:100%" value="${(d.note||'').replace(/"/g,'&quot;')}" placeholder="선택 입력" oninput="patchDraft(${d.id},'note',this.value)">
      <div class="draft-preview">
        <div class="draft-preview-lbl">월별가계부 ${state.year+state.mon}으로 집계</div>
        <div id="dp-amt-${d.id}" class="draft-preview-amt" style="color:${d.group==='수입'?'var(--green)':'var(--red)'}">${d.group==='수입'?'+ ':'- '}${fmtAmt}</div>
      </div>
    </div>`;
  }).join('');
  const sb=document.getElementById('save-btn');
  const cnt=state.drafts.filter(d=>d.name.trim()&&d.amount).length;
  sb.textContent=cnt?`${cnt}건 저장`:'항목을 입력하세요';
  sb.style.background=cnt?'var(--blue)':'var(--disabled)';
}

// ── ASSETS ──
function renderAssets() {
  renderAssetSummary();
  const chipEl=document.getElementById('asset-type-chips');
  if(chipEl) chipEl.innerHTML=AT_ORDER.map(t=>`<div class="chip ${state.newAssetType===t?'sel':''}" onclick="state.newAssetType='${t}';renderAssets()">${t}</div>`).join('');
  const types=AT_ORDER.filter(t=>state.assets.some(a=>a.type===t));
  document.getElementById('asset-group-list').innerHTML=types.map(t=>{
    const items=state.assets.filter(a=>a.type===t);
    const sum=items.reduce((s,a)=>s+num(a.amount),0);
    return`<div class="asset-group-card"><div class="asset-group-hd"><span class="badge" style="background:${at(t).bg};color:${at(t).fg}">${t}</span><span style="font-size:11px;color:var(--faint);flex:1">${items.length}개</span><span style="font-size:14.5px;font-weight:600;color:var(--ink)">${won(sum)}</span></div>${items.map(a=>`<div class="asset-input-row"><div onclick="toggleAssetCheck(${a.id})" style="width:17px;height:17px;border-radius:var(--r-sm);flex:none;border:1px solid ${a.checked?'var(--blue)':'var(--line)'};background:${a.checked?'var(--blue)':'var(--bg)'};display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;color:#fff">${a.checked?'✓':''}</div><div style="flex:1;min-width:0"><div style="font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</div><div style="font-size:10.5px;color:var(--faint);margin-top:2px">${assetTotal()?'전체의 '+pct(num(a.amount)/assetTotal()*100):'—'}</div></div><input class="inp-sm" inputmode="numeric" style="width:90px;text-align:right" value="${a.amount}" onchange="setAssetAmount(${a.id},this.value)"><div onclick="deleteAsset(${a.id})" style="width:28px;height:28px;border-radius:var(--r-sm);background:var(--red-tint);color:var(--red);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;font-weight:400;flex:none;line-height:1">×</div></div>`).join('')}</div>`;
  }).join('');
}
function renderAssetSummary() {
  const tot=assetTotal(),dt=debtTotal(),nw=netWorth();
  const el=document.getElementById('a-total');if(el)el.textContent=won(tot);
  const sub=document.getElementById('a-sub');if(sub)sub.textContent='부채 '+won(dt)+' · 순자산 '+won(nw);
}

// ── BUDGET INPUT SCREEN ──
function goApp(tab) {
  state.screen='app'; state.tab=tab||'mypage';
  history.pushState({screen:'app',tab:state.tab},'');
  render();
  document.getElementById('scroll-area').scrollTop=0;
}

function renderBudgetInput() {
  const keys=currentKeys();
  const bud=budgetFor(monthKey());
  const budGroups=state.groups.filter(g=>g!=='수입');
  const totalBudget=budGroups.reduce((s,g)=>s+num(bud[g]||0),0);
  const totalActual=budGroups.reduce((s,g)=>s+groupSum(keys,g),0);
  const rate=totalBudget?Math.min(100,totalActual/totalBudget*100):0;
  const rc=rate>100?'var(--red)':rate>80?'var(--amber)':'var(--blue)';
  const prevMon=Number(state.mon)===1?(Number(state.year)-1)+'년 12':state.year+'년 '+(Number(state.mon)-1);
  const el=document.getElementById('budget-input-body'); if(!el)return;
  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
      <div onclick="goApp('mypage')" style="width:34px;height:34px;border-radius:50%;background:var(--track);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;color:var(--ink);line-height:1">‹</div>
      <div style="font-size:17px;font-weight:700;color:var(--ink)">월 예산 입력</div>
      <div style="flex:1"></div>
      <select class="sel-sm" style="height:30px;font-size:11.5px" onchange="state.year=this.value;renderBudgetInput()">
        ${[Number(state.year)-1,Number(state.year),Number(state.year)+1].map(y=>`<option value="${y}" ${y===Number(state.year)?'selected':''}>${y}년</option>`).join('')}
      </select>
      <select class="sel-sm" style="height:30px;font-size:11.5px" onchange="state.mon=this.value;renderBudgetInput()">
        ${[...Array(12)].map((_,i)=>{const m=String(i+1).padStart(2,'0');return`<option value="${m}" ${m===state.mon?'selected':''}>${i+1}월</option>`;}).join('')}
      </select>
    </div>
    <div class="card" style="padding:14px 15px;margin-bottom:10px">
      <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:4px">월 예산 대비 집행률</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
        <span style="font-size:26px;font-weight:800;color:${rc}">${totalBudget?pct(rate):'—'}</span>
        ${totalBudget?`<span style="font-size:11.5px;color:var(--faint)">${won(totalActual)} / ${won(totalBudget)}</span>`:''}
      </div>
      ${totalBudget?`<div class="bar-row"><div class="bar-fill" style="background:${rc};width:${rate}%"></div></div>`:''}
    </div>
    <div class="card" style="padding:0 0 4px;margin-bottom:10px">
      ${budGroups.map(g=>{
        const b=num(bud[g]||0),a=groupSum(keys,g),r=b?a/b*100:0;
        const c2=r>100?'var(--red)':r>80?'var(--amber)':'var(--green)';
        return`<div style="padding:13px 15px;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:${b?'8px':'0'}">
            <span class="badge" style="background:${gc(g).bg};color:${gc(g).fg};flex:none">${g}</span>
            <span style="flex:1"></span>
            ${b?`<span onclick="clearGroupBudget('${g}')" style="font-size:16px;color:var(--faint);cursor:pointer;padding:2px 6px;line-height:1">×</span>`:''}
            <input class="inp-sm" inputmode="numeric" style="width:120px;text-align:right;height:36px"
                   value="${b||''}" placeholder="예산 미설정"
                   onchange="setBudgetAndRefresh('${g}',this.value)">
          </div>
          ${b?`
          <div class="bar-row" style="margin-bottom:5px"><div class="bar-fill" style="background:${c2};width:${Math.min(100,r)}%"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--faint)">
            <span>실적 ${won(a)} · <span style="color:${c2};font-weight:600">${pct(r)}</span></span>
            <span>${won(Math.max(0,b-a))} 남음</span>
          </div>`:`<div style="font-size:10.5px;color:var(--faint);margin-top:3px">실적 ${won(a)}</div>`}
        </div>`;
      }).join('')}
    </div>
    <button onclick="fillFromLastMonth()" class="btn-outline" style="height:44px;font-size:13px">
      ${prevMon}월 실적으로 채우기
    </button>`;
}

function setBudgetAndRefresh(group,val) { setBudget(group,val); renderBudgetInput(); }

function clearGroupBudget(group) {
  const mk=monthKey();
  if(state.budgets[mk]) state.budgets[mk][group]=0;
  bgSave(); renderBudgetInput();
}

function fillFromLastMonth() {
  const prevK=prevKeys()[0];
  const mk=monthKey();
  if(!state.budgets[mk]) state.budgets[mk]={};
  state.groups.filter(g=>g!=='수입').forEach(g=>{
    const actual=state.txs.filter(t=>t.date.replace(/-/g,'').slice(0,6)===prevK&&t.group===g).reduce((s,t)=>s+num(t.amount),0);
    if(actual>0) state.budgets[mk][g]=actual;
  });
  bgSave(); renderBudgetInput(); showToast('전월 실적으로 예산을 채웠습니다.');
}

// ── CATEGORY MANAGE SCREEN ──
function renderCatManage() {
  const keys=currentKeys();
  const el=document.getElementById('cat-manage-body'); if(!el)return;
  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
      <div onclick="goApp('mypage')" style="width:34px;height:34px;border-radius:50%;background:var(--track);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;color:var(--ink);line-height:1">‹</div>
      <div style="font-size:17px;font-weight:700;color:var(--ink)">카테고리 구분 관리</div>
    </div>
    ${state.groups.map(g=>{
      const cats=state.cats.filter(c=>c.group===g);
      const amt=groupSum(keys,g);
      return`<div class="card" style="padding:14px 15px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:11px">
          <span class="badge" style="background:${gc(g).bg};color:${gc(g).fg}">${g}</span>
          <span style="font-size:11px;color:var(--faint)">${cats.length}개</span>
          <span style="flex:1"></span>
          <span style="font-size:13px;font-weight:600;color:var(--ink)">${won(amt)}</span>
        </div>
        <div class="chip-group" style="margin-bottom:10px">
          ${cats.map(c=>`<div class="chip" style="background:${gc(g).bg};color:${gc(g).fg};border-color:${gc(g).c};display:flex;align-items:center;gap:3px;padding-right:4px">
            <span onclick="openEditCat('${g}','${c.name}')" style="cursor:pointer">${c.name}</span>
            <span onclick="openEditCat('${g}','${c.name}')" style="font-size:10px;cursor:pointer;opacity:.55;margin-left:1px">✏</span>
            <span onclick="removeCat('${g}','${c.name}')" style="font-size:14px;line-height:1;cursor:pointer;opacity:.55;margin-left:2px">×</span>
          </div>`).join('')}
        </div>
        <div style="display:flex;gap:7px">
          <input id="nc-${g.replace(/\//g,'-')}" class="inp-sm" style="flex:1" placeholder="새 카테고리"
                 onkeydown="if(event.key==='Enter')addCat('${g}',this.value)">
          <button onclick="addCat('${g}',document.getElementById('nc-${g.replace(/\//g,'-')}').value)"
                  class="btn-outline" style="height:36px;font-size:12px;width:52px;padding:0">추가</button>
        </div>
      </div>`;
    }).join('')}
    <div class="card" style="padding:14px 15px;border:1.5px dashed var(--line);background:var(--bg)">
      <div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:3px">대분류 추가</div>
      <div style="font-size:11px;color:var(--faint);margin-bottom:11px">대분류는 월별가계부의 합계 열이 됩니다.</div>
      <div style="display:flex;gap:7px">
        <input id="new-group-inp" class="inp-sm" style="flex:1" placeholder="예: 경조사"
               onkeydown="if(event.key==='Enter')addGroup(this.value)">
        <button onclick="addGroup(document.getElementById('new-group-inp').value)"
                class="btn-blue" style="height:36px;font-size:12px;width:52px;padding:0">추가</button>
      </div>
    </div>`;
}

function addCat(group,name) {
  name=(name||'').trim();
  if(!name){showToast('카테고리 이름을 입력하세요.');return;}
  if(state.cats.some(c=>c.group===group&&c.name===name)){showToast('이미 존재하는 카테고리입니다.');return;}
  state.cats.push({name,group}); bgSave(); renderCatManage();
}
function removeCat(group,catName) {
  const used=state.txs.filter(t=>t.group===group&&t.cat===catName).length;
  if(used>0) {
    if(!confirm(`'${catName}' 카테고리는 ${used}건의 거래에 사용 중입니다.\n삭제 시 해당 거래의 카테고리가 '미분류'로 변경됩니다.\n계속하시겠습니까?`))return;
    state.txs=state.txs.map(t=>t.group===group&&t.cat===catName?{...t,cat:'미분류'}:t);
  } else {
    if(!confirm(`'${catName}' 카테고리를 삭제하시겠습니까?`))return;
  }
  state.cats=state.cats.filter(c=>!(c.group===group&&c.name===catName));
  bgSave(); renderCatManage();
}

function openEditCat(group,oldName) {
  const ex=document.getElementById('cat-edit-modal');if(ex)ex.remove();
  const modal=document.createElement('div');
  modal.id='cat-edit-modal';modal.className='modal-backdrop';
  modal.innerHTML=`
    <div class="modal-box">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="modal-title" style="margin-bottom:0">카테고리 수정</div>
        <div onclick="closeCatEditModal()" style="font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px;line-height:1">×</div>
      </div>
      <div class="lbl">카테고리 이름</div>
      <input id="cat-edit-inp" class="inp-sm" style="width:100%;margin-bottom:18px" value="${oldName.replace(/"/g,'&quot;')}">
      <div style="display:flex;gap:9px">
        <button onclick="closeCatEditModal()" class="btn-outline" style="height:44px;font-size:13px;flex:1">취소</button>
        <button onclick="renameCat('${group}','${oldName}',document.getElementById('cat-edit-inp').value)" class="btn-blue" style="height:44px;font-size:13px;flex:2">저장</button>
      </div>
    </div>`;
  document.getElementById('app').appendChild(modal);
  setTimeout(()=>document.getElementById('cat-edit-inp')?.focus(),50);
}
function closeCatEditModal() { const el=document.getElementById('cat-edit-modal');if(el)el.remove(); }
function renameCat(group,oldName,newName) {
  newName=(newName||'').trim();
  if(!newName){showToast('카테고리 이름을 입력하세요.');return;}
  if(newName===oldName){closeCatEditModal();return;}
  if(state.cats.some(c=>c.group===group&&c.name===newName)){showToast('이미 존재하는 카테고리입니다.');return;}
  state.cats=state.cats.map(c=>c.group===group&&c.name===oldName?{...c,name:newName}:c);
  state.txs=state.txs.map(t=>t.group===group&&t.cat===oldName?{...t,cat:newName}:t);
  closeCatEditModal(); bgSave(); renderCatManage();
}
function addGroup(name) {
  name=(name||'').trim();
  if(!name){showToast('대분류 이름을 입력하세요.');return;}
  if(state.groups.includes(name)){showToast('이미 존재하는 대분류입니다.');return;}
  state.groups.push(name); bgSave(); renderCatManage();
}

// ── RESET ──
function resetLedger()  { if(!confirm('입력한 원자료와 월별 합계를 모두 지웁니다. 계속하시겠습니까?'))return; state.txs=[];bgSave();renderMypage();showToast('가계부를 초기화했습니다.'); }
function resetAssets()  { if(!confirm('등록된 계좌·자산 전체를 지웁니다. 계속하시겠습니까?'))return;    state.assets=[];bgSave();renderMypage();showToast('자산을 초기화했습니다.'); }
function resetBudgets() { if(!confirm('모든 월의 예산 설정을 지웁니다. 계속하시겠습니까?'))return;      state.budgets={};bgSave();renderMypage();showToast('예산을 초기화했습니다.'); }

// ── MYPAGE ──
function renderMypage() {
  const keys=currentKeys(),prevK=prevKeys();
  const acct=state.accounts.find(a=>a.id===state.authId);
  ['ledger-year','my-year'].forEach(id=>{const el=document.getElementById(id);if(!el)return;const cur=Number(state.year);el.innerHTML=[cur-1,cur,cur+1].map(y=>`<option value="${y}" ${y===Number(state.year)?'selected':''}>${y}년</option>`).join('');});
  ['ledger-mon','my-mon'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.innerHTML=[...Array(12)].map((_,i)=>{const m=String(i+1).padStart(2,'0');return`<option value="${m}" ${m===state.mon?'selected':''}>${i+1}월</option>`;}).join('');});
  if(acct){
    document.getElementById('my-id-badge').textContent='@'+acct.id;
    document.getElementById('my-phone').textContent=maskPhone(acct.phone);
  }
  // 프로필 사진
  const avatarEl=document.getElementById('my-avatar');
  if(avatarEl){
    if(state.profile.photo){
      avatarEl.innerHTML=`<img src="${state.profile.photo}" style="width:62px;height:62px;border-radius:50%;object-fit:cover;display:block">`;
      avatarEl.style.background='none';avatarEl.style.border='none';
    } else {
      avatarEl.innerHTML=`<span style="font-size:8.5px;font-family:ui-monospace,Menlo,monospace;color:var(--faint);text-align:center;line-height:1.3">프로필<br>사진</span>`;
      avatarEl.style.background='';avatarEl.style.border='';
    }
  }
  // 이름·나이 읽기 전용 표시 (수정은 모달에서)
  const ni=document.getElementById('my-name-display');if(ni) ni.textContent=state.profile.name||'—';
  const ai=document.getElementById('my-age-display');if(ai) ai.textContent=state.profile.age?(state.profile.age+'세'):'—';

  // ── 예산 집행률 카드 ──
  const bud=budgetFor(monthKey());
  const budGroups=state.groups.filter(g=>g!=='수입');
  const totalBudget=budGroups.reduce((s,g)=>s+num(bud[g]||0),0);
  const totalActual=budGroups.reduce((s,g)=>s+groupSum(keys,g),0);
  const overallRate=totalBudget?Math.min(100,totalActual/totalBudget*100):0;
  const orc=overallRate>100?'var(--red)':overallRate>80?'var(--amber)':'var(--blue)';
  const budCard=document.getElementById('my-budget-card');
  if(budCard){
    if(totalBudget){
      budCard.innerHTML=`<div class="card" style="padding:14px 15px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:var(--muted)">월 예산 대비 집행률</div>
          <div style="font-size:10.5px;color:var(--faint)">${state.year}년 ${Number(state.mon)}월</div>
        </div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
          <span style="font-size:28px;font-weight:800;color:${orc}">${pct(overallRate)}</span>
          <span style="font-size:11.5px;color:var(--faint)">${won(totalActual)} / ${won(totalBudget)}</span>
        </div>
        <div class="bar-row" style="margin-bottom:12px"><div class="bar-fill" style="background:${orc};width:${overallRate}%"></div></div>
        ${budGroups.filter(g=>num(bud[g]||0)>0).map(g=>{
          const b=num(bud[g]||0),a=groupSum(keys,g),r=b?a/b*100:0;
          const rc=r>100?'var(--red)':r>80?'var(--amber)':'var(--green)';
          return`<div style="display:flex;align-items:center;padding:7px 0;border-top:1px solid var(--line)">
            <span class="badge" style="background:${gc(g).bg};color:${gc(g).fg};flex:none;margin-right:8px">${g}</span>
            <span style="font-size:12px;color:var(--ink);flex:1">${won(a)}<span style="color:var(--faint)"> / ${won(b)}</span></span>
            <span style="font-size:11px;font-weight:600;color:${rc};margin-right:6px">${pct(r)}</span>
            <span style="font-size:10.5px;color:var(--faint)">${won(Math.max(0,b-a))} 남음</span>
          </div>`;
        }).join('')}
        <button onclick="go('budget-input')" class="btn-outline" style="margin-top:12px;height:40px;font-size:12.5px">월 예산 입력</button>
      </div>`;
    } else {
      budCard.innerHTML=`<div class="card" style="padding:14px 15px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:3px">월 예산 대비 집행률</div>
          <div style="font-size:11px;color:var(--faint)">예산을 설정하면 집행률이 표시됩니다.</div>
        </div>
        <button onclick="go('budget-input')" class="btn-outline" style="height:36px;font-size:12px;white-space:nowrap">예산 설정</button>
      </div>`;
    }
  }
  // ── 메뉴 섹션 ──
  const menuSec=document.getElementById('my-menu-section');
  if(menuSec) menuSec.innerHTML=`<div class="card" style="padding:0">
    <div onclick="go('cat-manage')" style="display:flex;align-items:center;padding:15px 16px;border-bottom:1px solid var(--line);cursor:pointer">
      <div style="width:34px;height:34px;border-radius:var(--r-md);background:var(--blue-tint);display:flex;align-items:center;justify-content:center;font-size:15px;margin-right:13px;flex:none">🗂</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:600;color:var(--ink)">카테고리 구분 관리</div></div>
      <span style="font-size:14px;color:var(--faint)">${state.cats.length}개 ›</span>
    </div>
    <div onclick="go('budget-input')" style="display:flex;align-items:center;padding:15px 16px;border-bottom:1px solid var(--line);cursor:pointer">
      <div style="width:34px;height:34px;border-radius:var(--r-md);background:var(--green-tint);display:flex;align-items:center;justify-content:center;font-size:15px;margin-right:13px;flex:none">📊</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:600;color:var(--ink)">월 예산 입력</div></div>
      <span style="font-size:14px;color:var(--faint)">${totalBudget?won(totalBudget)+' ›':'›'}</span>
    </div>
    <div onclick="goApp('assets')" style="display:flex;align-items:center;padding:15px 16px;cursor:pointer">
      <div style="width:34px;height:34px;border-radius:var(--r-md);background:var(--amber-tint);display:flex;align-items:center;justify-content:center;font-size:15px;margin-right:13px;flex:none">🏦</div>
      <div style="flex:1"><div style="font-size:13.5px;font-weight:600;color:var(--ink)">자산현황 관리</div></div>
      <span style="font-size:14px;color:var(--faint)">${state.assets.length}개 ›</span>
    </div>
  </div>`;
  // ── 초기화 섹션 ──
  const resetSec=document.getElementById('my-reset-section');
  if(resetSec) resetSec.innerHTML=`
    <div style="font-size:11px;font-weight:700;color:var(--faint);letter-spacing:.04em;margin-bottom:8px;padding-left:2px">초기화</div>
    <div class="card" style="padding:0">
      <div style="display:flex;align-items:center;padding:14px 15px;border-bottom:1px solid var(--line)">
        <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--ink)">가계부 초기화</div><div style="font-size:11px;color:var(--faint);margin-top:2px">입력한 원자료와 월별 합계를 모두 지웁니다.</div></div>
        <button onclick="resetLedger()" style="height:34px;border-radius:var(--r-md);background:var(--red-tint);color:var(--red);border:none;font-size:12px;font-weight:600;cursor:pointer;padding:0 14px">초기화</button>
      </div>
      <div style="display:flex;align-items:center;padding:14px 15px;border-bottom:1px solid var(--line)">
        <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--ink)">자산 초기화</div><div style="font-size:11px;color:var(--faint);margin-top:2px">등록된 계좌·자산 전체를 지웁니다.</div></div>
        <button onclick="resetAssets()" style="height:34px;border-radius:var(--r-md);background:var(--red-tint);color:var(--red);border:none;font-size:12px;font-weight:600;cursor:pointer;padding:0 14px">초기화</button>
      </div>
      <div style="display:flex;align-items:center;padding:14px 15px">
        <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--ink)">예산 초기화</div><div style="font-size:11px;color:var(--faint);margin-top:2px">모든 월의 예산 설정을 지웁니다.</div></div>
        <button onclick="resetBudgets()" style="height:34px;border-radius:var(--r-md);background:var(--red-tint);color:var(--red);border:none;font-size:12px;font-weight:600;cursor:pointer;padding:0 14px">초기화</button>
      </div>
    </div>`;

  document.getElementById('my-month-title').textContent=state.year+'년 '+Number(state.mon)+'월 대분류별 합계';
  document.getElementById('my-group-list').innerHTML=GROUPS.map(g=>{
    const amt=groupSum(keys,g),pv=groupSum(prevK,g),d=amt-pv;
    return`<div style="display:flex;align-items:center;gap:10px;padding:13px 0;border-bottom:1px solid var(--line)"><span style="width:3px;height:26px;border-radius:2px;background:${gc(g).c};flex:none"></span><div style="flex:1"><div style="font-size:13px;font-weight:500;color:var(--ink)">${g}</div><div style="font-size:10.5px;color:var(--faint);margin-top:2px">전월 ${won(pv)} · ${d===0?'변동 없음':(d>0?'▲ ':'▼ ')+short(Math.abs(d))}</div></div><span style="font-size:16px;font-weight:600;color:var(--ink)">${won(amt)}</span></div>`;
  }).join('');
  const nw=netWorth(),target=num(state.goal.target),rate=target?Math.min(100,nw/target*100):0;
  document.getElementById('goal-name').value=state.goal.name;
  document.getElementById('goal-target').value=state.goal.target;
  document.getElementById('goal-bar').style.width=rate+'%';
  document.getElementById('goal-rate').textContent=target?pct(rate):'목표 미설정';
  document.getElementById('goal-remain').textContent=target?'남은 금액 '+won(Math.max(0,target-nw)):'';
}

// ── GLOBAL BINDINGS ──
Object.assign(window,{
  state,go,switchTab,logout,loadAccount,removeAccount,confirmRemoveAccount,copyAdminInfo,
  doLogin,doSignup,shuffleQs,setFindMode,rotateQ,doFind,
  saveProfile,saveGoal,
  patchDraft,setDraftGroup,addDraft,removeDraft,setDraftField,saveDrafts,
  deleteTx,openEditTx,updateEditTx,saveEditTx,closeEditTx,
  addAsset,setAssetAmount,toggleAssetCheck,deleteAsset,renderAssets,
  setBudget,toggleGroup,render,
  openProfileEdit,closeProfileEdit,saveProfileEdit,handlePhotoUpload,
  goApp,renderBudgetInput,renderCatManage,
  setBudgetAndRefresh,clearGroupBudget,fillFromLastMonth,
  addCat,removeCat,openEditCat,closeCatEditModal,renameCat,addGroup,
  resetLedger,resetAssets,resetBudgets
});

// ── CLOCK ──
function updateClock(){const el=document.getElementById('status-time');if(!el)return;const d=new Date();el.textContent=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
updateClock();setInterval(updateClock,10000);

// ── INIT ──
async function init() {
  const ca=getCachedAccounts();if(ca) state.accounts=ca;
  state.drafts=[{id:nid(),name:'',date:todayStr(),group:'변동지출',cat:'',amount:'',note:''}];

  // 사용자 활동 감지 → 비활동 타이머 리셋
  let _actThrottle=0;
  ['click','touchstart','keydown'].forEach(ev=>
    document.addEventListener(ev,()=>{ if(state.authId) resetActivity(); },{passive:true})
  );
  document.addEventListener('mousemove',()=>{
    if(!state.authId) return;
    const now=Date.now();
    if(now-_actThrottle>10000){ _actThrottle=now; resetActivity(); }
  },{passive:true});
  // 1분마다 비활동 여부 확인
  setInterval(checkInactivity, 60_000);

  // 뒤로가기 지원
  history.replaceState({screen:'landing',tab:'dash'},'');
  window.addEventListener('popstate',e=>{
    const s=e.state;if(!s)return;
    state.screen=s.screen||'landing';
    if(s.tab) state.tab=s.tab;
    if(state.screen==='find'){state.findMode=s.extra||'id';setFindMode(state.findMode);}
    if(state.screen==='signup') shuffleQs();
    render();
    document.getElementById('scroll-area').scrollTop=0;
  });

  // 랜딩 먼저 표시
  render();

  // Firestore 계정 목록 로드
  try {
    const accounts=await fetchAccounts();
    if(accounts.length===0){
      const def=state.accounts[0];
      await saveAccount(def);
      await saveUserData(def.id,{txs:[],assets:[],budgets:{},cats:DEF_CATS.slice(),groups:GROUPS.slice(),profile:{name:def.name,age:'',photo:null},goal:{name:'목표 설정',target:'0'}});
    } else {state.accounts=accounts;}
    cacheAccounts();
  } catch(e){console.warn('Firestore 초기화 실패:',e);}

  // 저장된 로그인 복원 (계정 목록 로드 완료 후)
  const storedId=getStoredAuth();
  if(storedId) {
    const acct=state.accounts.find(a=>a.id===storedId);
    const expired=Date.now()-lastActivity() > INACTIVITY_MS;
    if(acct && !expired) {
      await loadAccount(storedId); // 자동 재로그인
      return;
    }
    clearAuth(); // 만료되었거나 계정 없음 → 제거
  }
}
init();
