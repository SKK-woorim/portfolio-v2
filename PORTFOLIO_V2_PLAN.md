# Portfolio V2 — 구현 기획서

> 목적: 이 문서만 읽고도 다른 작업 세션이 Portfolio V2를 설계·구현·검수할 수 있도록 확정된 요구사항과 기본 의사결정을 정리한다.

## 1. 프로젝트 개요

현재 운영 중인 포트폴리오를 개인 브랜드와 콘텐츠 운영을 위한 **Portfolio V2**로 전면 개편한다.

- 기존 운영 사이트: `https://elegant-pie-becf65.netlify.app`
- 연결된 GitHub 저장소: `SKK-woorim/skk_Portfolio`
- 현재 배포: Netlify + GitHub `main` 브랜치 연동
- V2의 핵심: 공개 포트폴리오, 블로그, 로그인 기반 관리자 CMS, 실제 데이터베이스와 이미지 저장소

기존 운영 사이트는 유지한다. V2는 별도 브랜치/Deploy Preview에서 개발·검수하고, 기능과 콘텐츠 검수가 끝난 뒤에만 운영 배포를 전환한다.

## 2. 제품 목표

1. 사이트에 들어오자마자 운영자(개발자)의 정체성, 강점, 작업 방식을 빠르게 이해시킨다.
2. 소개 아래에서 포트폴리오 이력을 자연스럽게 탐색하게 한다.
3. 운영자가 코드 수정 없이 관리자 화면에서 포트폴리오 이력과 블로그 글을 관리한다.
4. 관리자 로그인, 권한 검증, 데이터 검증, 이미지 저장, 백업을 갖춘 실제 운영 가능한 백엔드를 구축한다.
5. 신뢰감 있는 블루 계열의 단정하고 빠른 반응형 웹을 제공한다.

## 3. 사용자와 권한

| 사용자 | 목적 | 권한 |
| --- | --- | --- |
| 방문자 | 포트폴리오·프로젝트·블로그 열람 | 발행된 공개 콘텐츠 읽기 |
| 관리자(운영자) | 사이트 콘텐츠 운영 | 로그인, 모든 콘텐츠 CRUD, 이미지 관리, 사이트 정보 수정 |
| 공동 관리자(향후) | 보조 운영 | 역할 기반 권한으로 확장 가능하게 설계 |

초기에는 단일 관리자 계정만 운영한다. 공개 회원가입이나 일반 사용자 로그인은 만들지 않는다.

## 4. 정보 구조와 라우팅

### 공개 영역

| 경로 | 목적 |
| --- | --- |
| `/` | 소개, 대표 이력, 최신 글, 연락처를 한 번에 보여주는 홈 |
| `/portfolio` | 전체 포트폴리오 이력 목록 |
| `/portfolio/[slug]` | 포트폴리오 이력 상세 |
| `/blog` | 블로그 글 목록 및 태그/카테고리 필터 |
| `/blog/[slug]` | 블로그 글 상세 |
| `/about` | 상세 소개, 경력, 기술 스택 |
| `/contact` | 연락처와 외부 링크 |
| `/admin/login` | 관리자 로그인 |

### 관리자 영역

| 경로 | 목적 |
| --- | --- |
| `/admin` | 대시보드: 발행·초안 수, 최근 수정 항목 |
| `/admin/portfolio` | 포트폴리오 이력 목록, 검색, 정렬, 상태 관리 |
| `/admin/portfolio/new` | 포트폴리오 이력 생성 |
| `/admin/portfolio/[id]/edit` | 포트폴리오 이력 수정, 미리보기, 휴지통 이동 |
| `/admin/posts` | 블로그 글 목록 |
| `/admin/posts/new` | 게시글 작성 |
| `/admin/posts/[id]/edit` | 게시글 수정, 미리보기, 발행/비공개/삭제 |
| `/admin/profile` | 소개, 기술, 경력, 연락처, 외부 링크 수정 |
| `/admin/media` | 이미지 업로드와 미디어 관리 |
| `/admin/settings` | 기본 사이트 설정과 관리자 보안 설정 |

