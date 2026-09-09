# Portfolio V2 개선 기획 모음

- 작성일: 2026-09-05
- 상태: 구현 진행 중 — [구현 진행 현황](./implementation-progress.md) 참조
- 기준: 현재 작업 트리의 공개 사이트, 관리자 CMS, Supabase, RAG 서비스와 운영 문서

## 1. 문서 목적

현재 사이트는 공개 포트폴리오, 블로그, 다크·라이트 테마, 관리자 CMS, Supabase 미디어, SEO, Sentry, RAG 챗봇까지 핵심 기능을 갖췄다. 다음 단계에서는 기능 수를 늘리는 것보다 콘텐츠를 더 안전하고 편하게 운영하고, 방문자가 작업 역량을 더 빠르게 이해하며, 장애와 회귀를 조기에 발견할 수 있게 만드는 데 집중한다.

이 폴더는 개선 후보 전체 목록과 영역별 구현 기획서를 한곳에 묶는다. 모든 항목은 아직 구현된 기능이 아니라 검토·구현 대상이며, 실제 코드에서 확인한 문제와 측정이 필요한 가설을 구분한다.

## 2. 현재 상태에서 확인한 핵심 근거

- 본문은 Markdown이 기준이지만, 편집기에는 미디어 선택·업로드 기능이 없다. 관리자는 `/admin/media`에서 이미지를 올린 뒤 URL을 직접 복사해 Markdown 문법을 입력해야 한다.
- 미디어 화면에는 URL 복사와 사용처 표시가 없고, 삭제 검사는 대표 이미지 관계만 확인한다. Markdown 본문에서 쓰는 이미지는 삭제 방지 대상이 아니다.
- 게시글·포트폴리오 저장은 본문, 태그, 대표 이미지, 감사 로그가 하나의 트랜잭션으로 묶이지 않아 부분 저장 가능성이 있다.
- 로그인 제한용 `SECURITY DEFINER` 함수의 실행 권한이 `anon`, `authenticated`에 부여되어 있어 외부 호출자가 카운터를 조작할 수 있다.
- 공개 블로그에는 카테고리·태그 필터와 읽기 시간이 있지만, 검색·페이지네이션·연관 글·목차는 없다.
- 테마 전환과 `prefers-reduced-motion` 처리는 있지만, 시스템 테마 기본값, 현재 메뉴 상태, 자동 접근성 검사는 보완 여지가 있다.
- Pretendard는 외부 CDN에서 로드되고, OG PNG와 연락처 PNG는 원본 용량을 더 줄일 여지가 있다. 성능 개선 효과는 운영 환경에서 아직 수치로 검증되지 않았다.
- RAG에는 동기화 큐, 관리자 인덱스 화면, 실행 토글, 단위 테스트가 있지만 품질 회귀를 지속 측정하는 평가 실행·대시보드·사용자 피드백 루프는 없다.
- 테스트는 Markdown과 챗봇 계약에 집중되어 있다. CMS 생성·수정·미디어·RLS·마이그레이션을 실제 DB와 연결한 통합 검증은 부족하다.

## 3. 우선순위 정의

| 등급 | 의미 | 처리 원칙 |
| --- | --- | --- |
| P0 | 데이터 손상, 보안 우회, 운영자가 콘텐츠를 안전하게 작성하는 핵심 흐름 | 다음 기능 확장보다 먼저 처리 |
| P1 | 방문자 가치, 접근성, 검색 노출, 성능과 운영 효율에 직접 영향 | P0 안정화 직후 순차 처리 |
| P2 | 콘텐츠 규모가 커질수록 효과가 커지는 고도화 | 지표와 운영량을 보고 착수 |

노력도는 `S` 1~2일, `M` 3~5일, `L` 1~2주 수준의 상대 추정치다. DB 마이그레이션, 디자인 검수, 운영 배포 시간을 포함하면 달라질 수 있다.

## 4. 개선사항 전체 목록

