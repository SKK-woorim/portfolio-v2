# Vercel 배포 전환 인수인계

작성 기준일: 2026-08-14
대상 프로젝트: Portfolio V2

## 1. 전환 결과 요약

기존 Netlify 운영 프로젝트를 삭제하거나 이전한 것은 아니며, 동일한 Next.js 애플리케이션을 새 Vercel 프로젝트에 별도로 연결해 프로덕션 배포했다. 데이터베이스와 관리자 인증은 기존 Supabase 프로젝트를 그대로 사용한다.

현재 공개 주소:

- <https://portfolio-three-chi-dgdi7wj28c.vercel.app>
- 관리자 로그인: <https://portfolio-three-chi-dgdi7wj28c.vercel.app/admin/login>
- Vercel 프로젝트 대시보드: <https://vercel.com/skk-woorim1/portfolio>

Vercel 프로젝트 식별 정보:

| 항목 | 값 |
| --- | --- |
| Vercel Team | `skk-woorim1` |
| Project | `portfolio` |
| Project ID | `prj_FHbUTJeS89Me9BknoDd4fjO6IrtK` |
| Organization ID | `team_X9PcaqLiwJGLfimW8jOnUsln` |
| Framework | Next.js |
| Git 저장소 | `https://github.com/SKK-woorim/portfolio-v2.git` |
| 현재 로컬 브랜치 | `main` |

Project ID와 Organization ID는 프로젝트 연결 식별자이며 비밀키가 아니다. Supabase 키, Vercel 토큰, 사용자 비밀번호는 이 문서에 기록하지 않는다.

## 2. 현재 배포 구성

Vercel CLI로 `portfolio` 프로젝트를 생성·연결했고, CLI가 GitHub 저장소 연결까지 완료했다고 보고했다. 현재 운영 중인 배포는 Git push가 아니라 로컬 작업 트리를 Vercel CLI로 직접 업로드한 배포다.

배포 설정은 별도 `vercel.json` 없이 Vercel의 Next.js 자동 감지를 사용한다.

| 설정 | 현재 값 |
| --- | --- |
| Install | `pnpm install` 자동 감지 |
| Build | `pnpm run build` → `next build` |
| Package manager | `pnpm@10.27.0` |
| Node engine | `>=20.9.0` |
| Output | Next.js 기본 출력 |

Vercel 연결 정보는 로컬 `.vercel/project.json`에 저장된다. `.vercel`은 `.gitignore` 대상이므로 저장소에 커밋하지 않는다.

## 3. Vercel 환경 변수

공개 사이트 변수 3개와 로그인 제한용 서버 전용 변수 2개를 Vercel의 **Production** 환경에 등록해야 한다.

| 변수 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 기존 Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저에서 사용하는 Supabase publishable key |
| `NEXT_PUBLIC_SITE_URL` | 사이트맵, robots, RSS 등에 사용하는 공개 기준 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 로그인 제한 전용 RPC를 호출하는 서버 자격증명 |
| `LOGIN_RATE_LIMIT_SECRET` | 이메일·IP 대역 식별자를 HMAC 처리하는 32자 이상의 무작위 비밀값 |

`NEXT_PUBLIC_SITE_URL`의 운영 값은 다음과 같다.

```text
https://portfolio-three-chi-dgdi7wj28c.vercel.app
```

주의 사항:

