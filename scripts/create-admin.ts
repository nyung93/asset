import {randomUUID} from 'node:crypto';
import {closeDatabase, database, firebaseConfigured} from '../server/db';
import {encryptField, hashPassword, normalizeUsername, passwordRule, usernameLookup} from '../server/security';

// One-time bootstrap. The password comes from the process environment, never source control.
async function main() {
  if (!firebaseConfigured() || !process.env.FIELD_ENCRYPTION_KEY || Buffer.from(process.env.FIELD_ENCRYPTION_KEY,'base64').length!==32) {
    throw new Error('Firebase 서버 인증 정보와 32바이트 FIELD_ENCRYPTION_KEY를 먼저 설정해 주세요.');
  }
  const password=process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password || !passwordRule(password)) {
    throw new Error('관리자 비밀번호는 8자 이상이며 영문 대문자·소문자·특수문자를 포함해야 해요.');
  }
  const username=normalizeUsername('admin');
  const lookup=usernameLookup(username);
  const id=randomUUID();
  const now=new Date().toISOString();
  const user={id,name:'관리자',username_lookup:lookup,username_cipher:encryptField(username),
    birth_date_cipher:encryptField('2000-01-01'),phone_cipher:encryptField('01000000001'),
    password_hash:await hashPassword(password),role:'ADMIN',created_at:now,last_login_at:null};
  await database().runTransaction(async transaction => {
    const index=database().collection('usernames').doc(lookup);
    if ((await transaction.get(index)).exists) throw new Error('admin 계정이 이미 있어요. 기존 계정은 덮어쓰지 않았습니다.');
    transaction.create(database().collection('users').doc(id),user);
    transaction.create(index,{user_id:id});
  });
  process.stdout.write('admin 관리자 계정을 생성했어요.\n');
}

try {await main();}
catch(error) {
  process.stderr.write(`${error instanceof Error ? error.message : '관리자 계정을 생성하지 못했어요.'}\n`);
  process.exitCode=1;
} finally {
  await closeDatabase().catch(()=>undefined);
}
