# 웹 표준 현대화(`modern-web-guidance`) 적용 및 인수인계 문서 — 2026-11-17

- **작업 일자**: 2026-11-17
- **적용 기준**: `modern-web-guidance` (`2026_11_10-47b4c80e`) 정적 스캔(`legacy-scan`) 및 세부 가이드(`form-fields-automatically-fit-contents`, `dark-mode`, `animate-to-intrinsic-sizes`, `scroll-progress-indicator`, `dialog`, `light-dismiss-a-dialog`, `prevent-page-scroll-under-modal-dialog`, `html`, `js`)
- **목적**: 명령형 DOM 측정·이벤트 리스너·불필요한 배열 복사 등 레거시 패턴을 최신 웹 플랫폼 표준(CSS·HTML·ES2023)으로 전환하여 **스크롤·타이핑 성능**, **모달·키보드 접근성**, **테마 일관성**, **코드 유지보수성**을 개선한다.

---

## 1. 섹션별 커밋 및 변경 요약

| 섹션 | 커밋 해시 | 제목 | 수정 파일 |
| :--- | :--- | :--- | :--- |
| **섹션 1** | `566d3f2` | Modernize chatbot textarea sizing and root color-scheme CSS | `src/app/layout.tsx`, `src/app/globals.css`, `src/components/chatbot/chatbot-panel.tsx` |
| **섹션 2** | `64d33cc` | Drive ReadProgress on the compositor with scroll-timeline and scaleX | `src/components/read-progress.tsx`, `src/styles/visual-system.css` |
| **섹션 3** | `425a4d5` | Modernize CommandPalette and EvidenceGallery modal dialogs | `src/components/command-palette.tsx`, `src/components/case-evidence/evidence-gallery.tsx`, `src/styles/visual-system.css` |
| **섹션 4** | `0b32893` | Improve HTML semantics and keyboard accessibility across site components | `src/components/site-header.tsx`, `src/components/blog-browser.tsx`, `src/components/markdown-content.tsx` |
| **섹션 5** | `8c9ddf0` | Adopt ES2023 non-mutating array and reverse-search methods | `tsconfig.json`, `src/components/chatbot/chatbot-context.tsx`, `src/components/home/hero-chat-console.tsx`, `src/components/project-visuals/svg-visuals.tsx`, `src/lib/chat/content-version.ts` |
| **후속 보완(§5)** | 이 문서 수정과 같은 커밋 | Fix regressions and guide gaps found in the modern-web review | §5의 표 참고 |

---

## 2. 섹션별 상세 변경 내역 및 동작 원리

### 섹션 1: 챗봇 입력창 자동 높이(`field-sizing`) 및 루트 테마(`color-scheme`)·크기 보간(`interpolate-size`)

