# 성능·SEO·미디어 전송 개선 기획서

- 관련 항목: `PERF-01`~`PERF-03`, `SEO-01`
- 원칙: 측정 전에는 최적화 효과를 단정하지 않고, 운영 URL의 병목을 기준으로 변경한다.

## 1. 배경과 문제

현재 공개 카드와 상세 대표 이미지는 `next/image`와 반응형 `sizes`를 사용하고, 콘텐츠 조회에는 cache와 재검증 태그가 적용되어 있다. metadata, canonical, OG, JSON-LD, sitemap, RSS, robots도 마련되어 있다.

그러나 Pretendard는 jsDelivr에 의존하고, OG 및 연락처 원본 PNG는 직접 요청 또는 첫 이미지 변환 비용이 크다. Markdown 본문 이미지는 일반 `<img>`로 렌더링되어 크기 예약과 최적화 경로가 없다. 운영 Core Web Vitals, cold/warm TTFB, route별 client JS와 실제 이미지 전송량의 기준선도 문서화되어 있지 않다.

## 2. 목표와 예산

| 영역 | 목표 |
| --- | --- |
| 모바일 Core Web Vitals | p75 LCP ≤ 2.5초, INP ≤ 200ms, CLS ≤ 0.1 |
| 서버 응답 | 공개 목록·상세 warm TTFB p95의 기준선 대비 회귀 없음 |
| 글꼴 | 외부 CDN 장애 없이 Pretendard 또는 안정적인 system fallback 표시 |
| OG 이미지 | 1200×630 유지, 가독성을 보존하며 400KB 이하 목표 |
| 본문 이미지 | 표시 폭보다 과도한 원본 전송 방지, 명시적 크기 예약 |
| 검색 메타데이터 | production canonical·OG·JSON-LD·sitemap·RSS 검증 오류 0건 |

수치는 동일 기기·네트워크·콘텐츠에서 최소 3회 측정하고 중앙값을 기록한다. 실사용 p75가 수집되면 lab 결과보다 우선한다.

## 3. 측정 기준선

### 측정 경로

- `/`
- `/portfolio`
- 대표 이미지 있는 `/portfolio/[slug]`
- `/blog`
- 대표 이미지와 긴 Markdown이 있는 `/blog/[slug]`
- `/contact`
- 챗봇 닫힘과 열림 상태

### 기록 항목

- LCP 요소, LCP/INP/CLS
- cache cold/warm TTFB p50·p95
- HTML과 RSC payload, route client JS, hydration 비용
- 이미지별 실제 전송 bytes와 선택된 `srcset`
- 글꼴 요청 수, 시작·완료 시각, fallback 전환
- Supabase 쿼리 수·duration·payload
- Sentry 초기화가 client bundle과 요청에 미치는 영향

측정 결과는 이후 `docs/reviews/`의 날짜별 보고서로 보관한다. 제안 기능 때문에 지표가 좋아졌다고 가정하지 않는다.

## 4. 글꼴 전달 개선

### 방향

- Pretendard Variable의 필요한 WOFF2 파일과 라이선스를 `public/assets/fonts/pretendard/`에 보관한다.
- CSS 외부 stylesheet와 `preconnect`를 제거하고 framework font loader 또는 로컬 `@font-face` 중 현재 Next.js 버전에 맞는 방식을 적용한다.
- 한국어 glyph 범위와 실제 파일 수를 확인해 과도한 weight 분할을 피한다.
- `font-display: swap` 또는 optional을 실측 비교하고 한글 제목의 레이아웃 이동을 확인한다.
- system fallback의 metrics 차이가 큰 경우 size-adjust 계열 설정 가능성을 검토한다.

### 완료 조건

- CDN을 차단해도 사이트가 Pretendard 또는 의도한 fallback으로 읽힌다.
- 첫 화면에서 불필요한 font 파일을 여러 개 요청하지 않는다.
- 글꼴 전환으로 CLS 예산을 넘지 않는다.
- 라이선스 파일과 출처를 함께 보관한다.

## 5. 이미지 파이프라인

### 5.1 업로드 정규화

- 업로드 직후 서버에서 실제 이미지를 디코딩하고 width, height, format을 추출한다.
- EXIF와 불필요한 메타데이터를 제거한다.
- 사진은 품질 기준을 둔 WebP 또는 AVIF 파생본, 선명한 UI·도식은 PNG/WebP 비교 후 결정한다.
- 원본 보존 여부와 최대 해상도를 운영 정책으로 정한다. 기본은 긴 변 2560px 이하의 정규화본을 공개용으로 사용한다.
- `media`에 width, height, blur placeholder 또는 dominant color, checksum을 저장한다.
- content hash 또는 UUID 기반 immutable URL을 유지하고 같은 URL의 파일을 덮어쓰지 않는다.

### 5.2 공개 렌더링

- 대표 이미지는 현재 `next/image`를 유지하고 실제 카드 폭에 맞게 `sizes`를 검증한다.
- Markdown의 내부 미디어는 파싱 단계에서 `media` 메타데이터와 연결해 크기 영역을 예약한다.
- 외부 이미지는 허용 정책, 크기 예약 불가 경고와 lazy loading을 적용한다.
- 첫 viewport의 실제 LCP 이미지 한 개만 우선 로드한다. 여러 `priority` 후보가 대역폭을 경쟁하지 않는지 확인한다.
- 이미지 없는 콘텐츠는 현재 포트폴리오의 코드 기반 비대표 시각 요소 또는 이미지 없는 블로그 카드 레이아웃을 일관되게 유지한다. OG 이미지를 모든 글의 기본 썸네일로 반복 사용하지 않는다.

