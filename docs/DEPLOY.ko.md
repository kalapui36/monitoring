# 데모만 보일 때와 새 웹 버전 게시 방법

코드 작성·로컬 빌드는 실제 웹사이트 배포와 별개입니다. 진단 당시 원격 main은 최초 데모 커밋 `f847cf0`이었습니다. 최신 React/Supabase 코드는 이 작업에서 별도로 작성했습니다. 기존 데모 HTML을 열면 Supabase 연결·교사 로그인은 나타나지 않습니다. 브라우저 새로고침만으로 새 코드가 저장소에 올라가지는 않습니다.

## 새 화면 확인 기준

첫 화면에 **개인 Supabase 연결형 · 1.2.0**과 시작 안내가 보여야 합니다. 안내를 닫으면 **내 Supabase Project URL**, **내 Supabase 공개 Publishable key**, **내 프로젝트에 연결**이 나옵니다. Google 로그인은 본인 프로젝트를 연결한 뒤 활성화합니다. 학생 수는 실제 DB가 비어 있으면 0명이며 가짜 학생을 생성하지 않습니다.

배포 주소 끝에 `version.json`을 붙여 열면 version=1.2.0, mode=personal-supabase, demoData=false인지 확인할 수 있습니다. `SETUP.html`은 JavaScript 없이 읽는 전체 Supabase 안내입니다.

## A. GitHub Pages에서 배포

1. 새 코드를 저장소의 main에 반영합니다. 별도 작업 브랜치라면 GitHub에서 **Compare & pull request → Create pull request → Merge pull request**로 main에 병합합니다. 다른 변경이 있다면 충돌/차이를 먼저 확인합니다.
2. 배포 워크플로가 기존 Pages의 Source를 **GitHub Actions**로 전환하도록 구성했습니다. 자동 변경이 권한 오류로 실패하면 저장소 **Settings → Pages → Build and deployment → Source**를 직접 **GitHub Actions**로 바꿉니다. 기존 **Deploy from a branch**로 React 소스 index.html을 그대로 제공하면 프로그램을 실행할 수 없습니다.
3. **Actions → Deploy GitHub Pages → Run workflow → main → Run workflow**를 실행합니다. 테스트/빌드/배포가 모두 성공했는지 확인합니다.
4. **Settings → Pages**에 표시된 실제 주소를 새로 열고 위 버전/연결 화면을 확인합니다.
5. 이 배포에는 공용 Supabase URL/키가 필요하지 않습니다. 각 교사가 자기 브라우저에서 입력합니다. API 비밀키를 저장소/Actions Variables에 넣지 마세요.

이 클라우드에서는 Pages 주소와 GitHub 관리 API가 외부 접속 정책으로 차단되어 설정·실제 게시 상태를 직접 읽지 못했습니다. Git 원격 코드 읽기/쓰기 권한과 Pages 설정 API 접근 가능 여부는 별개입니다. 따라서 GitHub Actions에서 설정 전환·배포를 수행하며 실제 성공 여부는 해당 실행 결과로 확인해야 합니다.

## B. 별도 제작물/결과물 웹사이트에 올리기

1. `monitoring-web-1.2.0.zip`은 소스 ZIP이 아니라 바로 게시할 수 있는 정적 웹 빌드입니다.
2. 압축을 풀고 index.html, assets/, docs/, SETUP.html, version.json을 **모니터링 프로그램을 게시할 폴더**에 함께 업로드합니다. 다른 제작물 폴더를 덮어쓰지 마세요. assets 폴더가 빠지면 프로그램이 시작되지 않습니다.
3. HTTPS 웹 주소로 접속합니다. 파일을 더블클릭한 file:// 주소에서는 Google 로그인을 운영하지 않습니다.
4. 교사는 자신의 Supabase Site URL/Redirect URLs에 **실제 게시 주소**를 등록합니다. 이 ZIP은 상대 경로로 빌드하여 `/monitoring/`나 다른 하위 폴더에서도 자원을 찾을 수 있게 했습니다.
5. 보안상 다른 사이트의 iframe 안에서는 로그인을 실행하지 않습니다. 제작물 페이지의 링크로 프로그램을 **새 탭에서 직접** 여는 방식을 사용하세요.

소스를 다시 빌드해 ZIP을 만들려면 저장소 폴더에서 다음을 실행합니다.

```sh
VITE_BASE_PATH=./ npm run export:site
```

출력은 artifacts/monitoring-web-1.2.0.zip입니다. GitHub Pages Actions는 저장소 경로 `/monitoring/`로 별도 빌드합니다.

## 기기 활동 범위

일반 웹사이트는 확인할 수 있습니다. Chrome 탭/창 API가 카메라·파일·설정 앱의 내부 주소를 노출하면 그 활동도 고정된 앱 이름으로 기록합니다. 파일명·내부 query는 저장하지 않습니다. 확장이 전송한 내부 활동이 실제 DB에 저장되는 경로는 자동 검증했습니다.

그러나 Android·Linux 앱과 ChromeOS의 모든 기본 앱 실행/전환을 열거하는 권한은 일반 수동 설치 확장에 없습니다. 카메라 앱도 기기의 Chrome API에 노출되지 않으면 감지하지 못합니다. 카메라 촬영 영상이나 OS 전체 화면을 보는 기능도 아닙니다. 학생 카드의 사이트는 **최근 감지 결과**이지 보이지 않는 OS 활동을 추정한 값이 아닙니다.

첨부 구형 ZIP v2.0은 폴링에서 tab.url을 프로토콜 제한 없이 전송하는 경로가 있었고, Apps Script v5.3 생성기는 isWebPage()로 HTTP(S)를 제한합니다. 서로 다른 버전이므로 어느 코드가 실제 기기에서 동작했는지에 따라 범위가 다를 수 있습니다. 새 ZIP과 실제 크롬북에서 카메라 앱을 열어 수신되는지 별도 확인해야 합니다.