- `NEXT_PUBLIC_*` 변수는 브라우저 번들에서 공개될 수 있으므로 비밀값을 넣지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`와 `LOGIN_RATE_LIMIT_SECRET`은 새 로그인 제한 경계에 필수다. 둘 중 하나라도 없으면 로그인은 안전하게 일시 실패한다.
- 두 서버 전용 값은 Preview/Production 범위별로 별도 등록하고 `NEXT_PUBLIC_` 접두사를 붙이거나 브라우저·로그에 노출하지 않는다. 서비스 역할 키는 로그인 제한용 서버 모듈 밖의 일반 CMS CRUD에 사용하지 않는다.
- Preview와 Development 범위에는 Supabase 변수를 따로 등록하지 않았다. Preview 배포에서 CMS까지 검수하려면 환경 분리 정책을 정한 뒤 별도로 등록한다.
- `.env.local`에는 로컬 개발용 값과 Vercel CLI가 자동 발급한 `VERCEL_OIDC_TOKEN`이 있다. `.env.local` 전체를 공유하거나 커밋하지 않는다.
- `VERCEL_OIDC_TOKEN`은 사람이 문서에 복사해 관리하는 장기 비밀값이 아니다. 필요할 때 `vercel link` 또는 Vercel CLI가 다시 관리하게 둔다.

Vercel 대시보드에서 확인하는 경로:

```text
Project → Settings → Environment Variables
```

## 4. Supabase와 관리자 계정

이번 전환에서는 Supabase 프로젝트, DB 스키마, Storage, Auth 사용자 또는 관리자 계정을 새로 만들지 않았다. 따라서 기존 관리자 계정은 동일한 이메일과 비밀번호를 계속 사용한다.

관리자 접근 흐름:

1. `/admin`에 접근한다.
2. 비로그인 상태이면 `/admin/login`으로 이동한다.
3. 기존 Supabase 관리자 계정으로 로그인한다.
4. 프로필, 포트폴리오, 게시글 및 미디어를 관리한다.

배포 직후 공개 API 점검 당시 `site_profile`, 공개 상태의 `portfolio_items`, 공개 상태의 `posts` 결과는 비어 있었다. 이 상태에서는 코드의 기본 프로필 문구가 사용되거나 포트폴리오·블로그 목록이 비어 보일 수 있다. 관리자에서 콘텐츠를 저장하고 `published` 상태로 발행하면 공개 화면에 표시된다.

### Supabase에서 남은 수동 확인

Supabase 대시보드에서 다음 값을 새 Vercel 주소로 확인하거나 변경해야 한다.

```text
Authentication → URL Configuration → Site URL
```

권장 Site URL:

```text
https://portfolio-three-chi-dgdi7wj28c.vercel.app
```

비밀번호 로그인 자체는 같은 Supabase 프로젝트를 사용하므로 계속 가능하지만, Site URL과 Redirect URL이 예전 Netlify 주소로 남아 있으면 비밀번호 재설정, 초대, 이메일 인증 등의 링크가 예전 사이트로 이동할 수 있다. 해당 인증 기능을 사용한다면 새 Vercel 주소도 Redirect URLs에 등록하고 실제 이메일 흐름을 한 번 검증한다.

## 5. 배포와 운영 절차

### Git 연결을 통한 일반 배포

GitHub 저장소가 Vercel 프로젝트에 연결되어 있다. Vercel 대시보드의 `Settings → Git`에서 Production Branch가 `main`인지 확인한 뒤 운영한다.

일반적인 흐름:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git push origin main
```

Production Branch에 push하면 Vercel이 자동 배포하도록 구성하는 것이 기본 운영 방식이다. Preview 환경변수는 아직 없으므로, 기능 브랜치 Preview에서 Supabase 기반 화면을 검수하려면 Preview용 변수를 먼저 설정해야 한다.

### CLI를 통한 수동 프로덕션 배포

Vercel CLI 로그인과 Codex의 Vercel 플러그인 연결은 서로 다른 인증이다. 플러그인 연결에 실패하더라도 CLI 로그인이 되어 있으면 배포할 수 있다.

```bash
corepack enable
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link
pnpm dlx vercel@latest --prod --yes
```

이미 `.vercel/project.json`이 있는 정상 작업 복사본에서는 일반적으로 `link`를 반복할 필요가 없다. 다른 Vercel 계정이나 Team에 연결하지 않도록 배포 전 프로젝트 이름과 Team을 확인한다.

배포 상태 확인 예시:

```bash
pnpm dlx vercel@latest inspect <deployment-url>
```

## 6. 완료된 검증

전환 과정에서 다음 검증을 완료했다.

- ESLint 통과
- TypeScript typecheck 통과
- Vitest 6개 파일, 총 16개 테스트 통과
- Vercel 원격 `next build` 통과
- 최종 프로덕션 배포 상태 `Ready`
- `/`, `/portfolio`, `/blog` 응답 `200`
- `/admin`이 `/admin/login`으로 정상 이동
- `/admin/login` 응답 `200`
- `/sitemap.xml`, `/robots.txt`, `/rss.xml` 응답 `200`
- 사이트맵의 기준 주소가 Vercel 공개 주소로 생성됨
- 최종 사이트맵에서 `netlify` 문자열이 남지 않음

실제 관리자 비밀번호를 전달받지 않았으므로 운영 계정의 로그인 성공과 관리자 CRUD 전체 흐름은 검증하지 않았다.

## 7. 로컬 빌드 참고 사항

작업 환경의 Node.js `24.16.0`에서는 로컬 `next build`가 Turbopack 단계에서 장시간 멈췄고, `next build --webpack`은 Next.js가 TypeScript `--showConfig` 출력을 읽는 과정에서 실패했다. 같은 환경에서 직접 실행한 typecheck와 TypeScript `--showConfig`는 성공했으며, Vercel 원격 빌드는 같은 소스를 정상적으로 빌드했다.

로컬에서 같은 증상이 재현되면 다음 순서로 확인한다.

1. `pnpm install --frozen-lockfile`로 의존성을 다시 설치한다.
2. `pnpm lint`, `pnpm typecheck`, `pnpm test`를 각각 실행해 앱 자체 오류인지 분리한다.
3. Node 22 LTS 환경에서 로컬 빌드를 재현해 본다.
4. Vercel 원격 빌드 로그와 로컬 로그를 비교한다.

