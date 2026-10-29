import {randomUUID,timingSafeEqual} from 'node:crypto';
import {database, firebaseConfigured} from './db';
import {decryptField, encryptField, hashPassword, newToken, normalizeUsername, passwordRule, tokenHash, usernameLookup, verifyPassword} from './security';
import {GeminiRequestError, generateGemini} from './gemini';
import {ADVISOR_SYSTEM_PROMPT, advisorDataPrompt, parseAdvisorResponse, type MonthlyAdvisorSummary} from '../src/utils/aiAdvisor';
import {RECEIPT_PROMPT, parseReceiptResponse} from '../src/utils/receiptParser';
import {financeQuote} from './financeQuote';
import {configuredAdminBootstrapPassword,ensureAdminFromEnvironment,ensureAdminPassword} from './adminBootstrap';
import {characterAtXp, progression} from '../src/lib/progression';
import type {CharacterState} from '../src/types';

type Role = 'USER' | 'ADMIN';
interface UserRow {
  id: string; name: string; username_cipher: string; birth_date_cipher: string;
  phone_cipher: string; password_hash: string; role: Role; created_at: string; last_login_at: string | null;
}
interface AuthState {primary: UserRow; effective: UserRow; impersonationId?: string}
interface SessionRow {user_id:string;actor_admin_id:string|null;expires_at:string;created_at:string;last_seen_at?:string}
interface RememberRow {user_id:string;expires_at:string;created_at:string}
interface DataRow {data_cipher:string;version:number;transaction_count:number;total_expense:number;total_saving:number;total_xp:number;updated_at:string}
type JsonObject = Record<string, unknown>;
const REMEMBER_SECONDS = 7 * 86400;

class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'request_failed') {super(message);}
}

function response(data: JsonObject, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({'Cache-Control':'no-store', 'Content-Type':'application/json; charset=utf-8', 'X-Content-Type-Options':'nosniff'});
  cookies.forEach(cookie => headers.append('Set-Cookie', cookie));
  return new Response(JSON.stringify(data), {status, headers});
}

