# 2026-09-05 개선 계획 구현 진행 현황

작성 기준일: 2026-09-08
판정 기준: 현재 작업 트리, `git status`, `git diff`, 추적되지 않은 구현 파일, 테스트·검증 스크립트

## 판정과 담당 기록

상태는 다음처럼 보수적으로 판정했다.

- **완료**: 현재 코드와 마이그레이션에 핵심 구현이 있고 관련 단위 계약 또는 검증 근거가 있다.
- **부분**: 일부 구현은 있으나 계획의 운영 검증, 통합 검증, 전체 완료 기준이 남았다.
- **보류**: 현재 diff에서 구현 근거를 찾지 못했거나 계획상 후순위로 남겼다.

조정 기록에 따른 실제 담당은 다음과 같다. `Luna`는 접근성·테마·CI·문의 레이아웃, `Terra`는 CMS·미디어·공개 탐색·폰트·readiness, `Sol`은 보안·데이터·RAG, `root (Sol Ultra)`는 통합·리뷰·테스트를 담당했다. 아래 상태는 이 담당 배정과 현재 파일 근거를 함께 반영한다.

## 계획별 요약

| 계획 ID | 상태 | 담당/모델(구현 패스) | 현재 근거 | 남은 일 |
| --- | --- | --- | --- | --- |
| CMS-01~03 | 완료 | Terra / Sol Ultra | `markdown-editor.tsx`, media 관계·삭제 보호 migration | 운영 DB smoke test |
| CMS-04~05 | 부분 | Terra / Sol Ultra | editor 저장 상태·draft key·미디어 삽입 | 브라우저 이탈/발행 체크리스트 E2E |
| CMS-06 | 보류 | Terra | 수정 이력 구현 근거 없음 | 버전 이력·복원 설계 |
| UX-01, UX-03, UX-05 | 완료 | Terra / Luna | `blog-browser.tsx`, 목차·연관 콘텐츠·문의 context | 실제 콘텐츠와 E2E 보강 |
| UX-02, UX-04 | 보류/부분 | Terra | 페이지네이션 없음; portfolio는 일부 구조화 | 규모 기준·구조화 콘텐츠 도입 |
| A11Y-01~02 | 완료 | Luna / Sol Ultra | skip link, `aria-current`, system theme | 수동 보조기술 검수 |
| A11Y-03~04 | 부분 | Luna / Sol Ultra | Playwright 접근성 시나리오와 챗봇 focus/live 상태 | axe·두 테마·확대 수동 검수 |
| PERF-01 | 부분 | Terra / Sol Ultra | 로컬/CI 품질 게이트는 있으나 live Web Vitals 기준선 없음 | 운영 Web Vitals 기준선 기록 |
| PERF-02 | 완료 | Terra / Sol Ultra | self-hosted Pretendard asset과 `verify:fonts` CI 단계 | 운영 폰트 성능 수치 기록 |
| PERF-03, SEO-01 | 완료 | Terra / root | Sharp 정규화, metadata, sitemap/RSS/robots, production origin 단위 테스트 | live URL/bytes 검증 |
| SEC-01, DATA-01~02 | 완료(코드) | Sol / Sol Ultra | `202609070001~004`의 reservation/finalization·atomic RPC 경계 및 server actions | 확장 배포 뒤 staging RLS/RPC smoke test와 계약 단계 적용 기록 |
| SEC-02 | 완료 | Sol / Sol Ultra | Sharp decode/metadata/checksum 정규화와 테스트 | 실제 Storage 통합 검증 |
| SEC-03, DATA-03 | 부분 | Sol / root | CSP는 존재; migration verifier와 DB 승인 표식이 `202609070001`~`004`의 확장·계약 경계를 보호함 | nonce/hash 검토·빈 DB 통합 적용 |
| OPS-01 | 완료 | Luna / root | `.github/workflows/quality.yml`에서 lint/typecheck/test/font/migration/build/E2E와 RAG pytest 실행 | GitHub run 결과 확인 |
| OPS-02~03 | 부분/보류 | Sol / Terra | migration 계약·RAG/API 테스트는 있으나 실제 DB RLS와 복구 실행 기록 없음 | `001`~`003` 배포 뒤 staging 통합 테스트·`004` 계약 검증·복구 훈련 |
| OPS-04 | 부분 | root / Sol Ultra | `/api/health` liveness, `/api/readiness`의 Supabase 공개 읽기·조건부 챗봇 relay/backend 확인, Sentry 설정, chatbot runbook | production readiness 관찰, 경보 소유자·실제 알림, migration/backup 상태 모니터링 |
| RAG-01~02 | 완료(코드) | Sol / Sol Ultra | `services/rag-api/evaluation/runner.py` live runner, dataset hash, metrics, release gate와 pytest 계약 | staging/live evaluation 실행 기록 |
| RAG-03 | 부분 | Sol / root | 관리자 reindex/runtime UI와 평가 보고서 기반은 있음 | 품질·지연 대시보드와 feedback loop |

## ID별 상태 매핑

