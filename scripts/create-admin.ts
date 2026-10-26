import {randomUUID} from 'node:crypto';
import {database, ensureSchema} from '../server/db';
import {encryptField, hashPassword, normalizeUsername, passwordRule, usernameLookup} from '../server/security';

// One-time bootstrap. The password is supplied at runtime and never printed or committed.
async function main() {
  if (!process.env.DATABASE_URL || !process.env.FIELD_ENCRYPTION_KEY || Buffer.from(process.env.FIELD_ENCRYPTION_KEY,'base64').length!==32) {
    throw new Error('DATABASE_URL과 32바이트 FIELD_ENCRYPTION_KEY를 먼저 설정해 주세요.');
  }
  const password=process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password || !passwordRule(password)) {
    throw new Error('관리자 비밀번호는 8자 이상이며 영문 대문자·소문자·특수문자를 포함해야 해요.');
  }
  const username=normalizeUsername('admin');
  const lookup=usernameLookup(username);
  await ensureSchema();
  const client=await database().connect();
  try {
    await client.query('BEGIN');
    const existing=await client.query('SELECT id FROM users WHERE username_lookup=$1',[lookup]);
    if (existing.rowCount) throw new Error('admin 계정이 이미 있어요. 기존 계정은 덮어쓰지 않았습니다.');
    await client.query(`INSERT INTO users
      (id,name,username_lookup,username_cipher,birth_date_cipher,phone_cipher,password_hash,role)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[
      randomUUID(),'관리자',lookup,encryptField(username),encryptField('2000-01-01'),
      encryptField('01000000001'),await hashPassword(password),'ADMIN',
    ]);
    await client.query('COMMIT');
    process.stdout.write('admin 관리자 계정을 생성했어요.\n');
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
}

try {await main();}
catch(error) {
  process.stderr.write(`${error instanceof Error ? error.message : '관리자 계정을 생성하지 못했어요.'}\n`);
  process.exitCode=1;
} finally {
  if (process.env.DATABASE_URL) await database().end().catch(()=>undefined);
}
