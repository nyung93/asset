import './style.css';
import { fetchAccounts, saveAccount, deleteAccount, fetchUserData, saveUserData } from './db.js';

// ─────────────────────────────────────────
//  상수 & 유틸
// ─────────────────────────────────────────
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

const hashFn = (s) => {
  let h = 5381, t = String(s);
  for (let i = 0; i < t.length; i++) h = (((h << 5) + h) ^ t.charCodeAt(i)) >>> 0;
  return 'sha·' + h.toString(36) + t.length.toString(36);
};
const won   = (n) => '₩' + Math.round(n).toLocaleString('ko-KR');
const short = (n) => { const a = Math.abs(n); if (a >= 1e8) return (n/1e8).toFixed(a>=1e9?0:1).replace(/\.0$/,'')+'억'; if (a >= 1e4) return Math.round(n/1e4).toLocaleString('ko-KR')+'만'; return n.toLocaleString('ko-KR'); };
const pct   = (n) => (Math.round(n*10)/10).toFixed(n%1===0?0:1) + '%';
const num   = (v) => { const n = parseInt(String(v).replace(/[^0-9-]/g,''), 10); return isNaN(n) ? 0 : n; };
const digits    = (v) => String(v).replace(/[^0-9]/g,'');
const maskPhone = (p) => p && p.length >= 10 ? p.slice(0,3)+'-****-'+p.slice(-4) : (p || '—');
const gc = (g) => GC[g] || { c:'#9aa3b0', bg:'#eceff5', fg:'#6b7482' };
const at = (t) => AT[t] || { c:'#9aa3b0', bg:'#eceff5', fg:'#6b7482' };
const todayStr = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
const state = {
  screen: 'landing',
  tab: 'dash',
  year: String(new Date().getFullYear()),
  mon:  String(new Date().getMonth()+1).padStart(2,'0'),
  profile: { name:'', age:'' },
  goal: { name:'목표 설정', target:'0' },
  txs: [], assets: [], budgets: {},
  groups: GROUPS.slice(),
  cats: DEF_CATS.slice(),
  openGroups: {},
  authId: null,
  accounts: [{ id:'test1', name:'테스트', phone:'', pw:hashFn('1234'), qs:[{q:QPOOL[0],a:hashFn('test')}], createdAt:todayStr() }],
  drafts: [],
  signupQs: [],
  findMode: 'id',
  findQIdx: 0,
  newAssetType: '현금',
  seq: 100
};

function nid() { return ++state.seq; }

// ─────────────────────────────────────────
//  LOADING
// ─────────────────────────────────────────
function setLoading(v) {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = v ? 'flex' : 'none';
}

// ─────────────────────────────────────────
//  COMPUTED HELPERS
// ─────────────────────────────────────────
function monthKey()    { return state.year + state.mon; }
function currentKeys() { return [state.year + state.mon]; }
function prevKeys() {
  const pn = Number(state.mon) - 1;
  return pn >= 1 ? [state.year + String(pn).padStart(2,'0')] : [String(Number(state.year)-1) + '12'];
}
function groupSum(keys, g) {
  return state.txs
    .filter(t => keys.includes(t.date.replace(/-/g,'').slice(0,6)) && t.group === g)
    .reduce((s,t) => s + num(t.amount), 0);
}
function spendGroups()    { return state.groups.filter(g => g !== '수입' && g !== '저축/투자'); }
function spendTotal(keys) { return spendGroups().reduce((s,g) => s + groupSum(keys,g), 0); }
function assetTotal()     { return state.assets.filter(a => a.type !== '대출').reduce((s,a) => s + num(a.amount), 0); }
function debtTotal()      { return state.assets.filter(a => a.type === '대출').reduce((s,a) => s + num(a.amount), 0); }
function netWorth()       { return assetTotal() - debtTotal(); }
function budgetFor(key)   { return state.budgets[key] || {}; }
function monthTxs(keys)   { return state.txs.filter(t => keys.includes(t.date.replace(/-/g,'').slice(0,6))).sort((a,b) => a.date < b.date ? 1 : -1); }
function snapshotData()   {
  return {
    txs:     state.txs.slice(),
    assets:  state.assets.slice(),
    budgets: { ...state.budgets },
    cats:    state.cats.slice(),
    groups:  state.groups.slice(),
    profile: { ...state.profile },
    goal:    { ...state.goal }
  };
}

// ─────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────
function go(screen, extra) {
  if (screen === 'find')   { state.findMode = extra || 'id'; setFindMode(state.findMode); }
  if (screen === 'signup') { shuffleQs(); }
  state.screen = screen;
  render();
  document.getElementById('scroll-area').scrollTop = 0;
}

function switchTab(tab) {
  state.tab = tab;
  if (tab === 'input' && state.drafts.length === 0) addDraft();
  render();
  document.getElementById('scroll-area').scrollTop = 0;
}

async function logout() {
  if (state.authId) {
    setLoading(true);
    try { await saveUserData(state.authId, snapshotData()); } catch(e) { console.error('로그아웃 저장 실패:', e); }
    setLoading(false);
  }
  state.screen = 'landing'; state.authId = null; state.tab = 'dash';
  render();
}

