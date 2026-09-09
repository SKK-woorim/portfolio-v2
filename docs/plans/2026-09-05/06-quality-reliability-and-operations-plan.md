# 품질·신뢰성·운영 개선 기획서

- 관련 항목: `OPS-01`~`OPS-04`
- 목표: 배포 전에 회귀를 발견하고, 배포 후 장애를 빠르게 구분하며, 실제 복원이 가능한 운영 체계를 만든다.

## 1. 배경과 문제

프로젝트에는 lint, typecheck, Vitest, Playwright, build 명령과 Sentry, 단순 health endpoint가 있다. 챗봇에는 별도 Python 테스트와 systemd·Caddy 운영 문서도 있다. 다만 현재 E2E는 공개 탐색과 챗봇 중심이며, CMS CRUD와 DB 권한·마이그레이션을 실제 환경에서 검증하는 자동 경로가 부족하다.

`/api/health`는 Next.js 프로세스가 응답한다는 liveness만 보여준다. Supabase 조회, Storage 접근, RAG API, 동기화 worker의 readiness는 각각 따로 확인해야 한다. 백업 절차는 문서에 있지만 정기 복원 훈련과 콘텐츠 이동용 내보내기 기능은 구체화되어 있지 않다.

## 2. 품질 게이트

### PR 필수 검사

1. package install의 lockfile 일치
2. lint
3. TypeScript typecheck
4. Vitest 단위·컴포넌트 테스트
5. production build
6. 핵심 Playwright smoke test
7. 변경된 SQL이 있으면 migration·RLS 통합 테스트
8. 접근성 자동 검사

서로 같은 오류를 중복 검사해 시간을 늘리지 않도록 job을 분리하되, 최종 merge 조건은 한곳에서 확인한다. flaky test를 무조건 재시도로 숨기지 않고 원인과 소유자를 기록한다.

### 배포 후 smoke test

- 홈, 포트폴리오, 블로그, 연락처 200 응답
- 대표 상세 1건씩 200, 존재하지 않는 slug 404
- 관리자 미인증 접근이 로그인으로 이동하거나 거절됨
- canonical과 OG origin 확인
- sitemap, RSS, robots 파싱
- 챗봇 status 확인과 활성 시 고정 질문 1건
- 오류율·응답 시간 급증 여부 확인

## 3. 테스트 포트폴리오

### 단위·컴포넌트

- Markdown 파싱과 안전 URL
- 미디어 삽입, alt, 작성 복구 상태
- Zod 입력 정규화
- cache key와 재검증 대상
- RAG SSE 계약과 출처 URL 검증

### DB 통합

- 빈 DB에 전체 마이그레이션 적용
- 직전 운영 schema snapshot에 증분 적용
- anon/authenticated/admin 역할별 SELECT·INSERT·UPDATE·DELETE·RPC 허용표
- Storage upload/delete 정책
- 원자적 저장 rollback과 optimistic concurrency
- RAG trigger, queue claim, 공개/비공개 전환

### E2E

- 관리자 로그인 성공·실패·제한
- 게시글 생성 → 이미지 삽입 → 초안 저장 → 미리보기 → 발행 → 공개 확인
- 포트폴리오 생성 → 대표 지정 → 순서 변경 → 공개 확인
- 비공개·휴지통·복원과 cache 반영
- 사용 중 미디어 삭제 차단
- 다크·라이트, 모바일 메뉴, 키보드, 챗봇

테스트 데이터는 production과 분리하고 실행마다 고유 slug를 사용한 뒤 정리한다. 실패한 테스트가 운영 데이터를 삭제할 수 없도록 project ID와 environment guard를 둔다.

## 4. 상태 확인 설계

### liveness

- 앱 프로세스가 요청을 처리할 수 있는지만 확인한다.
- 외부 의존성 지연 때문에 liveness가 실패해 재시작 반복을 유발하지 않게 한다.
- 현재 `/api/health`를 이 역할로 유지할 수 있다.

### readiness

- 공개 콘텐츠 DB의 최소 read query
- 필요한 환경 변수 존재
- 선택적으로 Storage metadata 접근
- RAG 활성 상태라면 relay와 backend health를 분리 표시
- 각 의존성에 짧은 timeout을 두고 전체 실패 이유를 구조화한다.

공개 readiness 응답에는 프로젝트 URL, 내부 오류, secret, DB 상세를 노출하지 않는다. 상세 진단은 인증된 관리자 화면 또는 모니터링 시스템에서만 확인한다.

### synthetic monitoring

- 5분 간격: 홈과 liveness
- 10분 간격: 대표 공개 상세와 readiness
- 30분 또는 1시간 간격: 챗봇 고정 질문은 비용·CPU 부하를 보고 설정
- 연속 실패 횟수와 지속 시간을 조건으로 alert해 순간 네트워크 오류의 소음을 줄인다.

