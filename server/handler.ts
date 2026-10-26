import {randomUUID} from 'node:crypto';
import {database, ensureSchema} from './db';
import {decryptField, encryptField, hashPassword, newToken, normalizeUsername, passwordRule, tokenHash, usernameLookup, verifyPassword} from './security';

type Role = 'USER' | 'ADMIN';
interface UserRow {
  id: string; name: string; username_cipher: string; birth_date_cipher: string;
  phone_cipher: string; password_hash: string; role: Role; created_at: Date; last_login_at: Date | null;
}
interface AuthState {primary: UserRow; effective: UserRow; impersonationId?: string}
type JsonObject = Record<string, unknown>;

class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'request_failed') {super(message);}
}

function response(data: JsonObject, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({'Cache-Control':'no-store', 'Content-Type':'application/json; charset=utf-8', 'X-Content-Type-Options':'nosniff'});
  cookies.forEach(cookie => headers.append('Set-Cookie', cookie));
  return new Response(JSON.stringify(data), {status, headers});
}

function cookie(req: Request, name: string, value: string, maxAge: number): string {
  const secure = process.env.VERCEL === '1' || new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function readCookie(req: Request, name: string): string | undefined {
  const entry = (req.headers.get('cookie') ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

function sameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) throw new ApiError(403, '요청 출처를 확인할 수 없어요.', 'invalid_origin');
}

async function body(req: Request): Promise<JsonObject> {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'JSON 요청만 받을 수 있어요.');
  const raw = await req.text();
  if (raw.length > 800_000) throw new ApiError(413, '전송할 데이터가 너무 커요.');
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
  const result = await database().query<UserRow & {session_id: string; actor_admin_id: string | null}>(
    `SELECT u.*, s.id AS session_id, s.actor_admin_id FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>now()`, [tokenHash(token)]);
  return result.rows[0] ?? null;
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

async function createSession(userId: string, actorAdminId?: string): Promise<string> {
  const token = newToken();
  await database().query(`INSERT INTO sessions (id,user_id,token_hash,actor_admin_id,expires_at)
    VALUES ($1,$2,$3,$4,now()+interval '14 days')`, [randomUUID(),userId,tokenHash(token),actorAdminId ?? null]);
  return token;
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
  try {
    await database().query(`INSERT INTO users (id,name,username_lookup,username_cipher,birth_date_cipher,phone_cipher,password_hash,last_login_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now())`, [id,name,usernameLookup(username),encryptField(username),encryptField(birthDate),encryptField(phone),hashed]);
  } catch (error) {
    if ((error as {code?: string}).code === '23505') throw new ApiError(409, '이미 사용 중인 아이디예요.', 'duplicate_username');
    throw error;
  }
  const token = await createSession(id);
  const user = await database().query<UserRow>('SELECT * FROM users WHERE id=$1',[id]);
  return response({user:publicUser(user.rows[0]), impersonating:false}, 201, [cookie(req,'rgt_session',token,14*86400)]);
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
  const attempts = await database().query<{failed_count:number;locked_until:Date|null}>('SELECT failed_count,locked_until FROM auth_attempts WHERE attempt_key=$1',[attemptKey]);
  if (attempts.rows[0]?.locked_until && new Date(attempts.rows[0].locked_until).getTime() > Date.now()) throw new ApiError(429, '로그인 시도가 많아요. 15분 뒤 다시 시도해 주세요.', 'rate_limited');
  const users = await database().query<UserRow>('SELECT * FROM users WHERE username_lookup=$1',[lookup]);
  const user = users.rows[0];
  dummyHash ??= hashPassword('Dummy!password');
  const correct = await verifyPassword(password, user?.password_hash ?? await dummyHash);
  if (!user || !correct) {
    await database().query(`INSERT INTO auth_attempts (attempt_key,failed_count,locked_until,updated_at)
      VALUES ($1,1,NULL,now()) ON CONFLICT (attempt_key) DO UPDATE SET
      failed_count=CASE WHEN auth_attempts.updated_at<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.failed_count+1 END,
      locked_until=CASE WHEN auth_attempts.failed_count>=4 AND auth_attempts.updated_at>=now()-interval '15 minutes' THEN now()+interval '15 minutes' ELSE NULL END,
      updated_at=now()`, [attemptKey]);
    throw new ApiError(401, '아이디 또는 비밀번호가 올바르지 않아요.', 'invalid_credentials');
  }
  await database().query('DELETE FROM auth_attempts WHERE attempt_key=$1',[attemptKey]);
  await database().query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
  user.last_login_at = new Date();
  const token = await createSession(user.id);
  return response({user:publicUser(user),impersonating:false},200,[cookie(req,'rgt_session',token,14*86400),cookie(req,'rgt_impersonation','',0)]);
}

async function logout(req: Request): Promise<Response> {
  const primary = readCookie(req,'rgt_session'), impersonated = readCookie(req,'rgt_impersonation');
  if (primary) await database().query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(primary)]);
  if (impersonated) await database().query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(impersonated)]);
  return response({ok:true},200,[cookie(req,'rgt_session','',0),cookie(req,'rgt_impersonation','',0)]);
}

