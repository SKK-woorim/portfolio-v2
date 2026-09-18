# Astra 피드백 구현 진행 현황

- 기준일: 2026-09-18
- 대상 계획: [`astra-feedback-improvement-plan.md`](./astra-feedback-improvement-plan.md)
- 추적 범위: 원 계획의 D01-D10, U01-U13, E01-E18, O01-O07 총 48개 항목
- 이번 구현 패스에서는 사용자 콘텐츠·이미지와 운영 권한이 필요한 작업을 제외하고, 우선순위 UX·조회·Markdown·챗봇 회귀를 구현·검증했다.

## 판정 기준

- **완료**: 구현 근거와 자동 검증이 있으며, 이 표의 완료는 staging·운영 승인이나 실제 사용자 콘텐츠 승인까지 의미하지 않는다.
- **부분**: 핵심 구현 또는 계약 테스트는 있으나 수동 확인, 사용자 콘텐츠, 실제 DB/운영 환경 검증이 남아 있다.
- **보류**: 구현하지 않았거나 외부 권한·사용자 제공 자료·측정 기준이 없어 안전하게 완료할 수 없다.
- 실제 Supabase 운영 DB 쓰기·migration, staging smoke, 관리자 실제 쓰기, 외부 메시지 발송은 수행하지 않았다. 기존 Vercel 프로젝트에 production 배포하고 공개 읽기 전용 smoke만 수행했다.

## 48개 항목 상태

### 완료(자동 검증 기준) — 17개

| ID | 변경 근거 | 판정 메모 |
| --- | --- | --- |
| U04 | `src/app/not-found.tsx`, `src/app/(site)/not-found.tsx`, `src/components/not-found-content.tsx`, `e2e/public-site.spec.ts` | 직접 404와 site 내부 없는 slug에서 `main` 1개 계약을 확인했다. |
| U05 | `src/components/site-header.tsx`, `e2e/accessibility-theme.spec.ts` | 활성 메뉴 표시와 `aria-current`를 동기화했다. |
| E03 | `src/components/admin/post-form.tsx`, `src/components/admin/portfolio-form.tsx`, `src/components/admin/content-forms.test.ts` | 업무 오류 뒤 제목·요약·상태·대표 이미지가 유지되는 실제 컴포넌트 회귀 테스트를 추가했다. |
| E04 | `src/components/admin/post-form.tsx`, `src/components/admin/portfolio-form.tsx`, `src/components/admin/content-forms.test.ts` | publish 성공 뒤 status가 `published`로 동기화되는 컴포넌트 회귀 테스트를 추가했다. |
| E06 | `src/components/markdown-editor.tsx`, `src/components/markdown-editor.test.ts`, `src/components/admin/media-cover-select.tsx`, `src/components/admin/content-forms.test.ts` | 전체 draft 필드·대표 이미지 복원·메타데이터 연속 편집 autosave 회귀를 확인했다. |
| O03 | `services/rag-api/evaluation/runner.py`, `services/rag-api/tests/test_evaluation.py` | 낮은 성공률 반례를 포함한 RAG gate 테스트를 통과시켰다. |
| U01 | `src/components/blog-browser.tsx`, `src/components/blog-browser.test.ts` | 한글 IME 조합·빠른 입력 debounce·뒤로/앞으로 query 복원을 직접 검증했다. |
| U02 | `src/components/blog-browser.tsx`, `e2e/public-site.spec.ts` | 320px viewport에서 검색 입력 bounding box가 화면 안에 남는 것을 E2E로 확인했다. |
| U06 | `src/components/blog-browser.tsx`, `src/components/blog-browser.test.ts`, `src/app/(site)/blog/error.tsx`, `src/app/(site)/blog/error.test.ts` | 정상 빈 상태·필터 불일치·조회 실패를 구분하고 조회 실패 재시도 UI를 직접 검증했다. |
| U07 | `src/components/contact-copy-button.tsx`, `src/components/contact-copy-button.test.ts`, `e2e/public-site.spec.ts` | 이메일 복사 성공·실패 피드백과 연락처 맥락을 자동 검증했다. |
| U08 | `src/components/chatbot/chatbot-panel.tsx`, `src/components/chatbot/chatbot-widget.tsx`, `src/components/chatbot/chatbot-panel.test.ts`, `src/components/chatbot/chatbot-widget.test.ts` | 내부 링크 이동 시 dialog와 모바일 scroll lock이 해제되는 경로를 검증했다. |
| U09 | `src/components/chatbot/chatbot-panel.tsx`, `src/components/chatbot/chatbot-panel.test.ts` | checking·disabled·unavailable 세 상태에서 닫기 컨트롤 focus와 안내를 검증했다. |
| U10 | `src/components/chatbot/chatbot-panel.test.ts`, `src/components/chatbot/chatbot-widget.test.ts`, `src/components/chatbot/chatbot-message.test.ts` | 긴 대화의 새 답변 affordance, 여러 줄 입력, 초기화, 새 답변 상태를 직접 검증했다. |
| U11 | `src/components/chatbot/chatbot-widget.tsx`, `src/components/chatbot/chatbot-widget.test.ts`, `src/components/chatbot/runtime-availability.ts` | 실제 widget에서 timeout·enabled·disabled·unexpected 상태 전환을 통합 검증했다. |
| U13 | `src/app/globals.css`, `e2e/accessibility-theme.spec.ts` | reduced-motion에서 scroll behavior와 transition duration의 비활성화를 E2E로 확인했다. |
| E10 | `src/lib/content/repository.ts`, `src/lib/content/types.ts`, `src/components/markdown-content.tsx`, `src/components/markdown-content.test.ts` | repository의 inline media 메타데이터를 Markdown 이미지 width/height에 연결하고 명시적 alt="" 및 외부 fallback을 검증했다. |
| E14 | `src/components/chatbot/chatbot-message.tsx`, `src/components/chatbot/chatbot-widget.tsx`, `src/components/chatbot/chatbot-message.test.ts`, `src/components/chatbot/chatbot-widget.test.ts` | stop·length·cancelled 종료 사유가 실제 widget UI에 각각 반영되는 것을 검증했다. |