`/admin/*` 경로와 관리용 API는 인증된 관리자만 접근할 수 있어야 한다. 공개 사이트의 푸터에만 절제된 `관리자 로그인` 링크를 둔다.

## 5. 공개 홈 화면 요구사항

홈은 별도의 랜딩 전환 없이 곧바로 운영자 소개를 보여준다. 섹션 순서는 아래를 기본으로 한다.

### 5.1 상단 내비게이션

- 이름 또는 개인 워드마크
- 메뉴: 소개, 포트폴리오, 블로그, 연락처
- 모바일 메뉴 지원
- 스크롤 시 읽기 쉬운 고정/반고정 헤더

### 5.2 소개(Hero)

- 이름, 직무, 핵심 한 줄 소개
- “어떤 문제를 어떤 방식으로 해결하는 개발자인가”를 보여주는 짧은 설명
- 주요 관심 분야 또는 기술 키워드
- CTA: `포트폴리오 보기`, `연락하기`
- 선택적 프로필 이미지 또는 절제된 시각 요소
- 모든 문구·링크·이미지는 관리자에서 수정 가능

### 5.3 포트폴리오 이력

소개 아래부터 작업과 경험을 이력처럼 이어서 보여준다.

- 기본 정렬: 관리자가 지정한 노출 순서 → 동일 순서일 경우 최신순
- 홈에는 대표 이력만 노출하고, 전체 보기는 `/portfolio`에서 제공
- 각 카드/타임라인 항목에는 기간, 유형, 제목, 한 줄 요약, 기술 스택, 대표 이미지, 상세 링크를 표시
- 목록이 길어져도 가독성을 유지하도록 타임라인 또는 정돈된 카드 그리드를 사용
- 항목 선택 시 `/portfolio/[slug]` 상세로 이동

### 5.4 최신 블로그 글

- 최근 발행 글 3~5개
- 제목, 요약, 발행일, 태그, 대표 이미지
- 전체 블로그 이동 링크

### 5.5 연락처와 푸터

- 협업·문의 유도 문구
- 이메일, GitHub, LinkedIn 등 외부 링크
- 저작권 및 `관리자 로그인` 링크

## 6. 포트폴리오 이력 CMS 요구사항

관리자는 코드 변경 없이 포트폴리오 이력을 운영할 수 있어야 한다.

### 6.1 이력 데이터 필드

| 필드 | 설명 |
| --- | --- |
| 제목 | 프로젝트명 또는 경험명 |
| slug | 공개 URL용 고유 식별자 |
| 유형 | 프로젝트, 경력, 학습, 수상, 개인 작업 등 |
| 기간 | 연도 또는 시작일/종료일 |
| 한 줄 요약 | 목록과 홈에 노출되는 핵심 설명 |
| 상세 본문 | 문제, 역할, 해결 과정, 결과를 담는 본문 |
| 기술 스택 | 기술/도구 태그 |
| 대표 이미지 | 목록과 상세 상단 이미지 |
| 이미지 갤러리 | 상세 본문용 이미지 |
| 외부 링크 | 라이브 사이트, GitHub, 문서 등 |
| 상태 | 초안, 발행, 숨김, 휴지통 |
| 노출 순서 | 홈과 목록의 수동 정렬 값 |
| 대표 여부 | 홈의 대표 이력 노출 여부 |

### 6.2 관리 기능

- 이력 생성, 수정, 복제, 휴지통 이동, 복원, 영구 삭제
- 초안 상태에서 미리보기 후 발행
- 발행/숨김 전환
- 드래그 앤 드롭 또는 순서 번호로 노출 순서 변경
- 대표 이력 지정
- 제목 기반 slug 자동 제안 및 중복 검증
- 저장 전 필수값·링크·이미지 검증

## 7. 블로그 CMS 요구사항

### 7.1 글 데이터 필드