async function updateProfile(state: AuthState, input: JsonObject): Promise<Response> {
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
  await database().query(`UPDATE users SET birth_date_cipher=$1,phone_cipher=$2,password_hash=COALESCE($3,password_hash) WHERE id=$4`,
    [encryptField(birthDate),encryptField(phone),passwordHash,state.effective.id]);
  if (state.impersonationId) await audit(state.primary.id,state.effective.id,'PROFILE_UPDATE');
  const user = await database().query<UserRow>('SELECT * FROM users WHERE id=$1',[state.effective.id]);
  return response({user:publicUser(user.rows[0]),impersonating:!!state.impersonationId});
}

function appData(input: unknown): JsonObject {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400,'저장할 데이터가 올바르지 않아요.');
  const data = input as JsonObject;
  if (!data.character || !Array.isArray(data.budgetCodes) || !Array.isArray(data.transactions) || !Array.isArray(data.goals) || !Array.isArray(data.investments) || !Array.isArray(data.xpLogs)) throw new ApiError(400,'저장할 데이터가 올바르지 않아요.');
  return data;
}

function metrics(data: JsonObject) {
  const transactions = data.transactions as Array<{type?: string; amount?: number}>;
  const total = (type: string) => transactions.reduce((sum,tx) => sum+(tx.type===type && Number.isSafeInteger(tx.amount) && tx.amount!>0 ? tx.amount! : 0),0);
  const character = data.character as {totalXp?: number};
  return [transactions.length,total('EXPENSE'),total('SAVING'),Number.isSafeInteger(character.totalXp) ? character.totalXp : 0];
}

async function getData(state: AuthState): Promise<Response> {
  const result = await database().query<{data_cipher:string;version:number}>('SELECT data_cipher,version FROM app_data WHERE user_id=$1',[state.effective.id]);
  const row = result.rows[0];
  return response({data:row ? JSON.parse(decryptField(row.data_cipher)) : null,version:row?.version ?? 0});
}

async function saveData(state: AuthState, input: JsonObject): Promise<Response> {
  const data = appData(input.data);
  const version = input.version;
  if (!Number.isSafeInteger(version) || Number(version)<0) throw new ApiError(400,'데이터 버전을 확인해 주세요.');
  const encrypted = encryptField(JSON.stringify(data));
  const [count,expense,saving,xp] = metrics(data);
  let saved: {version:number}|undefined;
  if (version === 0) {
    const result = await database().query<{version:number}>(`INSERT INTO app_data
      (user_id,data_cipher,transaction_count,total_expense,total_saving,total_xp) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id) DO NOTHING RETURNING version`,[state.effective.id,encrypted,count,expense,saving,xp]);
    saved = result.rows[0];
  } else {
    const result = await database().query<{version:number}>(`UPDATE app_data SET data_cipher=$1,version=version+1,
      transaction_count=$2,total_expense=$3,total_saving=$4,total_xp=$5,updated_at=now()
      WHERE user_id=$6 AND version=$7 RETURNING version`,[encrypted,count,expense,saving,xp,state.effective.id,version]);
    saved = result.rows[0];
  }
  if (!saved) throw new ApiError(409,'다른 창에서 데이터가 변경됐어요. 새로고침 후 다시 확인해 주세요.','version_conflict');
  if (state.impersonationId) await audit(state.primary.id,state.effective.id,'DATA_UPDATE');
  return response({version:saved.version});
}

async function audit(actor: string,target: string,action: string) {
  await database().query('INSERT INTO admin_audit (id,actor_admin_id,target_user_id,action) VALUES ($1,$2,$3,$4)',[randomUUID(),actor,target,action]);
}

async function dashboard(): Promise<Response> {
  const users = await database().query(`SELECT count(*)::int AS total_users,
    count(*) FILTER (WHERE created_at>=date_trunc('month',now()))::int AS new_users_this_month,
    count(*) FILTER (WHERE last_login_at>=now()-interval '30 days')::int AS active_users_30d FROM users`);
  const data = await database().query(`SELECT COALESCE(sum(transaction_count),0)::bigint AS transaction_count,
    COALESCE(sum(total_expense),0)::bigint AS total_expense,
    COALESCE(sum(total_saving),0)::bigint AS total_saving,
    COALESCE(sum(total_xp),0)::bigint AS total_xp FROM app_data`);
  return response({users:users.rows[0],data:data.rows[0]});
}

