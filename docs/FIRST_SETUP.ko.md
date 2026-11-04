# Supabase를 처음 쓰는 교사의 입력칸별 설치 안내

프로그램 주소는 https://kalapui.com/monitoring/ 입니다. 각 교사가 자기 Supabase에 가입해 설정합니다. Supabase 관리 계정과 프로그램의 Google 로그인은 별개입니다. 프로젝트 이름이나 비밀번호를 채팅에 알려 줄 필요는 없습니다.

## 1. 새 프로젝트 만들기

https://supabase.com/dashboard 에서 가입/로그인한 뒤 New project를 누릅니다.

| 화면의 칸         | 넣을 값                                           |
| ----------------- | ------------------------------------------------- |
| Organization      | 본인 조직. 없으면 개인 조직을 만들고 Free 선택    |
| Project name      | classon-myclass 같은 알아볼 수 있는 이름          |
| Database Password | 본인이 새로 만든 비밀번호. 비밀번호 관리자에 보관 |
| Region            | 가까운 지역. Seoul이 제공되면 선택 가능           |
| Pricing plan      | Free                                              |

그 밖의 설정은 기본값을 유지하고 Create new project를 누릅니다. 프로젝트 준비 완료를 기다리세요. 무료 플랜도 사용량 제한이 있으므로 Usage/Pricing을 확인합니다. 이 절차에는 유료 플랜 전환이 필요하지 않습니다.

## 2. 데이터베이스 설치 — SQL Editor에 붙여 넣기

1. 프로그램의 ‘처음 사용 · 설정 안내 → 내 Supabase 설정’에서 **통합 설치 SQL 복사**를 누릅니다. 또는 제공된 monitoring-install.sql 파일 전체 내용을 복사합니다.
2. Supabase 왼쪽 **SQL Editor → New query**를 누릅니다.
3. 큰 코드 입력칸에 붙여 넣습니다. 별도로 이름·비밀번호를 코드에 입력하지 않습니다.
4. **Run**을 누릅니다. 통합 파일은 기본·교사 회원·개인 소유자·보안 SQL 네 개를 순서대로 적용합니다.
5. 마지막 결과에 **installed_security_version = 4**가 나오면 설치 단계가 끝난 것입니다. 빨간 오류가 나오면 멈추고 오류 내용부터 확인합니다.
6. **Table Editor**에 app_classes/app_students/app_teachers가 보이고, **Storage**에 student-captures가 있는지 확인합니다. 이 버킷은 **Public OFF**여야 합니다.

통합 파일은 처음 만든 빈 프로젝트용으로 권장합니다. 기존 데이터가 있는 프로젝트는 백업 후 현재 설치 이력에 맞춰 개별 SQL을 적용하세요. SQL 실행만으로 관리자 계정이나 실제 학생이 만들어지지는 않습니다.

## 3. Google 로그인 설정 — 주소 세 종류 구분

먼저 Supabase에서 Authentication → Sign In / Providers → Google을 엽니다. Google이 접혀 있으면 눌러 펼칩니다. **Callback URL**을 복사해 둡니다.

형식은 https://본인프로젝트.supabase.co/auth/v1/callback 입니다. ‘본인프로젝트’를 그대로 쓰지 말고 실제 화면에 보이는 주소를 복사하세요.

이어서 https://console.cloud.google.com/ 에서 다음을 진행합니다.

1. 위쪽 프로젝트 선택 → New project로 Google Cloud 프로젝트를 만듭니다.
2. Google Auth Platform을 엽니다. 구 화면에서는 APIs & Services → OAuth consent screen입니다.
3. Branding의 App name에는 ‘클래스온 개인용’, User support email과 연락 이메일에는 본인 이메일을 넣습니다.
4. Audience는 개인 사용 기준 External/Testing으로 두고 Test users에 **프로그램에 로그인할 본인 Google 이메일**을 추가합니다.
5. Clients → Create client → Application type: **Web application**, Name: classon-web을 입력합니다.
6. 아래 URL 칸을 입력하고 Create를 누릅니다.

| Google Cloud의 칸             | 넣을 값                                  |
| ----------------------------- | ---------------------------------------- |
| Authorized JavaScript origins | https://kalapui.com                      |
| Authorized redirect URIs      | 앞에서 복사한 본인 Supabase Callback URL |

생성된 **Client ID**와 **Client Secret**을 확인하고 Supabase의 Google 설정으로 돌아갑니다.

| Supabase Google 설정의 칸  | 넣을 값                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| Enable Sign in with Google | ON                                                                  |
| Client ID                  | Google이 발급한 Client ID. 보통 apps.googleusercontent.com으로 끝남 |
| Client Secret              | Google이 발급한 Client Secret                                       |

Save를 누릅니다. Client Secret은 Supabase 제공자 설정에만 입력하며 클래스온 연결 폼이나 채팅에 넣지 않습니다. 다른 옵션은 기본값을 유지합니다. Google의 기본 로그인 범위만 필요하고 Gmail/Drive 권한은 필요하지 않습니다.

이제 Supabase Authentication → URL Configuration에서 다음을 설정합니다.

| Supabase URL Configuration의 칸 | 넣을 값                         |
| ------------------------------- | ------------------------------- |
| Site URL                        | https://kalapui.com/monitoring/ |
| Redirect URLs → Add URL         | https://kalapui.com/monitoring/ |

