# 테스트 기록 (2026-10-22)

- Node.js `node --test tests/core.test.mjs`: **12/12 통과**.
- Chromium Playwright UI 시뮬레이션: 데스크톱/모바일 렌더링, 20개 학생 카드 표시, 검색, 상태 필터, 전체 잠금·해제 상태 변경, 공지 창 제출, 학급 변경, 브라우저 JS 오류 없음.
- Playwright 테스트 브라우저에서는 네트워크 요청 제한이 있었기에 같은 HTML/CSS/JS를 인라인 결합해 `page.set_content`로 로드하는 방식으로 검사.
- 실제 Supabase 서버, GitHub Actions, 20~100대 실제 크롬북, 학교 계정, 원격 잠금/실제 캡처는 테스트하지 않았음.
- `database/001_schema_draft.sql`은 *설계 초안*으로 실제 DB 마이그레이션 테스트 및 프로덕션 보안 검증을 거치지 않았음.