// ─────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────
async function doLogin() {
  const id = (document.getElementById('l-id').value || '').trim();
  const pw = document.getElementById('l-pw').value || '';
  if (!id || !pw) { showNotice('login-notice','아이디와 비밀번호를 입력하세요.',false); return; }
  if (id === 'admin' && pw === 'admin') { go('admin'); renderAdmin(); return; }
  const acct = state.accounts.find(a => a.id === id);
  if (!acct || acct.pw !== hashFn(pw)) { showNotice('login-notice','아이디 또는 비밀번호가 올바르지 않습니다.',false); return; }
  await loadAccount(id);
}

async function loadAccount(id) {
  setLoading(true);
  let d = null;
  try { d = await fetchUserData(id); } catch(e) { console.error('데이터 로드 실패:', e); }
  setLoading(false);
  if (d) {
    state.txs     = JSON.parse(JSON.stringify(d.txs || []));
    state.assets  = JSON.parse(JSON.stringify(d.assets || []));
    state.budgets = JSON.parse(JSON.stringify(d.budgets || {}));
    state.cats    = (d.cats || DEF_CATS).slice();
    state.groups  = (d.groups || GROUPS).slice();
    state.profile = { ...(d.profile || { name:id, age:'' }) };
    state.goal    = { ...(d.goal || { name:'목표 설정', target:'0' }) };
  } else {
    state.txs = []; state.assets = []; state.budgets = {};
    state.cats = DEF_CATS.slice(); state.groups = GROUPS.slice();
    const acct = state.accounts.find(a => a.id === id);
    state.profile = { name: acct ? acct.name : id, age:'' };
    state.goal    = { name:'목표 설정', target:'0' };
  }
  state.authId = id;
  state.screen = 'app';
  state.tab    = 'dash';
  state.drafts = [{ id:nid(), name:'', date:todayStr(), group:'변동지출', cat:'', amount:'', note:'' }];
  render();
}

async function doSignup() {
  const name  = (document.getElementById('su-name').value || '').trim();
  const id    = (document.getElementById('su-id').value || '').trim();
  const pw    = document.getElementById('su-pw').value || '';
  const pw2   = document.getElementById('su-pw2').value || '';
  const phone = digits(document.getElementById('su-phone').value || '');
  if (!name)             { showNotice('signup-notice','이름을 입력하세요.',false); return; }
  if (id.length < 4)     { showNotice('signup-notice','아이디는 4자 이상 입력하세요.',false); return; }
  if (state.accounts.some(a => a.id === id) || id === 'admin') { showNotice('signup-notice','이미 사용 중인 아이디입니다.',false); return; }
  if (pw.length < 6)     { showNotice('signup-notice','비밀번호는 6자 이상 입력하세요.',false); return; }
  if (pw !== pw2)        { showNotice('signup-notice','비밀번호 확인이 일치하지 않습니다.',false); return; }
  if (phone.length < 10) { showNotice('signup-notice','휴대폰 번호를 정확히 입력하세요.',false); return; }
  const qs = state.signupQs.map((q,i) => ({ q, a:(document.getElementById('su-q'+i)||{value:''}).value.trim() }));
  if (qs.some(x => !x.a)) { showNotice('signup-notice','비밀번호 찾기 질문 3개에 모두 답해주세요.',false); return; }
  const acct = { id, name, phone, pw:hashFn(pw), qs:qs.map(x => ({q:x.q, a:hashFn(x.a)})), createdAt:todayStr() };
  setLoading(true);
  try {
    await saveAccount(acct);
    await saveUserData(id, { txs:[], assets:[], budgets:{}, cats:DEF_CATS.slice(), groups:GROUPS.slice(), profile:{name,age:''}, goal:{name:'목표 설정',target:'0'} });
    state.accounts.push(acct);
  } catch(e) {
    setLoading(false);
    showNotice('signup-notice','서버 오류가 발생했습니다. 다시 시도해 주세요.',false);
    return;
  }
  setLoading(false);
  go('login');
  setTimeout(() => showNotice('login-notice','가입이 완료되었습니다. 로그인해 주세요.',true), 50);
}

function shuffleQs() {
  const pool = [...QPOOL], out = [];
  while (out.length < 1 && pool.length) out.push(pool.splice(Math.floor(Math.random()*pool.length), 1)[0]);
  state.signupQs = out;
  renderSignupQs();
}
function renderSignupQs() {
  const el = document.getElementById('su-qs'); if (!el) return;
  el.innerHTML = state.signupQs.map((q,i) => `
    <div style="background:var(--card);border:1px solid var(--line);border-radius:var(--r-md);padding:12px 13px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:18px;height:18px;border-radius:50%;background:var(--blue-tint);color:var(--blue);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none">${i+1}</span>
        <span style="font-size:12px;font-weight:600;color:var(--ink)">${q}</span>
      </div>
      <input id="su-q${i}" class="inp-sm" placeholder="답변 입력" style="width:100%;margin-top:9px">
    </div>`).join('');
}