function cookie(req: Request, name: string, value: string, maxAge?: number): string {
  const secure = process.env.VERCEL === '1' || new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  const lifetime = maxAge === undefined ? '' : `; Max-Age=${maxAge}`;
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/${lifetime}${secure}`;
}

function readCookie(req: Request, name: string): string | undefined {
  const entry = (req.headers.get('cookie') ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

function sameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) throw new ApiError(403, '요청 출처를 확인할 수 없어요.', 'invalid_origin');
}

async function body(req: Request, maxChars = 800_000): Promise<JsonObject> {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'JSON 요청만 받을 수 있어요.');
  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxChars) throw new ApiError(413, '전송할 데이터가 너무 커요.');
  const raw = await req.text();
  if (raw.length > maxChars) throw new ApiError(413, '전송할 데이터가 너무 커요.');
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body');
    return value as JsonObject;
  } catch {throw new ApiError(400, '입력 내용을 다시 확인해 주세요.');}
}

function string(value: unknown, max = 200): string {
  return typeof value === 'string' && value.length <= max ? value : '';
}

function validBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value && value < new Date().toISOString().slice(0,10) && date.getUTCFullYear() >= 1900;
}

function validPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!/^01[016789]\d{7,8}$/.test(digits)) throw new ApiError(400, '휴대폰 번호를 확인해 주세요.');
  return digits;
}

function publicUser(user: UserRow) {
  return {
    id:user.id, name:user.name, username:decryptField(user.username_cipher),
    birthDate:decryptField(user.birth_date_cipher), phone:decryptField(user.phone_cipher),
    role:user.role, createdAt:user.created_at, lastLoginAt:user.last_login_at,
  };
}

async function session(token: string | undefined): Promise<(UserRow & {session_id: string; actor_admin_id: string | null}) | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const id = tokenHash(token);
  const found = await database().collection('sessions').doc(id).get();
  if (!found.exists) return null;
  const saved = found.data() as SessionRow;
  const now = Date.now();
  const createdAt = Date.parse(saved.created_at);
  const lastSeenAt = Date.parse(saved.last_seen_at ?? saved.created_at);
  const expiresAt = Date.parse(saved.expires_at);
  // Old 14-day sessions are also constrained by the new absolute and idle limits.
  if (!Number.isFinite(createdAt) || !Number.isFinite(lastSeenAt) || !Number.isFinite(expiresAt) ||
      expiresAt <= now || now-createdAt >= 12*60*60_000 || now-lastSeenAt >= 15*60_000) {
    await database().collection('sessions').doc(id).delete();
    return null;
  }
  const user = await database().collection('users').doc(saved.user_id).get();
  if (!user.exists) return null;
  if (now-lastSeenAt >= 60_000) await database().collection('sessions').doc(id).update({last_seen_at:new Date(now).toISOString()});
  return {...user.data() as UserRow,session_id:id,actor_admin_id:saved.actor_admin_id};
}

async function auth(req: Request): Promise<AuthState> {
  const primary = await session(readCookie(req, 'rgt_session'));
  if (!primary || primary.actor_admin_id) throw new ApiError(401, '로그인이 필요해요.', 'unauthorized');
  const impersonated = await session(readCookie(req, 'rgt_impersonation'));
  if (impersonated && primary.role === 'ADMIN' && impersonated.actor_admin_id === primary.id && impersonated.role === 'USER') {
    return {primary, effective:impersonated, impersonationId:impersonated.session_id};
  }
  return {primary, effective:primary};
}

function adminOnly(state: AuthState): void {
  if (state.primary.role !== 'ADMIN' || state.impersonationId) throw new ApiError(403, '관리자 권한이 필요해요.', 'forbidden');
}

function requireAccount(state:AuthState,expectedId:unknown):void {
  if(expectedId!==state.effective.id) throw new ApiError(409,'로그인 계정이 변경됐어요. 다시 로그인해 주세요.','account_changed');
}

async function createSession(userId: string, actorAdminId?: string): Promise<string> {
  const token = newToken();
  const now = new Date();
  await database().collection('sessions').doc(tokenHash(token)).create({
    user_id:userId,actor_admin_id:actorAdminId ?? null,
    expires_at:new Date(now.getTime()+12*60*60_000).toISOString(),created_at:now.toISOString(),last_seen_at:now.toISOString(),
  } satisfies SessionRow);
  return token;
}

async function createRememberToken(userId:string):Promise<string> {
  const token=newToken(), now=new Date();
  await database().collection('remember_tokens').doc(tokenHash(token)).create({
    user_id:userId,created_at:now.toISOString(),expires_at:new Date(now.getTime()+REMEMBER_SECONDS*1000).toISOString(),
  } satisfies RememberRow);
  return token;
}

async function revokeRememberToken(req:Request):Promise<void> {
  const token=readCookie(req,'rgt_remember');
  if(token && /^[A-Za-z0-9_-]{43}$/.test(token)) await database().collection('remember_tokens').doc(tokenHash(token)).delete();
}

async function hasRememberToken(req:Request,userId:string):Promise<boolean> {
  const token=readCookie(req,'rgt_remember');
  if(!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const ref=database().collection('remember_tokens').doc(tokenHash(token));
  const found=await ref.get();
  if(!found.exists) return false;
  const row=found.data() as RememberRow;
  if(row.expires_at<=new Date().toISOString()) {await ref.delete();return false;}
  return row.user_id===userId;
}

async function renewFromRemember(req:Request):Promise<Response|null> {
  const oldToken=readCookie(req,'rgt_remember');
  if(!oldToken || !/^[A-Za-z0-9_-]{43}$/.test(oldToken)) return null;
  const freshToken=newToken(), now=new Date();
  const oldRef=database().collection('remember_tokens').doc(tokenHash(oldToken));
  const freshRef=database().collection('remember_tokens').doc(tokenHash(freshToken));
  const renewed=await database().runTransaction(async transaction=>{
    const found=await transaction.get(oldRef);
    if(!found.exists) return null;
    const row=found.data() as RememberRow;
    if(row.expires_at<=now.toISOString()) {transaction.delete(oldRef);return null;}
    const account=await transaction.get(database().collection('users').doc(row.user_id));
    if(!account.exists) {transaction.delete(oldRef);return null;}
    const user=account.data() as UserRow;
    if(user.role!=='USER') {transaction.delete(oldRef);return null;}
    const remainingSeconds=Math.max(1,Math.ceil((Date.parse(row.expires_at)-now.getTime())/1000));
    transaction.delete(oldRef);
    transaction.create(freshRef,{user_id:user.id,created_at:now.toISOString(),expires_at:row.expires_at} satisfies RememberRow);
    return {user,remainingSeconds};
  });
  if(!renewed) return null;
  const token=await createSession(renewed.user.id);
  return response({user:publicUser(renewed.user),impersonating:false,remembered:true},200,[
    cookie(req,'rgt_session',token),cookie(req,'rgt_remember',freshToken,renewed.remainingSeconds),cookie(req,'rgt_impersonation','',0),
  ]);
}

async function status(req:Request):Promise<Response> {
  let state:AuthState;
  try {state=await auth(req);}
  catch(error) {
    if(!(error instanceof ApiError) || error.status!==401) throw error;
    const restored=await renewFromRemember(req);
    if(restored) return restored;
    throw error;
  }
  const remembered=await hasRememberToken(req,state.primary.id);
  return response({user:publicUser(state.effective),impersonating:!!state.impersonationId,
    adminName:state.impersonationId ? state.primary.name : undefined,remembered});
}

async function register(req: Request, input: JsonObject): Promise<Response> {
  const name = string(input.name, 40).trim();
  const username = normalizeUsername(string(input.username, 40));
  const birthDate = string(input.birthDate, 10);
  const phone = validPhone(string(input.phone, 30));
  const password = string(input.password, 128);
  if (name.length < 2 || !validBirthDate(birthDate)) throw new ApiError(400, '이름과 생년월일을 확인해 주세요.');
  if (!passwordRule(password)) throw new ApiError(400, '비밀번호는 8자 이상이며 영문 대문자·소문자·특수문자를 포함해야 해요.');
  const id = randomUUID();
  const hashed = await hashPassword(password);
  const row: UserRow = {id,name,username_cipher:encryptField(username),birth_date_cipher:encryptField(birthDate),
    phone_cipher:encryptField(phone),password_hash:hashed,role:'USER',created_at:new Date().toISOString(),last_login_at:new Date().toISOString()};
  const lookup = usernameLookup(username);
  try {
    await database().runTransaction(async transaction => {
      const usernameRef = database().collection('usernames').doc(lookup);
      if ((await transaction.get(usernameRef)).exists) throw new ApiError(409,'이미 사용 중인 아이디예요.','duplicate_username');
      transaction.create(database().collection('users').doc(id),{...row,username_lookup:lookup});
      transaction.create(usernameRef,{user_id:id});
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as {code?: number}).code === 6) throw new ApiError(409,'이미 사용 중인 아이디예요.','duplicate_username');
    throw error;
  }
  await revokeRememberToken(req);
  const token = await createSession(id);
  return response({user:publicUser(row), impersonating:false,remembered:false}, 201, [cookie(req,'rgt_session',token),cookie(req,'rgt_remember','',0)]);
}

let dummyHash: Promise<string> | undefined;
async function login(req: Request, input: JsonObject): Promise<Response> {
  const password = string(input.password, 128);
  let username: string;
  try {username = normalizeUsername(string(input.username, 40));}
  catch {throw new ApiError(401, '아이디 또는 비밀번호가 올바르지 않아요.', 'invalid_credentials');}
  const lookup = usernameLookup(username);
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim().slice(0,80);
  const attemptKey = tokenHash(`${lookup}:${ip}`);
  const attemptRef = database().collection('auth_attempts').doc(attemptKey);
  const attempt = (await attemptRef.get()).data() as {failed_count:number;locked_until:string|null;updated_at:string}|undefined;
  if (attempt?.locked_until && attempt.locked_until > new Date().toISOString()) throw new ApiError(429, '로그인 시도가 많아요. 15분 뒤 다시 시도해 주세요.', 'rate_limited');
  const index = await database().collection('usernames').doc(lookup).get();
  const userId = index.data()?.user_id as string|undefined;
  const found = userId ? await database().collection('users').doc(userId).get() : null;
  const user = found?.data() as UserRow|undefined;
  dummyHash ??= hashPassword('Dummy!password');
  const correct = await verifyPassword(password, user?.password_hash ?? await dummyHash);
  if (!user || !correct) {
    await database().runTransaction(async transaction => {
      const previous = (await transaction.get(attemptRef)).data() as typeof attempt;
      const now = Date.now();
      const recent = previous && new Date(previous.updated_at).getTime() >= now-15*60_000;
      const failedCount = recent ? previous.failed_count+1 : 1;
      transaction.set(attemptRef,{failed_count:failedCount,
        locked_until:failedCount>=5 ? new Date(now+15*60_000).toISOString() : null,
        updated_at:new Date(now).toISOString()});
    });
    throw new ApiError(401, '아이디 또는 비밀번호가 올바르지 않아요.', 'invalid_credentials');
  }
  await attemptRef.delete();
  user.last_login_at = new Date().toISOString();
  await database().collection('users').doc(user.id).update({last_login_at:user.last_login_at});
  await revokeRememberToken(req);
  const remembered=input.remember===true && user.role==='USER';
  const token = await createSession(user.id);
  const rememberToken=remembered ? await createRememberToken(user.id) : null;
  return response({user:publicUser(user),impersonating:false,remembered},200,[
    cookie(req,'rgt_session',token),cookie(req,'rgt_impersonation','',0),
    rememberToken ? cookie(req,'rgt_remember',rememberToken,REMEMBER_SECONDS) : cookie(req,'rgt_remember','',0),
  ]);
}

async function logout(req: Request): Promise<Response> {
  const primary = readCookie(req,'rgt_session'), impersonated = readCookie(req,'rgt_impersonation');
  if (primary) await database().collection('sessions').doc(tokenHash(primary)).delete();
  if (impersonated) await database().collection('sessions').doc(tokenHash(impersonated)).delete();
  await revokeRememberToken(req);
  return response({ok:true},200,[cookie(req,'rgt_session','',0),cookie(req,'rgt_impersonation','',0),cookie(req,'rgt_remember','',0)]);
}

async function updateProfile(req:Request,state: AuthState, input: JsonObject): Promise<Response> {
  requireAccount(state,input.userId);
  const birthDate = string(input.birthDate,10), phone = validPhone(string(input.phone,30));
  if (!validBirthDate(birthDate)) throw new ApiError(400,'생년월일을 확인해 주세요.');
  const nextPassword = string(input.newPassword,128);
  let passwordHash: string | null = null;
  if (nextPassword) {
    if (!passwordRule(nextPassword)) throw new ApiError(400,'새 비밀번호는 8자 이상이며 영문 대문자·소문자·특수문자를 포함해야 해요.');
    const currentPassword = string(input.currentPassword,128);
    if (!await verifyPassword(currentPassword,state.effective.password_hash)) throw new ApiError(403,'현재 비밀번호가 올바르지 않아요.','invalid_password');
    passwordHash = await hashPassword(nextPassword);
  }
  const updates = {birth_date_cipher:encryptField(birthDate),phone_cipher:encryptField(phone),
    ...(passwordHash ? {password_hash:passwordHash} : {})};
  await database().collection('users').doc(state.effective.id).update(updates);
  if (state.impersonationId) await audit(state.primary.id,state.effective.id,'PROFILE_UPDATE');
  return response({user:publicUser({...state.effective,...updates}),impersonating:!!state.impersonationId,
    remembered:await hasRememberToken(req,state.primary.id)});
}

function appData(input: unknown): JsonObject {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400,'저장할 데이터가 올바르지 않아요.');
  const data = input as JsonObject;
  if (!data.character || !Array.isArray(data.budgetCodes) || !Array.isArray(data.transactions) || !Array.isArray(data.goals) || !Array.isArray(data.investments) || !Array.isArray(data.xpLogs) || (data.recurringExpenses!==undefined && !Array.isArray(data.recurringExpenses)) || (data.recurringExpensePayments!==undefined && !Array.isArray(data.recurringExpensePayments))) throw new ApiError(400,'저장할 데이터가 올바르지 않아요.');
  return data;
}

function metrics(data: JsonObject): [number,number,number,number] {
  const transactions = data.transactions as Array<{type?: string; amount?: number}>;
  const total = (type: string) => transactions.reduce((sum,tx) => sum+(tx.type===type && Number.isSafeInteger(tx.amount) && tx.amount!>0 ? tx.amount! : 0),0);
  const character = data.character as {totalXp?: number};
  return [transactions.length,total('EXPENSE'),total('SAVING'),Number.isSafeInteger(character.totalXp) ? character.totalXp! : 0];
}

async function getData(req:Request,state: AuthState): Promise<Response> {
  requireAccount(state,new URL(req.url).searchParams.get('userId'));
  const row = (await database().collection('app_data').doc(state.effective.id).get()).data() as DataRow|undefined;
  return response({data:row ? JSON.parse(decryptField(row.data_cipher)) : null,version:row?.version ?? 0});
}

async function saveData(state: AuthState, input: JsonObject): Promise<Response> {
  requireAccount(state,input.userId);
  const data = appData(input.data);
  const version = input.version;
  if (!Number.isSafeInteger(version) || Number(version)<0) throw new ApiError(400,'데이터 버전을 확인해 주세요.');
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized,'utf8') > 600_000) throw new ApiError(413,'가계부 데이터가 너무 커요. CSV로 백업한 뒤 문의해 주세요.','data_too_large');
  const encrypted = encryptField(serialized);
  const [count,expense,saving,xp] = metrics(data);
  const ref = database().collection('app_data').doc(state.effective.id);
  const nextVersion = Number(version)+1;
  await database().runTransaction(async transaction => {
    const prior = await transaction.get(ref);
    const currentVersion = (prior.data() as DataRow|undefined)?.version ?? 0;
    if (currentVersion !== version) throw new ApiError(409,'다른 창에서 데이터가 변경됐어요. 새로고침 후 다시 확인해 주세요.','version_conflict');
    const row:DataRow = {data_cipher:encrypted,version:nextVersion,transaction_count:count,
      total_expense:expense,total_saving:saving,total_xp:xp,updated_at:new Date().toISOString()};
    if (prior.exists) transaction.update(ref,row);
    else transaction.create(ref,row);
  });
  if (state.impersonationId) await audit(state.primary.id,state.effective.id,'DATA_UPDATE');
  return response({version:nextVersion});
}

async function audit(actor: string,target: string,action: string) {
  await database().collection('admin_audit').doc(randomUUID()).create({actor_admin_id:actor,target_user_id:target,action,created_at:new Date().toISOString()});
}

async function dashboard(): Promise<Response> {
  const [users,data] = await Promise.all([database().collection('users').get(),database().collection('app_data').get()]);
  const now = Date.now();
  const monthStart = new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
  const members = users.docs.map(doc => doc.data() as UserRow);
  const total = (key:keyof Pick<DataRow,'transaction_count'|'total_expense'|'total_saving'|'total_xp'>) =>
    String(data.docs.reduce((sum,doc) => sum+(Number(doc.data()[key])||0),0));
  return response({users:{total_users:members.length,
    new_users_this_month:members.filter(user => user.created_at>=monthStart.toISOString()).length,
    active_users_30d:members.filter(user => user.last_login_at && new Date(user.last_login_at).getTime()>=now-30*86400_000).length},
    data:{transaction_count:total('transaction_count'),total_expense:total('total_expense'),
      total_saving:total('total_saving'),total_xp:total('total_xp')}});
}

async function members(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim().slice(0,40);
  const offset = Math.max(0,Math.min(100_000,Number(url.searchParams.get('offset') ?? 0) || 0));
  let lookup = '';
  try {if (search) lookup = usernameLookup(search);} catch { /* Search by name only. */ }
  const normalized = search.toLocaleLowerCase('ko-KR');
  const [users,data] = await Promise.all([database().collection('users').get(),database().collection('app_data').get()]);
  const scores = new Map(data.docs.map(doc => [doc.id, Number((doc.data() as DataRow).total_xp) || 0]));
  const filtered = users.docs.map(doc => doc.data() as UserRow & {username_lookup:string})
    .filter(user => !search || user.name.toLocaleLowerCase('ko-KR').includes(normalized) || user.username_lookup===lookup)
    .sort((left,right) => right.created_at.localeCompare(left.created_at));
  return response({members:filtered.slice(offset,offset+50).map(user => {
    const rawXp = scores.get(user.id) ?? 0;
    const totalXp = Number.isSafeInteger(rawXp) && rawXp >= 0 ? rawXp : 0;
    const growth = progression(totalXp);
    return {id:user.id,name:user.name,username:decryptField(user.username_cipher),role:user.role,
      birthDate:decryptField(user.birth_date_cipher),phone:decryptField(user.phone_cipher),
      lastLoginAt:user.last_login_at,createdAt:user.created_at,totalXp,level:growth.level,houseStage:growth.houseStage,houseName:growth.house.name};
  }),
    hasMore:filtered.length>offset+50});
}

async function resetMemberXp(state:AuthState,input:JsonObject):Promise<Response> {
  adminOnly(state);
  if (input.confirm !== 'RESET_XP') throw new ApiError(400,'점수 초기화를 다시 확인해 주세요.');
  const targetId = string(input.userId,36);
  if (!targetId) throw new ApiError(400,'회원을 선택해 주세요.');
  const userRef = database().collection('users').doc(targetId);
  const dataRef = database().collection('app_data').doc(targetId);
  const auditRef = database().collection('admin_audit').doc(randomUUID());
  await database().runTransaction(async transaction => {
    const [userSnapshot,dataSnapshot] = await Promise.all([transaction.get(userRef),transaction.get(dataRef)]);
    const user = userSnapshot.data() as UserRow|undefined;
    if (!user || user.role !== 'USER') throw new ApiError(404,'초기화할 회원을 찾을 수 없어요.');
    if (dataSnapshot.exists) {
      const saved = dataSnapshot.data() as DataRow;
      const data = appData(JSON.parse(decryptField(saved.data_cipher)));
      data.character = characterAtXp(data.character as CharacterState,0);
      data.xpLogs = [];
      transaction.update(dataRef,{...saved,data_cipher:encryptField(JSON.stringify(data)),version:saved.version+1,total_xp:0,updated_at:new Date().toISOString()});
    }
    transaction.create(auditRef,{actor_admin_id:state.primary.id,target_user_id:targetId,action:'XP_RESET',created_at:new Date().toISOString()});
  });
  return response({ok:true,totalXp:0,level:1,houseStage:1});
}

async function impersonate(req: Request,state: AuthState,input: JsonObject): Promise<Response> {
  adminOnly(state);
  const targetId = string(input.userId,36);
  const target = (await database().collection('users').doc(targetId).get()).data() as UserRow|undefined;
  if (!target || target.id===state.primary.id) throw new ApiError(404,'접속할 회원을 찾을 수 없어요.');
  if (target.role !== 'USER') throw new ApiError(404,'접속할 회원을 찾을 수 없어요.');
  const token = await createSession(target.id,state.primary.id);
  await audit(state.primary.id,target.id,'IMPERSONATION_START');
  return response({user:publicUser(target),impersonating:true,adminName:state.primary.name,remembered:false},200,[cookie(req,'rgt_impersonation',token)]);
}

async function stopImpersonation(req: Request,state: AuthState): Promise<Response> {
  if (!state.impersonationId) throw new ApiError(400,'회원 계정 접속 중이 아니에요.');
  await audit(state.primary.id,state.effective.id,'IMPERSONATION_STOP');
  await database().collection('sessions').doc(state.impersonationId).delete();
  return response({user:publicUser(state.primary),impersonating:false,remembered:false},200,[cookie(req,'rgt_impersonation','',0)]);
}

async function reserveAiRequest(userId: string): Promise<void> {
  const day = new Date().toISOString().slice(0,10);
  const ref = database().collection('ai_usage').doc(`${userId}_${day}`);
  await database().runTransaction(async transaction => {
    const prior = await transaction.get(ref);
    const count = Number(prior.data()?.count ?? 0);
    if (count >= 30) throw new ApiError(429, '오늘의 AI 이용 횟수를 모두 사용했어요. 내일 다시 찾아와 주세요.', 'ai_daily_limit');
    transaction.set(ref, {count: count + 1, updated_at: new Date().toISOString()});
  });
}

function advisorSummary(input: unknown): MonthlyAdvisorSummary {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, '월간 통계를 다시 확인해 주세요.');
  const value = input as Record<string,unknown>;
  const amount = (item: unknown) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0 && item <= 1_000_000_000_000;
  if (typeof value.yearMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.yearMonth) || !amount(value.totalBudget) || !amount(value.totalExpenses)) throw new ApiError(400, '월간 통계를 다시 확인해 주세요.');
  let topCategory: MonthlyAdvisorSummary['topCategory'] = null;
  if (value.topCategory !== null) {
    const category = value.topCategory as Record<string,unknown> | undefined;
    if (!category || typeof category.categoryName !== 'string' || category.categoryName.length > 60 || typeof category.codeId !== 'string' || !/^[A-Za-z0-9_-]{1,20}$/.test(category.codeId) || !amount(category.amount)) throw new ApiError(400, '지출 카테고리를 다시 확인해 주세요.');
    topCategory = {categoryName: category.categoryName, codeId: category.codeId, amount: category.amount as number};
  }
  if (!Array.isArray(value.investmentReturns) || value.investmentReturns.length > 2) throw new ApiError(400, '투자 수익률을 다시 확인해 주세요.');
  const investmentReturns = value.investmentReturns.map((item: unknown) => {
    const record = item as Record<string,unknown> | null;
    if (!record || (record.currency !== 'KRW' && record.currency !== 'USD') || typeof record.rate !== 'number' || !Number.isFinite(record.rate) || record.rate < -100 || record.rate > 1_000_000) throw new ApiError(400, '투자 수익률을 다시 확인해 주세요.');
    return {currency: record.currency as 'KRW' | 'USD', rate: record.rate};
  });
  return {yearMonth: value.yearMonth, totalBudget: value.totalBudget as number, totalExpenses: value.totalExpenses as number, topCategory, investmentReturns};
}

async function aiAdvice(state: AuthState, input: JsonObject): Promise<Response> {
  const summary = advisorSummary(input.summary);
  await reserveAiRequest(state.effective.id);
  const raw = await generateGemini({systemPrompt: ADVISOR_SYSTEM_PROMPT, prompt: advisorDataPrompt(summary)});
  try {return response({text: parseAdvisorResponse(raw).text});}
  catch {throw new ApiError(502, '할미의 답변을 정리하지 못했어요. 다시 눌러 주세요.', 'gemini_format');}
}

async function aiReceipt(state: AuthState, input: JsonObject): Promise<Response> {
  const encoded = input.imageBase64;
  if (typeof encoded !== 'string' || encoded.length < 20 || encoded.length > 1_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new ApiError(400, '결제 이미지를 다시 선택해 주세요.', 'invalid_image');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 10 || bytes.length > 1_350_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new ApiError(400, 'JPG 결제 이미지를 다시 선택해 주세요.', 'invalid_image');
  await reserveAiRequest(state.effective.id);
  const raw = await generateGemini({systemPrompt: RECEIPT_PROMPT, prompt: '이 이미지의 결제 내역 하나를 지정한 JSON으로 추출해 줘.', imageBase64: encoded, json: true});
  return response(parseReceiptResponse(raw) as unknown as JsonObject);
}

async function checkAdminBootstrap(req:Request):Promise<Response> {
  const configured=configuredAdminBootstrapPassword();
  if (!configured) throw new ApiError(404,'요청한 기능을 찾을 수 없어요.');
  const supplied=req.headers.get('x-admin-bootstrap-secret') ?? '';
  const left=Buffer.from(supplied),right=Buffer.from(configured);
  if (left.length!==right.length || !timingSafeEqual(left,right)) throw new ApiError(403,'관리자 설정을 확인할 수 없어요.','bootstrap_secret_mismatch');
  try {return response({status:await ensureAdminPassword(configured)});}
  catch(error) {
    if (error instanceof Error && error.message.includes('관리자 계정과 연결되지')) throw new ApiError(409,'admin 아이디가 일반 회원 계정으로 사용 중이에요.','admin_username_conflict');
    if (error instanceof Error && error.message.includes('색인이 손상')) throw new ApiError(409,'admin 계정 색인을 확인해야 해요.','admin_index_conflict');
    if (error instanceof Error && error.message.includes('비밀번호는')) throw new ApiError(400,'관리자 비밀번호 규칙을 확인해 주세요.','bootstrap_password_rule');
    throw new ApiError(503,'관리자 계정 설정이 완료되지 않았어요. 서버 로그를 확인해 주세요.','bootstrap_failed');
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new ApiError(405,'지원하지 않는 요청이에요.');
    if (req.method === 'POST') sameOrigin(req);
    if (req.method === 'GET' && new URL(req.url).searchParams.get('action') === 'finance-quote') return await financeQuote(req);
    // Missing secrets fail closed; the app never falls back to shared browser data.
    if (!firebaseConfigured() || !process.env.FIELD_ENCRYPTION_KEY || Buffer.from(process.env.FIELD_ENCRYPTION_KEY,'base64').length!==32) throw new ApiError(503,'Firebase 연결을 준비하고 있어요.','setup_required');
    const action = new URL(req.url).searchParams.get('action');
    if (req.method === 'POST' && action === 'admin-bootstrap-check') return await checkAdminBootstrap(req);
    try {await ensureAdminFromEnvironment();}
    catch {console.error('Administrator bootstrap failed; normal requests remain available.');}
    if (req.method === 'POST' && action === 'register') return await register(req,await body(req));
    if (req.method === 'POST' && action === 'login') return await login(req,await body(req));
    if (req.method === 'POST' && action === 'logout') return await logout(req);
    if (req.method === 'GET' && action === 'status') return await status(req);
    const state = await auth(req);
    if (req.method === 'GET' && action === 'data') return await getData(req,state);
    if (req.method === 'POST' && action === 'data') return await saveData(state,await body(req));
    if (req.method === 'POST' && action === 'profile') return await updateProfile(req,state,await body(req));
    if (req.method === 'POST' && action === 'stop-impersonation') return await stopImpersonation(req,state);
    if (req.method === 'POST' && action === 'ai-advice') return await aiAdvice(state,await body(req));
    if (req.method === 'POST' && action === 'ai-receipt') return await aiReceipt(state,await body(req,1_900_000));
    if (req.method === 'GET' && action === 'dashboard') {adminOnly(state);return await dashboard();}
    if (req.method === 'GET' && action === 'members') {adminOnly(state);return await members(req);}
    if (req.method === 'POST' && action === 'reset-member-xp') return await resetMemberXp(state,await body(req));
    if (req.method === 'POST' && action === 'impersonate') return await impersonate(req,state,await body(req));
    throw new ApiError(404,'요청한 기능을 찾을 수 없어요.');
  } catch (error) {
    if (error instanceof ApiError) return response({error:error.message,code:error.code},error.status);
    if (error instanceof GeminiRequestError) return response({error:error.message,code:error.code},error.status);
    if (error instanceof Error && /아이디는 영문|FIELD_ENCRYPTION_KEY|Invalid encrypted/.test(error.message)) {
      if (error.message.startsWith('아이디')) return response({error:error.message,code:'invalid_input'},400);
    }
    // Never expose credentials, ciphertext, password hashes or stack traces.
    return response({error:'잠시 연결이 원활하지 않아요. 다시 시도해 주세요.',code:'server_error'},500);
  }
}
