# Portfolio V2 초기 설정과 출시 운영

작성 기준일: 2026-09-07

## 1. 프로젝트와 Vercel 연결

1. 이 저장소를 GitHub에 연결한다.
2. Vercel에서 저장소를 연결하고 운영 브랜치를 `main`으로 지정한다. 기능 브랜치는 Preview 배포에서 검수한다.
3. Vercel의 Production 환경과 Preview 환경을 구분하고, 각 환경의 Supabase 프로젝트와 환경 변수를 서로 섞지 않는다.
4. 검수와 준비가 끝날 때까지 기존 공개 도메인의 DNS를 변경하지 않는다.

Vercel 배포 상세와 현재 연결 정보는 [Vercel 배포 전환 인수인계](./vercel-deployment-handoff.md)를 기준으로 한다.

## 2. Supabase 환경과 마이그레이션

1. Supabase에 `portfolio-v2-staging`과 `portfolio-v2-production` 프로젝트를 각각 준비한다.
2. 각 프로젝트에 `supabase/migrations/`의 SQL 파일을 파일명 기준 사전순(lexicographic order)으로 적용한다. 단, `202609070004_enforce_rpc_boundaries.sql`은 확장 단계의 일부가 아니다. 이 파일은 `001`~`003` 적용, 새 웹 배포, smoke test, 지정한 롤백 관찰 기간이 모두 끝난 뒤에만 계약 단계로 적용한다. 일부 최신 파일만 적용하거나 파일을 합쳐 실행하지 않는다.

현재 적용 순서는 다음과 같다.

```text
202608050001_initial_schema.sql
202608050002_privilege_grants.sql
202608060001_fix_login_rate_limiting.sql
202608060002_add_content_trash_state.sql
202608210001_chatbot_rag.sql
202608210002_chatbot_sync_triggers.sql
202608240001_fix_claim_knowledge_sync_job.sql
202608240002_grant_rag_source_access.sql
202608240003_chatbot_runtime_control.sql
202609070001_secure_login_and_media_usage.sql
202609070002_atomic_content_mutations.sql
202609070003_media_image_metadata.sql
202609070004_enforce_rpc_boundaries.sql  # 계약 단계: 아래 4절의 순서를 따른다.
```

`pnpm verify:migrations`는 파일명 정렬, 타임스탬프 중복, `202609070001`~`004`의 로그인 예약/확정, 미디어 참조·URL, 원자적 감사 로그, 삭제 outbox, RPC 경계 계약을 검사한다. 이 검사는 실제 Supabase 프로젝트에 SQL을 적용하는 작업을 대신하지 않는다.

3. staging에서만 `supabase/seed.sql`을 적용한다. 운영 콘텐츠나 비밀번호를 seed에 넣지 않는다.
4. Authentication에서 이메일·비밀번호 로그인만 켜고 공개 회원가입을 끈다.
5. 최초 운영자 계정을 만들고, 비밀번호는 저장소나 환경 변수에 기록하지 않는다.
6. 생성한 계정의 역할을 SQL Editor에서 `admin`으로 변경한다.

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

`media` Storage 버킷과 RLS 정책은 마이그레이션이 생성한다. `service_role` 키는 서버 전용 로그인 제한 RPC에만 사용하고 브라우저, 일반 CRUD, 로그에 노출하지 않는다.

## 3. Vercel 환경 변수

| 변수 | Preview / staging | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | staging 프로젝트 URL | production 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | staging publishable key | production publishable key |
| `NEXT_PUBLIC_SITE_URL` | Preview 또는 검수 도메인 | 실제 공개 도메인 |
| `NEXT_PUBLIC_SENTRY_DSN` | staging DSN | production DSN |
| `SENTRY_AUTH_TOKEN` | 필요 시 | 필요 시 |
| `SUPABASE_SERVICE_ROLE_KEY` | staging 서버 전용 키 | production 서버 전용 키 |
| `LOGIN_RATE_LIMIT_SECRET` | 32자 이상 무작위 값 | staging과 다른 32자 이상 무작위 값 |

`SUPABASE_SERVICE_ROLE_KEY`와 `LOGIN_RATE_LIMIT_SECRET`은 새 로그인 제한 경계에 필수다. 두 값은 서버에서만 읽고 브라우저 번들·로그·티켓에 복사하지 않는다. `LOGIN_RATE_LIMIT_SECRET`은 최소 32자이며 환경별로 서로 달라야 한다. 둘 중 하나라도 없으면 로그인 제한을 우회하지 않고 로그인 액션이 안전하게 일시 실패하는지 확인한다.

## 4. 마이그레이션 롤아웃 순서와 유지보수

`202609070001_secure_login_and_media_usage.sql`은 예약/확정형 서버 전용 로그인 제한을 추가하고, `002`와 `003`은 저장 RPC, 미디어 메타데이터, 감사 로그와 삭제 outbox를 확장한다. `004`는 그 전환이 정상임을 확인한 뒤에만 이전 로그인 RPC·테이블을 제거하고 직접 DML을 회수하는 **되돌리기 어려운 계약 단계**다.

