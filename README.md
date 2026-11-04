# 클래스온 · monitoring

React + TypeScript + Vite 교사 대시보드와 Supabase Database/Auth/Realtime/Storage, ZIP 수동 설치형 Chrome MV3 확장을 연결하는 프로젝트입니다.

**각 교사가 자신의 Supabase 프로젝트를 연결하는 개인 프로젝트 방식입니다.** 공통 웹은 정적 프로그램만 배포합니다. 브라우저 연결 화면에 본인 Project URL과 공개 Publishable key를 입력하며, 배포자 DB로 자동 연결하거나 공용 회원 DB에 가입 정보를 모으지 않습니다. 로그인·학생·캡처·사용량은 연결한 프로젝트에 속합니다. 첫 방문 가이드에 Supabase 가입·SQL ①②③④·Google OAuth·함수 배포·소유자 지정·크롬북 설치를 안내합니다.

기존 가상 데이터는 운영에서 제외하고 `src/demo/`와 `reference/`에 보존했습니다. 실제 DB가 비어 있으면 빈 화면입니다.

## 먼저 읽기

- **[데모만 보일 때 / 새 웹 버전 게시 방법](docs/DEPLOY.ko.md)**: GitHub Pages와 별도 결과물 사이트에 실제 빌드를 반영하는 절차. 새 화면은 개인 Supabase 연결형 1.2.0입니다.

- **[초보자용 실제 설치 안내](docs/SETUP.ko.md)**: Free 프로젝트, SQL, Google Cloud, 교사 회원가입, Edge Function, Pages, 학생 연결, 가비아 도메인 순서.
- [현재 아키텍처](docs/architecture.md), [권한·인증·개인정보](docs/security.md), [ChromeOS 검증 체크리스트](docs/CHROMEOS.ko.md).
- [검증 결과](docs/validation.md). 자동 테스트와 실제 계정·크롬북 검증은 구분합니다.

## 현재 코드

- Google OAuth/세션 복원/로그아웃, 본인 프로젝트 Google 로그인과 세션 복원, SQL Editor에서 수동 지정한 소유자 UUID에만 교사 가입·데이터 접근 허용. 첫 로그인 자동 승격은 없습니다.
- 실제 DB 학급 생성·변경·기록 ON/OFF, 학생 등록 신청·교사 승인·등록 폐기·정보 수정.
- 확장의 접속 확인·현재 사이트·URL·체류 기록·도움 요청 전송.
- 전체/선택/개별 명령, revision·만료·중복 방지·기기 ACK, 학생별 오류 상세.
- 검은 Chrome 전체 화면 팝업 잠금, 문구·자동 해제·비상 코드·통신 단절 안전 해제, 제한된 창 복구.
- 공지 표시·닫기, 활성 웹 탭 캡처 업로드, 비공개 버킷의 인증된 이미지 조회.
- 확장 전용 공지 창·시크릿 탭 제외·캡처 서버 확정, 보관 기간 설정·수동 정리, Pages Actions와 후속 사용자 도메인 CNAME 복사.

이는 **외부 설정까지 이미 적용됐다는 뜻은 아닙니다.** 사용자 Supabase 프로젝트와 Google OAuth 설정·함수 배포가 필요합니다. 실제 ChromeOS에서 테스트하지 않은 기능을 학교 운영 완료로 간주하지 마세요. OS 전체 잠금을 보장하지 않습니다.

## 개발

Node.js 24 LTS / npm을 사용합니다.

```sh
npm ci
# 웹 연결 폼에서 본인 프로젝트 URL과 공개 키 설정; 빌드 환경변수에는 넣지 않음
npm run dev
npm test
npm run test:live
npm run test:legacy
npm run build
npm run preview
```

연결 설정은 해당 브라우저 localStorage에 저장합니다. 설정 없이도 빌드·배포할 수 있으며 기본 프로젝트로의 대체 접속은 없습니다. Pages 빌드는 VITE_BASE_PATH만 사용합니다. 비밀키는 연결 폼에서 거부합니다.

DB 테스트는 PGlite의 실제 PostgreSQL 엔진으로 SQL·RLS·RPC를 실행하며 Supabase 호스팅 서비스 전체를 대체하지 않습니다. `test:live`는 운영 코드 관련 로컬 자동 검사이고, 실제 학교 연결 테스트라는 뜻은 아닙니다. 전체 테스트에는 과거 시연 UI 회귀 검사가 별도로 포함됩니다.

## 서버 파일

- `supabase/migrations/202610220001_monitoring.sql`: 새 app_* 테이블, RLS, private bucket, Realtime, 명령/등록 RPC.
- `supabase/migrations/202611040001_teacher_accounts.sql`: 기본 SQL 다음에 적용할 교사 회원가입·소유자·교사별 RLS/RPC/Storage 업그레이드. 기존 단일 관리자 학급은 소유자를 보존합니다.
- `supabase/migrations/202611040002_personal_project.sql`: 마지막에 적용하는 개인 프로젝트 소유자 전용 가입·접근 제한.
- `src/connection.ts`: 브라우저별 연결 설정. `src/components/ConnectionSetup.tsx`: 공개 연결값 입력.
- `supabase/migrations/202611040003_security_hardening.sql`: 마지막 보안 업데이트. 업로드 예약/완료·Storage RLS·구형 프로토콜 차단·보안 버전 확인.
- `supabase/functions/device/`: 학생 인증/등록/기록/명령/캡처 API와 관리자 코드 발급·정리.
- `student-extension/`: 실제 MV3 런타임. 교사가 웹에서 공통 ZIP을 생성합니다. 현재 연결한 개인 프로젝트 URL만 패키징합니다. 같은 프로젝트의 학급끼리 공유하며 다른 프로젝트용 ZIP과 섞지 않습니다.
- `.env.example`: 공개 설정 이름. 서비스 키·OAuth Secret·비밀번호를 포함하지 않습니다.

## 보안 검증

[공격 시뮬레이션 보고서](docs/security-review.ko.md), [검증 결과](docs/validation.md)를 읽으세요. npm run test:security는 격리된 자동 검증이며 실제 서비스 침투 테스트가 아닙니다. npm run security:scan은 알려진 비밀 패턴만 검사합니다. 빌드 후 테스트 Chromium(CDP 127.0.0.1:9222)에서 npm run test:browser-security로 로컬 브라우저 공격을 재현합니다. 테스트 수집 서버는 루프백에만 생성되며 합성 토큰만 사용하고 운영 배포에 포함하지 않습니다.

현재 보안 보완은 ④ SQL + 최신 Edge + 학생 ZIP 1.1을 모두 적용해야 합니다. CSP/초기 자원 무결성/Actions 커밋 고정도 배포 코드 자체의 침해나 유효 토큰 탈취를 막는 절대 보장이 아닙니다. 실서비스 확인 전 학교 운영 안전 인증을 받은 것으로 취급하지 마세요.

## 알려진 범위

한 설치는 한 학급 연결을 활성화합니다. 복수 학급 동시 소속·자동 전환은 미제공입니다. 보관 기간 초과 파일/기록의 자동 예약 삭제는 미설정이며 관리자 정리 버튼이 필요합니다. ChromeOS 시스템 페이지·학교 정책·MV3 절전 때문에 모든 환경에서 같은 제어 지연이나 잠금 범위를 보장하지 않습니다. 실제 99대 동시 네트워크 부하는 별도 검증 대상입니다.

코드 작성·로컬 검사와 사용자 Supabase 적용·GitHub 배포·실제 기기 검증은 각각 별도 완료 단계입니다.
