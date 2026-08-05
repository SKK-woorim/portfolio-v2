# Portfolio V2

개인 브랜드, 포트폴리오 이력, 블로그, 관리자 CMS를 하나로 운영하는 Next.js 애플리케이션입니다.

## 시작하기

```bash
pnpm install
pnpm dev
```

로컬에서 Supabase를 연결하지 않아도 예시 콘텐츠로 공개 화면을 확인할 수 있습니다. 실제 관리자 로그인과 CMS는 `.env.example`을 참고해 Supabase 환경 변수를 설정한 뒤 사용할 수 있습니다.

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
- Supabase 마이그레이션: `supabase/migrations/202608050001_initial_schema.sql`
- 초기 설정·배포 운영: `docs/operations/initial-setup.md`