* **대상 파일**: `src/components/chatbot/chatbot-panel.tsx`, `src/app/globals.css`, `src/app/layout.tsx`
* **변경 내용**:
  1. **챗봇 `<textarea>` 자동 크기 조절 (`form-fields-automatically-fit-contents`)**:
     * **Before**: `input` 상태가 바뀔 때마다 `useEffect`에서 `textarea.style.height = "auto"` 후 `textarea.scrollHeight`를 읽어 인라인 스타일을 주입(매 타이핑마다 동기 레이아웃 리플로우 발생).
     * **After**: `.chatbot-input-wrap textarea`에 `field-sizing: content; width: 100%; height: auto; min-block-size: 42px; max-block-size: 112px;`를 선언.
     * **정정(§5)**: 최초 커밋은 `useEffect`를 지워 `field-sizing` 미지원 브라우저(Safari 26.2 미만, Firefox 152 미만)에서 입력창이 한 줄로 고정됐다. 지금은 `CSS.supports("field-sizing", "content")`가 거짓일 때만 기존 `scrollHeight` 효과가 동작한다.
     * **유지보수 주의사항**: `textarea`에 `field-sizing: content`를 쓸 때 `width: 100%`를 지우면 긴 placeholder가 한 글자 입력 시 가로로 급격히 줄어들므로 반드시 명시적 가로 폭(`width: 100%`)을 유지해야 한다.
  2. **루트 `color-scheme` 및 `<meta name="color-scheme">` 선언 (`dark-mode`)**:
     * **Before**: `.site-theme` 래퍼에만 `color-scheme`가 지정되어 뷰포트 루트 스크롤바와 초기 캔버스에 테마가 늦게 반영됨.
     * **After**: `src/app/layout.tsx`에서 `export const viewport: Viewport = { colorScheme: "light dark" }`를 내보내고, `src/app/globals.css`의 `:root`에는 `color-scheme: light`, 공개 사이트 래퍼가 있는 문서(`:root:has(.site-theme)`)에만 `dark`, 라이트 테마(`:root[data-site-theme="light"]:has(.site-theme)`)에는 `light`를 선언. 관리자 레이아웃(`src/app/admin/layout.tsx`)은 `viewport.colorScheme: "light"`를 내보낸다.
     * **정정(§5)**: 최초 커밋의 `html[data-site-theme="dark"]` 규칙은 테마 스크립트가 모든 경로의 `<html>`에 속성을 달기 때문에 `/admin`에도 적용되어, "관리자 기본값 보호"가 성립하지 않았다.
  3. **고유 크기 키워드 트랜지션 허용 (`animate-to-intrinsic-sizes`)**:
     * `:root`에 `interpolate-size: allow-keywords;`를 선언하여 하위 컴포넌트에서 `0` ↔ `auto` 크기 트랜지션이 동작하도록 설정.
  4. **챗봇 백드롭 스크롤 체이닝 차단 (`prevent-page-scroll-under-modal-dialog`)**:
     * `.chatbot-backdrop`에 `overflow: hidden; overscroll-behavior: contain;`을 추가하여 백드롭 위에서 휠/터치 스크롤 시 뒤쪽 페이지가 스크롤되지 않도록 차단.

---

### 섹션 2: 읽기 진행 표시줄(`ReadProgress`) 컴포지터 애니메이션 전환

* **대상 파일**: `src/components/read-progress.tsx`, `src/styles/visual-system.css`
* **변경 내용 (`scroll-progress-indicator`)**:
  * **Before**: 스크롤 이벤트마다 `requestAnimationFrame`에서 `getBoundingClientRect()`를 호출하고 `bar.style.width`를 퍼센트 단위로 갱신하여 매 프레임 레이아웃 재계산 발생.
  * **After**:
    * `.read-progress`를 `width: 100%; transform: scaleX(0); transform-origin: 0 50%;`로 고정하고, `@media (prefers-reduced-motion: no-preference)` 및 `@supports (animation-timeline: scroll())` 조건에서 대상 영역의 뷰 타임라인(`.read-progress-target { view-timeline: --read-progress block; }`)에 묶어 `animation: vs-read-progress auto linear both; animation-timeline: --read-progress; animation-range: contain 0% contain 100%;`로 구동. `ReadProgress`가 `targetId` 요소에 `read-progress-target` 클래스를 붙인다.
    * **정정(§5)**: 최초 커밋은 `animation-timeline: scroll(root block)`이라 막대가 본문(`#case-article`)이 아니라 문서 전체 스크롤을 재서, 본문 끝에서 100%에 닿지 않았고 `targetId`가 CSS 경로에서 무시됐다.
    * `ReadProgress` 컴포넌트에서는 `CSS.supports("animation-timeline", "scroll()")`가 참이고 `prefers-reduced-motion: reduce`가 아닐 때 JS 스크롤 리스너 등록을 생략하며, 폴백이 필요한 브라우저에서도 `bar.style.width` 대신 컴포지터 속성인 `bar.style.transform = scaleX(...)`만 갱신.
  * **유지보수 주의사항**: CSS에서 `animation` 단축 속성(shorthand)은 `animation-timeline`과 `animation-range`를 초기화하므로, 반드시 두 속성을 `animation` 선언 **뒤에** 위치시켜야 한다.

---

### 섹션 3: 모달·오버레이(`CommandPalette`, `EvidenceGallery`) 표준화