재현성을 고정하려면 별도 검증 후 `package.json`의 Node engine을 명시적인 LTS 범위로 좁히는 것을 고려한다. 현재는 `>=20.9.0`을 유지했다.

## 8. Netlify 관련 파일의 현재 상태

기존 Netlify 사이트나 설정을 삭제하지 않았다. 저장소에는 `netlify.toml`이 남아 있으며, 로컬 빌드 산출물인 `.netlify/`는 ESLint와 Git에서 제외했다.

Vercel 운영에는 `netlify.toml`이 사용되지 않는다. 기존 Netlify 사이트를 중단하거나 파일을 제거하려면 별도 작업으로 처리한다. 기존 서비스가 아직 트래픽을 받고 있을 수 있으므로 확인 없이 Netlify 프로젝트, 도메인 또는 환경변수를 삭제하지 않는다.

현재 초기 설정·마이그레이션·Vercel 운영 절차는 `docs/operations/initial-setup.md`를 우선 참고한다.

## 9. 저장소와 커밋 시 주의 사항

현재 라이브 배포는 로컬 작업 트리를 CLI로 업로드한 결과이며, Vercel 전환 과정의 변경사항은 아직 Git에 커밋하거나 push하지 않았다.

전환 과정에서 발생한 로컬 변경:

- `.gitignore`: `.vercel`, `.env*` 제외 규칙 추가
- `eslint.config.mjs`: `.netlify`, 일반 빌드 산출물 및 생성 파일 제외 규칙 추가
- `.env.local`: `NEXT_PUBLIC_SITE_URL` 갱신 및 CLI 토큰 자동 추가; Git 제외 대상
- `.vercel/project.json`: Vercel 프로젝트 연결 정보 생성; Git 제외 대상

현재 작업 트리에는 전환 작업과 무관하거나 작업 시작 전부터 존재하던 변경도 있다.

- `HOB_GML_Implementation.md` 삭제 상태
- `next-env.d.ts` 변경 상태
- `tsconfig.json` 변경 상태

특히 `HOB_GML_Implementation.md`는 프로젝트 지침상 명시적 요청 없이 삭제·복원·이동·수정하면 안 된다. 다음 커밋 전에 반드시 변경 주체와 의도를 확인하고, Vercel 관련 변경과 무관한 파일을 실수로 함께 커밋하지 않는다.

또한 Git 연결을 통한 다음 배포는 GitHub에 올라간 소스를 기준으로 새 배포를 만들 수 있다. 따라서 현재 CLI 배포와 Git 저장소의 차이를 검토한 뒤 필요한 Vercel 관련 변경만 의도적으로 커밋하는 것이 안전하다.

## 10. 장애 점검 순서

### 사이트 전체가 열리지 않을 때

1. Vercel 프로젝트의 최신 Production Deployment가 `Ready`인지 확인한다.
2. Domains에서 공개 별칭이 최신 Production Deployment를 가리키는지 확인한다.
3. Build Logs와 Runtime Logs를 확인한다.

### 공개 콘텐츠가 비어 있을 때

1. Production 환경에 Supabase URL과 publishable key가 있는지 확인한다.
2. Supabase에서 해당 콘텐츠의 `status`가 `published`인지 확인한다.
3. RLS 정책이 익명 사용자의 공개 콘텐츠 조회를 허용하는지 확인한다.
4. 관리자에서 저장 후 새로고침하거나 필요하면 재배포한다.

### 관리자 로그인이 실패할 때

1. Supabase Auth에 해당 사용자가 존재하는지 확인한다.
2. `public.profiles`에서 사용자의 역할이 `admin`인지 확인한다.
3. Supabase Auth 로그와 Vercel Runtime Logs를 함께 확인한다.
4. 비밀번호 재설정 링크가 예전 Netlify 주소로 이동하면 Supabase Site URL과 Redirect URLs를 수정한다.

### 사이트맵이나 RSS에 예전 주소가 나올 때

1. Vercel Production의 `NEXT_PUBLIC_SITE_URL`을 확인한다.
2. 값을 수정했다면 새 프로덕션 배포를 생성한다.
3. `/sitemap.xml`, `/robots.txt`, `/rss.xml`을 다시 확인한다.

## 11. 다음 담당자의 권장 후속 작업

1. Supabase Auth의 Site URL과 Redirect URLs를 Vercel 주소로 변경하고 이메일 인증 흐름을 검증한다.
2. 기존 관리자 계정으로 실제 로그인해 프로필 저장, 포트폴리오 발행, 게시글 발행, 미디어 업로드를 확인한다.
3. Vercel의 Production Branch가 `main`인지 확인한다.
4. 현재 작업 트리의 기존 변경과 Vercel 전환 변경을 분리해 필요한 항목만 커밋한다.
5. Git push 자동 배포를 한 번 검증한다.
6. Vercel 운영이 안정된 뒤 기존 Netlify 사이트의 유지·중단 여부를 별도로 결정한다.
