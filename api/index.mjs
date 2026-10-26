// server/handler.ts
import { randomUUID } from "node:crypto";

// server/db.ts
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
var firestore;
function firebaseConfigured() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  return !!(projectId && (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS));
}
function database() {
  if (firestore) return firestore;
  if (!firebaseConfigured()) throw new Error("Firebase server credentials are missing");
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const app = getApps().find((candidate) => candidate.name === "rich-grandma-tycoon") ?? initializeApp({
    projectId,
    credential: process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY ? cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    }) : applicationDefault()
  }, "rich-grandma-tycoon");
  firestore = getFirestore(app);
  return firestore;
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
  const id = tokenHash(token);
  const found = await database().collection("sessions").doc(id).get();
  if (!found.exists) return null;
  const saved = found.data();
  if (saved.expires_at <= (/* @__PURE__ */ new Date()).toISOString()) return null;
  const user = await database().collection("users").doc(saved.user_id).get();
  if (!user.exists) return null;
  return { ...user.data(), session_id: id, actor_admin_id: saved.actor_admin_id };
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
  await database().collection("sessions").doc(tokenHash(token)).create({
    user_id: userId,
    actor_admin_id: actorAdminId ?? null,
    expires_at: new Date(Date.now() + 14 * 864e5).toISOString(),
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  });
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
  const row = {
    id,
    name,
    username_cipher: encryptField(username),
    birth_date_cipher: encryptField(birthDate),
    phone_cipher: encryptField(phone),
    password_hash: hashed,
    role: "USER",
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    last_login_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const lookup = usernameLookup(username);
  try {
    await database().runTransaction(async (transaction) => {
      const usernameRef = database().collection("usernames").doc(lookup);
      if ((await transaction.get(usernameRef)).exists) throw new ApiError(409, "\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uC544\uC774\uB514\uC608\uC694.", "duplicate_username");
      transaction.create(database().collection("users").doc(id), { ...row, username_lookup: lookup });
      transaction.create(usernameRef, { user_id: id });
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.code === 6) throw new ApiError(409, "\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uC544\uC774\uB514\uC608\uC694.", "duplicate_username");
    throw error;
  }
  const token = await createSession(id);
  return response({ user: publicUser(row), impersonating: false }, 201, [cookie(req, "rgt_session", token, 14 * 86400)]);
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
  const attemptRef = database().collection("auth_attempts").doc(attemptKey);
  const attempt = (await attemptRef.get()).data();
  if (attempt?.locked_until && attempt.locked_until > (/* @__PURE__ */ new Date()).toISOString()) throw new ApiError(429, "\uB85C\uADF8\uC778 \uC2DC\uB3C4\uAC00 \uB9CE\uC544\uC694. 15\uBD84 \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", "rate_limited");
  const index = await database().collection("usernames").doc(lookup).get();
  const userId = index.data()?.user_id;
  const found = userId ? await database().collection("users").doc(userId).get() : null;
  const user = found?.data();
  dummyHash ??= hashPassword("Dummy!password");
  const correct = await verifyPassword(password, user?.password_hash ?? await dummyHash);
  if (!user || !correct) {
    await database().runTransaction(async (transaction) => {
      const previous = (await transaction.get(attemptRef)).data();
      const now = Date.now();
      const recent = previous && new Date(previous.updated_at).getTime() >= now - 15 * 6e4;
      const failedCount = recent ? previous.failed_count + 1 : 1;
      transaction.set(attemptRef, {
        failed_count: failedCount,
        locked_until: failedCount >= 5 ? new Date(now + 15 * 6e4).toISOString() : null,
        updated_at: new Date(now).toISOString()
      });
    });
    throw new ApiError(401, "\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.", "invalid_credentials");
  }
  await attemptRef.delete();
  user.last_login_at = (/* @__PURE__ */ new Date()).toISOString();
  await database().collection("users").doc(user.id).update({ last_login_at: user.last_login_at });
  const token = await createSession(user.id);
  return response({ user: publicUser(user), impersonating: false }, 200, [cookie(req, "rgt_session", token, 14 * 86400), cookie(req, "rgt_impersonation", "", 0)]);
}
async function logout(req) {
  const primary = readCookie(req, "rgt_session"), impersonated = readCookie(req, "rgt_impersonation");
  if (primary) await database().collection("sessions").doc(tokenHash(primary)).delete();
  if (impersonated) await database().collection("sessions").doc(tokenHash(impersonated)).delete();
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
  const updates = {
    birth_date_cipher: encryptField(birthDate),
    phone_cipher: encryptField(phone),
    ...passwordHash ? { password_hash: passwordHash } : {}
  };
  await database().collection("users").doc(state.effective.id).update(updates);
  if (state.impersonationId) await audit(state.primary.id, state.effective.id, "PROFILE_UPDATE");
  return response({ user: publicUser({ ...state.effective, ...updates }), impersonating: !!state.impersonationId });
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
  const row = (await database().collection("app_data").doc(state.effective.id).get()).data();
  return response({ data: row ? JSON.parse(decryptField(row.data_cipher)) : null, version: row?.version ?? 0 });
}
async function saveData(state, input) {
  const data = appData(input.data);
  const version = input.version;
  if (!Number.isSafeInteger(version) || Number(version) < 0) throw new ApiError(400, "\uB370\uC774\uD130 \uBC84\uC804\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, "utf8") > 6e5) throw new ApiError(413, "\uAC00\uACC4\uBD80 \uB370\uC774\uD130\uAC00 \uB108\uBB34 \uCEE4\uC694. CSV\uB85C \uBC31\uC5C5\uD55C \uB4A4 \uBB38\uC758\uD574 \uC8FC\uC138\uC694.", "data_too_large");
  const encrypted = encryptField(serialized);
  const [count, expense, saving, xp] = metrics(data);
  const ref = database().collection("app_data").doc(state.effective.id);
  const nextVersion = Number(version) + 1;
  await database().runTransaction(async (transaction) => {
    const prior = await transaction.get(ref);
    const currentVersion = prior.data()?.version ?? 0;
    if (currentVersion !== version) throw new ApiError(409, "\uB2E4\uB978 \uCC3D\uC5D0\uC11C \uB370\uC774\uD130\uAC00 \uBCC0\uACBD\uB410\uC5B4\uC694. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.", "version_conflict");
    const row = {
      data_cipher: encrypted,
      version: nextVersion,
      transaction_count: count,
      total_expense: expense,
      total_saving: saving,
      total_xp: xp,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (prior.exists) transaction.update(ref, row);
    else transaction.create(ref, row);
  });
  if (state.impersonationId) await audit(state.primary.id, state.effective.id, "DATA_UPDATE");
  return response({ version: nextVersion });
}
async function audit(actor, target, action) {
  await database().collection("admin_audit").doc(randomUUID()).create({ actor_admin_id: actor, target_user_id: target, action, created_at: (/* @__PURE__ */ new Date()).toISOString() });
}
async function dashboard() {
  const [users, data] = await Promise.all([database().collection("users").get(), database().collection("app_data").get()]);
  const now = Date.now();
  const monthStart = /* @__PURE__ */ new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const members2 = users.docs.map((doc) => doc.data());
  const total = (key) => String(data.docs.reduce((sum, doc) => sum + (Number(doc.data()[key]) || 0), 0));
  return response({
    users: {
      total_users: members2.length,
      new_users_this_month: members2.filter((user) => user.created_at >= monthStart.toISOString()).length,
      active_users_30d: members2.filter((user) => user.last_login_at && new Date(user.last_login_at).getTime() >= now - 30 * 864e5).length
    },
    data: {
      transaction_count: total("transaction_count"),
      total_expense: total("total_expense"),
      total_saving: total("total_saving"),
      total_xp: total("total_xp")
    }
  });
}
async function members(req) {
  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 40);
  const offset = Math.max(0, Math.min(1e5, Number(url.searchParams.get("offset") ?? 0) || 0));
  let lookup = "";
  try {
    if (search) lookup = usernameLookup(search);
  } catch {
  }
  const normalized = search.toLocaleLowerCase("ko-KR");
  const users = await database().collection("users").get();
  const filtered = users.docs.map((doc) => doc.data()).filter((user) => !search || user.name.toLocaleLowerCase("ko-KR").includes(normalized) || user.username_lookup === lookup).sort((left, right) => right.created_at.localeCompare(left.created_at));
  return response({
    members: filtered.slice(offset, offset + 50).map((user) => ({
      id: user.id,
      name: user.name,
      username: decryptField(user.username_cipher),
      role: user.role,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at
    })),
    hasMore: filtered.length > offset + 50
  });
}
async function impersonate(req, state, input) {
  adminOnly(state);
  const targetId = string(input.userId, 36);
  const target = (await database().collection("users").doc(targetId).get()).data();
  if (!target || target.id === state.primary.id) throw new ApiError(404, "\uC811\uC18D\uD560 \uD68C\uC6D0\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.");
  if (target.role !== "USER") throw new ApiError(404, "\uC811\uC18D\uD560 \uD68C\uC6D0\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.");
  const token = await createSession(target.id, state.primary.id);
  await audit(state.primary.id, target.id, "IMPERSONATION_START");
  return response({ user: publicUser(target), impersonating: true, adminName: state.primary.name }, 200, [cookie(req, "rgt_impersonation", token, 14 * 86400)]);
}
async function stopImpersonation(req, state) {
  if (!state.impersonationId) throw new ApiError(400, "\uD68C\uC6D0 \uACC4\uC815 \uC811\uC18D \uC911\uC774 \uC544\uB2C8\uC5D0\uC694.");
  await audit(state.primary.id, state.effective.id, "IMPERSONATION_STOP");
  await database().collection("sessions").doc(state.impersonationId).delete();
  return response({ user: publicUser(state.primary), impersonating: false }, 200, [cookie(req, "rgt_impersonation", "", 0)]);
}
async function handleRequest(req) {
  try {
    if (req.method !== "GET" && req.method !== "POST") throw new ApiError(405, "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC694\uCCAD\uC774\uC5D0\uC694.");
    if (req.method === "POST") sameOrigin(req);
    if (!firebaseConfigured() || !process.env.FIELD_ENCRYPTION_KEY || Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "base64").length !== 32) throw new ApiError(503, "Firebase \uC5F0\uACB0\uC744 \uC900\uBE44\uD558\uACE0 \uC788\uC5B4\uC694.", "setup_required");
    const action = new URL(req.url).searchParams.get("action");
    if (req.method === "POST" && action === "register") return await register(req, await body(req));
    if (req.method === "POST" && action === "login") return await login(req, await body(req));
    if (req.method === "POST" && action === "logout") return await logout(req);
    const state = await auth(req);
    if (req.method === "GET" && action === "status") return response({ user: publicUser(state.effective), impersonating: !!state.impersonationId, adminName: state.impersonationId ? state.primary.name : void 0 });
    if (req.method === "GET" && action === "data") return await getData(state);
    if (req.method === "POST" && action === "data") return await saveData(state, await body(req));
    if (req.method === "POST" && action === "profile") return await updateProfile(state, await body(req));
    if (req.method === "POST" && action === "stop-impersonation") return await stopImpersonation(req, state);
    if (req.method === "GET" && action === "dashboard") {
      adminOnly(state);
      return await dashboard();
    }
    if (req.method === "GET" && action === "members") {
      adminOnly(state);
      return await members(req);
    }
    if (req.method === "POST" && action === "impersonate") return await impersonate(req, state, await body(req));
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