* **대상 파일**: `src/components/command-palette.tsx`, `src/components/case-evidence/evidence-gallery.tsx`, `src/styles/visual-system.css`
* **변경 내용 (`dialog`, `light-dismiss-a-dialog`, `prevent-page-scroll-under-modal-dialog`)**:
  1. **`CommandPalette` 네이티브 `<dialog>` 전환**:
     * **Before**: `<div className="cmdk-layer"><div className="cmdk" role="dialog" aria-modal="true">` 구조로, 포커스 트랩과 배경 `inert` 처리가 빠져 있어 팔레트가 열린 상태에서 `Tab` 키를 누르면 포커스가 뒤쪽 페이지로 빠져나감.
     * **After**: 네이티브 `<dialog className="cmdk">`와 `dialog.showModal()`을 사용하여 Top Layer 렌더링, 자동 포커스 트랩, 배경 `inert` 격리, `Esc` 닫기, 닫힐 때 호출 버튼으로의 자동 포커스 복원을 브라우저 표준 동작으로 일원화.
  2. **선언적 `closedby="any"` 및 바운딩 박스 Light-Dismiss 폴백**:
     * `CommandPalette`와 `EvidenceGallery`의 `<dialog>` 모두에 `closedby="any"` 속성을 부여.
     * `closedBy in HTMLDialogElement.prototype`를 지원하지 않는 브라우저(Safari 등)를 위해 공용 훅 `useDialogLightDismiss`(`src/components/use-dialog-light-dismiss.ts`)가 `pointerdown`과 `pointerup`이 **모두** `dialog.getBoundingClientRect()` 바깥일 때만 닫는다. 그래서 다이얼로그 안에서 시작한 텍스트 선택 드래그를 배경에서 놓아도 닫히지 않는다.
     * **정정(§5)**: 최초 커밋의 `onClick` 좌표 폴백은 안에서 누르고 바깥에서 뗀 드래그도 바깥 좌표의 `click`으로 받아 닫았으므로, 위 방지 효과가 없었다.
  3. **모달 및 `::backdrop` 오버스크롤 차단**:
     * `.cmdk:modal`과 `.evidence-lightbox:modal`에 `overscroll-behavior: contain;`을, 각 `::backdrop` 의사 요소에 `overflow: hidden; overscroll-behavior: contain;`을 적용(`::backdrop`은 기본값이 `overflow: visible`이라 `overflow: hidden`이 있어야 스크롤 컨테이너가 되어 `overscroll-behavior`가 작동함).

---

### 섹션 4: 시맨틱 HTML 및 키보드 접근성 보완

* **대상 파일**: `src/components/site-header.tsx`, `src/components/blog-browser.tsx`, `src/components/markdown-content.tsx`
* **변경 내용 (`html`)**:
  1. **모바일 내비게이션 메뉴(`#mobile-menu`)**:
     * `inert={!open}`과 `transition-[block-size,max-height]`(`h-auto` / `h-0`)를 추가하여 메뉴가 닫혀 있을 때 하위 포커스 트리와 보조기기 노출을 브라우저 레벨에서 차단하고 `:root`의 `interpolate-size: allow-keywords`와 연동.
  2. **블로그 검색·필터 랜드마크(`<search>`)**:
     * `BlogBrowser`의 검색·필터 래퍼를 `<div>`에서 시맨틱 `<search>` 요소로 변경하여 별도 ARIA 없이 보조기기에 검색 영역 랜드마크를 노출.
  3. **마크다운 코드 블록 및 표 접근성**:
     * `MarkdownContent`의 가로 스크롤 코드 블록(`<pre className="... overflow-x-auto ...">`)에 `tabIndex={0}`, `role="region"`, `aria-label`을 추가하여 키보드 전용 사용자도 코드 블록에 초점을 맞추고 좌우 스크롤할 수 있도록 개선.
     * 마크다운 표의 `<thead>` 내 `<th>`에 `scope="col"`을 명시.

---

### 섹션 5: ES2023 비변이 배열 메서드 적용