## 5. Sentry와 로그

- client/server/edge별 환경과 release를 명확히 지정한다.
- 개인정보가 event payload에 들어가지 않도록 before-send scrubbing을 적용한다.
- 챗봇 질문 원문, 이메일, auth header, HMAC, Supabase token은 수집하지 않는다.
- route, error code, request ID, 콘텐츠 유형처럼 진단 가능한 비식별 context만 남긴다.
- traces/replay는 기본 최소 sampling에서 시작해 실제 문제 해결 가치와 비용을 보고 조정한다.
- alert마다 담당자, 대응 시간, runbook 링크와 종료 조건을 둔다.

권장 알림:

- 공개 5xx 비율 급증
- 관리자 저장 실패 연속 발생
- DB readiness 연속 실패
- RAG first token timeout·generation timeout 증가
- RAG 인덱싱 `processing` 장기 정체 또는 `failed` 증가
- Oracle 디스크·메모리 임계치

## 6. 백업·복원·이동성

### 백업 범위

- Supabase DB: 콘텐츠, 관계, profile, 감사 로그, RAG 문서 상태
- Supabase Storage: 원본·정규화 이미지와 key 목록
- 배포 환경 변수 목록: 값이 아닌 키와 소유 위치
- RAG 모델·설정: 모델 파일 출처와 checksum, service 설정
- 코드와 migration: Git remote와 release tag

### 콘텐츠 내보내기

관리자 전용으로 다음 구조의 zip 또는 JSON manifest를 생성한다.

```text
export-date/
- site-profile.json
- portfolio.json
- posts.json
- taxonomy.json
- media-manifest.json
- media/
```

- 비밀번호, auth token, HMAC secret, 내부 로그를 포함하지 않는다.
- Markdown 원문, slug, 상태, 날짜, 미디어 관계를 보존한다.
- import는 별도 검증과 dry-run을 거치며 기존 콘텐츠를 자동 덮어쓰지 않는다.

### 복원 훈련

- 분기마다 staging 격리 환경에서 DB와 Storage를 복원한다.
- 대표 콘텐츠 수, 관계 수, 이미지 checksum, 공개 렌더링을 확인한다.
- 목표 RPO/RTO를 첫 훈련 결과로 정하고 이후 개선한다.
- 복원 기록에 소요 시간, 누락, 수동 단계와 담당자를 남긴다.

## 7. 배포와 롤백

- production 배포 전 DB migration의 하위 호환성을 확인한다.
- schema 변경은 expand → application switch → contract 순서를 사용한다.
- 배포 artifact와 DB migration version을 release에 연결한다.
- 롤백은 이전 웹 배포로 돌려도 새 schema에서 동작할 수 있는 기간을 확보한다.
- 관리자 기능이 위험하면 공개 사이트를 유지한 채 관리자 쓰기만 임시 중지할 수 있는 운영 스위치를 검토한다.
- 챗봇은 이미 제공되는 공개 연결 토글을 장애 완화 수단으로 유지한다.

## 8. 운영 대시보드

처음에는 별도 거대 대시보드보다 다음 핵심 지표만 제공한다.

| 영역 | 지표 |
| --- | --- |
| 공개 사이트 | 요청 수, 4xx/5xx, p95 응답, Web Vitals |
| 관리자 | 저장 성공/실패, 업로드 실패, 충돌 수 |
| 데이터 | readiness, cache 오류, migration version |
| 미디어 | 저장량, 업로드량, 미사용 자산 수 |
| RAG | availability, first-token p95, 완료율, 검색 없음, index 실패 |

지표가 행동으로 이어지지 않으면 수집하지 않는다. 각 카드에는 정상 범위, 마지막 갱신 시각과 관련 runbook을 둔다.

## 9. 단계별 구현

### 1차: 배포 전 방어

- CI 필수 검사
- 핵심 관리자 E2E
- DB migration·RLS 통합 테스트 기반
- production 환경 guard

### 2차: 장애 감지

- liveness/readiness 분리
- Sentry 개인정보 제거와 alert
- 배포 후 synthetic smoke test

### 3차: 복구 가능성

- DB·Storage 통합 백업 목록
- 콘텐츠 export
- staging 복원 훈련과 결과 보고서
- release와 migration version 연결

## 10. 완료 기준

- PR에서 코드, 빌드, 접근성, 핵심 E2E와 DB 정책 회귀를 자동으로 차단한다.
- liveness, DB readiness, RAG 상태를 혼동하지 않고 장애 영역을 구분한다.
- 경보에는 담당자와 실행 가능한 runbook이 연결된다.
- production과 분리된 환경에서 DB·Storage·콘텐츠 복원을 실제로 완료한 기록이 있다.
- 이전 웹 배포와 새 schema의 호환 범위를 문서화해 안전하게 롤백할 수 있다.