### 부분 — 17개

| ID | 변경 근거 | 남은 확인 |
| --- | --- | --- |
| D01 | `src/app/(site)/page.tsx`, `src/components/section-heading.tsx` | 첫 화면 구조는 반영했지만 역할·대표 범위의 최종 문구는 사용자 콘텐츠 승인이 필요하다. |
| D04 | `src/app/(site)/page.tsx`, `src/app/(site)/portfolio/page.tsx` | 모바일 우선 순서 변경은 반영했지만 실제 대표 사례 노출 판단은 사용자 자료와 수동 확인이 필요하다. |
| D07 | `src/app/(site)/page.tsx`, `src/components/project-visual.tsx` | 히어로 시각 구조는 반영했지만 최종 전용 artwork와 전 해상도 수동 검수가 남아 있다. |
| D08 | `src/app/globals.css`, `e2e/accessibility-theme.spec.ts` | 반응형 타이포 기반은 반영했지만 200% 확대 및 의미 단위 수동 검수가 남아 있다. |
| D09 | `src/app/globals.css`, `e2e/accessibility-theme.spec.ts` | 양 테마 자동 접근성 경로는 보강했지만 전체 WCAG 대비·상태 조합의 수동/전용 감사는 남아 있다. |
| D10 | `src/components/post-card.tsx`, `src/components/project-card.tsx` | 카드 위계는 정리했지만 결과·역할 중심 비교를 위한 실제 사례 콘텐츠 검수는 남아 있다. |
| U03 | `src/components/post-card.tsx`, `src/components/project-card.tsx` | 링크·접근성 이름 구현은 있으나 카드 전용 자동 검증이 없다. |
| U12 | `src/components/admin/admin-sidebar.tsx`, `src/app/admin/(workspace)/layout.tsx` | 모바일 관리자 로그아웃 구현은 있으나 실제 인증 세션과 390px 종료 검증이 남아 있다. |
| E01 | `src/lib/content/repository.ts`, `src/lib/health/readiness.ts`, `src/lib/health/published-content-contract.test.ts` | 명시적 관계·readiness 계약은 추가했지만 실제 Supabase 관계와 staging 공개 집합 smoke는 수행하지 않았다. |
| E02 | `src/lib/content/repository.ts`, `.env.example`, `README.md` | 저장소 오류 전파와 demo 경계를 정리했지만 실제 운영 cache/권한/장애 환경은 검증하지 않았다. |
| E08 | `src/components/admin/portfolio-order-list.tsx`, `src/components/admin/portfolio-order-message.ts`, `src/components/admin/portfolio-order-message.test.ts` | 구조화된 성공/실패 메시지와 rollback 계약은 테스트했지만 늦은 응답·재시도·staging 순서 smoke는 남아 있다. |
| E05 | `src/app/globals.css` | reset layer와 variant 스타일 충돌은 정리했지만 computed style 및 양 테마 전체 검사가 없다. |
| E12 | `src/lib/site-metadata.ts`, `src/app/(site)/blog/[slug]/page.tsx`, `src/app/(site)/portfolio/[slug]/page.tsx` | fallback 하드코딩을 상수화했지만 CMS 프로필과 동적으로 연결된 단일 출처가 아니다. |
| E13 | `src/components/markdown-content.tsx`, `src/components/markdown-content.test.ts` | 괄호·escaped pipe·escaped backslash fixture는 있으나 감사 완료 기준의 전체 AST/보안 경계 자동 검증은 아니다. |
| E17 | `src/lib/health/readiness.ts`, `scripts/verify-migration-contracts.mjs`, `src/lib/health/published-content-contract.test.ts` | 런타임 관계 계약과 migration 검사는 있으나 생성 타입 갱신과 전체 CI schema drift 검증은 남아 있다. |
| O01 | `src/lib/health/readiness.ts`, `src/app/api/readiness/route.ts`, `src/app/api/readiness/route.test.ts` | readiness와 smoke 경계를 구현했지만 실제 관계 장애 주입·운영 알림 연동은 하지 않았다. |
| O02 | `src/app/api/readiness/route.test.ts`, `src/lib/health/published-content-contract.test.ts`, `src/components/admin/content-forms.test.ts` | 확정 결함의 수정 전/후 자동 계약은 추가했지만 실제 DB fixture/staging 및 production smoke는 남아 있다. |