function setFindMode(mode) {
  state.findMode = mode;
  document.getElementById('find-id-fields').style.display = mode === 'id' ? 'block' : 'none';
  document.getElementById('find-pw-fields').style.display = mode === 'pw' ? 'flex' : 'none';
  const sid = document.getElementById('find-seg-id'), spw = document.getElementById('find-seg-pw');
  if (sid) sid.style.cssText = mode === 'id' ? 'background:var(--card);color:var(--ink)' : '';
  if (spw) spw.style.cssText = mode === 'pw' ? 'background:var(--card);color:var(--ink)' : '';
  updateFindQ();
}
function updateFindQ() {
  const id   = (document.getElementById('f-id') || {value:''}).value.trim();
  const acct = state.accounts.find(a => a.id === id);
  const q    = acct ? acct.qs[state.findQIdx % acct.qs.length] : null;
  const el   = document.getElementById('find-q-text');
  if (el) el.textContent = q ? q.q : '아이디를 먼저 입력하세요';
}
function rotateQ() {
  const id   = (document.getElementById('f-id') || {value:''}).value.trim();
  const acct = state.accounts.find(a => a.id === id);
  if (!acct || acct.qs.length <= 1) return;
  state.findQIdx = (state.findQIdx + 1) % acct.qs.length;
  updateFindQ();
}
async function doFind() {
  const mode = state.findMode;
  clearNotice('find-notice');
  if (mode === 'id') {
    const phone = digits(document.getElementById('f-phone-id').value || '');
    if (phone.length < 10) { showNotice('find-notice','휴대폰 번호를 정확히 입력하세요.',false); return; }
    const hits = state.accounts.filter(a => a.phone === phone);
    if (!hits.length) { showNotice('find-notice','해당 번호로 가입된 계정이 없습니다.',false); return; }
    showNotice('find-notice','찾은 아이디: '+hits.map(a=>a.id).join(', '),true);
  } else {
    const id    = (document.getElementById('f-id').value || '').trim();
    const phone = digits(document.getElementById('f-phone-pw').value || '');
    const ans   = (document.getElementById('f-ans').value || '').trim();
    const npw   = document.getElementById('f-npw').value || '';
    const acct  = state.accounts.find(a => a.id === id);
    if (!acct)               { showNotice('find-notice','가입된 아이디가 아닙니다.',false); return; }
    if (acct.phone !== phone){ showNotice('find-notice','휴대폰 번호가 일치하지 않습니다.',false); return; }
    const q = acct.qs[state.findQIdx % acct.qs.length];
    if (!ans)                { showNotice('find-notice','질문에 답해주세요.',false); return; }
    if (q.a !== hashFn(ans)) { showNotice('find-notice','질문 답이 일치하지 않습니다.',false); return; }
    if (npw.length < 6)      { showNotice('find-notice','새 비밀번호는 6자 이상 입력하세요.',false); return; }
    acct.pw = hashFn(npw);
    setLoading(true);
    try { await saveAccount(acct); showNotice('find-notice','비밀번호가 변경되었습니다.',true); }
    catch(e) { showNotice('find-notice','저장 실패. 다시 시도해 주세요.',false); }
    setLoading(false);
  }
}

// ─────────────────────────────────────────
//  ADMIN
// ─────────────────────────────────────────
function renderAdmin() {
  const el = document.getElementById('admin-list'); if (!el) return;
  document.getElementById('admin-sub').textContent = '가입 계정 '+state.accounts.length+'개 · 비밀번호는 해시로만 보관';
  el.innerHTML = state.accounts.map(a => `
    <div class="card" style="padding:14px 15px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14.5px;font-weight:700;color:var(--ink)">${a.name}</span>
        <span style="font-size:11.5px;color:var(--muted)">@${a.id}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">
        <span class="badge" style="background:var(--track);color:var(--muted)">${maskPhone(a.phone)}</span>
        <span class="badge" style="background:var(--track);color:var(--muted)">질문 ${a.qs.length}개</span>
        <span class="badge" style="background:var(--track);color:var(--muted)">가입 ${a.createdAt}</span>
      </div>
      <div style="display:flex;gap:7px;margin-top:12px">
        <div onclick="loadAccount('${a.id}')" style="flex:1;height:38px;border-radius:var(--r-md);background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;cursor:pointer">데이터 열기</div>
        <div onclick="removeAccount('${a.id}')" style="width:44px;height:38px;border-radius:var(--r-md);background:var(--red-tint);color:var(--red);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;cursor:pointer;flex:none">삭제</div>
      </div>
    </div>`).join('');
}
async function removeAccount(id) {
  if (!confirm(id+' 계정을 삭제하시겠습니까?')) return;
  setLoading(true);
  try { await deleteAccount(id); } catch(e) { console.error(e); }
  state.accounts = state.accounts.filter(a => a.id !== id);
  setLoading(false);
  renderAdmin();
}