1. staging 백업, 현재 배포 식별자, 이전 정상 Vercel 배포 URL, 그리고 production의 롤백 관찰 종료 시각을 기록한다.
2. staging에 기존 마이그레이션과 `202609070001` → `002` → `003`을 파일명 순서대로 적용하고 `pnpm verify:migrations`를 실행한다. 이 시점에는 `004`를 적용하지 않는다.
3. staging에 새 웹을 배포해 로그인, CMS, 미디어 흐름과 아래 smoke test를 통과시킨다. `/api/health`와 `/api/readiness`도 배포 환경에서 확인한다.
4. production 유지보수 창에서 `001` → `002` → `003`을 중단 없이 적용한 뒤, **지체 없이** 새 Vercel 웹 배포를 시작한다. 첫 파일부터 전환 구간이 시작되므로 실패한 파일 뒤를 건너뛰지 않는다.
5. 웹 배포가 Ready가 되면 로그인 예약/확정, 관리자 CMS, 미디어 업로드·삭제, 공개 렌더링과 readiness를 smoke test한다. 지정한 롤백 관찰 기간 동안에는 `004`를 적용하지 않고 새 배포와 이전 정상 배포 식별자를 보존한다.
6. 관찰 기간에 오류·회귀가 없고 롤백 창을 닫기로 승인되면, 각 환경의 SQL Editor에서 아래 승인 표식을 먼저 기록한다. 이 표식이 없으면 `004`가 의도적으로 실패하므로 일반적인 일괄 `db push`가 계약 단계를 우발적으로 넘지 못한다. `approval_note`에는 승인 티켓이나 변경 기록을 남긴다.

```sql
insert into public.deployment_contract_approvals (contract_key, approval_note)
values ('202609070004_enforce_rpc_boundaries', 'rollback window closed: CHANGE-REFERENCE')
on conflict (contract_key) do update
set approval_note = excluded.approval_note,
    approved_at = now();
```

7. staging에서 먼저 `202609070004_enforce_rpc_boundaries.sql`을 적용해 legacy login RPC/table 제거와 direct DML 거부를 확인한다. 이어 production에도 승인 표식을 기록하고 같은 파일 하나만 적용한 뒤 `pnpm verify:migrations` 및 계약 smoke test를 다시 실행한다.

롤백은 이미 적용한 SQL 파일을 편집하거나 삭제하는 방식으로 하지 않는다. `001`~`003` 단계에서 실패하면 신규 웹 배포를 이전 정상 배포로 되돌리고, 영향 범위에 따라 로그인 유지보수 상태를 유지하며 DB 복구 또는 별도 정방향 보정 마이그레이션을 준비한다. `004` 적용 뒤에는 이전 웹 배포가 삭제된 legacy RPC와 직접 DML에 의존할 수 있으므로 이를 롤백 수단으로 사용하지 않는다. 이 경우 새 정방향 보정 또는 DB 복구 절차를 선택한다.

## 5. staging RLS/RPC smoke test

staging에서 다음을 각각 수행하고 결과와 실행 시각을 기록한다.

- 익명 사용자는 공개 `published` 콘텐츠만 조회하고 draft·trashed 콘텐츠, 관리자 테이블, 로그인 제한 테이블을 조회하지 못한다.
- 일반 인증 사용자는 관리자 전용 콘텐츠 변경 RPC를 호출하지 못한다. 관리자 세션은 `save_*_atomic`, 상태 전이, 순서 변경, 미디어 alt/삭제 RPC를 성공시킨다.
- 익명 또는 `authenticated` 역할은 로그인 예약/확정 RPC를 직접 호출하지 못하고, 서버의 `service_role` 호출만 `reserve_login_attempt_trusted`와 `finalize_login_attempt_trusted`를 성공시킨다. 동시 로그인 시도는 예약 수까지 제한되고 `success`·`failure`·`abandoned` 확정이 예약을 해제하는지 확인한다.
- 콘텐츠 저장에 전달한 inline/cover media ID가 UUID이며 실제 `media` 행과 일치하지 않으면 거절되는지, 빈 `public_url`이 새 미디어에 허용되지 않는지 확인한다. `content_json.type`이 없거나 `markdown`이 아니어도 거절되어야 한다.
- 프로필 저장, 미디어 등록/alt 변경, 챗봇 runtime 변경은 각각 대상 행 변경과 `audit_logs` 행이 하나의 트랜잭션으로 성공 또는 롤백되는지 확인한다.
- 사용 중인 미디어 삭제는 거절되고, 사용하지 않는 미디어 삭제는 metadata 삭제·`media_deletion_outbox` 생성·감사 로그가 원자적으로 완료되는지 확인한다. Storage 삭제 실패는 outbox에 남아 재시도 가능해야 한다.
- 콘텐츠 저장·상태 전이·순서 변경의 잘못된 버전 또는 상태는 거절되며 부분 저장이 남지 않는다.
- staging 관리자 로그인, 미디어 업로드, 대표 이미지/본문 미디어 연결과 공개 렌더링을 확인한다.
- `004` 적용 뒤에는 legacy login RPC와 `login_rate_limits` 테이블이 존재하지 않고, `authenticated`가 나열된 콘텐츠·미디어·감사 테이블에 직접 insert/update/delete 하지 못하는지 확인한다.