| ID | 영역 | 개선사항 | 기대 효과 | 우선순위 | 노력도 | 상세 기획 |
| --- | --- | --- | --- | --- | --- | --- |
| CMS-01 | 작성 | 편집기 안에서 미디어 검색·선택·즉시 업로드·Markdown 삽입 | 게시글 이미지 작성 절차 단축, URL 오입력 감소 | P0 | M | [CMS·미디어](./01-cms-authoring-and-media-plan.md) |
| CMS-02 | 미디어 | 미디어 URL 복사, alt 수정, 사용처와 사용 횟수 표시 | 자산 재사용성과 접근성 향상 | P0 | M | [CMS·미디어](./01-cms-authoring-and-media-plan.md) |
| CMS-03 | 미디어 | Markdown 본문까지 포함한 사용 중 이미지 삭제 방지 | 발행 글의 깨진 이미지 방지 | P0 | M | [CMS·미디어](./01-cms-authoring-and-media-plan.md) |
| CMS-04 | 작성 | 이탈 경고와 로컬 복구 초안, 저장 상태 표시 | 장문 작성 중 데이터 손실 감소 | P1 | M | [CMS·미디어](./01-cms-authoring-and-media-plan.md) |
| CMS-05 | 발행 | 공개 경로 미리보기, 발행 체크리스트, slug 중복 즉시 확인 | 발행 실수와 수정 왕복 감소 | P1 | M | [CMS·미디어](./01-cms-authoring-and-media-plan.md) |
| CMS-06 | 운영 | 수정 이력과 이전 버전 복원 | 잘못된 편집의 복구 가능성 확보 | P2 | L | [CMS·미디어](./01-cms-authoring-and-media-plan.md) |
| UX-01 | 탐색 | 제목·요약·태그 기반 블로그 검색과 URL 상태 유지 | 원하는 글 발견 시간 단축 | P1 | M | [콘텐츠 경험](./02-content-discovery-and-conversion-plan.md) |
| UX-02 | 탐색 | 콘텐츠 수 증가 시 서버 페이지네이션과 필터 결과 수 | 목록 성능과 방향성 개선 | P2 | M | [콘텐츠 경험](./02-content-discovery-and-conversion-plan.md) |
| UX-03 | 상세 | 긴 글 목차, 현재 위치, 이전·다음·연관 콘텐츠 | 상세 페이지 체류와 연속 탐색 개선 | P1 | M | [콘텐츠 경험](./02-content-discovery-and-conversion-plan.md) |
| UX-04 | 포트폴리오 | 역할·문제·해결·성과 지표를 구조화하고 목록 필터 제공 | 채용·협업 관점의 설득력 강화 | P1 | L | [콘텐츠 경험](./02-content-discovery-and-conversion-plan.md) |
| UX-05 | 전환 | 상세 페이지 문맥에 맞는 연락 CTA와 클릭 이벤트 | 문의 경로 명확화, 전환 측정 | P1 | S | [콘텐츠 경험](./02-content-discovery-and-conversion-plan.md) |
| A11Y-01 | 내비게이션 | 건너뛰기 링크, 현재 메뉴 `aria-current`, 명확한 랜드마크 | 키보드·스크린리더 탐색 개선 | P0 | S | [접근성·테마](./03-accessibility-and-theme-plan.md) |
| A11Y-02 | 테마 | 시스템 설정 기본값, 명시적 사용자 선택, 상태 안내 정비 | 첫 방문 선호 존중과 토글 이해도 개선 | P1 | S | [접근성·테마](./03-accessibility-and-theme-plan.md) |
| A11Y-03 | 검수 | 두 테마의 대비·200% 확대·모바일·키보드 검수표와 axe 자동화 | 시각 변경 시 접근성 회귀 방지 | P0 | M | [접근성·테마](./03-accessibility-and-theme-plan.md) |
| A11Y-04 | 챗봇 | 패널 포커스 이동·복귀, Escape, 상태 알림과 스크롤 잠금 검증 | 보조기술 사용자의 챗봇 이용 가능성 확보 | P0 | M | [접근성·테마](./03-accessibility-and-theme-plan.md) |
| PERF-01 | 측정 | 운영 URL의 Web Vitals, TTFB, route JS, 이미지 bytes 기준선 수집 | 추측이 아닌 병목 기반 최적화 | P1 | S | [성능·SEO](./04-performance-seo-and-media-plan.md) |
| PERF-02 | 글꼴 | Pretendard 자체 호스팅과 subset·preload 정책 | CDN 의존과 글꼴 표시 변동 감소 | P1 | M | [성능·SEO](./04-performance-seo-and-media-plan.md) |
| PERF-03 | 이미지 | 업로드 정규화, 크기 메타데이터, OG·연락 이미지 압축 | 전송량·CLS·첫 요청 비용 감소 | P1 | M | [성능·SEO](./04-performance-seo-and-media-plan.md) |
| SEO-01 | 검색 | 운영 URL 필수 검증, metadata·JSON-LD·RSS·sitemap 자동 검사 | 잘못된 canonical과 공유 카드 회귀 방지 | P1 | M | [성능·SEO](./04-performance-seo-and-media-plan.md) |
| SEC-01 | 인증 | 공개 역할의 로그인 제한 조작 RPC 제거, 신뢰된 서버 경계에서 제한 처리 | 계정 잠금 유발·제한 초기화 공격 차단 | P0 | L | [보안·정합성](./05-security-and-data-integrity-plan.md) |
| DATA-01 | 저장 | 콘텐츠·태그·미디어 관계·감사 로그를 원자적 RPC로 저장 | 부분 저장과 감사 누락 방지 | P0 | L | [보안·정합성](./05-security-and-data-integrity-plan.md) |
| DATA-02 | 변경 | 조건부 상태 전이와 원자적 순서 변경 | 동시 요청 시 덮어쓰기·부분 정렬 방지 | P0 | M | [보안·정합성](./05-security-and-data-integrity-plan.md) |
| SEC-02 | 업로드 | 실제 파일 시그니처·디코딩 검사, 메타데이터 제거, 서버 재인코딩 | 위장 파일과 과대 이미지 위험 축소 | P0 | M | [보안·정합성](./05-security-and-data-integrity-plan.md) |
| SEC-03 | 브라우저 | 테마 초기화 스크립트의 CSP nonce/hash 적용 검토 | 운영 CSP의 `unsafe-inline` 의존 축소 | P1 | M | [보안·정합성](./05-security-and-data-integrity-plan.md) |
| DATA-03 | 스키마 | 배포된 마이그레이션 불변화와 생성 DB 타입 검증 | 환경별 스키마 분기 방지 | P0 | M | [보안·정합성](./05-security-and-data-integrity-plan.md) |
| OPS-01 | CI | lint·typecheck·unit·build·핵심 E2E를 PR 품질 게이트로 실행 | 수동 검수 의존과 회귀 감소 | P0 | M | [품질·운영](./06-quality-reliability-and-operations-plan.md) |
| OPS-02 | DB 검증 | 빈 DB·증분 마이그레이션, RLS와 Storage 정책 통합 테스트 | 배포 후 권한·스키마 장애 예방 | P0 | L | [품질·운영](./06-quality-reliability-and-operations-plan.md) |
| OPS-03 | 복구 | DB·Storage·콘텐츠 내보내기와 분기별 복원 훈련 | 운영자 실수와 장애에서 복구 가능 | P1 | M | [품질·운영](./06-quality-reliability-and-operations-plan.md) |
| OPS-04 | 관측 | liveness/readiness 분리, Sentry 알림·샘플링·소유자 정의 | 장애 발견과 대응 시간 단축 | P1 | M | [품질·운영](./06-quality-reliability-and-operations-plan.md) |
| RAG-01 | 품질 | 고정 평가셋 자동 실행과 검색·출처·답변 지표 관리 | 모델·청킹 변경의 품질 회귀 탐지 | P1 | L | [RAG 품질](./07-rag-quality-and-operations-plan.md) |
| RAG-02 | 신뢰 | 답변별 출처 일치 검증과 근거 부족 시 답변 거절 강화 | 환각과 잘못된 링크 감소 | P1 | M | [RAG 품질](./07-rag-quality-and-operations-plan.md) |
| RAG-03 | 운영 | 관리자 품질·지연·실패 대시보드와 익명 피드백 | 실제 이용 문제를 다음 개선으로 연결 | P2 | L | [RAG 품질](./07-rag-quality-and-operations-plan.md) |