### 보류 — 14개

| ID | 보류 사유 | 후속 입력 |
| --- | --- | --- |
| D02 | 대표 사례의 기여·선택·결과·한계를 임의로 작성할 수 없다. | 사용자가 승인한 대표 사례 2건의 원자료. |
| D03 | 실제 또는 익명 산출물을 임의 생성·교체할 수 없다. | 공개 가능한 산출물과 익명화 범위. |
| D05 | 기간·역할·사례 연결은 사용자 사실 확인이 필요하다. | 승인된 경력·역할·사례 데이터. |
| D06 | 글의 직접 경험·적용 사례를 임의로 보강할 수 없다. | 사용자 제공 초안과 공개 범위. |
| E07 | 구조화 CMS 링크의 원자 저장 계약을 추가로 구현하지 않았다. | 링크 관계 스키마·권한·관리자 UX 결정. |
| E09 | projection/pagination의 효과를 측정할 데이터 규모와 누락 계약이 없다. | 승인된 데이터 규모·성능 기준·페이지네이션 정책. |
| E11 | 공개/비공개 미디어 정책을 실제 storage 정책과 함께 확인하지 않았다. | bucket policy, private media 요구, staging 권한. |
| E15 | 동일 조건의 운영 성능 baseline과 전후 측정을 수행하지 않았다. | 측정 환경·대표 트래픽·SLO 기준. |
| E16 | 도구 경계와 임시 산출물의 전체 CI/운영 정합을 입증하지 않았다. | 승인된 실행 경계와 재현 가능한 운영 절차. |
| E18 | CSP Report-Only 관측 기간과 nonce/hash 전환 기준을 충족하지 않았다. | 허가된 staging 관측 및 위반 보고 검토. |
| O04 | RAG 의미 구조·섹션 검색 보존을 실제 corpus로 검증하지 않았다. | 승인된 corpus와 의미 보존 평가셋. |
| O05 | 장애 주입 후 무수동 복귀 자동화를 구현·검증하지 않았다. | 운영 장애 주입 권한과 복구 정책. |
| O06 | dependency·배포 환경 재구축을 실제 배포 파이프라인으로 검증하지 않았다. | 배포 대상·registry 권한·재현성 기준. |
| O07 | 사실성·출처 생존성 평가를 실제 자료로 수행하지 않았다. | 승인된 질문/사실/출처 평가셋. |

