import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function encryptionKey(): Buffer {
  const encoded = process.env.FIELD_ENCRYPTION_KEY;
  if (!encoded) throw new Error('FIELD_ENCRYPTION_KEY is missing');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must contain 32 random bytes in base64');
  return key;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptField(value: string): string {
  const [version, ivText, tagText, dataText] = value.split('.');
  if (version !== 'v1' || !ivText || !tagText || !dataText) throw new Error('Invalid encrypted field');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString('utf8');
}

export function normalizeUsername(value: string): string {
  const username = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{3,19}$/.test(username)) throw new Error('아이디는 영문으로 시작하는 영문·숫자·밑줄 4~20자로 입력해 주세요.');
  return username;
}

export function usernameLookup(username: string): string {
  const lookupKey = createHmac('sha256', encryptionKey()).update('rich-grandma-username-v1').digest();
  return createHmac('sha256', lookupKey).update(normalizeUsername(username)).digest('hex');
}

export function passwordRule(value: string): boolean {
  return value.length >= 8 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[^A-Za-z0-9\s]/.test(value);
}

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string): Promise<string> {
  if (!passwordRule(password)) throw new Error('비밀번호는 8자 이상이며 영문 대문자·소문자·특수문자를 포함해야 해요.');
  const salt = randomBytes(16);
  const hash = await derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, nText, rText, pText, saltText, hashText] = stored.split('$');
  const n = Number(nText), r = Number(rText), p = Number(pText);
  if (algorithm !== 'scrypt' || n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  if (expected.length !== 64) return false;
  const actual = await derive(password, Buffer.from(saltText, 'base64url'), n, r, p);
  return timingSafeEqual(actual, expected);
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}