## 5. 권장 실행 순서

### 0단계: 기준선 고정

기간 목표는 1~2일이다.

- 운영 데이터와 Storage 백업을 먼저 만든다.
- 현재 공개 핵심 경로, 관리자 CRUD, 챗봇 동작을 기록한다.
- 운영 Web Vitals와 이미지 전송량을 측정해 이후 비교 기준으로 보관한다.

### 1단계: 안전성 확보

예상 범위는 1~2주다.

- `SEC-01`, `DATA-01`, `DATA-02`, `DATA-03`을 먼저 처리한다.
- `SEC-02`, `CMS-03`으로 업로드와 미디어 삭제 경계를 닫는다.
- `OPS-01`, `OPS-02`를 함께 적용해 보안·DB 수정의 회귀를 막는다.

### 2단계: 관리자 작성 경험

예상 범위는 1주다.

- `CMS-01`, `CMS-02`로 본문 이미지 삽입을 한 화면에서 끝내게 한다.
- `CMS-04`, `CMS-05`로 장문 작성과 발행 실수를 줄인다.
- 이 단계에서는 Markdown을 기준 포맷으로 유지하고, 사용되지 않는 Tiptap 편집기로 재전환하지 않는다.

### 3단계: 방문자 경험과 접근성

예상 범위는 1~2주다.

