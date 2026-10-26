import {closeDatabase, database, firebaseConfigured} from '../server/db';
import {normalizeUsername,usernameLookup} from '../server/security';

const username=process.argv[2];
if(!username) {process.stderr.write('Usage: npm run admin:grant -- <username>\n');process.exit(1);}
try {
  if(!firebaseConfigured()) throw new Error('Firebase 서버 인증 정보를 먼저 설정해 주세요.');
  const lookup=usernameLookup(normalizeUsername(username));
  const index=await database().collection('usernames').doc(lookup).get();
  const userId=index.data()?.user_id as string|undefined;
  if(!userId) throw new Error('No registered account matches that username.');
  const ref=database().collection('users').doc(userId);
  const user=await ref.get();
  if(!user.exists) throw new Error('No registered account matches that username.');
  await ref.update({role:'ADMIN'});
  process.stdout.write(`Admin access granted to ${user.data()?.name}.\n`);
} catch(error) {
  process.stderr.write(`${error instanceof Error?error.message:'Failed to grant admin access.'}\n`);
  process.exitCode=1;
} finally {
  await closeDatabase().catch(()=>undefined);
}
