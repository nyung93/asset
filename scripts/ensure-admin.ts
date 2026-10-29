import {closeDatabase, firebaseConfigured} from '../server/db';
import {ensureAdminPassword} from '../server/adminBootstrap';

try {
  if (!firebaseConfigured()) throw new Error('Firebase 서버 인증 정보가 필요해요.');
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password) throw new Error('ADMIN_BOOTSTRAP_PASSWORD를 비밀 환경 변수로 설정해 주세요.');
  const result = await ensureAdminPassword(password);
  process.stdout.write(`admin 관리자 계정: ${result === 'created' ? '생성' : result === 'updated' ? '비밀번호 변경' : '이미 설정됨'}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : '관리자 계정을 설정하지 못했어요.'}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => undefined);
}