- `A11Y-01`부터 `A11Y-04`까지 공개 핵심 흐름을 먼저 검수한다.
- `UX-01`, `UX-03`, `UX-05`로 탐색과 문의 전환을 연결한다.
- 포트폴리오 구조화(`UX-04`)는 실제 콘텐츠 2건을 먼저 변환한 뒤 전체에 확장한다.

### 4단계: 성능·검색·RAG 고도화

예상 범위는 2주 이상이며 지표에 따라 조정한다.

- `PERF-01`의 기준선에서 실제 병목으로 확인된 항목만 `PERF-02`, `PERF-03`으로 개선한다.
- `SEO-01`을 배포 검증에 포함한다.
- `RAG-01`, `RAG-02`를 먼저 적용하고 충분한 사용량이 생기면 `RAG-03`을 추가한다.

## 6. 이번 범위에서 보류할 항목

- 댓글, 회원가입, 결제, 구독은 포트폴리오의 주목적과 맞지 않아 제안하지 않는다.
- 방문자 행동 데이터가 없는 상태에서 대규모 홈 재설계나 애니메이션 확대를 우선하지 않는다.
- 콘텐츠 수가 적은 현재는 무한 스크롤과 외부 검색 서비스를 도입하지 않는다.
- 본문 포맷을 Markdown에서 Tiptap JSON으로 다시 바꾸는 작업은 마이그레이션 비용 대비 이점이 검증되지 않아 보류한다.
- RAG 모델 교체는 평가 기준선을 만든 뒤 결정한다.

## 7. 공통 완료 기준

- 각 개선은 단위 또는 통합 테스트와 운영 검수 절차를 함께 추가한다.
- 두 테마, 모바일 360px, 데스크톱, 키보드만 사용, 200% 텍스트 확대에서 핵심 흐름이 완료된다.
- DB 변경은 순방향 마이그레이션으로만 적용하며 staging에서 복원·롤백 절차를 확인한다.
- 공개 콘텐츠의 기존 URL과 관리자 작성 데이터는 유지한다.
- 배포 전후 성능·오류·전환 지표를 같은 조건으로 비교하고 결과를 기록한다.

## 8. 관련 문서

- 기존 제품 기준: [`PORTFOLIO_V2_PLAN.md`](../../../PORTFOLIO_V2_PLAN.md)
- 디자인 기준: [`portfolio-design.md`](../../design/portfolio-design.md)
- RAG 기존 기획: [`chatbot-rag-implementation-plan.md`](../chatbot-rag-implementation-plan.md)
- 기술 개선 분석: [`change-history-technical-improvements.md`](../../reviews/change-history-technical-improvements.md)
- 배포 인수인계: [`vercel-deployment-handoff.md`](../../operations/vercel-deployment-handoff.md)