### 5.3 정적 이미지

- `public/og.png`는 텍스트 선명도와 소셜 플랫폼 호환성을 확인하며 압축한다.
- 연락처 이미지는 WebP/AVIF 파생본과 PNG를 비교하고, 투명도나 선명도 손실이 없으면 더 작은 형식을 사용한다.
- 변환 전후를 육안 검수하고 원본은 필요 시 `deliverables/` 또는 제작 원본 위치에 분리 보관한다.

## 6. 데이터 조회와 cache

- 목록은 본문 원문 없이 카드에 필요한 필드만 조회하는 현재 원칙을 유지한다.
- 콘텐츠 변경 시 경로와 cache tag가 모두 무효화되는지 통합 테스트한다.
- 현재 사용 중인 cache API는 Next.js 16.3 로컬 문서의 지원 상태와 deprecation 안내를 구현 시점에 확인하고 안정 API로 이동한다.
- DB 오류와 정상 빈 결과를 같은 빈 배열로 취급하지 않는다. 방문자 화면은 안전한 빈 상태를 보여도 관측 시스템에는 원인을 남긴다.
- 상세 경로 수가 늘어날 때만 사전 생성 범위와 요청 시 생성을 조정한다.
- cache TTL을 바꾸기 전 cold/warm TTFB와 콘텐츠 반영 지연을 함께 비교한다.

## 7. SEO와 공유 검증

### 7.1 URL 정책

- production build에서는 신뢰할 수 있는 site URL이 없으면 명확히 실패시키거나 배포 검증을 실패 처리한다.
- Preview에서는 production canonical을 유지할지 `noindex`와 preview origin을 쓸지 정책을 하나로 고정한다.
- forwarded host 값을 검증 없이 metadata base로 사용하지 않는다.
- slug 변경을 허용하면 이전 slug와 새 slug의 영구 리디렉션 테이블을 도입한다.

### 7.2 콘텐츠 메타데이터

- 상세 페이지는 콘텐츠별 제목·설명·발행일·수정일·대표 이미지를 사용한다.
- 대표 이미지가 없는 상세는 전역 OG를 암묵적으로 상속할지, 이미지를 비울지 현재 정책을 테스트로 고정한다.
- JSON-LD는 공개 화면과 실제 DB 값이 일치하고, 비공개 콘텐츠를 참조하지 않아야 한다.
- sitemap `lastModified`는 실제 `updated_at`, RSS는 발행일과 절대 URL을 사용한다.
- 모든 OG 이미지에 절대 URL, 크기와 alt를 제공한다.

### 7.3 자동 검사

- 배포 후보 URL에서 root와 대표 상세 2건의 title, description, canonical, Open Graph, X card를 검사한다.
- sitemap과 RSS의 URL origin, 상태 코드, XML 파싱을 검사한다.
- JSON-LD를 JSON으로 파싱하고 필수 필드와 내부 URL을 검사한다.
- 관리자와 Preview 환경의 robots/noindex 정책을 확인한다.

## 8. 단계별 구현

### 1차: 기준선과 빠른 개선

- 운영 성능 기준선 기록
- OG·연락처 이미지 무손실 또는 시각 품질 유지 압축
- production site URL 검증
- metadata·sitemap·RSS 자동 smoke test

### 2차: 글꼴과 업로드

- Pretendard 자체 호스팅
- 업로드 width/height/checksum 추출과 정규화
- 미디어 DB 메타데이터 마이그레이션

### 3차: 본문 이미지와 cache

- 내부 Markdown 이미지의 크기 예약과 최적화
- cache API 정비와 오류·빈 상태 분리
- 운영 Web Vitals 회귀 경보

## 9. 테스트 계획

- CDN과 외부 이미지 origin을 차단해도 핵심 텍스트와 레이아웃이 정상이다.
- 업로드한 JPEG/PNG/WebP/AVIF의 크기·형식 메타데이터가 실제 파일과 일치한다.
- 세로·가로·초대형·투명 이미지에서 왜곡과 CLS가 없다.
- 내부 본문 이미지는 lazy load되며 첫 화면 LCP 이미지만 우선 처리된다.
- production URL 누락 또는 잘못된 scheme에서 배포 검증이 실패한다.
- 발행·수정·비공개 전환 후 공개 페이지, sitemap, RSS cache가 기대대로 갱신된다.
- 대표 이미지 없는 상세 페이지의 OG 정책이 테스트와 일치한다.

## 10. 완료 기준

- 운영 URL의 성능 기준선과 변경 후 결과가 동일 양식으로 기록된다.
- Pretendard 표시가 외부 CSS CDN에 의존하지 않는다.
- 정적·CMS 이미지가 시각 품질을 유지하면서 예산 안에서 전달된다.
- Markdown 내부 이미지가 크기 예약과 안전한 로딩 정책을 사용한다.
- 배포 전에 canonical, OG, JSON-LD, sitemap, RSS의 주요 오류를 자동으로 발견한다.