async function members(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim().slice(0,40);
  const offset = Math.max(0,Math.min(100_000,Number(url.searchParams.get('offset') ?? 0) || 0));
  let lookup = '0000000000000000000000000000000000000000000000000000000000000000';
  try {if (search) lookup = usernameLookup(search);} catch { /* Partial names are searched in plaintext name only. */ }
  const result = await database().query<UserRow>(`SELECT * FROM users WHERE ($1='' OR name ILIKE $2 OR username_lookup=$3)
    ORDER BY created_at DESC LIMIT 51 OFFSET $4`,[search,`%${search.replace(/[\\%_]/g, '\\$&')}%`,lookup,offset]);
  return response({members:result.rows.slice(0,50).map(user => ({id:user.id,name:user.name,username:decryptField(user.username_cipher),role:user.role,lastLoginAt:user.last_login_at,createdAt:user.created_at})),hasMore:result.rows.length>50});
}

async function impersonate(req: Request,state: AuthState,input: JsonObject): Promise<Response> {
  adminOnly(state);
  const targetId = string(input.userId,36);
  const result = await database().query<UserRow>('SELECT * FROM users WHERE id=$1 AND role=$2',[targetId,'USER']);
  const target = result.rows[0];
  if (!target || target.id===state.primary.id) throw new ApiError(404,'접속할 회원을 찾을 수 없어요.');
  const token = await createSession(target.id,state.primary.id);
  await audit(state.primary.id,target.id,'IMPERSONATION_START');
  return response({user:publicUser(target),impersonating:true,adminName:state.primary.name},200,[cookie(req,'rgt_impersonation',token,14*86400)]);
}

async function stopImpersonation(req: Request,state: AuthState): Promise<Response> {
  if (!state.impersonationId) throw new ApiError(400,'회원 계정 접속 중이 아니에요.');
  await audit(state.primary.id,state.effective.id,'IMPERSONATION_STOP');
  await database().query('DELETE FROM sessions WHERE id=$1',[state.impersonationId]);
  return response({user:publicUser(state.primary),impersonating:false},200,[cookie(req,'rgt_impersonation','',0)]);
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new ApiError(405,'지원하지 않는 요청이에요.');
    if (req.method === 'POST') sameOrigin(req);
    // Missing secrets fail closed; the app never falls back to shared browser data.
    if (!process.env.DATABASE_URL || !process.env.FIELD_ENCRYPTION_KEY || Buffer.from(process.env.FIELD_ENCRYPTION_KEY,'base64').length!==32) throw new ApiError(503,'데이터베이스 연결을 준비하고 있어요.','setup_required');
    await ensureSchema();
    const action = new URL(req.url).searchParams.get('action');
    if (req.method === 'POST' && action === 'register') return register(req,await body(req));
    if (req.method === 'POST' && action === 'login') return login(req,await body(req));
    if (req.method === 'POST' && action === 'logout') return logout(req);
    const state = await auth(req);
    if (req.method === 'GET' && action === 'status') return response({user:publicUser(state.effective),impersonating:!!state.impersonationId,adminName:state.impersonationId ? state.primary.name : undefined});
    if (req.method === 'GET' && action === 'data') return getData(state);
    if (req.method === 'POST' && action === 'data') return saveData(state,await body(req));
    if (req.method === 'POST' && action === 'profile') return updateProfile(state,await body(req));
    if (req.method === 'POST' && action === 'stop-impersonation') return stopImpersonation(req,state);
    if (req.method === 'GET' && action === 'dashboard') {adminOnly(state);return dashboard();}
    if (req.method === 'GET' && action === 'members') {adminOnly(state);return members(req);}
    if (req.method === 'POST' && action === 'impersonate') return impersonate(req,state,await body(req));
    throw new ApiError(404,'요청한 기능을 찾을 수 없어요.');
  } catch (error) {
    if (error instanceof ApiError) return response({error:error.message,code:error.code},error.status);
    if (error instanceof Error && /아이디는 영문|FIELD_ENCRYPTION_KEY|Invalid encrypted/.test(error.message)) {
      if (error.message.startsWith('아이디')) return response({error:error.message,code:'invalid_input'},400);
    }
    // Never expose SQL, ciphertext, password hashes, environment values or stack traces.
    return response({error:'잠시 연결이 원활하지 않아요. 다시 시도해 주세요.',code:'server_error'},500);
  }
}
