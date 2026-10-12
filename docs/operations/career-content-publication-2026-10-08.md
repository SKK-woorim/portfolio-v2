# 경력 프로젝트 콘텐츠 게시 기록 (2026-10-08)

## 게시 내용

- 프로필 소개·직무명·기술 스택을 사용자 제공 경력에 맞춰 갱신했습니다. 기존 이름, 이메일, 소셜 링크, 아바타는 유지했습니다.
- `yonsei-medical-data-platform`과 `samsung-sdi-multi-agent-mlops-poc` 두 프로젝트를 공개 게시했습니다. 각 항목에 태그 6개를 연결했고, 삼성SDI를 sort order 0, 연세대학교를 1로 배치했습니다.
- 기존 공개 프로젝트 네 건은 본문·상태를 보존하고 sort order만 2–5로 이동했습니다. 테스트·휴지통 항목은 변경하지 않았습니다.
- 날짜 필드는 월 단위 경력을 UI에 표시하기 위한 월 시작일·말일 convention을 사용합니다. 화면에는 월까지만 표시합니다.

## 사전 스냅샷과 데이터 검증

- 게시 전 읽기 전용 스냅샷: [`tmp/career-publication-snapshot-2026-10-08-before-publication.json`](../../tmp/career-publication-snapshot-2026-10-08-before-publication.json), 2026-10-08 06:07:44 UTC
- 적용 SQL: [`career-content-publication-2026-10-08.sql`](career-content-publication-2026-10-08.sql)
- 게시 후 프로필과 두 신규 항목을 원본 JSON·Markdown·평문 변환 결과와 대조했습니다. 상태, 순서, 기간, 요약, 본문과 태그 6개가 일치합니다.
- 기존 공개 프로젝트 네 건의 본문·상태와 프로필의 연락처·소셜 링크·아바타·이름이 스냅샷과 동일함을 확인했습니다. SQL 실행 후 발견한 Markdown 경계 개행 두 글자는 신규 두 건의 `content_json.markdown`에서만 제거해 원고 파일과 정확히 맞췄습니다.
- 스키마, RLS, Auth, 미디어, 블로그 데이터는 변경하지 않았습니다.

## 빌드·배포·운영 확인

- `pnpm typecheck` 통과.
- 로컬 `pnpm build`는 Next.js 최적화 빌드 단계에서 1분 이상 출력 없이 대기해 해당 세션만 중단했습니다. 이어 실행한 Vercel 원격 프로덕션 빌드는 컴파일·TypeScript 검사·정적 페이지 생성 32/32를 완료했습니다.
- 기존 `skk-woorim1/portfolio` 프로젝트에 배포: [`portfolio-three-chi-dgdi7wj28c.vercel.app`](https://portfolio-three-chi-dgdi7wj28c.vercel.app), deployment `dpl_BUk73YAbi2BBd6TJXEkJp861zS2k` (`READY`).
- 홈, 소개, 포트폴리오 목록, 두 프로젝트 상세, `/api/readiness`, `/sitemap.xml`이 모두 HTTP 200으로 응답했습니다. 신규 두 건의 제목과 월 단위 기간이 홈·소개·목록·상세·사이트맵에 반영됐고, readiness 상태는 `ready`입니다.

게시 후 포트폴리오 데이터 캐시의 재검증 주기는 1시간입니다.