## Production 배포 및 공개 smoke

- 배포 시각: `2026-09-18T01:21:43Z` (Vercel `READY` 확인 시각)
- 대상: 기존 `skk-woorim1/portfolio` 프로젝트 (`projectId`: `prj_FHbUTJeS89Me9BknoDd4fjO6IrtK`, `orgId`: `team_X9PcaqLiwJGLfimW8jOnUsln`)
- Deployment URL: <https://portfolio-13vkxdihj-skk-woorim1.vercel.app>
- 기존 production alias: <https://portfolio-three-chi-dgdi7wj28c.vercel.app>
- 추가 alias: <https://portfolio-skk-woorim1.vercel.app>
- 상태: `READY`

alias 기준으로 다음 공개 경로를 읽기 전용 확인했으며 모두 HTTP `200`이었다.

| 경로 | 결과 |
| --- | --- |
| `/` | `200`, HTML 응답 |
| `/portfolio` | `200`, HTML 응답 |
| `/blog` | `200`, HTML 응답 |
| `/blog/rag-document-pipeline` | `200`, HTML 응답 |
| `/contact` | `200`, HTML 응답 |
| `/api/readiness` | `200`, `status: ready`; `supabaseConfig`·`publishedContent`는 `ready`, 챗봇 relay/backend는 `disabled` |
| `/rss.xml` | `200`, RSS와 canonical alias 링크 확인 |
| `/sitemap.xml` | `200`, canonical alias URL 확인 |
| `/robots.txt` | `200`, sitemap canonical alias 확인 |

이 결과는 production 배포와 공개 읽기 경로의 현재 응답만 확인한다. 관리자 로그인·CRUD, DB 쓰기·migration, Storage private 정책, 외부 RAG backend 운영 상태와 전체 장애 복구는 검증하지 않았으므로 완료로 판정하지 않는다.

## 자동 검증 결과

이번 구현 패스와 현재 작업 트리 기준 자동 검증 결과다.

- `pnpm lint`: 통과
- `pnpm typecheck`: 통과
- Vitest: 35개 파일, 169개 테스트 통과
- Playwright `public-site`/`accessibility-theme` E2E: 10개 통과 (개발 서버 webServer 기준; staging·production smoke 아님)
- `pnpm build`: 통과
- `cd services/rag-api && python3 -m pytest -q`: 56개 통과
- 폰트 및 migration 검증 스크립트: 통과
- `git diff --check`: 통과

자동 검증 통과만으로 실제 Supabase 관계의 전체 계약, 사용자 콘텐츠의 정확성, 공개 파일 접근 정책, 외부 RAG 의존성, staging 및 관리자 운영 상태를 완료 처리하지 않았다. production 공개 읽기 smoke는 위 기록 범위에서만 수행했다.

## 운영·사용자 콘텐츠 의존 미완료 목록

- 사용자 입력 없이는 D02, D03, D05, D06의 사례·경력·산출물·글 내용을 만들거나 공개로 판정하지 않는다.
- U12와 E11은 각각 허가된 관리자 세션과 storage 정책이 필요하다.
- E01, E02, E17, O01, O02는 전체 DB 관계·권한·staging smoke가 필요하다. production 공개 read smoke는 수행했지만 운영 DB에 직접 쓰거나 migration하지 않았다.
- E07, E09, E15, E16, E18은 스키마/규모/측정/관측 기준을 먼저 확정해야 한다.
- O04-O07은 승인된 corpus·장애 주입·배포 권한·평가셋 없이는 검증하지 않는다.
- 실제 관리자 쓰기, 외부 메시지 발송, staging smoke는 수행하지 않았다. production 배포와 공개 endpoint smoke는 위 기록대로 수행했지만 전체 운영 확인은 남아 있다.

따라서 계획 문서의 상태는 **구현 진행 중**으로 유지하며, 위 입력과 운영 검증이 확보된 뒤 항목별 완료 판정을 갱신한다.
