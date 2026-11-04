# 각 교사가 자기 Supabase로 사용하는 설치 가이드

공통 웹사이트는 프로그램 화면만 제공합니다. **각 교사가 Supabase에 가입해 본인 프로젝트를 만들고 연결합니다.** 학생 데이터·캡처·인증·서버 함수 사용량은 그 프로젝트에 쌓이며 배포자 프로젝트를 공용으로 사용하지 않습니다. 웹 배포자가 로그인 사용자 명단을 모으는 별도 DB는 구현하지 않았습니다.

Supabase는 로그인(Auth), 데이터베이스(PostgreSQL), 실시간 갱신(Realtime), 파일(Storage), 학생 연결 서버(Edge Functions)를 제공하는 서비스입니다. Supabase 관리 계정 가입과 클래스온 Google 로그인은 서로 다른 절차입니다.

실행 사이트에 가짜 학생이 먼저 보이거나 연결 폼이 없다면 Supabase 설정 문제가 아니라 예전 배포본일 수 있습니다. [새 웹 버전 게시 안내](DEPLOY.ko.md)를 먼저 확인하세요. 새 화면의 표시는 **개인 Supabase 연결형 · 1.2.0**입니다.

## 1. Supabase 가입과 무료 프로젝트 만들기

1. [Supabase Dashboard](https://supabase.com/dashboard)에 접속합니다. **Sign up / Sign in**을 눌러 안내되는 가입 방식으로 본인의 관리 계정을 만들고 로그인합니다.
2. **New project**를 누릅니다. 조직이 없으면 본인 조직을 만들고 **Free** 플랜을 선택합니다.
3. Project name에 알아볼 수 있는 이름(예: `my-classon`)을 입력합니다.
4. Database Password를 생성하고 본인 비밀번호 관리자에 보관합니다. 웹 연결 입력란이나 채팅에 보내지 않습니다.
5. 가까운 Region(제공된다면 Seoul)을 선택하고 **Create new project**를 누릅니다. 프로젝트 준비가 끝날 때까지 기다립니다.
6. 계정에 제공되는 보안 설정/2단계 인증을 설정하고 복구 수단을 안전하게 보관합니다.

무료 플랜은 무제한이 아닙니다. 본인 프로젝트의 **Usage**, [Pricing](https://supabase.com/pricing)에서 DB·Storage·Edge Function·트래픽 한도를 확인하세요. 20명 하루 4시간 월 20일의 폴링·기록만 대략 154만 회/월이며 실제 사용량은 다릅니다. 한도를 넘으면 제한이나 요금제가 관련될 수 있습니다. 이 안내는 유료 전환을 자동으로 하지 않습니다. 장기간 미사용 시 무료 프로젝트 중지 정책도 확인하세요.

## 2. SQL 네 파일을 순서대로 적용

웹페이지의 **처음 사용 · 설정 안내 → 내 Supabase 설정**에서 SQL을 다운로드할 수 있습니다. 저장소의 다음 파일과 동일합니다.

1. `supabase/migrations/202610220001_monitoring.sql` — 기본 테이블·RLS·비공개 버킷·Realtime
2. `supabase/migrations/202611040001_teacher_accounts.sql` — 교사 회원과 학급 소유권
3. `supabase/migrations/202611040002_personal_project.sql` — 개인 프로젝트 소유자만 이용하도록 제한
4. `supabase/migrations/202611040003_security_hardening.sql` — 캡처 예약·완료 검증, 미완료 파일 접근 차단, 보안 버전 확인

각 파일을 텍스트 편집기로 열고 **전체 내용**을 복사합니다. 본인 Supabase 왼쪽 **SQL Editor → New query**에 붙여 넣고 **Run**을 누릅니다. 첫 파일 성공 후 새 쿼리에서 두 번째, 다음 세 번째와 네 번째를 실행합니다. 한 파일만 실행하지 마세요.

- 새 프로젝트: ①→②→③→④ 모두 실행합니다.
- 이전 공용 버전을 설치했다면: 먼저 DB를 백업하고 적용 이력을 확인한 뒤 누락된 ②·③·④와 최신 Edge Function·웹을 함께 갱신합니다. 기존 데이터는 다른 프로젝트로 자동 이동하지 않습니다.
- 재실행할 때: 과거 기본 파일만 실행하면 예전 권한이 복원될 수 있으므로 필요한 파일을 순서대로 적용하고 마지막에 반드시 ③과 ④를 적용합니다.

**Table Editor**에서 app_classes/app_students/app_teachers, **Storage**에서 student-captures 버킷을 확인하세요. **Public 스위치는 꺼져 있어야 합니다.** SQL은 첫 로그인자를 소유자로 자동 지정하지 않습니다.

Realtime 확인은 SQL Editor에서 다음을 실행합니다.

```sql
select tablename from pg_publication_tables
where pubname='supabase_realtime' and schemaname='public'
  and tablename like 'app_%';
```

app_classes/app_students/app_commands/app_events/app_captures가 대상입니다. 기기 토큰·참여 코드 테이블은 구독 대상이 아닙니다.

## 3. 본인 Google 로그인 연결

각 프로젝트가 별도의 인증 서버이므로 **각 교사가 본인 Google OAuth 앱도 설정**합니다. 배포자의 Google Client Secret을 나누어 쓰지 않습니다.

1. [Google Cloud Console](https://console.cloud.google.com/)에 로그인 → 위쪽 프로젝트 선택 → **New project**로 프로젝트를 만듭니다.
2. **Google Auth Platform**을 엽니다. 구 화면은 **APIs & Services → OAuth consent screen**입니다.
3. Branding에서 앱 이름·지원 이메일·연락처를 입력합니다. Audience는 개인 시험이라면 **External → Testing**으로 하고 **Test users에 본인 Google 계정만 추가**합니다. 본인만 쓸 때 다른 교사 전체를 이 앱에 추가할 필요가 없습니다. 조직의 Internal 설정은 학교 정책을 따릅니다.
4. 기본 로그인 범위 openid·이메일·프로필만 사용합니다. Gmail/Drive 권한은 필요하지 않습니다.
5. **Clients → Create client → Web application**을 선택합니다.
6. 본인 Supabase **Authentication → Sign In / Providers → Google**에서 표시되는 **Callback URL**을 복사합니다. 보통 `https://본인프로젝트.supabase.co/auth/v1/callback`입니다.
7. Google Cloud 클라이언트의 **Authorized redirect URIs**에 그 Callback URL을 붙여 넣습니다. 이 칸에 클래스온 웹 주소를 넣으면 안 됩니다.
8. Authorized JavaScript origins 칸에는 사용하는 웹사이트의 origin(기본 배포는 `https://kalapui36.github.io`)만 넣습니다. `/monitoring/`는 origin 칸에 넣지 않습니다.
9. 생성한 Client ID와 Client Secret을 본인 Supabase의 Google 제공자 설정에 입력 → Google 로그인 활성화 → **Save**합니다. Secret은 이 화면에만 넣고 웹 연결 폼·채팅·GitHub에는 넣지 않습니다.
10. Supabase **Authentication → URL Configuration**의 **Site URL**과 **Redirect URLs → Add URL**에 실제 사용하는 웹사이트 주소(기본 `https://kalapui36.github.io/monitoring/`)를 넣습니다. 끝 `/`와 실제 도메인을 맞추세요.
11. **Allow new users to sign up**이 켜져 있어야 첫 Auth 계정이 만들어집니다. 소유자 제한은 ③ SQL이 별도로 강제합니다. 본인만 Test user여도 학교 Google Workspace가 외부 앱을 금지하면 담당자 확인이 필요합니다.

Google 화면에서 앱 게시/검증이나 개인정보 안내를 요구하면 안내를 따릅니다. Testing 상태의 제한·세션 정책은 Google이 정하므로 장기 로그인 유지 기간을 무조건 보장하지 않습니다.

## 4. 학생 연결 서버 배포

공통 웹사이트가 학생 연결 서버까지 제공하는 것은 아닙니다. **본인 프로젝트에 device 함수를 배포**해야 학생 등록·캡처가 작동합니다.

1. PC에 [Node.js 24 LTS](https://nodejs.org/)를 설치합니다.
2. 최신 프로그램 저장소를 PC에 받습니다. GitHub 저장소에서 **Code → Download ZIP**으로 내려받아 압축을 풀어도 됩니다. 폴더 안에 package.json과 supabase/functions/device가 있어야 합니다. 학생용 ZIP과 다른 파일입니다.
3. Windows에서는 이 폴더 주소창에 `powershell`을 입력해 터미널을 열고, macOS에서는 터미널에서 이 폴더로 이동합니다.
4. 다음 명령으로 Supabase에 로그인합니다.

```sh
npx --yes supabase@2.121.0 login
```

브라우저 승인을 진행합니다. CLI가 토큰을 요구한다면 본인의 Supabase 계정 Access Tokens에서 발급해 **본인 터미널 프롬프트에만** 입력합니다. 채팅으로 전달하지 않습니다.

5. Supabase **Project Settings → General → Reference ID / Project ID**를 복사합니다. 아래 YOUR_PROJECT_ID를 그 값으로 바꾸어 실행합니다.

```sh
npx --yes supabase@2.121.0 functions deploy device --project-ref YOUR_PROJECT_ID --no-verify-jwt
```

6. **Edge Functions → device**에서 배포 상태를 확인합니다. 이 과정에는 Docker 설치가 필요하지 않습니다. 함수 안에서 교사 Auth와 기기 토큰을 별도로 검증하므로 이 함수에만 --no-verify-jwt를 적용합니다.
7. 서비스 키는 Supabase 서버 기본 환경변수에서 사용합니다. 웹·학생 ZIP에 복사하지 않습니다.

## 5. 공통 웹사이트에서 내 프로젝트 연결

1. Supabase **Project Settings → Data API / API**에서 **Project URL**을 복사합니다.
2. **Project Settings → API Keys**에서 브라우저용 **Publishable key**를 복사합니다. `sb_publishable_`로 시작합니다. 구형 anon 키도 지원합니다. **Secret / service_role을 선택하지 마세요.** 보안상 표준 `https://프로젝트.supabase.co` 주소만 지원하며 사용자 지정 Supabase API 도메인·자체 호스팅 주소는 현재 지원하지 않습니다.
3. 공통 클래스온 웹사이트에서 시작 안내를 닫고 **클래스온 연결 설정**으로 갑니다.
4. **내 Supabase Project URL**, **내 Supabase 공개 Publishable key**에 붙여 넣고 **내 프로젝트에 연결**을 누릅니다.
5. 이 설정은 현재 브라우저의 localStorage에만 저장합니다. 새 브라우저·다른 PC에서는 다시 연결합니다. 연결 저장은 형식만 검사하며 서버 설치 성공을 의미하지 않습니다.
6. 다른 프로젝트로 바꾸려면 **내 Supabase 연결 해제**로 현재 브라우저의 로그인을 해제하고 설정을 지운 뒤 새 주소·공개 키를 입력합니다. 데이터 삭제나 서버 계정 삭제는 아닙니다.

각 교사가 GitHub를 복제하거나 자기 웹사이트를 배포할 필요는 없습니다. 공통 배포물에는 특정 교사의 프로젝트 URL·키를 넣지 않으며, 입력하지 않으면 어떤 기본 프로젝트에도 자동 접속하지 않습니다.

## 6. 첫 로그인과 본인 소유자 지정

1. 연결한 웹에서 **Google 계정으로 회원가입**을 누르고 3단계 Test users에 넣은 본인 계정으로 로그인합니다.
2. 처음에는 **교사 회원가입**과 본인 UUID가 표시됩니다. 아무 로그인 계정이나 자동으로 소유자가 되지 않습니다.
3. 본인 Supabase **Authentication → Users**에서 이메일로 본인 행을 찾아 **User UID**가 웹에 나온 UUID와 같은지 확인합니다.
4. **SQL Editor → New query**에서 아래 UUID를 확인한 실제 값으로 바꾸어 실행합니다.

```sql
insert into public.app_admins(user_id)
values ('확인한-본인의-Auth-UUID');
```

이 테이블 이름은 app_admins지만, 개인 프로젝트에서는 본인 소유자를 뜻합니다. 이미 한 명이 지정돼 있으면 중복 추가하지 말고 기존 값을 확인하세요. 첫 웹 로그인/공개 키만으로는 이 행을 생성할 수 없습니다.

5. 웹으로 돌아가 안내를 확인 → 체크 → **교사 회원가입 완료**를 누릅니다. **아직 학급이 없습니다**가 나오면 정상입니다.
6. **학급 추가**로 학급을 만들고 학생을 연결합니다. 기존 웹 브라우저 로그인은 유효한 동안 유지됩니다.
7. 다른 Google 계정이 로그인하더라도 소유자가 아니면 가입·데이터 조회·제어·코드 발급이 거절되어야 합니다.

## 7. 학생 크롬북 연결

1. 교사 대시보드에서 학급 생성 → **참여 코드 발급**을 누릅니다. 코드는 기본 1시간, 최대 20회 신청입니다.
2. **학생 설치·ZIP → 학생용 ZIP 다운로드**를 누릅니다. **현재 연결한 본인 프로젝트 주소가 들어 있는 ZIP**입니다. 같은 프로젝트의 학급들은 같은 ZIP을 쓸 수 있지만 다른 교사 프로젝트의 ZIP을 섞지 마세요. 프로젝트 변경 시 학생 재설정/재등록이 필요하고 기록은 자동 이전되지 않습니다.
3. 크롬북 파일 앱에서 ZIP을 ‘모두 추출’합니다. 메뉴가 없으면 ZIP을 열어 모든 파일을 복사한 뒤 ‘내 파일 → 다운로드’의 새 폴더에 붙여 넣습니다. manifest.json이 바로 보이는 폴더여야 하며 설치 후 지우지 않습니다.
4. Chrome 주소창 `chrome://extensions` → **개발자 모드 ON** → **압축해제된 확장 프로그램을 로드합니다** → 그 폴더를 선택합니다.
5. 이는 확장 관리 화면의 개발자 모드입니다. **크롬북 OS 개발자 모드 전환·초기화는 필요하지 않습니다.** 학교 정책으로 막혔으면 우회하지 말고 담당자에게 확인하세요.
6. 열린 학생 연결 창(안 열리면 퍼즐 아이콘 → 클래스온)에 코드·번호·이름을 입력하고 등록 신청합니다.
7. 교사가 실제 기기를 확인하고 승인합니다. 학생과 교사 양쪽에서 연결을 확인합니다.
8. 학급 모니터링 ON 후 일반 웹페이지의 제목·URL·체류시간이 갱신되는지 확인합니다. OFF는 기록 수집을 중단하되 제어는 유지합니다.

Windows·Mac 데스크톱 Chrome은 별도 검증 대상입니다. Android/iPad의 일반 Chrome에 이 ZIP 확장을 설치할 수는 없습니다.

## 8. 실제 수업 전 확인

- 공지는 방문 중인 웹사이트 DOM이 아닌 확장 전용 창에 표시합니다. Chrome의 창 표시 정책과 자동 닫힘을 실기기로 확인하세요. 시크릿 탭은 활동 수집·캡처에서 제외합니다. 보안 업데이트 전 기기에 남아 있던 미전송 활동 큐는 폐기하며, 기존 DB 기록을 자동 삭제하는 것은 아닙니다.
- 비상 해제 코드를 발급해 안전하게 보관하고 기기에 동기화합니다. 정상 잠금·해제·공지·잠금 해제 상태의 캡처·도움 요청을 크롬북 한 대로 확인하세요.
- 잠금은 Chrome 팝업 범위이며 OS 전체 잠금이 아닙니다. 통신 장애 시 최대 120초 lease로 안전 해제하지만 절전/정책에 따른 실제 동작을 확인해야 합니다.
- 접속·기록·캡처가 **본인 Supabase의 app\_*와 private Storage**에 저장되는지 확인합니다. ZIP·가짜 화면만으로 연결 성공이라 판단하지 마세요.
- 보관 기간은 방문/이벤트 1~30일, 캡처 1~7일입니다. 실제 파일 삭제는 **보관 기간 지난 기록 정리**를 실행해야 합니다. 자동 예약 삭제는 미설정입니다.
- [크롬북 검증표](CHROMEOS.ko.md)는 자동 테스트와 별도로 수행합니다.

## 9. 로그인 정보는 어디에 저장되는가

| 정보                                                                      | 저장/처리 위치                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Google 비밀번호                                                           | Google. 클래스온과 Supabase가 비밀번호를 입력받거나 저장하지 않습니다.                                                |
| 앱 로그인 사용자 UUID·이메일·제공자 정보                                  | 해당 교사가 연결한 Supabase Auth의 Authentication → Users. Google 로그인 프로필/토큰 정보도 인증 서비스가 처리합니다. |
| 소유자·교사 회원·학급·학생·기록                                           | 해당 교사의 Supabase DB. 이메일은 Auth 프로필에 있을 수 있고 권한 판단은 UUID를 사용합니다.                           |
| 캡처 이미지                                                               | 해당 교사의 비공개 Supabase Storage                                                                                   |
| 로그인 유지용 access/refresh token, PKCE 상태와 세션에 포함된 제공자 토큰 | 교사 브라우저의 Supabase SDK 저장소(localStorage 등). 유효한 토큰 유출은 계정 접근 위험입니다.                        |
| 프로젝트 URL·공개 키                                                      | 교사 브라우저 localStorage. 브라우저에서 보이는 공개 설정이며 RLS/인증을 대신하지 않습니다.                           |
| 접속 과정의 운영 로그                                                     | Supabase·Google·웹 호스팅 제공자가 각 정책에 따라 처리할 수 있습니다. ‘어디에도 기록되지 않는다’고 보장하지 않습니다. |

배포자가 관리하는 공통 회원 명단/학생 저장 서버로 모으는 기능은 없습니다. **다만 공통 웹의 JavaScript는 로그인 세션으로 동작하므로, 웹 배포 계정이나 코드가 침해되면 개인 Supabase 토큰·데이터도 영향을 받을 수 있습니다.** 개인 DB를 쓴다는 이유로 배포자 보안 책임이 사라지지는 않습니다.

## 10. 보안 책임 분담

- **Supabase:** 인증·DB·Storage 등 호스팅 인프라와 서비스 보안을 담당합니다. 교사가 별도 인증 서버/DB 서버를 운영하거나 모든 공격을 직접 방어할 필요는 없습니다.
- **프로그램 배포자:** 안전한 코드·의존성, RLS/서버 권한 로직, XSS 방지, HTTPS, GitHub/배포 계정 2단계 인증과 변경 검토를 관리합니다. 공통 페이지에 불필요한 외부 스크립트·분석 SDK를 넣지 않습니다.
- **각 교사:** Supabase·Google 계정과 복구 수단, 비밀키, SQL/함수 업데이트, 학생 승인·보관/삭제·권한 안내, 사용량을 관리합니다. RLS와 private 버킷을 끄지 마세요. 개인 기기/프로필을 쓰고 공용 PC 사용 후 로그아웃·연결 해제하세요.

아무도 ‘해킹 불가능’을 보장할 수 없습니다. 토큰·비밀키가 노출되었다면 단순 코드 삭제만으로 해결되지 않습니다. 해당 계정에서 세션 폐기/로그아웃과 키 폐기·재발급을 진행하고 의심 기기를 등록 폐기합니다. 앱에 별도 비밀번호 회원가입은 구현하지 않고 Google OAuth를 사용합니다.

## 11. 문제 해결

| 증상                  | 확인                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------- |
| 연결 설정 저장 불가   | 브라우저 저장소 허용, HTTPS URL, publishable/anon 키인지 확인                           |
| Google redirect 오류  | Google redirect는 본인 Supabase Callback URL, Supabase 허용 URL은 공통 웹 주소인지 확인 |
| Google 계정 접근 차단 | 본인 Test users 등록, 학교 외부 앱 정책 확인                                            |
| 소유자 지정 오류      | 본인 프로젝트인지, Auth Users UUID와 app_admins가 일치하는지 확인                       |
| 학생 등록 실패        | 본인 device 함수 배포·해당 프로젝트 ZIP·코드 만료·번호 중복 확인                        |
| 캡처 실패             | 잠금 해제·일반 웹 탭 활성화·Chrome 정책·private Storage 확인                            |

오류 공유 시 학생 정보·JWT·기기 토큰·비상 코드는 가리세요.

## 12. 웹 배포자용 메모

공통 정적 웹의 GitHub Actions는 VITE_BASE_PATH(기본 /monitoring/)만 필요합니다. 교사 Supabase URL/키는 GitHub Variables에 넣지 않습니다. 이전 VITE_SUPABASE_URL/KEY로 기본 프로젝트를 자동 연결하지 않습니다. 웹 도메인을 바꾸면 모든 사용자가 자기 Supabase Redirect URLs와 필요시 Google origin을 갱신해야 합니다. 같은 Supabase 프로젝트라면 학생 ZIP의 API 주소는 바뀌지 않습니다.

자체 호스팅하고 싶다면 저장소를 받아 Pages에 배포하고 본인 주소를 OAuth에 등록할 수 있습니다. 가비아 서브도메인은 DNS CNAME을 GitHub Pages 호스트에 연결하고 GitHub Custom domain/HTTPS를 설정합니다. 저장소 루트 CNAME은 빌드에 복사하며 루트 도메인 배포 시 VITE_BASE_PATH=/를 사용합니다. 기존 메일 MX 레코드는 지우지 않습니다.

## 13. 이번 보안 검증과 남은 위험

[보안 검증 보고서](security-review.ko.md)를 읽어 주세요. ④ SQL과 최신 device 함수, 새 학생 ZIP을 모두 적용해야 보완 내용이 반영됩니다. 운영 웹은 인라인 스크립트·임의 외부 전송 제한 CSP와 Referrer 제한을 빌드에 넣습니다. GitHub Pages는 frame-ancestors HTTP 헤더를 직접 설정할 수 없어 프레임에서는 앱 초기화를 거부하며, 별도 호스팅에서는 헤더도 적용하는 것이 좋습니다.

개인 Supabase·RLS·CSP는 유효한 토큰을 훔친 공격자나 공통 웹의 배포 코드를 장악한 공격자까지 막아 주지는 못합니다. 합성 토큰으로 이 잔여 위험을 재현했습니다. 높은 분리가 필요하면 신뢰할 수 있는 릴리스를 검토하여 각 교사가 독립된 도메인에 호스팅하는 방식을 고려할 수 있지만, 이것도 해킹 불가능을 보장하지 않습니다.

## 14. ChromeOS 활동 확인 범위

일반 웹사이트와 Chrome 탭/창 API에 노출되는 일부 카메라·파일·설정 앱 주소를 지원합니다. 모든 OS/Android/Linux 앱 활동을 확인하는 것은 아닙니다. 내부 앱은 고정된 앱 이름과 주소만 기록하며 경로·파일명·query를 제거합니다. 카메라 앱의 실제 감지 가능 여부는 기기에서 검증해야 하고 카메라 영상 캡처는 제공하지 않습니다. 학생 카드에는 최근 감지한 Chrome 활동을 표시합니다.