저장하세요. Authentication → Sign In / Providers에서 Allow new users to sign up도 ON이어야 첫 계정이 생성됩니다. 다른 주소에 프로그램을 직접 올렸다면 위 예시 대신 프로그램 안내 화면에 표시되는 현재 주소를 사용합니다.

Google redirect에는 Supabase Callback을, Supabase redirect에는 프로그램 웹 주소를 넣는다는 차이가 핵심입니다.

## 4. 학생 연결 서버 — Edge Functions에 코드 붙여 넣기

명령어 설치 없이 Supabase 웹 편집기로 진행할 수 있도록 단일 파일을 제공합니다.

1. 프로그램 안내에서 **학생 연결 서버 코드 복사**를 누릅니다. 또는 device-dashboard.txt 파일의 전체 내용을 복사합니다.
2. Supabase 왼쪽 **Edge Functions → Deploy a new function → Via Editor**를 선택합니다. 화면에 따라 ‘Create a new function’으로 표시될 수 있습니다.
3. Function name은 반드시 **device**로 입력합니다. 대소문자와 다른 이름을 쓰지 않습니다.
4. 편집기의 index.ts 예제 코드를 모두 선택해 지우고 복사한 코드 전체를 붙여 넣습니다. 개인 URL/키/비밀번호를 코드 안에 추가하지 않습니다.
5. **Deploy function / Deploy**를 누릅니다. 이름을 마지막 배포 창에서 묻는 화면이면 거기에도 device를 입력합니다.
6. 배포 후 device → Details 또는 Settings에서 **Verify JWT with legacy secret** 또는 **Enforce JWT verification**을 **OFF**로 저장합니다. 이 함수만 변경합니다. DB RLS나 Google 로그인은 끄지 않습니다. 제공 코드 안에서 교사·학생 인증을 별도로 확인합니다.
7. Edge Functions 목록에 device가 배포된 상태인지 확인합니다. 오류가 나면 다음 단계로 넘기지 말고 오류 내용을 확인하세요.

서비스 비밀키를 별도로 웹페이지에 넣지 않습니다. Supabase가 서버에 제공하는 기본 환경변수를 사용합니다. 단일 파일은 현재 운영 코드로부터 생성하고 Deno 타입 검사와 인증 거부 검사를 실행했지만, 사용자 프로젝트의 실제 Dashboard 배포는 별도 확인이 필요합니다.

## 5. URL·공개 키 복사 — 프로그램 연결 폼에 넣기

| 복사할 곳                            | 복사할 값            | 프로그램에 붙일 칸               |
| ------------------------------------ | -------------------- | -------------------------------- |
| Project Settings → Data API 또는 API | Project URL          | 내 Supabase Project URL          |
| Project Settings → API Keys          | Publishable key의 값 | 내 Supabase 공개 Publishable key |

Project URL은 https://프로젝트ID.supabase.co 형태입니다. postgresql://로 시작하는 DB 연결 문자열은 사용하지 않습니다. Publishable key는 보통 sb_publishable_로 시작합니다. 이름이 default인 행이라면 ‘default’라는 이름이 아니라 키 값을 복사합니다. Secret/service_role 키는 선택하지 않습니다.

https://kalapui.com/monitoring/ 에서 안내를 닫고 위 두 칸을 채운 뒤 **내 프로젝트에 연결**을 누릅니다. 이 설정은 현재 브라우저에 저장됩니다. GitHub 설정에 키를 넣을 필요는 없습니다.

## 6. 첫 Google 로그인 — 본인을 소유자로 지정

1. 프로그램에서 Google 계정으로 회원가입/로그인을 누릅니다. Google Test users에 추가한 본인 계정을 선택합니다.
2. ‘교사 회원가입’ 화면에 본인 UUID가 나옵니다.
3. Supabase Authentication → Users에서 본인 이메일의 행을 열고 User UID가 웹의 UUID와 같은지 확인합니다.
4. Supabase SQL Editor → New query에서 아래 UUID를 본인 실제 값으로 바꿔 실행합니다.

```sql
insert into public.app_admins(user_id)
values ('여기에-본인의-실제-UUID')
on conflict (user_id) do nothing;
```

UUID는 aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee 같은 형식입니다. 위 예시 문자열을 그대로 실행하지 마세요. 이메일이나 Google Client ID도 아닙니다. 본인 UUID만 수동으로 지정하며 첫 로그인에 자동 권한을 주지 않습니다.

5. 웹으로 돌아가 사용 안내를 확인하고 체크한 뒤 **교사 회원가입 완료**를 누릅니다.
6. ‘아직 학급이 없습니다’가 보이면 정상입니다. 학급 추가 후 학생을 연결합니다. 미연결 상태에 가짜 학생을 보여주지 않습니다.

## 7. 완료 확인

- 교사 재로그인/새로고침 후 자기 학급이 유지되는지 확인합니다.
- 참여 코드 발급과 학생 ZIP 다운로드가 되는지 확인합니다. 학생 연결에는 4단계 device 배포가 필요합니다.
- 학생 한 대를 등록·승인한 뒤 접속·기록·명령을 실제 크롬북에서 확인합니다. 프로그램은 전체 OS 앱 감시가 아니라 Chrome API에서 노출되는 웹/일부 내부 앱 활동을 확인합니다.

문제를 공유할 때는 어느 단계인지와 오류 문구를 알려 주세요. 비밀번호·Client Secret·서비스 키·로그인 토큰·학생 개인정보는 보내지 않습니다.