- 제목, slug, 요약, 본문
- 대표 이미지와 alt 텍스트
- 카테고리와 복수 태그
- 상태: 초안, 발행, 비공개, 휴지통
- 발행일, 생성일, 수정일
- SEO 제목과 설명(기본값은 제목/요약에서 자동 생성)

### 7.2 글 관리 기능

- 새 글 작성, 임시 저장, 수정, 미리보기, 발행, 비공개, 삭제
- `Tiptap` 기반 WYSIWYG 편집기를 사용한다. 제목·링크·이미지·코드 블록·인용문·목록·굵게·기울임을 버튼과 단축키로 쉽게 입력할 수 있어야 한다.
- 에디터 본문은 Tiptap JSON을 PostgreSQL `jsonb` 컬럼에 저장한다. 공개 페이지는 서버에서 허용된 확장만 사용해 안전하게 렌더링하며, 원본 HTML을 신뢰해 그대로 출력하지 않는다.
- 예약 발행은 후속 기능으로 두되, 데이터 모델은 확장 가능하게 설계
- 발행 글만 `/blog`와 RSS에 노출

## 8. 관리자 인증과 보안

1. Supabase Auth의 이메일·비밀번호 로그인만 사용한다. 공개 회원가입은 비활성화하고, 최초 관리자 계정은 Supabase 대시보드에서 생성한다.
2. 비밀번호 저장과 해시는 Supabase Auth에 맡기며, 애플리케이션 DB에 비밀번호 또는 해시를 별도로 저장하지 않는다.
3. 로그인 세션은 `@supabase/ssr`을 이용한 `HttpOnly`, `Secure`, `SameSite` 보안 쿠키로 관리한다.
4. `proxy.ts`와 서버 작업 양쪽에서 로그인 상태와 `profiles.role = 'admin'`을 검증한다.
5. 로그인 요청에는 속도 제한을 적용한다.
6. 모든 생성·수정 작업은 `Zod` 스키마로 서버 측에서 재검증한다.
7. Supabase RLS 정책으로 발행 콘텐츠만 익명 읽기를 허용하고, 관리자만 생성·수정·삭제하도록 강제한다.
8. Supabase Storage의 `media` 버킷은 공개 읽기만 허용하며, 업로드·수정·삭제는 관리자 RLS 정책으로만 허용한다.
9. API 키, DB URL, 인증 비밀값은 Netlify 환경 변수로만 보관하며 저장소에 커밋하지 않는다. `service_role` 키는 브라우저에 절대 전달하지 않는다.
10. 삭제는 기본적으로 소프트 삭제(휴지통)이며, 영구 삭제는 명시적 확인 후 수행한다.
11. 운영 장애 추적을 위한 Sentry, Netlify 배포 로그, Supabase 로그와 데이터베이스 백업 정책을 설정한다. Storage 파일은 DB 백업 범위 밖이므로 별도 복구 절차를 문서화한다.

향후 요구 시 2단계 인증과 다중 관리자 역할을 추가한다.

## 9. 데이터 모델 초안

### 핵심 테이블

| 테이블 | 주요 필드 |
| --- | --- |
| `auth.users` | Supabase Auth가 관리하는 관리자 계정과 비밀번호 해시 |
| `profiles` | id(`auth.users` 참조), role, display_name, created_at |
| `site_profile` | display_name, role_title, headline, bio, avatar_url, contact, social_links |
| `portfolio_items` | id, slug, title, type, summary, content_json, start_date, end_date, status, sort_order, is_featured |
| `portfolio_tags` | portfolio_item_id, tag_id |
| `posts` | id, slug, title, excerpt, content_json, content_text, status, published_at, seo_title, seo_description |
| `tags` | id, name, slug |
| `post_tags` | post_id, tag_id |
| `categories` | id, name, slug |
| `media` | id, storage_key, url, alt, mime_type, size, created_at |
| `audit_logs` | actor_id, action, target_type, target_id, metadata, created_at |

이미지와 본문에 포함되는 모든 미디어는 `media`와 연결 가능해야 하며, 삭제 전 사용 중 여부를 점검한다.

