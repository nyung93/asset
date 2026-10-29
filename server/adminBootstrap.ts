import {createHmac, randomUUID} from 'node:crypto';
import {database} from './db';
import {encryptField, hashPassword, normalizeUsername, passwordRule, usernameLookup} from './security';

let appliedFingerprint: string | undefined;

/** Applies a server-only administrator password once for each configured secret. */
export async function ensureAdminPassword(password: string): Promise<'created'|'updated'|'unchanged'> {
  if (!passwordRule(password)) throw new Error('관리자 비밀번호는 8자 이상이며 영문 대문자·소문자·특수문자를 포함해야 해요.');
  const key = Buffer.from(process.env.FIELD_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must contain 32 random bytes in base64');
  const fingerprint = createHmac('sha256', key).update('admin-bootstrap-v1').update(password).digest('hex');
  if (appliedFingerprint === fingerprint) return 'unchanged';

  const db = database();
  const markerRef = db.collection('system').doc('admin-bootstrap-v1');
  if ((await markerRef.get()).data()?.fingerprint === fingerprint) {
    appliedFingerprint = fingerprint;
    return 'unchanged';
  }
  const passwordHash = await hashPassword(password);
  const lookup = usernameLookup(normalizeUsername('admin'));
  const indexRef = db.collection('usernames').doc(lookup);
  const result = await db.runTransaction(async transaction => {
    const marker = await transaction.get(markerRef);
    if (marker.data()?.fingerprint === fingerprint) return {id:'',status:'unchanged' as const};
    const index = await transaction.get(indexRef);
    const existingId = index.data()?.user_id as string | undefined;
    if (index.exists && !existingId) throw new Error('admin 아이디 색인이 손상돼 있어요.');
    let id = existingId;
    let status: 'created'|'updated' = 'updated';
    if (id) {
      const userRef = db.collection('users').doc(id);
      const user = await transaction.get(userRef);
      if (!user.exists || user.data()?.role !== 'ADMIN') throw new Error('admin 아이디가 관리자 계정과 연결되지 않았어요.');
      transaction.update(userRef,{password_hash:passwordHash});
    } else {
      id = randomUUID();
      const now = new Date().toISOString();
      transaction.create(db.collection('users').doc(id),{
        id,name:'관리자',username_lookup:lookup,username_cipher:encryptField('admin'),
        birth_date_cipher:encryptField('2000-01-01'),phone_cipher:encryptField('01000000001'),
        password_hash:passwordHash,role:'ADMIN',created_at:now,last_login_at:null,
      });
      transaction.create(indexRef,{user_id:id});
      status = 'created';
    }
    return {id,status};
  });

  if (result.status === 'unchanged') return 'unchanged';
  // End old administrator and persistent sessions after password rotation.
  for (const [collection,field] of [
    ['sessions','user_id'],['sessions','actor_admin_id'],['remember_tokens','user_id'],
  ] as const) {
    const documents = await db.collection(collection).where(field,'==',result.id).get();
    for (let offset=0; offset<documents.docs.length; offset+=400) {
      const batch = db.batch();
      for (const document of documents.docs.slice(offset,offset+400)) batch.delete(document.ref);
      await batch.commit();
    }
  }
  await markerRef.set({fingerprint,applied_at:new Date().toISOString()});
  appliedFingerprint = fingerprint;
  return result.status;
}

export async function ensureAdminFromEnvironment(): Promise<void> {
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (password) await ensureAdminPassword(password);
}
