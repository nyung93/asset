import {randomUUID} from 'node:crypto';
import {closeDatabase, database, firebaseConfigured} from '../server/db';
import {encryptField, hashPassword, normalizeUsername, passwordRule, usernameLookup} from '../server/security';

/** Create admin or replace only the password of an existing ADMIN account. */
async function main() {
  if (!firebaseConfigured() || Buffer.from(process.env.FIELD_ENCRYPTION_KEY ?? '', 'base64').length !== 32) {
    throw new Error('Firebase 서버 인증 정보와 32바이트 FIELD_ENCRYPTION_KEY가 필요해요.');
  }
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password || !passwordRule(password)) {
    throw new Error('관리자 비밀번호는 8자 이상이며 영문 대문자·소문자·특수문자를 포함해야 해요.');
  }

  const db = database();
  const lookup = usernameLookup(normalizeUsername('admin'));
  const indexRef = db.collection('usernames').doc(lookup);
  const passwordHash = await hashPassword(password);
  const result = await db.runTransaction(async transaction => {
    const index = await transaction.get(indexRef);
    const existingId = index.data()?.user_id as string | undefined;
    if (index.exists && !existingId) throw new Error('admin 아이디 색인이 손상돼 있어요. 계정을 변경하지 않았습니다.');
    if (existingId) {
      const userRef = db.collection('users').doc(existingId);
      const user = await transaction.get(userRef);
      if (!user.exists || user.data()?.role !== 'ADMIN') {
        throw new Error('admin 아이디가 관리자 계정과 연결되지 않아 비밀번호를 변경하지 않았습니다.');
      }
      transaction.update(userRef, {password_hash:passwordHash});
      return {id:existingId, created:false};
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    transaction.create(db.collection('users').doc(id), {
      id, name:'관리자', username_lookup:lookup, username_cipher:encryptField('admin'),
      birth_date_cipher:encryptField('2000-01-01'), phone_cipher:encryptField('01000000001'),
      password_hash:passwordHash, role:'ADMIN', created_at:now, last_login_at:null,
    });
    transaction.create(indexRef, {user_id:id});
    return {id, created:true};
  });

  // Password rotation must also end old administrator and persistent login sessions.
  for (const [collection, field] of [
    ['sessions', 'user_id'], ['sessions', 'actor_admin_id'], ['remember_tokens', 'user_id'],
  ] as const) {
    const documents = await db.collection(collection).where(field, '==', result.id).get();
    for (let offset = 0; offset < documents.docs.length; offset += 400) {
      const batch = db.batch();
      for (const document of documents.docs.slice(offset, offset + 400)) batch.delete(document.ref);
      await batch.commit();
    }
  }
  process.stdout.write(result.created ? 'admin 관리자 계정을 생성했어요.\n' : 'admin 관리자 비밀번호를 변경했어요. 이전 로그인은 종료했어요.\n');
}

try {await main();}
catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : '관리자 계정을 설정하지 못했어요.'}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => undefined);
}