## 10. 디자인 시스템

### 디자인 원칙

- 신뢰감 있는 블루 계열
- 밝은 배경, 충분한 여백, 명확한 정보 위계
- 과도한 그라데이션·유리 효과·애니메이션을 피함
- 둥근 모서리와 그림자는 절제해서 사용
- 공개 사이트와 관리자 화면이 같은 제품으로 느껴지도록 토큰을 공유
- WCAG AA 수준의 텍스트 대비와 키보드 접근성을 기본 목표로 함

### 기본 색상 토큰

| 역할 | 값 |
| --- | --- |
| Primary | `#0B3A78` |
| Primary Action | `#1463C3` |
| Primary Soft | `#EAF3FF` |
| Page Background | `#F5F9FF` |
| Surface | `#FFFFFF` |
| Border | `#D7E4F5` |
| Text Strong | `#172033` |
| Text Muted | `#5E6B80` |
| Success | `#16846B` |
| Danger | `#C83D4B` |

## 11. 확정 기술 스택과 구현 규칙

아래 구성은 V2의 확정 사양이다. 구현 세션은 다른 프레임워크·BaaS·ORM을 새로 도입하지 않고 이 조합을 사용한다. 패키지 버전은 구현 시점의 최신 안정 버전으로 고정하고 lockfile을 커밋한다.

| 영역 | 확정 도구 | 적용 원칙 |
| --- | --- | --- |
| 웹 앱 | Next.js App Router + React + TypeScript | 공개 화면·관리자 화면·서버 로직을 하나의 앱으로 구성 |
| 호스팅 | Netlify | GitHub 연동, 브랜치별 Deploy Preview, 운영 배포 |
| DB | Supabase PostgreSQL | 스키마, 인덱스, RLS, 마이그레이션을 SQL로 관리 |
| 인증 | Supabase Auth + `@supabase/ssr` | 이메일·비밀번호, 쿠키 세션, 관리자 전용 접근 |
| DB 클라이언트 | `@supabase/supabase-js` + 생성 TypeScript 타입 | 별도 ORM(Prisma 등)을 도입하지 않음 |
| 파일 저장 | Supabase Storage `media` 버킷 | 공개 읽기, 관리자만 업로드/수정/삭제 |
| UI | Tailwind CSS + shadcn/ui + Lucide | 블루 기반 디자인 토큰과 접근성 있는 관리자 컴포넌트 |
| 폼·검증 | React Hook Form + Zod + `@hookform/resolvers` | 동일 Zod 스키마를 폼과 서버 작업에서 공통 사용 |
| 글 편집 | Tiptap + StarterKit | JSON 본문 저장, 허용 확장만 렌더링 |
| 이력 정렬 | `@dnd-kit/core` + `@dnd-kit/sortable` | 관리자 목록에서 드래그로 순서 변경 |
| 테스트 | Vitest + Testing Library + Playwright | 단위/컴포넌트/E2E 테스트 분리 |
| 오류 모니터링 | `@sentry/nextjs` | 클라이언트·서버 오류 추적 |

### 11.1 백엔드 경계

- 공개 콘텐츠 읽기: Next.js 서버 컴포넌트에서 Supabase 서버 클라이언트를 사용한다.
- 관리자 CRUD: Next.js Server Actions를 기본으로 사용하고, 각 작업에서 세션·역할·Zod 입력값을 검증한다.
- Route Handlers: 외부 웹훅, 재검증, 필요한 공개 API처럼 HTTP 엔드포인트가 꼭 필요한 경우에만 사용한다.
- 브라우저에는 Supabase publishable key만 노출할 수 있다. `service_role` 키는 서버 전용 환경 변수로만 보관하며 일반 CRUD에 사용하지 않는다.
- 전역 상태 관리 라이브러리(Redux 등)는 도입하지 않는다. 서버 데이터는 서버 컴포넌트와 URL 상태로, 폼 상태는 React Hook Form으로 관리한다.