실제 DB 연결 없는 단위 테스트 통과만으로 완료 처리하지 않는다. production 데이터로 smoke test를 실행하지 않는다.

## 6. 상태 확인 엔드포인트

- `GET /api/health`는 프로세스 liveness 확인용이다. 항상 `200`과 `{ status: "ok", timestamp }`를 반환하며 Supabase, 챗봇, 마이그레이션 상태를 검사하지 않는다.
- `GET /api/readiness`는 배포 수락과 의존성 확인용이다. Supabase 설정과 공개 포트폴리오 조회를 최대 1.5초씩 확인한다. 챗봇 master switch 또는 runtime이 꺼진 경우 챗봇 구성 요소는 `disabled`로 보고 readiness를 막지 않는다. 챗봇이 켜진 경우에는 runtime 설정, backend URL, backend health의 `{ status: "ok", embeddingReady: true, modelReady: true }`가 모두 필요하다.
- readiness가 충족되면 `200 { status: "ready", components }`, 그렇지 않으면 세부 오류 대신 구성 요소 상태만 담은 `503 { status: "not_ready", components }`를 `Cache-Control: no-store`와 함께 반환한다. 현재 readiness는 공개 콘텐츠 읽기와 챗봇 relay/backend의 가용성을 확인하며, migration 버전·백업 신선도·Sentry 경보 전달까지 보증하지 않는다.

## 7. 배포 전 readiness checklist

- [ ] 백업, 복구 담당자, 유지보수 창, 이전 정상 Vercel 배포 URL을 기록했다.
- [ ] 모든 migration 파일을 사전순으로 적용했고 `pnpm verify:migrations`가 통과했다.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`와 32자 이상 `LOGIN_RATE_LIMIT_SECRET`이 Preview/Production에 각각 설정됐다.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`가 통과했다.
- [ ] `pnpm verify:fonts`가 통과하고 `public/assets/fonts/`의 Pretendard 파일이 실제로 존재한다.
- [ ] `sharp` 이미지 정규화 테스트와 업로드 metadata(폭·높이·checksum) 검증이 통과했다.
- [ ] Node 전용 `/api/chat`, `/api/chat/status`가 Edge가 아닌 `runtime = "nodejs"`로 실행되는지 확인했다.
- [ ] staging RLS/RPC smoke test, 로그인, 관리자 CRUD, 미디어 삭제 보호를 통과했다.
- [ ] `/api/health`가 200을 반환하고, `/api/readiness`가 현재 챗봇 운영 상태에 맞춰 200 또는 조사 가능한 503을 반환한다.
- [ ] `001`~`003` 이후 웹 배포·smoke test·롤백 관찰 기간을 완료했으며, 승인 표식은 변경 기록과 함께 남겼고 `004`는 해당 창을 닫은 뒤에만 적용한다.
- [ ] Preview에서 비로그인 `/admin/*` 접근과 Server Action 우회가 차단된다.
- [ ] draft·hidden·trashed 콘텐츠가 공개 목록, 상세, RSS, 사이트맵에 나오지 않는다.
- [ ] 실제 도메인과 `NEXT_PUBLIC_SITE_URL`이 일치하고 `/`, `/sitemap.xml`, `/robots.txt`, `/rss.xml`을 확인했다.
- [ ] Vercel Production 배포가 `Ready`이고 Runtime Logs와 Sentry 오류가 정상이다.

## 8. 백업·복구와 운영 확인

- Supabase Postgres 백업 정책과 보관 기간을 확인하고, 최소 분기마다 staging 복구를 실제로 연습한다.
- Storage 파일은 DB 백업에 포함되지 않을 수 있으므로 `media` 버킷 목록과 파일을 별도로 보관한다. 삭제 전 사용처를 확인한다.
- 배포 후 관리자 로그인, 프로필 저장, 포트폴리오/게시글 원자 저장, 미디어 업로드·삭제 outbox, 공개 페이지, `/api/health`, `/api/readiness`를 smoke test한다.
- 장애 시 `004` 전에는 Vercel Production을 이전 Ready 배포로 되돌릴 수 있다. `004` 후에는 이전 배포가 legacy 경계에 의존할 수 있으므로, DB는 적용된 migration을 기준으로 정방향 보정 또는 복구 절차를 선택한다. migration 파일을 수정해 재실행하지 않는다.