// ─────────────────────────────────────────
//  DRAFT
// ─────────────────────────────────────────
function addDraft() {
  state.drafts.push({ id:nid(), name:'', date:todayStr(), group:'변동지출', cat:'', amount:'', note:'' });
  if (state.screen === 'app' && state.tab === 'input') renderInput();
}
function removeDraft(id) {
  state.drafts = state.drafts.filter(d => d.id !== id);
  renderInput();
}
function setDraftField(id, field, val) {
  state.drafts = state.drafts.map(d => d.id === id ? { ...d, [field]:val } : d);
  renderInput();
}
async function saveDrafts() {
  const valid = state.drafts.filter(d => d.name.trim() && d.amount);
  if (!valid.length) { showToast('저장할 항목이 없습니다.'); return; }
  valid.forEach(d => state.txs.push({ id:nid(), name:d.name.trim(), date:d.date, group:d.group, cat:d.cat||'미분류', amount:num(d.amount), note:d.note }));
  state.drafts = [{ id:nid(), name:'', date:todayStr(), group:'변동지출', cat:'', amount:'', note:'' }];
  renderInput();
  try {
    await saveUserData(state.authId, snapshotData());
    showToast(valid.length+'건 저장되었습니다.');
  } catch(e) {
    showToast('저장 실패. 다시 시도해 주세요.');
  }
}

// ─────────────────────────────────────────
//  ASSETS
// ─────────────────────────────────────────
async function addAsset() {
  const name   = document.getElementById('new-asset-name').value.trim();
  const amount = num(document.getElementById('new-asset-amount').value);
  if (!name) { showToast('자산 이름을 입력하세요.'); return; }
  state.assets.push({ id:nid(), name, type:state.newAssetType, amount, checked:false });
  document.getElementById('new-asset-name').value   = '';
  document.getElementById('new-asset-amount').value = '';
  renderAssets();
  try { await saveUserData(state.authId, snapshotData()); }
  catch(e) { showToast('저장 실패.'); }
}
let _assetSaveTimer;
function setAssetAmount(id, val) {
  state.assets = state.assets.map(a => a.id === id ? { ...a, amount:num(val) } : a);
  renderAssetSummary();
  clearTimeout(_assetSaveTimer);
  _assetSaveTimer = setTimeout(() => saveUserData(state.authId, snapshotData()).catch(console.error), 800);
}
async function toggleAssetCheck(id) {
  state.assets = state.assets.map(a => a.id === id ? { ...a, checked:!a.checked } : a);
  renderAssets();
  try { await saveUserData(state.authId, snapshotData()); } catch(e) {}
}

// ─────────────────────────────────────────
//  NOTICE / TOAST
// ─────────────────────────────────────────
function showNotice(elId, msg, ok) {
  const el = document.getElementById(elId); if (!el) return;
  el.innerHTML = `<div class="notice ${ok?'notice-ok':'notice-err'}">${msg}</div>`;
}
function clearNotice(elId) { const el = document.getElementById(elId); if (el) el.innerHTML = ''; }
let _toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ─────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────
function render() {
  ['s-landing','s-login','s-signup','s-find','s-admin','s-app'].forEach(id => {
    document.getElementById(id).classList.remove('active');
  });
  const sb = document.getElementById('status-bar');
  const tb = document.getElementById('tab-bar');

  if (state.screen === 'landing') {
    document.getElementById('s-landing').classList.add('active');
    sb.style.background='var(--blue)'; sb.style.color='#fff';
    tb.style.display='none';
  } else if (state.screen === 'login') {
    document.getElementById('s-login').classList.add('active');
    sb.style.background='var(--bg)'; sb.style.color='var(--ink)';
    tb.style.display='none';
  } else if (state.screen === 'signup') {
    document.getElementById('s-signup').classList.add('active');
    renderSignupQs();
    sb.style.background='var(--bg)'; sb.style.color='var(--ink)';
    tb.style.display='none';
  } else if (state.screen === 'find') {
    document.getElementById('s-find').classList.add('active');
    sb.style.background='var(--bg)'; sb.style.color='var(--ink)';
    tb.style.display='none';
  } else if (state.screen === 'admin') {
    document.getElementById('s-admin').classList.add('active');
    sb.style.background='var(--blue)'; sb.style.color='#fff';
    tb.style.display='none';
    renderAdmin();
  } else if (state.screen === 'app') {
    document.getElementById('s-app').classList.add('active');
    tb.style.display='flex';
    ['dash','ledger','input','assets','mypage'].forEach(t => {
      document.getElementById('tab-'+t).style.display = state.tab === t ? 'block' : 'none';
    });
    ['dash','ledger','assets','mypage'].forEach(t => {
      document.getElementById('tb-'+t).classList.toggle('active', state.tab === t);
    });
    if (state.tab === 'dash' || state.tab === 'assets') {
      sb.style.background='var(--blue)'; sb.style.color='#fff';
    } else {
      sb.style.background='var(--card)'; sb.style.color='var(--ink)';
    }
    if      (state.tab === 'dash')   renderDash();
    else if (state.tab === 'ledger') renderLedger();
    else if (state.tab === 'input')  renderInput();
    else if (state.tab === 'assets') renderAssets();
    else if (state.tab === 'mypage') renderMypage();
  }
}