* **대상 파일**: `tsconfig.json`, `src/components/chatbot/chatbot-context.tsx`, `src/components/home/hero-chat-console.tsx`, `src/components/project-visuals/svg-visuals.tsx`, `src/lib/chat/content-version.ts`
* **변경 내용 (`js/copying-array-methods`)**:
  * `tsconfig.json`의 `target`과 `lib`를 `ES2022`에서 `ES2023`으로 상향(`package.json`의 `engines.node: ">=20.9.0"`과 일치).
  * `[...messages].reverse().find(...)` → `messages.findLast(...)` (`chatbot-context.tsx`)
  * 역방향 `while` 인덱스 탐색 루프 → `messages.findLastIndex(...)` 및 `.findLast(...)` (`hero-chat-console.tsx`)
  * `[...tail].reverse()` → `tail.toReversed()` (`svg-visuals.tsx`)
  * `[...projects].sort(bySlug)` / `[...posts].sort(bySlug)` → `projects.toSorted(bySlug)` / `posts.toSorted(bySlug)` (`content-version.ts`)

---

## 3. 의도적으로 보류(유지)한 항목 및 기술적 사유

인수인계 후 불필요한 재작업이나 테스트 파손을 막기 위해 아래 항목들은 현재 구조를 유지하기로 결정했다.

1. **`src/lib/health/readiness.ts`의 `runBounded` (`js/promise-with-resolvers`)**:
   * `legacy-scan`에서 `new Promise<never>((_, reject) => { rejectCancellation = reject; })`를 `Promise.withResolvers()`로 교체하라는 제안을 출력하나, `Promise.withResolvers()`는 ES2024 / Node 22+ 기능이므로 현재 `engines.node: ">=20.9.0"` 기준에서 제외(`dropWhen`)된다.
   * 또한 `Promise.race([operation(controller.signal), cancellation])`를 제거하고 `AbortSignal.timeout()`만 넘기면, `signal` 이벤트를 무시하는 비협조적 비동기 함수(예: `src/lib/health/readiness.test.ts` 109행의 무한 대기 Mock Promise)를 강제로 타임아웃시킬 수 없으므로 현재의 `Promise.race` 구조를 그대로 유지해야 한다.
2. **`ChatbotPanel` 루트 요소의 커스텀 `<div role="dialog">` 유지**:
   * `ChatbotPanel`은 데스크톱에서 우측 하단 플로팅 위젯 형태로 동작하며, 이미 수동 포커스 트랩·`Escape` 닫기·포커스 복원이 구현되어 있다.
   * 또한 `src/components/chatbot/chatbot-widget.test.ts`(121행)에서 `document.body.classList.contains("chatbot-scroll-locked")`를 직접 검증하고 있고, Vitest(`jsdom`) 환경은 `<dialog>.showModal()`을 기본 지원하지 않으므로, 기존 테스트 계약을 보존하면서 `.chatbot-backdrop`의 오버스크롤 차단과 `<textarea>`의 `field-sizing: content`만 적용했다.
3. **`BlogBrowser` `<input>`의 `type="text"`(기본값) 유지**:
   * `<search>` 랜드마크는 바깥 컨테이너에 적용하되, 내부 `<input>`에 `type="search"`를 주면 암묵적 ARIA role이 `textbox`에서 `searchbox`로 바뀌어 `src/components/blog-browser.test.ts`(69행) 및 `e2e/public-site.spec.ts`(28행)의 `getByRole("textbox", { name: /글 검색/ })` 셀렉터가 깨진다. 따라서 `<input>`의 기본 role(`textbox`)은 그대로 유지한다.
4. **`SiteHeader` `#mobile-menu` 내부 링크의 `tabIndex={open ? 0 : -1}` 유지**:
   * 부모 `#mobile-menu`에 `inert={!open}`을 추가했더라도, `e2e/accessibility-theme.spec.ts`(32행)에서 `toHaveAttribute("tabindex", "-1")`을 명시적으로 검증하므로 하위 링크의 `tabIndex` 속성도 함께 유지한다.

---

## 4. 검증 명령어 및 결과

