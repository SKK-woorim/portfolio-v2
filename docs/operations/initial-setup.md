# Portfolio V2 초기 설정과 출시 운영

## 1. 프로젝트 연결

1. 이 저장소를 GitHub에 새로 생성한다.
2. Netlify에서 GitHub 저장소를 연결한다. 운영 브랜치는 `main`으로 두고, 기능 작업은 별도 브랜치의 Deploy Preview로 검수한다.
3. 기존 운영 사이트는 V2 검수가 끝나기 전까지 연결이나 도메인을 변경하지 않는다.

## 2. Supabase 환경 분리

1. Supabase에 `portfolio-v2-staging`과 `portfolio-v2-production` 프로젝트를 각각 생성한다.
2. 각 프로젝트 SQL Editor 또는 Supabase CLI에서 `supabase/migrations/202608050001_initial_schema.sql`을 순서대로 적용한다.
3. staging에서만 `supabase/seed.sql`을 적용한다. 이 파일에는 운영 콘텐츠나 계정을 넣지 않는다.
4. Authentication > Providers에서 이메일·비밀번호 로그인만 켜고, 공개 회원가입을 끈다.
5. Authentication > Users에서 최초 운영자 계정을 만든다. 비밀번호는 이 저장소나 환경 변수에 기록하지 않는다.
6. 생성한 계정의 역할을 SQL Editor에서 `admin`으로 변경한다.

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

`media` Storage 버킷과 RLS 정책은 첫 마이그레이션이 생성한다. 업로드는 관리자 세션으로만 수행하고, `service_role` 키는 일반 CRUD 또는 브라우저에서 사용하지 않는다.

## 3. Netlify 환경 변수

| 변수 | Deploy Preview | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | staging 프로젝트 URL | production 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | staging publishable key | production publishable key |
| `NEXT_PUBLIC_SITE_URL` | Preview URL 또는 검수 도메인 | 실제 공개 도메인 |
| `NEXT_PUBLIC_SENTRY_DSN` | staging DSN | production DSN |
| `SENTRY_AUTH_TOKEN` | 필요 시 | 필요 시 |

`SUPABASE_SERVICE_ROLE_KEY`는 현재 앱의 일반 CRUD에 필요하지 않다. 운영상 별도 서버 작업을 추가해야 할 때만 서버 전용 환경 변수로 등록한다.

## 4. 배포 전 점검

1. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`가 모두 성공하는지 확인한다.
2. Preview에서 비로그인 상태로 `/admin/*` 및 관리자 Server Action에 접근할 수 없는지 확인한다.
3. 초안·숨김·휴지통 콘텐츠가 공개 목록, 상세, RSS, 사이트맵에서 보이지 않는지 확인한다.
4. 관리자 계정으로 포트폴리오·게시글·미디어의 생성/수정/휴지통 흐름을 점검한다.
5. 모바일 메뉴, 키보드 포커스, 색상 대비, 이미지 대체 텍스트를 검수한다.
6. 실제 운영 도메인과 `NEXT_PUBLIC_SITE_URL`을 일치시킨 뒤에만 프로덕션 배포한다.

## 5. 백업과 복구

- Supabase의 Postgres 백업 정책과 보관 기간은 프로젝트 요금제에서 확인하고, 최소 분기마다 복구 절차를 staging에서 검증한다.
- Storage 파일은 DB 백업에 포함되지 않을 수 있다. 월별로 `media` 버킷 목록과 파일을 별도 보관하고, 삭제 전에 미디어 연결 여부를 확인한다.
- Sentry, Netlify 배포 로그, Supabase 로그의 알림 수신자를 정하고 테스트 오류를 한 번 발생시켜 알림을 검증한다.
