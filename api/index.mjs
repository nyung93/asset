// server/handler.ts
import { randomUUID } from "node:crypto";

// server/db.ts
import pg from "pg";
var pool;
var schemaReady;
function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 1e4 });
  return pool;
}
async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = database();
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        username_lookup CHAR(64) NOT NULL UNIQUE,
        username_cipher TEXT NOT NULL,
        birth_date_cipher TEXT NOT NULL,
        phone_cipher TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash CHAR(64) NOT NULL UNIQUE,
        actor_admin_id UUID REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS app_data (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data_cipher TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        transaction_count INTEGER NOT NULL DEFAULT 0,
        total_expense BIGINT NOT NULL DEFAULT 0,
        total_saving BIGINT NOT NULL DEFAULT 0,
        total_xp INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS auth_attempts (
        attempt_key CHAR(64) PRIMARY KEY,
        failed_count INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS admin_audit (
        id UUID PRIMARY KEY,
        actor_admin_id UUID NOT NULL REFERENCES users(id),
        target_user_id UUID NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  })().catch((error) => {
    schemaReady = void 0;
    throw error;
  });
  return schemaReady;
}

// server/security.ts
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
var SCRYPT_N = 1 << 17;
var SCRYPT_R = 8;
var SCRYPT_P = 1;
function encryptionKey() {
  const encoded = process.env.FIELD_ENCRYPTION_KEY;
  if (!encoded) throw new Error("FIELD_ENCRYPTION_KEY is missing");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must contain 32 random bytes in base64");
  return key;
}
function encryptField(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
function decryptField(value) {
  const [version, ivText, tagText, dataText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !dataText) throw new Error("Invalid encrypted field");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}
function normalizeUsername(value) {
  const username = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{3,19}$/.test(username)) throw new Error("\uC544\uC774\uB514\uB294 \uC601\uBB38\uC73C\uB85C \uC2DC\uC791\uD558\uB294 \uC601\uBB38\xB7\uC22B\uC790\xB7\uBC11\uC904 4~20\uC790\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
  return username;
}
function usernameLookup(username) {
  const lookupKey = createHmac("sha256", encryptionKey()).update("rich-grandma-username-v1").digest();
  return createHmac("sha256", lookupKey).update(normalizeUsername(username)).digest("hex");
}
function passwordRule(value) {
  return value.length >= 8 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[^A-Za-z0-9\s]/.test(value);
}
function derive(password, salt, n, r, p) {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
async function hashPassword(password) {
  if (!passwordRule(password)) throw new Error("\uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1\uC774\uBA70 \uC601\uBB38 \uB300\uBB38\uC790\xB7\uC18C\uBB38\uC790\xB7\uD2B9\uC218\uBB38\uC790\uB97C \uD3EC\uD568\uD574\uC57C \uD574\uC694.");
  const salt = randomBytes(16);
  const hash = await derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
async function verifyPassword(password, stored) {
  const [algorithm, nText, rText, pText, saltText, hashText] = stored.split("$");
  const n = Number(nText), r = Number(rText), p = Number(pText);
  if (algorithm !== "scrypt" || n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  if (expected.length !== 64) return false;
  const actual = await derive(password, Buffer.from(saltText, "base64url"), n, r, p);
  return timingSafeEqual(actual, expected);
}
function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
function newToken() {
  return randomBytes(32).toString("base64url");
}

// server/handler.ts
var ApiError = class extends Error {
  constructor(status, message, code = "request_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
  status;
  code;
};
function response(data, status = 200, cookies = []) {
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" });
  cookies.forEach((cookie2) => headers.append("Set-Cookie", cookie2));
  return new Response(JSON.stringify(data), { status, headers });
}
function cookie(req, name, value, maxAge) {
  const secure = process.env.VERCEL === "1" || new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
function readCookie(req, name) {
  const entry = (req.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}
function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) throw new ApiError(403, "\uC694\uCCAD \uCD9C\uCC98\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC5B4\uC694.", "invalid_origin");
}
async function body(req) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new ApiError(415, "JSON \uC694\uCCAD\uB9CC \uBC1B\uC744 \uC218 \uC788\uC5B4\uC694.");
  const raw = await req.text();
  if (raw.length > 8e5) throw new ApiError(413, "\uC804\uC1A1\uD560 \uB370\uC774\uD130\uAC00 \uB108\uBB34 \uCEE4\uC694.");
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid body");
    return value;
  } catch {
    throw new ApiError(400, "\uC785\uB825 \uB0B4\uC6A9\uC744 \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  }
}
function string(value, max = 200) {
  return typeof value === "string" && value.length <= max ? value : "";
}
function validBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value < (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) && date.getUTCFullYear() >= 1900;
}
function validPhone(value) {
  const digits = value.replace(/\D/g, "");
  if (!/^01[016789]\d{7,8}$/.test(digits)) throw new ApiError(400, "\uD734\uB300\uD3F0 \uBC88\uD638\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  return digits;
}
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: decryptField(user.username_cipher),
    birthDate: decryptField(user.birth_date_cipher),
    phone: decryptField(user.phone_cipher),
    role: user.role,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at
  };
}
async function session(token) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await database().query(
    `SELECT u.*, s.id AS session_id, s.actor_admin_id FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [tokenHash(token)]
  );
  return result.rows[0] ?? null;
}
async function auth(req) {
  const primary = await session(readCookie(req, "rgt_session"));
  if (!primary || primary.actor_admin_id) throw new ApiError(401, "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD574\uC694.", "unauthorized");
  const impersonated = await session(readCookie(req, "rgt_impersonation"));
  if (impersonated && primary.role === "ADMIN" && impersonated.actor_admin_id === primary.id && impersonated.role === "USER") {
    return { primary, effective: impersonated, impersonationId: impersonated.session_id };
  }
  return { primary, effective: primary };
}
function adminOnly(state) {
  if (state.primary.role !== "ADMIN" || state.impersonationId) throw new ApiError(403, "\uAD00\uB9AC\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", "forbidden");
}
async function createSession(userId, actorAdminId) {
  const token = newToken();
  await database().query(`INSERT INTO sessions (id,user_id,token_hash,actor_admin_id,expires_at)
    VALUES ($1,$2,$3,$4,now()+interval '14 days')`, [randomUUID(), userId, tokenHash(token), actorAdminId ?? null]);
  return token;
}
async function register(req, input) {
  const name = string(input.name, 40).trim();
  const username = normalizeUsername(string(input.username, 40));
  const birthDate = string(input.birthDate, 10);
  const phone = validPhone(string(input.phone, 30));
  const password = string(input.password, 128);
  if (name.length < 2 || !validBirthDate(birthDate)) throw new ApiError(400, "\uC774\uB984\uACFC \uC0DD\uB144\uC6D4\uC77C\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  if (!passwordRule(password)) throw new ApiError(400, "\uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1\uC774\uBA70 \uC601\uBB38 \uB300\uBB38\uC790\xB7\uC18C\uBB38\uC790\xB7\uD2B9\uC218\uBB38\uC790\uB97C \uD3EC\uD568\uD574\uC57C \uD574\uC694.");
  const id = randomUUID();
  const hashed = await hashPassword(password);
  try {
    await database().query(`INSERT INTO users (id,name,username_lookup,username_cipher,birth_date_cipher,phone_cipher,password_hash,last_login_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now())`, [id, name, usernameLookup(username), encryptField(username), encryptField(birthDate), encryptField(phone), hashed]);
  } catch (error) {
    if (error.code === "23505") throw new ApiError(409, "\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uC544\uC774\uB514\uC608\uC694.", "duplicate_username");
    throw error;
  }
  const token = await createSession(id);
  const user = await database().query("SELECT * FROM users WHERE id=$1", [id]);
  return response({ user: publicUser(user.rows[0]), impersonating: false }, 201, [cookie(req, "rgt_session", token, 14 * 86400)]);
}
var dummyHash;
async function login(req, input) {
  const password = string(input.password, 128);
  let username;
  try {
    username = normalizeUsername(string(input.username, 40));
  } catch {
    throw new ApiError(401, "\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.", "invalid_credentials");
  }
  const lookup = usernameLookup(username);
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 80);
  const attemptKey = tokenHash(`${lookup}:${ip}`);
  const attempts = await database().query("SELECT failed_count,locked_until FROM auth_attempts WHERE attempt_key=$1", [attemptKey]);
  if (attempts.rows[0]?.locked_until && new Date(attempts.rows[0].locked_until).getTime() > Date.now()) throw new ApiError(429, "\uB85C\uADF8\uC778 \uC2DC\uB3C4\uAC00 \uB9CE\uC544\uC694. 15\uBD84 \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", "rate_limited");
  const users = await database().query("SELECT * FROM users WHERE username_lookup=$1", [lookup]);
  const user = users.rows[0];
  dummyHash ??= hashPassword("Dummy!password");
  const correct = await verifyPassword(password, user?.password_hash ?? await dummyHash);
  if (!user || !correct) {
    await database().query(`INSERT INTO auth_attempts (attempt_key,failed_count,locked_until,updated_at)
      VALUES ($1,1,NULL,now()) ON CONFLICT (attempt_key) DO UPDATE SET
      failed_count=CASE WHEN auth_attempts.updated_at<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.failed_count+1 END,
      locked_until=CASE WHEN auth_attempts.failed_count>=4 AND auth_attempts.updated_at>=now()-interval '15 minutes' THEN now()+interval '15 minutes' ELSE NULL END,
      updated_at=now()`, [attemptKey]);
    throw new ApiError(401, "\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.", "invalid_credentials");
  }
  await database().query("DELETE FROM auth_attempts WHERE attempt_key=$1", [attemptKey]);
  await database().query("UPDATE users SET last_login_at=now() WHERE id=$1", [user.id]);
  user.last_login_at = /* @__PURE__ */ new Date();
  const token = await createSession(user.id);
  return response({ user: publicUser(user), impersonating: false }, 200, [cookie(req, "rgt_session", token, 14 * 86400), cookie(req, "rgt_impersonation", "", 0)]);
}
async function logout(req) {
  const primary = readCookie(req, "rgt_session"), impersonated = readCookie(req, "rgt_impersonation");
  if (primary) await database().query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(primary)]);
  if (impersonated) await database().query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(impersonated)]);
  return response({ ok: true }, 200, [cookie(req, "rgt_session", "", 0), cookie(req, "rgt_impersonation", "", 0)]);
}
async function updateProfile(state, input) {
  const birthDate = string(input.birthDate, 10), phone = validPhone(string(input.phone, 30));
  if (!validBirthDate(birthDate)) throw new ApiError(400, "\uC0DD\uB144\uC6D4\uC77C\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  const nextPassword = string(input.newPassword, 128);
  let passwordHash = null;
  if (nextPassword) {
    if (!passwordRule(nextPassword)) throw new ApiError(400, "\uC0C8 \uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1\uC774\uBA70 \uC601\uBB38 \uB300\uBB38\uC790\xB7\uC18C\uBB38\uC790\xB7\uD2B9\uC218\uBB38\uC790\uB97C \uD3EC\uD568\uD574\uC57C \uD574\uC694.");
    const currentPassword = string(input.currentPassword, 128);
    if (!await verifyPassword(currentPassword, state.effective.password_hash)) throw new ApiError(403, "\uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.", "invalid_password");
    passwordHash = await hashPassword(nextPassword);
  }
  await database().query(
    `UPDATE users SET birth_date_cipher=$1,phone_cipher=$2,password_hash=COALESCE($3,password_hash) WHERE id=$4`,
    [encryptField(birthDate), encryptField(phone), passwordHash, state.effective.id]
  );
  if (state.impersonationId) await audit(state.primary.id, state.effective.id, "PROFILE_UPDATE");
  const user = await database().query("SELECT * FROM users WHERE id=$1", [state.effective.id]);
  return response({ user: publicUser(user.rows[0]), impersonating: !!state.impersonationId });
}
function appData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "\uC800\uC7A5\uD560 \uB370\uC774\uD130\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.");
  const data = input;
  if (!data.character || !Array.isArray(data.budgetCodes) || !Array.isArray(data.transactions) || !Array.isArray(data.goals) || !Array.isArray(data.investments) || !Array.isArray(data.xpLogs)) throw new ApiError(400, "\uC800\uC7A5\uD560 \uB370\uC774\uD130\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.");
  return data;
}
function metrics(data) {
  const transactions = data.transactions;
  const total = (type) => transactions.reduce((sum, tx) => sum + (tx.type === type && Number.isSafeInteger(tx.amount) && tx.amount > 0 ? tx.amount : 0), 0);
  const character = data.character;
  return [transactions.length, total("EXPENSE"), total("SAVING"), Number.isSafeInteger(character.totalXp) ? character.totalXp : 0];
}
async function getData(state) {
  const result = await database().query("SELECT data_cipher,version FROM app_data WHERE user_id=$1", [state.effective.id]);
  const row = result.rows[0];
  return response({ data: row ? JSON.parse(decryptField(row.data_cipher)) : null, version: row?.version ?? 0 });
}
async function saveData(state, input) {
  const data = appData(input.data);
  const version = input.version;
  if (!Number.isSafeInteger(version) || Number(version) < 0) throw new ApiError(400, "\uB370\uC774\uD130 \uBC84\uC804\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  const encrypted = encryptField(JSON.stringify(data));
  const [count, expense, saving, xp] = metrics(data);
  let saved;
  if (version === 0) {
    const result = await database().query(`INSERT INTO app_data
      (user_id,data_cipher,transaction_count,total_expense,total_saving,total_xp) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id) DO NOTHING RETURNING version`, [state.effective.id, encrypted, count, expense, saving, xp]);
    saved = result.rows[0];
  } else {
    const result = await database().query(`UPDATE app_data SET data_cipher=$1,version=version+1,
      transaction_count=$2,total_expense=$3,total_saving=$4,total_xp=$5,updated_at=now()
      WHERE user_id=$6 AND version=$7 RETURNING version`, [encrypted, count, expense, saving, xp, state.effective.id, version]);
    saved = result.rows[0];
  }
  if (!saved) throw new ApiError(409, "\uB2E4\uB978 \uCC3D\uC5D0\uC11C \uB370\uC774\uD130\uAC00 \uBCC0\uACBD\uB410\uC5B4\uC694. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.", "version_conflict");
  if (state.impersonationId) await audit(state.primary.id, state.effective.id, "DATA_UPDATE");
  return response({ version: saved.version });
}
async function audit(actor, target, action) {
  await database().query("INSERT INTO admin_audit (id,actor_admin_id,target_user_id,action) VALUES ($1,$2,$3,$4)", [randomUUID(), actor, target, action]);
}
async function dashboard() {
  const users = await database().query(`SELECT count(*)::int AS total_users,
    count(*) FILTER (WHERE created_at>=date_trunc('month',now()))::int AS new_users_this_month,
    count(*) FILTER (WHERE last_login_at>=now()-interval '30 days')::int AS active_users_30d FROM users`);
  const data = await database().query(`SELECT COALESCE(sum(transaction_count),0)::bigint AS transaction_count,
    COALESCE(sum(total_expense),0)::bigint AS total_expense,
    COALESCE(sum(total_saving),0)::bigint AS total_saving,
    COALESCE(sum(total_xp),0)::bigint AS total_xp FROM app_data`);
  return response({ users: users.rows[0], data: data.rows[0] });
}
async function members(req) {
  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 40);
  const offset = Math.max(0, Math.min(1e5, Number(url.searchParams.get("offset") ?? 0) || 0));
  let lookup = "0000000000000000000000000000000000000000000000000000000000000000";
  try {
    if (search) lookup = usernameLookup(search);
  } catch {
  }
  const result = await database().query(`SELECT * FROM users WHERE ($1='' OR name ILIKE $2 OR username_lookup=$3)
    ORDER BY created_at DESC LIMIT 51 OFFSET $4`, [search, `%${search.replace(/[\\%_]/g, "\\$&")}%`, lookup, offset]);
  return response({ members: result.rows.slice(0, 50).map((user) => ({ id: user.id, name: user.name, username: decryptField(user.username_cipher), role: user.role, lastLoginAt: user.last_login_at, createdAt: user.created_at })), hasMore: result.rows.length > 50 });
}
async function impersonate(req, state, input) {
  adminOnly(state);
  const targetId = string(input.userId, 36);
  const result = await database().query("SELECT * FROM users WHERE id=$1 AND role=$2", [targetId, "USER"]);
  const target = result.rows[0];
  if (!target || target.id === state.primary.id) throw new ApiError(404, "\uC811\uC18D\uD560 \uD68C\uC6D0\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.");
  const token = await createSession(target.id, state.primary.id);
  await audit(state.primary.id, target.id, "IMPERSONATION_START");
  return response({ user: publicUser(target), impersonating: true, adminName: state.primary.name }, 200, [cookie(req, "rgt_impersonation", token, 14 * 86400)]);
}
async function stopImpersonation(req, state) {
  if (!state.impersonationId) throw new ApiError(400, "\uD68C\uC6D0 \uACC4\uC815 \uC811\uC18D \uC911\uC774 \uC544\uB2C8\uC5D0\uC694.");
  await audit(state.primary.id, state.effective.id, "IMPERSONATION_STOP");
  await database().query("DELETE FROM sessions WHERE id=$1", [state.impersonationId]);
  return response({ user: publicUser(state.primary), impersonating: false }, 200, [cookie(req, "rgt_impersonation", "", 0)]);
}
async function handleRequest(req) {
  try {
    if (req.method !== "GET" && req.method !== "POST") throw new ApiError(405, "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC694\uCCAD\uC774\uC5D0\uC694.");
    if (req.method === "POST") sameOrigin(req);
    if (!process.env.DATABASE_URL || !process.env.FIELD_ENCRYPTION_KEY || Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "base64").length !== 32) throw new ApiError(503, "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC900\uBE44\uD558\uACE0 \uC788\uC5B4\uC694.", "setup_required");
    await ensureSchema();
    const action = new URL(req.url).searchParams.get("action");
    if (req.method === "POST" && action === "register") return register(req, await body(req));
    if (req.method === "POST" && action === "login") return login(req, await body(req));
    if (req.method === "POST" && action === "logout") return logout(req);
    const state = await auth(req);
    if (req.method === "GET" && action === "status") return response({ user: publicUser(state.effective), impersonating: !!state.impersonationId, adminName: state.impersonationId ? state.primary.name : void 0 });
    if (req.method === "GET" && action === "data") return getData(state);
    if (req.method === "POST" && action === "data") return saveData(state, await body(req));
    if (req.method === "POST" && action === "profile") return updateProfile(state, await body(req));
    if (req.method === "POST" && action === "stop-impersonation") return stopImpersonation(req, state);
    if (req.method === "GET" && action === "dashboard") {
      adminOnly(state);
      return dashboard();
    }
    if (req.method === "GET" && action === "members") {
      adminOnly(state);
      return members(req);
    }
    if (req.method === "POST" && action === "impersonate") return impersonate(req, state, await body(req));
    throw new ApiError(404, "\uC694\uCCAD\uD55C \uAE30\uB2A5\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.");
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message, code: error.code }, error.status);
    if (error instanceof Error && /아이디는 영문|FIELD_ENCRYPTION_KEY|Invalid encrypted/.test(error.message)) {
      if (error.message.startsWith("\uC544\uC774\uB514")) return response({ error: error.message, code: "invalid_input" }, 400);
    }
    return response({ error: "\uC7A0\uC2DC \uC5F0\uACB0\uC774 \uC6D0\uD65C\uD558\uC9C0 \uC54A\uC544\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", code: "server_error" }, 500);
  }
}

// server/vercelEntry.ts
async function handler(request, response2) {
  try {
    const protocol = process.env.VERCEL === "1" || request.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const host = request.headers.host ?? "localhost";
    const url = new URL(request.url ?? "/", `${protocol}://${host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
      else if (value !== void 0) headers.set(key, value);
    }
    const chunks = [];
    if (request.method !== "GET" && request.method !== "HEAD") {
      for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const webRequest = new Request(url, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? void 0 : Buffer.concat(chunks)
    });
    const result = await handleRequest(webRequest);
    response2.statusCode = result.status;
    result.headers.forEach((value, key) => {
      if (key !== "set-cookie") response2.setHeader(key, value);
    });
    const cookies = result.headers.getSetCookie();
    if (cookies.length) response2.setHeader("Set-Cookie", cookies);
    response2.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error("Account API function failed", error);
    response2.statusCode = 503;
    response2.setHeader("Cache-Control", "no-store");
    response2.setHeader("Content-Type", "application/json; charset=utf-8");
    response2.end(JSON.stringify({ error: "\uC11C\uBC84 \uC5F0\uACB0\uC744 \uC900\uBE44\uD558\uACE0 \uC788\uC5B4\uC694.", code: "api_unavailable" }));
  }
}
export {
  handler as default
};