변경 후 아래 명령어로 정적 타입 검사, 린트, 전체 유닛 테스트, 브라우저 테스트, `legacy-scan` 재검증을 수행할 수 있다. CSS·다이얼로그·포커스 동작은 jsdom에서 확인되지 않으므로 `pnpm test:e2e`도 검증에 포함한다.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
npx -y modern-web-guidance@latest legacy-scan . --json
```

* **`pnpm typecheck`**: 오류 0건 통과
* **`pnpm lint`**: 경고·오류 0건 통과
* **`pnpm test`**: 전체 테스트 스위트 통과
* **`legacy-scan`**: 적용 대상 5건(`form-fields-automatically-fit-contents` 1건, `js/copying-array-methods` 4건) 모두 해소 확인 (의도적 보류 항목인 `readiness.ts`의 ES2024 `js/promise-with-resolvers` 1건만 유지)

---

## 5. 후속 검토 및 보완 (2026-11-17)

위 1~5 섹션을 가이드 원문(`dialog`, `light-dismiss-a-dialog`, `dark-mode`, `form-fields-automatically-fit-contents`, `scroll-progress-indicator`, `ime-safe-enter-submit`, `responsive-table`, `html`)과 실제 브라우저(Chromium)로 다시 검토해 아래 항목을 보완했다. 위 §2의 해당 문장도 함께 고쳤다.

| # | 문제 | 변경 | 수정 파일 |
| :--- | :--- | :--- | :--- |
| 1 | 테마 스크립트가 모든 경로의 `<html>`에 `data-site-theme`을 달아, 다크 OS에서 라이트 전용인 `/admin/login`의 루트 `color-scheme`이 `dark`로 계산됨(검토 시 확인). | 루트 테마 규칙을 `:root:has(.site-theme)`(기본 `dark`)와 `:root[data-site-theme="light"]:has(.site-theme)`(`light`, 명시도 우선)로 한정. 관리자 레이아웃이 `viewport.colorScheme: "light"`를 내보내 `<meta name="color-scheme" content="light">`만 출력(세그먼트 `viewport`는 얕게 병합되어 루트 값을 대체). | `src/app/globals.css`, `src/app/admin/layout.tsx` |
| 2 | `field-sizing` 미지원 브라우저(Safari 26.2 미만, Firefox 152 미만)에서 챗봇 입력창이 한 줄로 고정됨. | `CSS.supports("field-sizing", "content")`가 거짓일 때만 기존 높이 계산 `useEffect`(최대 112px)를 실행. 지원 브라우저는 CSS 경로 그대로. | `src/components/chatbot/chatbot-panel.tsx` |
| 3 | 읽기 진행 막대가 CSS 경로에서 문서 전체를 재서 본문 끝에서 약 95%(검토 시 0.9495)에 머물고, JS 폴백(본문 기준)과 동작이 달랐음. | `ReadProgress`가 `targetId` 요소에 `read-progress-target` 클래스를 붙이고, CSS가 그 요소의 `view-timeline: --read-progress block`과 `animation-range: contain 0% contain 100%`, `animation-fill-mode: both`로 막대를 구동. `@supports`·감속 모션 조건, `transform`만 쓰는 애니메이션, JS 폴백은 유지. | `src/components/read-progress.tsx`, `src/styles/visual-system.css` |
| 4 | 두 다이얼로그의 `click` 좌표 폴백이 안에서 누르고 배경에서 뗀 드래그에도 닫힘. 같은 코드가 두 벌. | 공용 훅 `useDialogLightDismiss`로 통합. `pointerdown`·`pointerup`이 모두 바깥일 때만 닫고, `closedBy`를 지원하면 아무것도 하지 않음. `closedby="any"`는 유지. | `src/components/use-dialog-light-dismiss.ts`, `src/components/command-palette.tsx`, `src/components/case-evidence/evidence-gallery.tsx` |
| 5 | 명령 팔레트에 보이는 닫기 버튼이 없어 터치·음성 제어 사용자는 배경만으로 닫아야 했음. | 입력 줄에 `<button type="button" aria-label="검색 닫기">`(40px, `focus-ring`)를 추가해 `closePalette` 호출. 방향키·Enter 처리를 다이얼로그에서 검색어 입력으로 옮겨, 닫기 버튼에서 Enter가 선택 항목을 실행하지 않고 버튼을 누르게 함. | `src/components/command-palette.tsx`, `src/styles/visual-system.css` |
| 6 | Safari는 IME 확정 Enter보다 `compositionend`를 먼저 전달해 `isComposing`만으로는 조합 중 Enter를 걸러내지 못함. | 가이드 패턴대로 Enter에서 먼저 `preventDefault()` 후 `isComposing || keyCode === 229`이면 중단. Shift+Enter(줄바꿈)는 막지 않음. | `src/components/chatbot/chatbot-panel.tsx`, `src/components/command-palette.tsx` |
| 7 | 가로 스크롤되는 마크다운 표 래퍼와 공개 저장 용량 표 래퍼가 키보드로 초점을 받지 못함. | `tabIndex={0}`, `role="region"`, `aria-label`(마크다운: "표", 저장 용량: "`{차트 제목}` 표"), `focus-ring` 추가. 관리자 표는 범위 밖. | `src/components/markdown-content.tsx`, `src/components/case-evidence/storage-chart.tsx` |

### 테스트

* **유닛(jsdom)**: `src/components/use-dialog-light-dismiss.test.ts`(바깥 누름·뗌이면 닫힘, 안에서 누르고 바깥에서 떼면 유지, 안에서 누르고 떼면 유지, `closedBy` 지원 시 무동작), `src/components/command-palette.test.ts`(`keyCode: 229` Enter 무시, 일반 Enter 실행, 닫기 버튼 Enter 미차단·클릭 시 닫힘), `src/components/chatbot/chatbot-panel.test.ts`(`keyCode: 229` Enter 미전송, Shift+Enter 미차단, `field-sizing` 미지원 시에만 `112px` 인라인 높이), `src/components/markdown-content.test.ts`(표 래퍼 region).
* **브라우저(`e2e/modern-web.spec.ts`)**: 다크 OS에서 `/admin/login` 루트 `color-scheme`이 `light`이고 메타가 `light`, `/about`은 `dark`, 저장된 라이트 선호에서는 `light` / 첫 프로젝트 상세에서 막대 `scaleX`가 이전 공식 `clamp(-rect.top / (rect.height - innerHeight), 0, 1)`과 0.01 이내 / 팔레트를 "검색 열기"로 열면 입력에 초점, 닫기 버튼·Esc·닫기 버튼 Enter로 닫히고 초점이 호출 버튼으로 복귀 / 모바일 메뉴는 닫혀 있을 때만 `inert`. 설명 제목에 "chatbot"이 없어 CI(`--grep-invert chatbot`)에서도 실행된다.
* **`e2e/public-site.spec.ts`의 챗봇 출처 테스트 재작성**: 홈에서는 히어로 콘솔이 보이는 동안 떠 있는 실행 버튼이 숨고, 클릭하던 추천 문구와 확인하던 상태 문구가 바뀌어 실패하던 테스트를 `/about`에서 `data-availability="enabled"`를 기다린 뒤 질문을 입력하고, `data-phase="complete"`·`data-delivery="complete"` 답변·"답변 출처"의 링크 `href`·Esc 닫기·실행 버튼 초점 복귀를 확인하도록 고쳤다.

### 검증 결과 (이번 작업에서 직접 실행)

* `pnpm typecheck`: 오류 0건 / `pnpm lint`: 경고·오류 0건 / `pnpm test`: 48개 파일, 268개 통과(기존 258개 + 신규 10개) / `pnpm build`: 성공.
* `pnpm test:e2e`: 19개 모두 통과. 같은 저장소에서 `next dev`가 이미 3111 포트로 실행 중이면 Next가 두 번째 개발 서버를 거부하므로, 3000 포트를 실행 중인 개발 서버로 넘겨 Playwright가 기존 서버를 재사용하게 했다. 챗봇을 켜지 않고 빌드한 `next start` 서버로 돌렸을 때는 이름에 "chatbot"이 든 4개(CI에서 제외되는 테스트)만 실패하고 나머지 15개는 통과했다.
* 읽기 진행 막대 수치(Chromium, 1280×720, `/portfolio/samsung-sdi-multi-agent-mlops-poc`, 이전 공식 → 막대 `scaleX`): `scrollY` 0 → 0 / 0, 300 → 0.0392 / 0.0392, 1514 → 0.2419 / 0.2419, 3028 → 0.4946 / 0.4946, 4542 → 0.7473 / 0.7473, 본문 끝 6056 → 1 / 1, 문서 끝 6374 → 1 / 1.
* `src/app/global-error.tsx`는 Next 문서상 전역 스타일을 포함하지 않고 자체 인라인 `:root` 규칙으로 테마를 정하므로 이번 CSS 변경의 영향을 받지 않는다고 판단했다(브라우저에서 직접 띄워 확인하지는 않음).
