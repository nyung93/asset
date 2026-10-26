# Firebase 계정·가계부 저장소 설정

앱은 Vercel의 `/api/index` 서버 함수에서 Firebase Admin SDK로 Cloud Firestore에
접속합니다. 브라우저에는 서비스 계정 키를 보내지 않습니다. 기존 아이디 기반
회원가입·로그인과 관리자 화면은 그대로 사용하며, 별도의 Firebase Authentication
이메일 계정은 만들지 않습니다. 서버 설정 전에는 `setup_required`로 거부합니다.

## Firebase 프로젝트 `asset-1d626`

1. [Firebase 콘솔](https://console.firebase.google.com/project/asset-1d626/firestore)에서
   Cloud Firestore 데이터베이스를 만듭니다. 이미 있으면 이 단계를 건너뜁니다.
2. 서버 전용 서비스 계정에 Firestore 읽기·쓰기 권한을 부여하고 비공개 키를
   발급합니다. [Firebase Admin SDK 설정](https://firebase.google.com/docs/admin/setup)을
   참고하세요. 기존 Firestore 보안 규칙에서 아래 앱 컬렉션이 브라우저에 공개되지
   않는지도 확인하세요. Admin SDK는 보안 규칙과 별도로 서버 권한으로 접속합니다.
   키 파일을 Git이나 채팅에 올리지 마세요.
3. Vercel의 `asset` 프로젝트 → Settings → Environment Variables에서 **Production**에
   아래 네 값을 설정합니다. 변경 후 Production을 재배포합니다.

   | 이름 | 값 |
   | --- | --- |
   | `FIREBASE_PROJECT_ID` | `asset-1d626` |
   | `FIREBASE_CLIENT_EMAIL` | 서비스 계정 JSON의 `client_email` |
   | `FIREBASE_PRIVATE_KEY` | 서비스 계정 JSON의 `private_key` 전체. 실제 줄바꿈과 `\\n` 모두 지원 |
   | `FIELD_ENCRYPTION_KEY` | `openssl rand -base64 32`로 한 번 생성한 값 |

   `FIREBASE_*`에 `VITE_` 접두사를 붙이지 마세요. Vite의 `VITE_*` 값은 브라우저에
   노출됩니다. 로컬 개발에는 `.env.example`을 참고해 프로젝트 루트의
   `.env.local`에 같은 값을 넣고 개발 서버를 재시작합니다. Google Application
   Default Credentials를 쓰는 로컬 환경에서는 서비스 계정 두 값 대신
   `GOOGLE_APPLICATION_CREDENTIALS` 파일 경로를 사용할 수 있습니다.

4. 일반 사용자는 로그인 화면에서 직접 가입합니다. 관리자 계정은 같은 서버
   환경값을 가진 로컬 환경에서 `ADMIN_BOOTSTRAP_PASSWORD`를 일시적으로 설정한 뒤
   `npm run accounts:create-admin`으로 한 번만 만듭니다. 이 명령은 `admin`이 이미
   있으면 덮어쓰지 않습니다. 실행 후 부트스트랩 비밀번호를 환경에서 제거하세요.
   기존 사용자에게 관리자 권한을 부여할 때만
   `npm run admin:grant -- <아이디>`를 사용합니다.

`FIELD_ENCRYPTION_KEY`는 안전한 비밀 저장소에 별도 백업해야 합니다. 바꾸거나
잃어버리면 기존 아이디·생년월일·휴대폰 번호·가계부를 복호화할 수 없습니다.
기존 PostgreSQL 계정은 Firestore로 자동 이전되지 않습니다. 이전 DB에 회원이
있다면 별도 마이그레이션 후 전환해야 합니다.

## 저장·보안 동작

- `users`, `usernames`, `sessions`, `auth_attempts`, `app_data`, `admin_audit` 컬렉션을
  서버에서 사용합니다. 브라우저가 Firestore에 직접 접속하지 않습니다.
- 비밀번호는 사용자별 솔트로 scrypt 해시하고, 아이디·생년월일·휴대폰 번호·
  가계부 데이터는 서버에서 AES-256-GCM으로 암호화합니다. 이름은 회원 검색을 위해
  평문으로 저장하고, 아이디 검색에는 키 기반 블라인드 인덱스를 씁니다.
- 회원가입의 아이디 중복 검사와 가계부 버전 갱신은 Firestore 트랜잭션으로
  처리합니다. 다른 창에서 먼저 저장하면 버전 충돌을 반환합니다.
- 인증은 14일짜리 HttpOnly/SameSite 쿠키와 서버 세션으로 확인합니다. 관리자
  회원 접속은 별도 세션과 감사 기록을 남깁니다.
- 현재 관리자 통계·회원 검색은 Firestore 문서를 읽어 집계합니다. 회원 수가
  커지면 집계 문서와 검색 인덱스로 교체해야 합니다.
- 가계부 스냅샷은 Firestore 문서 크기 제한을 고려해 600KB 이하만 받습니다.
  저장 전 CSV 백업 기능은 계속 사용할 수 있습니다.

## 검증

`npm run build`와 `npm test`가 서버 번들, 암호화, 계정·세션·가계부 API 흐름을
검증합니다. 가짜 Firestore 테스트는 실제 서비스 계정 권한·네트워크까지 확인하지
않습니다. 환경 변수 설정 후 실서버에서 회원가입 → 가계부 저장 → 새로고침 후
재로그인 → 관리자 계정 접속을 확인해야 연결이 완료됩니다.