| ID | 상태 | 담당/모델(현재 패스) | 증거 또는 미완료 사유 |
| --- | --- | --- | --- |
| CMS-01 | 완료 | Codex / GPT-5 | Markdown editor에서 기존 미디어 검색·선택·업로드·본문 삽입 |
| CMS-02 | 완료 | Codex / GPT-5 | media 관리 화면의 alt·URL·사용처 컴포넌트와 metadata migration |
| CMS-03 | 완료 | Codex / GPT-5 | post/portfolio media 관계 및 `delete_media_atomic`/trigger |
| CMS-04 | 부분 | Codex / GPT-5 | draft key·저장 상태는 있으나 이탈 복구 브라우저 검증 부족 |
| CMS-05 | 부분 | Codex / GPT-5 | slug/content validation과 상태 흐름은 있으나 발행 체크리스트 E2E 부족 |
| CMS-06 | 보류 | 미지정 | 수정 이력·복원 저장소 구현 없음 |
| UX-01 | 완료 | Codex / GPT-5 | URL query 기반 제목·요약·태그·카테고리 검색 |
| UX-02 | 보류 | 미지정 | 서버 페이지네이션과 결과 수 기반 threshold 없음 |
| UX-03 | 완료 | Codex / GPT-5 | Markdown 목차, 이전/다음, related posts/projects |
| UX-04 | 부분 | Codex / GPT-5 | 상세의 Type/Period 등 일부 구조화; 역할·문제·성과 전체 모델링은 없음 |
| UX-05 | 완료 | Codex / GPT-5 | context가 있는 contact CTA와 테스트 |
| A11Y-01 | 완료 | Codex / GPT-5 | skip link, main landmark, navigation `aria-current` |
| A11Y-02 | 완료 | Codex / GPT-5 | `system | light | dark` preference와 OS 변경 반영 |
| A11Y-03 | 부분 | Codex / GPT-5 | public-site/accessibility E2E는 있으나 axe·200% 수동 결과 없음 |
| A11Y-04 | 부분 | Codex / GPT-5 | 챗봇 dialog focus, Escape, scroll lock, live status 구현; 실제 SR 검수 미완료 |
| PERF-01 | 보류 | 미지정 | Web Vitals/TTFB/route JS 기준선 수집 근거 없음 |
| PERF-02 | 부분 | Codex / GPT-5 | `public/assets/fonts` 및 `verify:fonts` 존재; 운영 성능 측정 미완료 |
| PERF-03 | 완료 | Terra / Sol | Sharp 정규화와 width/height/checksum metadata |
| SEO-01 | 완료 | Terra / root | metadata, JSON-LD, RSS, sitemap, robots 및 `site-metadata.test.ts` production-origin 검증 |
| SEC-01 | 완료(코드) | Sol | `202609070001`의 service-role reservation/finalization과 `004`의 legacy login RPC/table 제거 계약 |
| DATA-01 | 완료 | Sol | `save_portfolio_atomic`, `save_post_atomic` 및 server action 호출 |
| DATA-02 | 완료 | Sol | conditional status transition·atomic reorder RPC |
| SEC-02 | 완료 | Sol | Sharp file signature/decode, size/metadata/checksum 검증 |
| SEC-03 | 보류 | Sol | CSP는 있으나 nonce/hash 전환 검토·검증 없음 |
| DATA-03 | 부분 | Sol / root | migration contract script, 계약 단계 DB 승인 표식과 13개 forward SQL(`202609070001`~`004` 포함); 빈 DB 실제 적용 기록 없음 |
| OPS-01 | 완료 | Luna / root | GitHub Actions 품질 게이트가 web·RAG pytest·E2E를 실행 |
| OPS-02 | 부분 | Sol / root | `001`~`004` migration/API 계약 검증은 있으나 실제 Supabase RLS/RPC 및 contract-phase 실행 기록 없음 |
| OPS-03 | 보류 | Terra | backup/export/restore 실행 기록 없음 |
| OPS-04 | 부분 | root / Sol Ultra | `/api/health` liveness와 `/api/readiness`의 Supabase 공개 읽기·조건부 챗봇 backend 확인, Sentry/runbook 구현; production 관찰·경보 실측 미완료 |
| RAG-01 | 완료(코드) | Sol | evaluation dataset/models/runner와 `releaseGate` criteria 구현 |
| RAG-02 | 완료(코드) | Sol | source validity, refusal, privacy, protocol metrics와 critical failure gate 구현 |
| RAG-03 | 부분 | Sol / root | 관리자 index 상태·reindex·runtime toggle; 품질/지연 대시보드와 feedback 없음 |

## 완료·부분·보류 후속 순서

1. `initial-setup.md` 순서대로 `202609070001` → `002` → `003` 확장 적용, 즉시 Vercel 웹 배포, staging RLS/RPC smoke test와 롤백 관찰 기간을 운영 증거로 남긴다. `202609070004` 계약 단계는 그 창을 닫은 뒤에만 적용한다.
2. GitHub Actions의 web/RAG 품질 게이트 결과와 로컬 validation 결과를 구분해 기록한다.
3. 실제 staging에서 Sharp/runtime, 관리자 CRUD, 미디어 사용 중 삭제 방지와 복구 절차를 확인한다.
4. live RAG evaluation runner를 운영 URL에 실행해 release gate 결과를 보관한다.
5. 그 뒤 수동 접근성 검수, 운영 Web Vitals/SEO 기준선, RAG 품질·지연 대시보드와 경보 소유자를 보완한다.

이 문서는 현재 diff의 진행 현황이다. 코드·CI 구현 완료와 staging/live 실행 완료를 구분하며, 실제로 실행하지 않은 staging smoke test와 live RAG evaluation을 운영 완료로 승격하지 않는다.