### 11.2 데이터와 권한 정책

- `portfolio_items`, `posts` 등 모든 공개 테이블에 RLS를 활성화한다.
- 익명 사용자는 `status = 'published'` 행만 `SELECT`할 수 있다.
- `profiles.role = 'admin'`인 인증 사용자만 전체 콘텐츠 CRUD와 미디어 업로드를 할 수 있다.
- 초안·숨김·휴지통 콘텐츠는 관리자에게만 보인다.
- 최초 관리자 계정과 `profiles`의 관리자 역할 부여는 마이그레이션/운영 절차로 명시하고, 공개 회원가입은 비활성화한다.

### 11.3 개발·배포 환경

- `supabase/migrations/`에 테이블, 인덱스, RLS, Storage 정책을 모두 SQL 마이그레이션으로 커밋한다.
- `supabase/seed.sql`에는 개발·테스트용 콘텐츠만 둔다. 실제 운영 데이터와 비밀번호는 커밋하지 않는다.
- DB 스키마 변경 후 Supabase 타입을 생성해 앱에 반영한다.
- Supabase는 최소 `staging`과 `production` 프로젝트를 분리한다. Netlify Deploy Preview는 `staging`만 사용하며 운영 DB·Storage를 변경하지 않는다.
- Netlify 환경 변수는 Local/Preview/Production 컨텍스트를 분리해 설정한다.
- GitHub Actions와 Netlify 배포 전에 `lint`, `typecheck`, `test`, `build`를 통과해야 한다.

### 11.4 필수 패키지

```text
@supabase/supabase-js
@supabase/ssr
tailwindcss
shadcn/ui
lucide-react
react-hook-form
zod
@hookform/resolvers
@tiptap/react
@tiptap/starter-kit
@dnd-kit/core
@dnd-kit/sortable
vitest
@testing-library/react
@playwright/test
@sentry/nextjs
```

## 12. 개발 단계

1. 기존 저장소 구조와 배포 설정 점검, V2 전용 브랜치 생성
2. 디자인 토큰, 라우팅, 공개 홈/목록/상세 화면 골격 구현
3. 데이터베이스 스키마와 마이그레이션, 시드 데이터 구성
4. 관리자 인증과 보호된 `/admin` 레이아웃 구현
5. 포트폴리오 이력 CRUD, 정렬, 발행/미리보기 구현
6. 블로그 CRUD, 태그/카테고리, 발행/미리보기 구현
7. 이미지 업로드와 미디어 관리 구현
8. SEO, RSS, 사이트맵, 오류 화면, 접근성, 반응형 검수
9. Deploy Preview에서 콘텐츠 입력과 기능 테스트
10. 백업·환경 변수·운영 체크리스트를 확인한 뒤 프로덕션 배포

## 13. 완료 기준

- 방문자가 모바일·데스크톱에서 소개, 포트폴리오, 블로그를 정상적으로 탐색한다.
- 첫 화면에서 운영자의 정체성과 핵심 역량을 이해할 수 있다.
- 관리자가 로그인하지 않으면 관리자 경로와 관리 API에 접근할 수 없다.
- 관리자가 포트폴리오 이력과 게시글을 생성·수정·정렬·발행·삭제할 수 있다.
- 발행된 콘텐츠만 공개 사이트에 노출된다.
- 공개 콘텐츠의 URL, 제목, 설명, OG 메타데이터, 사이트맵이 정상 생성된다.
- 이미지와 비밀값이 안전하게 관리된다.
- 기존 운영 사이트는 V2 검수 완료 전까지 변경되지 않는다.

## 14. 범위 밖 항목(초기 버전)

- 방문자 회원가입 및 댓글 기능
- 결제·구독 기능
- 다국어 콘텐츠
- 복수 관리자 세부 권한
- 예약 발행과 고급 분석 대시보드

이 항목들은 데이터 모델과 구조를 막지 않되, MVP 출시를 지연시키지 않도록 후속 단계로 둔다.
