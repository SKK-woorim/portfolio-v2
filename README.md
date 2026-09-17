# Portfolio V2

개인 브랜드, 포트폴리오 이력, 블로그, 관리자 CMS를 하나로 운영하는 Next.js 애플리케이션입니다.

## 시작하기

```bash
pnpm install
pnpm dev
```

로컬에서 예시 프로필을 보려면 `.env.local`에 `NEXT_PUBLIC_CONTENT_DEMO_MODE=true`를 명시적으로 설정합니다. 공개 글·프로젝트와 관리자 CMS는 `.env.example`을 참고해 Supabase 환경 변수를 설정한 뒤 사용할 수 있습니다. 데모 모드는 운영 환경에서 동작하지 않습니다.

## 확인 명령

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 주요 문서

- 제품 요구사항: `PORTFOLIO_V2_PLAN.md`
- 디자인 기준: `docs/design/portfolio-design.md`
- Supabase 마이그레이션: `supabase/migrations/`의 모든 SQL을 파일명 사전순으로 적용
- 초기 설정·배포 운영: `docs/operations/initial-setup.md`