// ─────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────
function renderDash() {
  const keys = currentKeys(), prevK = prevKeys();
  const nw = netWorth(), totalAssets = assetTotal();
  const income = groupSum(keys,'수입'), spend = spendTotal(keys), flow = income - spend;
  const prevIncome = groupSum(prevK,'수입'), prevSpend = spendTotal(prevK);

  document.getElementById('d-net-worth').textContent = won(nw);
  document.getElementById('d-month-label').textContent = state.year+'년 '+Number(state.mon)+'월';
  document.getElementById('d-net-flow').textContent = (flow >= 0 ? '+ ' : '-') + short(Math.abs(flow));
  document.getElementById('d-net-flow').style.color = flow >= 0 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.7)';
  document.getElementById('d-income').textContent = won(income);
  document.getElementById('d-prev-income').textContent = '전월 '+won(prevIncome);
  document.getElementById('d-spend').textContent = won(spend);
  document.getElementById('d-prev-spend').textContent = '전월 '+won(prevSpend);

  const types = AT_ORDER.filter(t => state.assets.some(a => a.type === t && a.type !== '대출'));
  const barEl = document.getElementById('d-asset-bar');
  const legEl = document.getElementById('d-asset-legend');
  if (totalAssets > 0) {
    barEl.innerHTML = types.map(t => {
      const sum = state.assets.filter(a => a.type === t).reduce((s,a) => s + num(a.amount), 0);
      return `<div class="asset-bar-seg" style="background:${at(t).c};width:${sum/totalAssets*100}%"></div>`;
    }).join('');
    legEl.innerHTML = types.map(t => {
      const sum = state.assets.filter(a => a.type === t).reduce((s,a) => s + num(a.amount), 0);
      return `<div class="legend-item"><div class="legend-dot" style="background:${at(t).c}"></div><span class="legend-label">${t}</span><span class="legend-pct">${pct(sum/totalAssets*100)}</span></div>`;
    }).join('');
  } else {
    barEl.innerHTML = ''; legEl.innerHTML = '';
  }

  const top = state.assets.filter(a => a.type !== '대출').sort((a,b) => num(b.amount) - num(a.amount)).slice(0,5);
  document.getElementById('d-asset-list').innerHTML = top.length ? top.map(a => `
    <div class="asset-list-item">
      <span class="badge" style="background:${at(a.type).bg};color:${at(a.type).fg}">${a.type}</span>
      <span style="font-size:13px;color:var(--ink);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</span>
      <span style="font-size:13px;font-weight:600;color:var(--ink)">${won(num(a.amount))}</span>
    </div>`).join('') : '<div style="padding:22px;text-align:center;font-size:12px;color:var(--faint)">등록된 자산이 없습니다.</div>';

  document.getElementById('d-group-title').textContent = state.year+'년 '+Number(state.mon)+'월 구분별 합계';
  const maxG = Math.max(1, ...GROUPS.map(g => groupSum(keys,g)));
  document.getElementById('d-group-list').innerHTML = GROUPS.map(g => {
    const amt = groupSum(keys,g);
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
      <span style="width:3px;height:16px;border-radius:2px;background:${gc(g).c};flex:none"></span>
      <span style="font-size:12.5px;color:var(--ink);flex:none;width:66px">${g}</span>
      <div class="bar-row" style="flex:1"><div class="bar-fill" style="background:${gc(g).c};width:${amt/maxG*100}%"></div></div>
      <span style="font-size:12.5px;font-weight:500;color:var(--ink);flex:none">${won(amt)}</span>
    </div>`;
  }).join('');

  const recent = monthTxs(keys).slice(0,4);
  document.getElementById('d-recent-tx').innerHTML = recent.map(t => `
    <div class="tx-item">
      <div class="tx-top">
        <span class="tx-name">${t.name}</span>
        <span class="tx-amt" style="color:${gc(t.group).c}">${t.group==='수입'?'+ ':'-'}${won(num(t.amount))}</span>
      </div>
      <div class="tx-meta">
        <span class="badge" style="background:${gc(t.group).bg};color:${gc(t.group).fg}">${t.group}</span>
        <span class="badge" style="background:var(--track);color:var(--muted)">${t.cat}</span>
        <span style="flex:1"></span>
        <span class="tx-day">${t.date.slice(5)}</span>
      </div>
    </div>`).join('') + `<div class="row-link" onclick="switchTab('input')">원자료 입력하기</div>`;
}

// ─────────────────────────────────────────
//  LEDGER
// ─────────────────────────────────────────
function renderLedger() {
  const keys = currentKeys(), prevK = prevKeys();
  const income = groupSum(keys,'수입'), spend = spendTotal(keys), flow = income - spend;

  ['ledger-year','my-year'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = Number(state.year);
    el.innerHTML = [cur-1,cur,cur+1].map(y => `<option value="${y}" ${y===Number(state.year)?'selected':''}>${y}년</option>`).join('');
  });
  ['ledger-mon','my-mon'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = [...Array(12)].map((_,i) => { const m = String(i+1).padStart(2,'0'); return `<option value="${m}" ${m===state.mon?'selected':''}>${i+1}월</option>`; }).join('');
  });

  document.getElementById('ledger-sub-label').textContent = state.year+'년 '+Number(state.mon)+'월';
  document.getElementById('l-income').textContent = won(income);
  document.getElementById('l-spend').textContent  = won(spend);
  document.getElementById('l-net').textContent    = won(flow);

  const sgNames = spendGroups();
  let acc = 0;
  const stops = sgNames.map(g => { const amt = groupSum(keys,g); const p = spend ? amt/spend*100 : 0; const s = acc; acc += p; return `${gc(g).c} ${s}% ${acc}%`; });
  document.getElementById('l-donut').style.background = spend ? `conic-gradient(${stops.join(',')})` : 'var(--track)';
  document.getElementById('l-donut-val').textContent = short(spend);
  document.getElementById('l-donut-legend').innerHTML = sgNames.map(g => {
    const amt = groupSum(keys,g);
    return `<div style="display:flex;align-items:center;gap:7px"><span style="width:8px;height:8px;border-radius:3px;background:${gc(g).c};flex:none"></span><span style="font-size:11.5px;color:var(--muted);flex:1">${g}</span><span style="font-size:11.5px;font-weight:600;color:var(--ink)">${spend?pct(amt/spend*100):'0%'}</span></div>`;
  }).join('');

  const maxG = Math.max(1, ...GROUPS.map(g => groupSum(keys,g)));
  document.getElementById('l-groups').innerHTML = GROUPS.map(g => {
    const amt = groupSum(keys,g), pv = groupSum(prevK,g), d = amt - pv;
    const open = !!state.openGroups[g];
    const cats = state.txs.filter(t => keys.includes(t.date.replace(/-/g,'').slice(0,6)) && t.group === g);
    const catMap = {}; cats.forEach(t => { catMap[t.cat||'미분류'] = (catMap[t.cat||'미분류']||0) + num(t.amount); });
    const catRows = Object.keys(catMap).sort((a,b) => catMap[b]-catMap[a]).map(k => `
      <div class="group-body-item">
        <span style="font-size:12px;color:var(--muted);flex:1">${k}</span>
        <span style="font-size:12.5px;font-weight:500;color:var(--ink)">${won(catMap[k])}</span>
      </div>`).join('');
    return `<div class="group-card">
      <div class="group-card-header" onclick="toggleGroup('${g}')">
        <div style="display:flex;align-items:center;gap:9px">
          <span class="badge" style="background:${gc(g).bg};color:${gc(g).fg}">${g}</span>
          <span style="flex:1"></span>
          <span style="font-size:15px;font-weight:600;color:var(--ink)">${won(amt)}</span>
          <span style="font-size:11px;color:var(--faint);transform:${open?'rotate(180deg)':'none'};display:inline-block">▾</span>
        </div>
        <div style="display:flex;align-items:center;gap:9px;margin-top:10px">
          <div class="bar-row" style="flex:1"><div class="bar-fill" style="background:${gc(g).c};width:${amt/maxG*100}%"></div></div>
          <span style="font-size:10.5px;color:var(--muted);flex:none">${d===0?'변동 없음':(d>0?'▲ ':'▼ ')+short(Math.abs(d))}</span>
        </div>
      </div>
      ${open ? `<div class="group-card-body">${catRows||'<div style="padding:11px 0;font-size:11.5px;color:var(--faint)">내역이 없습니다.</div>'}</div>` : ''}
    </div>`;
  }).join('');

  const bud = budgetFor(monthKey()), budKeys = Object.keys(bud);
  document.getElementById('l-budget').innerHTML = budKeys.length ? budKeys.map(g => {
    const b = num(bud[g]), a = groupSum(keys,g), r = b ? a/b*100 : 0;
    const rc = r > 100 ? 'var(--red)' : r > 80 ? 'var(--amber)' : 'var(--green)';
    return `<div class="budget-row">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-size:12.5px;color:var(--ink);flex:1">${g}</span>
        <span style="font-size:12.5px;font-weight:600;color:${rc}">${b?pct(r):'예산 미설정'}</span>
      </div>
      <div class="bar-row" style="margin-top:7px"><div class="bar-fill" style="background:${rc};width:${Math.min(100,r)}%"></div></div>
      <div style="font-size:10.5px;color:var(--faint);margin-top:5px">${won(a)} / 예산 ${won(b)}</div>
    </div>`;
  }).join('') : '<div style="padding:14px;font-size:12px;color:var(--faint)">예산이 설정되지 않았습니다.</div>';

  const txs = monthTxs(keys);
  document.getElementById('l-tx-title').textContent = '원자료 '+txs.length+'건';
  document.getElementById('l-tx-list').innerHTML = txs.length ? txs.map(t => `
    <div style="display:flex;gap:10px;padding:12px 15px;border-bottom:1px solid var(--line)">
      <div style="font-size:10.5px;color:var(--faint);flex:none;width:34px;line-height:1.6">${t.date.slice(5)}</div>
      <div style="flex:1;min-width:0">
        <div class="tx-top"><span class="tx-name">${t.name}</span><span class="tx-amt" style="color:${gc(t.group).c}">${t.group==='수입'?'+ ':'-'}${won(num(t.amount))}</span></div>
        <div class="tx-meta"><span class="badge" style="background:${gc(t.group).bg};color:${gc(t.group).fg}">${t.group}</span><span class="badge" style="background:var(--track);color:var(--muted)">${t.cat}</span></div>
      </div>
    </div>`).join('') :
    '<div style="padding:22px;text-align:center;font-size:12px;color:var(--faint)">이 달의 원자료가 없습니다.<br><span style="color:var(--blue);cursor:pointer" onclick="switchTab(\'input\')">입력하러 가기</span></div>';
}

function toggleGroup(g) { state.openGroups[g] = !state.openGroups[g]; renderLedger(); }

// ─────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────
function renderInput() {
  document.getElementById('inp-sub-label').textContent = state.year+'년 '+Number(state.mon)+'월 · 작성 중 '+state.drafts.length+'건';
  const list = document.getElementById('draft-list');
  list.innerHTML = state.drafts.map((d,i) => {
    const cats = state.cats.filter(c => c.group === d.group).map(c => c.name);
    const groupChips = GROUPS.map(g => `<div class="chip ${d.group===g?'sel':''}" onclick="setDraftField(${d.id},'group','${g}');setDraftField(${d.id},'cat','')" style="${d.group===g?'background:'+gc(g).bg+';color:'+gc(g).fg+';border-color:'+gc(g).c:''}">${g}</div>`).join('');
    const catChips   = cats.map(c => `<div class="chip ${d.cat===c?'sel':''}" onclick="setDraftField(${d.id},'cat','${c}')" style="${d.cat===c?'background:'+gc(d.group).bg+';color:'+gc(d.group).fg+';border-color:'+gc(d.group).c:''}">${c}</div>`).join('');
    const fmtAmt = d.amount && !isNaN(num(d.amount)) ? won(Math.abs(num(d.amount))) : '—';
    return `<div class="draft-card">
      <div class="draft-top"><div class="draft-no">항목 ${i+1}</div><div class="draft-del" onclick="removeDraft(${d.id})">삭제</div></div>
      <div class="lbl">항목명</div>
      <input class="inp-sm" style="width:100%" value="${d.name}" placeholder="예: 이쁜이사료" oninput="setDraftField(${d.id},'name',this.value)">
      <div style="display:flex;gap:9px;margin-top:11px">
        <div style="flex:1"><div class="lbl">날짜</div><input type="date" class="inp-sm" style="width:100%" value="${d.date}" onchange="setDraftField(${d.id},'date',this.value)"></div>
        <div style="flex:1"><div class="lbl">금액</div><input class="inp-sm" style="width:100%;text-align:right" inputmode="numeric" value="${d.amount}" placeholder="0" oninput="setDraftField(${d.id},'amount',this.value)"></div>
      </div>
      <div class="lbl" style="margin-top:11px">수입지출구분</div>
      <div class="chip-group">${groupChips}</div>
      ${cats.length ? `<div class="lbl" style="margin-top:11px">카테고리</div><div class="chip-group">${catChips}</div>` : ''}
      <div class="lbl" style="margin-top:11px">비고</div>
      <input class="inp-sm" style="width:100%" value="${d.note}" placeholder="선택 입력" oninput="setDraftField(${d.id},'note',this.value)">
      <div class="draft-preview">
        <div class="draft-preview-lbl">월별가계부 ${state.year+state.mon}으로 집계</div>
        <div class="draft-preview-amt" style="color:${d.group==='수입'?'var(--green)':'var(--red)'}">${d.group==='수입'?'+ ':'-'}${fmtAmt}</div>
      </div>
    </div>`;
  }).join('');
  const sb  = document.getElementById('save-btn');
  const cnt = state.drafts.filter(d => d.name.trim() && d.amount).length;
  sb.textContent      = cnt ? `${cnt}건 저장` : '항목을 입력하세요';
  sb.style.background = cnt ? 'var(--blue)' : 'var(--disabled)';
}

// ─────────────────────────────────────────
//  ASSETS
// ─────────────────────────────────────────
function renderAssets() {
  renderAssetSummary();
  const chipEl = document.getElementById('asset-type-chips');
  if (chipEl) chipEl.innerHTML = AT_ORDER.map(t => `<div class="chip ${state.newAssetType===t?'sel':''}" onclick="state.newAssetType='${t}';renderAssets()">${t}</div>`).join('');
  const types = AT_ORDER.filter(t => state.assets.some(a => a.type === t));
  document.getElementById('asset-group-list').innerHTML = types.map(t => {
    const items = state.assets.filter(a => a.type === t);
    const sum   = items.reduce((s,a) => s + num(a.amount), 0);
    return `<div class="asset-group-card">
      <div class="asset-group-hd">
        <span class="badge" style="background:${at(t).bg};color:${at(t).fg}">${t}</span>
        <span style="font-size:11px;color:var(--faint);flex:1">${items.length}개</span>
        <span style="font-size:14.5px;font-weight:600;color:var(--ink)">${won(sum)}</span>
      </div>
      ${items.map(a => `<div class="asset-input-row">
        <div onclick="toggleAssetCheck(${a.id})" style="width:17px;height:17px;border-radius:var(--r-sm);flex:none;border:1px solid ${a.checked?'var(--blue)':'var(--line)'};background:${a.checked?'var(--blue)':'var(--bg)'};display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;color:#fff">${a.checked?'✓':''}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</div>
          <div style="font-size:10.5px;color:var(--faint);margin-top:2px">${assetTotal()?'전체의 '+pct(num(a.amount)/assetTotal()*100):'—'}</div>
        </div>
        <input class="inp-sm" inputmode="numeric" style="width:106px;text-align:right" value="${a.amount}" onchange="setAssetAmount(${a.id},this.value)">
      </div>`).join('')}
    </div>`;
  }).join('');
}
function renderAssetSummary() {
  const tot = assetTotal(), dt = debtTotal(), nw = netWorth();
  const el  = document.getElementById('a-total'); if (el) el.textContent = won(tot);
  const sub = document.getElementById('a-sub');   if (sub) sub.textContent = '부채 '+won(dt)+' · 순자산 '+won(nw);
}

// ─────────────────────────────────────────
//  MYPAGE
// ─────────────────────────────────────────
function renderMypage() {
  const keys = currentKeys(), prevK = prevKeys();
  const acct = state.accounts.find(a => a.id === state.authId);
  ['ledger-year','my-year'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = Number(state.year);
    el.innerHTML = [cur-1,cur,cur+1].map(y => `<option value="${y}" ${y===Number(state.year)?'selected':''}>${y}년</option>`).join('');
  });
  ['ledger-mon','my-mon'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = [...Array(12)].map((_,i) => { const m = String(i+1).padStart(2,'0'); return `<option value="${m}" ${m===state.mon?'selected':''}>${i+1}월</option>`; }).join('');
  });
  if (acct) {
    document.getElementById('my-id-badge').textContent = '@'+acct.id;
    document.getElementById('my-phone').textContent    = maskPhone(acct.phone);
  }
  const ni = document.getElementById('my-name'), ai = document.getElementById('my-age');
  if (ni) ni.value = state.profile.name;
  if (ai) ai.value = state.profile.age;
  document.getElementById('my-month-title').textContent = state.year+'년 '+Number(state.mon)+'월 대분류별 합계';

  document.getElementById('my-group-list').innerHTML = GROUPS.map(g => {
    const amt = groupSum(keys,g), pv = groupSum(prevK,g), d = amt - pv;
    return `<div style="display:flex;align-items:center;gap:10px;padding:13px 0;border-bottom:1px solid var(--line)">
      <span style="width:3px;height:26px;border-radius:2px;background:${gc(g).c};flex:none"></span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:var(--ink)">${g}</div>
        <div style="font-size:10.5px;color:var(--faint);margin-top:2px">전월 ${won(pv)} · ${d===0?'변동 없음':(d>0?'▲ ':'▼ ')+short(Math.abs(d))}</div>
      </div>
      <span style="font-size:16px;font-weight:600;color:var(--ink)">${won(amt)}</span>
    </div>`;
  }).join('');

  const nw = netWorth(), target = num(state.goal.target);
  const rate = target ? Math.min(100, nw/target*100) : 0;
  document.getElementById('goal-name').value   = state.goal.name;
  document.getElementById('goal-target').value = state.goal.target;
  document.getElementById('goal-bar').style.width = rate + '%';
  document.getElementById('goal-rate').textContent   = target ? pct(rate) : '목표 미설정';
  document.getElementById('goal-remain').textContent = target ? '남은 금액 '+won(Math.max(0, target-nw)) : '';
}

// ─────────────────────────────────────────
//  GLOBAL BINDINGS
// ─────────────────────────────────────────
Object.assign(window, {
  state, go, switchTab, logout, loadAccount, removeAccount,
  doLogin, doSignup, shuffleQs, setFindMode, rotateQ, doFind,
  addDraft, removeDraft, setDraftField, saveDrafts,
  addAsset, setAssetAmount, toggleAssetCheck, renderAssets,
  toggleGroup, render
});

// ─────────────────────────────────────────
//  STATUS BAR 시계
// ─────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('status-time');
  if (!el) return;
  const d = new Date();
  el.textContent = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
updateClock();
setInterval(updateClock, 10000);

// ─────────────────────────────────────────
//  INIT — Firestore에서 계정 목록 로드
// ─────────────────────────────────────────
async function init() {
  setLoading(true);
  try {
    const accounts = await fetchAccounts();
    if (accounts.length === 0) {
      // 최초 실행: 기본 계정 Firestore에 저장
      const defaultAcct = state.accounts[0];
      await saveAccount(defaultAcct);
      await saveUserData(defaultAcct.id, {
        txs:[], assets:[], budgets:{},
        cats: DEF_CATS.slice(), groups: GROUPS.slice(),
        profile: { name: defaultAcct.name, age:'' },
        goal: { name:'목표 설정', target:'0' }
      });
    } else {
      state.accounts = accounts;
    }
  } catch(e) {
    console.warn('Firestore 초기화 실패 (오프라인?)', e);
  }
  setLoading(false);
  state.drafts = [{ id:nid(), name:'', date:todayStr(), group:'변동지출', cat:'', amount:'', note:'' }];
  render();
}

init();
