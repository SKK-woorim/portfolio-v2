# 관리자 화면(`/admin`) 웹 표준 현대화(`modern-web-guidance`) 작업 기록 — 2026-11-17

- **작업 일자**: 2026-11-17
- **선행 문서**: [`modern-web-guidance-handover-2026-11-17.md`](./modern-web-guidance-handover-2026-11-17.md) — 공개 사이트 현대화 때 "관리자 화면은 범위 밖"으로 남긴 후속 작업이다.
- **적용 가이드 id**: `dialog`, `ime-safe-enter-submit`, `forms`, `autofill-sign-in-form`, `autofill-sign-up-form`, `responsive-table`, `navbar`, `accessibility`, `copy-button`, `optimize-image-priority`, `form-fields-automatically-fit-contents`, `accessible-error-announcement`(라이브 영역 주의 사항만)
- **범위**: `src/app/admin/**`, `src/components/admin/**`, `src/components/markdown-editor.tsx`, `src/components/ui/button.tsx`, 공용 CSS(`src/app/globals.css`) 추가분. 서버 액션·검증·DB 쿼리·콘텐츠 상태 전이 규칙(`@/lib/content/status`)은 바꾸지 않았다.
- **커밋**: 아직 없음(작업 트리 변경만 있음).

---

## 1. 새로 만든 공용 모듈

| 파일 | 역할 |
| :--- | :--- |
| `src/components/admin/confirm-dialog.tsx` | `window.confirm`을 대신하는 네이티브 모달 확인 창(§2-2) |
| `src/components/admin/form-status.tsx` | 서버 액션 결과 메시지(오류 `role="alert"`, 성공은 상시 `role="status"`)(§2-7) |
| `src/components/admin/password-field.tsx` | 비밀번호 입력 + `aria-pressed` 표시 토글(§2-3, §2-4) |
| `src/components/ui/field-classes.ts` | 입력·select·textarea 공용 클래스, 16px 글꼴, textarea 자동 높이(§2-8) |
| `src/test-utils/native-dialog.ts` | jsdom용 `showModal`/`close`/`<form method="dialog">` 흉내(테스트 전용) |
| `src/app/globals.css` 추가분 | `.admin-dialog`(모달 가운데 정렬·스크롤 차단), `.focus-ring-inset`(안쪽 포커스 표시) |
| `src/components/ui/button.tsx` | `danger` 변형 추가, React 19 `ref` prop을 받도록 타입을 `ComponentPropsWithRef<"button">`로 변경 |

---

## 2. 항목별 Before / After

### 2-1. 본문 이미지 선택 창 → 네이티브 `<dialog>` (`dialog`, `optimize-image-priority`)

* **대상**: `src/components/markdown-editor.tsx`, `src/components/markdown-editor.test.ts`, `src/app/globals.css`
* **Before**: `<div class="fixed inset-0 …"><section role="dialog" aria-modal="true">` 구조. 수동 Tab 트랩·Escape 처리·`requestAnimationFrame` 포커스 복원. 배경은 `inert`가 아니고 뒤 페이지 스크롤도 막지 않음. 열릴 때 제목(`tabIndex=-1`)에 포커스.
* **After**:
  * 항상 렌더링되는 `<dialog className="admin-dialog …" closedby="any">`를 `showModal()`로 연다. 내용은 열려 있을 때만 마운트한다(닫힌 상태에서 썸네일·입력이 렌더링되지 않음).
  * `role`, `aria-modal`, 수동 Tab 트랩(`onDialogKeyDown`), Escape 처리, 닫을 때의 수동 포커스 복원(`imageButtonRef`), 제목 포커스(`dialogTitleRef`)를 지웠다. 포커스 복귀는 브라우저가 호출 요소(이미지 넣기 버튼, Ctrl/Cmd+I로 열었다면 본문 textarea)로 한다.
  * 닫기 버튼·취소·삽입은 `dialog.close()`만 부르고, React 상태(`isMediaDialogOpen`)는 `onClose`에서 맞춘다. 그래서 Esc·바깥 클릭으로 닫혀도 상태가 어긋나지 않는다.
  * 바깥 클릭 닫기: `closedby="any"` + 기존 `useDialogLightDismiss` 훅(미지원 브라우저용 좌표 폴백).
  * 초기 포커스: React `autoFocus`는 마운트 때만 동작하므로 쓰지 않고, `isMediaDialogOpen`이 참이 된 뒤 effect에서 검색 입력에 `focus()`한다.
  * 이미지 삽입 뒤 textarea로 포커스·커서를 옮기는 기존 동작은 유지(닫힘 → 브라우저 포커스 복귀 → 다음 프레임에 textarea 포커스).
  * CSS(`globals.css`의 `.admin-dialog`): `margin: auto`(Tailwind preflight가 0으로 초기화한 UA 가운데 정렬 복구), `:modal { overscroll-behavior: contain }`, `::backdrop { overflow: hidden; overscroll-behavior: contain; background: rgb(0 0 0 / .45) }`. `<dialog>`에는 `display` 유틸리티를 주지 않는다. 폭은 기존 `p-4` 여백을 대신해 `w-[calc(100%-2rem)] max-w-3xl`.
  * 선택 목록 썸네일 `<img>`에 `loading="lazy" decoding="async"`.
  * 검색 입력 줄 `<label>`에 `focus-within` 테두리를 더했다(입력이 `outline-none`이라 포커스 표시가 없었음).
  * **Enter의 암묵적 제출 차단(검토 후 보완)**: 선택 창은 게시글·포트폴리오 `<form>` 안에 있어(포털로 옮기지 않음), 창 안의 검색·대체 텍스트 입력에서 Enter를 누르면 바깥 콘텐츠 폼이 제출되어 저장까지 일어났다(Chromium에서 재현). `<dialog onKeyDown>`에서 대상이 `<input>`이고 Enter이면 `preventDefault()`한다. `ime-safe-enter-submit` 패턴대로 막는 일을 먼저 하므로 IME 확정 Enter(`isComposing`, `keyCode === 229`)도 어떤 동작으로 이어지지 않는다. Enter에 새 동작(예: 이미지 삽입)은 붙이지 않았다. 버튼(Enter로 누름)과 `type="file"`(Enter로 파일 창 열기)은 그대로 두고, Space는 건드리지 않는다. 체크박스의 Enter는 기본 동작이 암묵적 제출뿐이라 함께 막는다.

### 2-2. `window.confirm` 두 곳 → 공용 확인 다이얼로그 (`dialog` Rule 1)

* **대상**: `src/components/admin/confirm-dialog.tsx`(신규), `content-status-actions.tsx`, `chatbot-reindex-controls.tsx`
* **Before**: 휴지통 이동과 전체 재인덱싱이 `window.confirm`.
* **After** (`ConfirmDialog`):
  * 네이티브 모달(`showModal()`), `aria-labelledby`(제목 `<h2>`), 설명이 있으면 `aria-describedby`.
  * 버튼은 `<form method="dialog">`의 `value="cancel"` / `value="confirm"`. `close` 이벤트에서 `returnValue`를 읽고 즉시 `''`로 되돌린다. `''`(Esc 포함)는 취소.
  * `closedby`를 주지 않아 모달 기본값(Esc만 닫힘, 바깥 클릭 무시).
  * 열자마자 **취소 버튼**에 포커스(`showModal()` 직후 `focus()`; React `autoFocus`는 네이티브 `autofocus` 속성을 남기지 않아 `showModal()`의 초기 포커스에 쓰이지 않음).
  * 스크롤 차단 CSS는 §2-1과 같은 `.admin-dialog`.
* `ContentStatusActions`: 확인이 필요한 전이(현재 `trash`)는 `confirming` 상태로 창을 열고, 확인 시에만 기존 `run()`을 실행한다. 문구는 기존 한 문장을 제목("이 콘텐츠를 휴지통으로 옮길까요?")과 설명("언제든 복구할 수 있습니다.")으로 나눴고, 확인 버튼은 "휴지통으로 옮기기"(새 문구).
* `ReindexAllControl`: `onSubmit`에서 기본 제출을 막고 창을 연다. 확인하면 승인 표시(`approvedRef`)를 세우고 `form.requestSubmit()`으로 **같은 폼을 다시 제출**한다. 그래서 `useActionState` 경로·`pending`·`confirmed=true` 필드가 기존과 같다. 확인 창은 `<form method="dialog">`가 제출 폼 안에 중첩되지 않도록 형제로 두고 `<div>`로 감쌌다.
* `markdown-editor.tsx`의 "저장하지 않은 변경" 링크 이동 경고(`window.confirm`)는 동기 판단이 필요해 그대로 두었다.

### 2-3. 로그인 폼 (`autofill-sign-in-form`, `forms`)

* **대상**: `src/components/admin/login-form.tsx`, `password-field.tsx`(신규)
* **Before**: 감싸는 `<label>`, 이메일 `autoComplete="email"`, 비밀번호 표시 토글 없음.
* **After**:
  * 이메일: `id="admin-login-email"`, `type`·`name`은 `email` 유지, `autoComplete="username"`, `spellCheck={false}`, `enterKeyHint="next"`.
  * 비밀번호: `id="admin-login-password"`, `autoComplete="current-password"`, `enterKeyHint="done"`.
  * 두 입력 모두 `<label htmlFor>` 명시 연결(감싸지 않음).
  * 표시 토글: `<button type="button" aria-pressed aria-controls aria-label="비밀번호 표시">`. 이름은 고정하고 상태는 `aria-pressed`로 전한다. 아이콘(`Eye`/`EyeOff`)은 `aria-hidden`. 붙여넣기 차단 없음. 보이는 상태에서도 맞춤법 검사·자동 수정이 동작하지 않도록 `spellCheck={false} autoCapitalize="none" autoCorrect="off"`.
  * `src/app/admin/login/actions.ts`는 바꾸지 않았다.

### 2-4. 초대 활성화 폼 (`autofill-sign-up-form`, `forms`)

* **대상**: `src/components/admin/invite-activation-form.tsx`
* **Before**: 입력에 `name`/`id`가 없음, 비밀번호 확인 입력(두 번 입력), "8자 이상" 규칙은 오류 문구로만 안내. 만료 상태의 성공·실패 메시지가 모두 초록색 `role="status"` 상자.
* **After**:
  * 새 비밀번호: `id="admin-new-password" name="new-password" autoComplete="new-password" minLength={8}`, `htmlFor` 연결, 표시 토글(§2-3 공용 컴포넌트).
  * **비밀번호 확인 입력과 불일치 검사를 제거**했다. 8자 미만 JS 검사는 `minLength`가 막지 못한 경우를 위한 안내로 남겼다.
  * 입력 **위**에 상시 안내문 "8자 이상으로 입력해 주세요."(`id="admin-new-password-hint"`)를 두고 `aria-describedby`로 연결(새 문구).
  * 만료 상태 이메일: `id="admin-activate-email" name="email" spellCheck={false}`, `htmlFor` 연결(`autoComplete="email"` 유지).
  * 메시지 상태를 `{ error, success }`로 나눠 `FormStatus`로 표시. 그 결과 "이메일을 보내지 못했습니다" 오류가 이제 빨간 `role="alert"`로 보인다(이전에는 초록 상자). 성공 상자 색은 공용 성공색(`#eaf8f4`/`#146b58`)으로 통일(이전 `#edf8f1`/`#17613b`, 거의 같은 색).
  * Supabase 호출 흐름(세션 복원, `updateUser`, `resetPasswordForEmail`)은 바꾸지 않았다.

### 2-5. 사이드바 현재 위치 + 건너뛰기 링크 (`navbar`, `accessibility`)

* **대상**: `src/components/admin/admin-sidebar.tsx`, `src/app/admin/(workspace)/layout.tsx`
* **Before**: 활성 링크를 배경·글자색으로만 구분, `aria-current` 없음. 건너뛰기 링크 없음.
* **After**:
  * `getCurrentState(pathname, href)`: 정확히 그 페이지면 `aria-current="page"`, 그 아래 화면(예: `/admin/posts/new`, `/admin/portfolio/[id]/edit`)이면 `aria-current="true"`(현재 구역). 이전의 `startsWith(href)`가 `/admin/postsx` 같은 경로도 맞히던 점도 `href + "/"`로 고쳤다.
  * 스타일 기준은 `[aria-current]`(Tailwind 임의 변형 `[&[aria-current]]:`). 색 외에 **굵기(500 → 700)**와 **안쪽 막대**(좁은 화면은 아래 3px, `lg` 이상은 왼쪽 3px, 색 `--primary` `#0b3a78`)를 더했다. 막대 색과 배경(`--primary-soft` `#eaf3ff`) 대비는 약 10:1로 계산된다(3:1 이상).
  * 사이드바 앞에 `<a className="skip-link" href="#admin-main">본문으로 건너뛰기</a>`, `<main id="admin-main" tabIndex={-1}>`. 공개 사이트의 `.skip-link`(`globals.css`)를 그대로 쓴다.
  * 메뉴 아이콘에 `aria-hidden="true"` 명시.

### 2-6. 관리자 표 3개 (`responsive-table`, `accessibility`)

* **대상**: `src/app/admin/(workspace)/portfolio/page.tsx`, `posts/page.tsx`, `chatbot/page.tsx`
* **After**:
  * 가로 스크롤 래퍼: `tabIndex={0} role="region" aria-labelledby="<caption id>"`, 포커스 표시 `focus-ring-inset`.
  * 표 이름 `<caption className="sr-only">`: "포트폴리오 항목 목록", "게시글 목록", "챗봇 지식 문서 목록".
  * 모든 열 머리글 `<th scope="col">`, 비어 있던 작업 열 머리글에 `<span className="sr-only">작업</span>`.
  * 각 행의 제목 셀을 `<th scope="row">`로(기존 `td`의 클래스 유지 + `text-left`, 챗봇 표는 내부 `<p>`가 굵기를 정하므로 `font-normal`).
  * **포커스 표시를 안쪽으로 그리는 이유**: 래퍼가 `overflow-hidden rounded-3xl` 섹션을 꽉 채워 기존 `.focus-ring`(바깥 3px)은 완전히 잘린다. 또한 `.focus-ring`은 레이어 밖 CSS라 Tailwind 유틸리티로 `outline-offset`을 덮어쓸 수 없어 `globals.css`에 `.focus-ring-inset`(같은 색·두께, `outline-offset: -3px`)을 추가했다.
  * 손댄 부분만 줄을 나눴다(나머지 한 줄 JSX는 그대로).

### 2-7. 폼 결과 메시지 (`forms` 7절, `accessible-error-announcement`)

* **대상**: `form-status.tsx`(신규) 및 사용처 `login-form`, `invite-activation-form`, `media-upload-form`, `site-profile-form`, `post-form`, `portfolio-form`, `media-alt-form`, `media-delete-form`, `chatbot-runtime-toggle`, `chatbot-reindex-controls`, `content-status-actions` (11개 파일)
* **Before**: 같은 오류/성공 마크업 복제. `media-upload-form`, `site-profile-form`, `post-form`, `portfolio-form`의 성공 메시지는 `role` 없음. 나머지 성공 메시지는 `role="status"`가 있었지만 **성공할 때 새로 나타나는** 라이브 영역이라 안정적으로 읽히지 않음.
* **After** (`FormStatus`):
  * 오류: 기존처럼 나타날 때 렌더링되는 `role="alert"`(`content-forms.test.ts`의 `getByRole("alert")` 유지).
  * 성공: **항상 DOM에 있는 하나의 `<p role="status">`**의 내용만 바뀐다. 비어 있을 때 클래스는 `sr-only`(절대 위치)라 grid/flex 부모의 칸·gap을 만들지 않고, `display: none`이 아니어서 접근성 트리에 남는다. 내용이 생기면 같은 요소가 시각 클래스로 바뀐다.
  * **같은 문구의 반복 결과(검토 후 보완)**: 선택 prop `result`(호출부는 `useActionState` 상태 객체, 또는 `setMessage`/`setFeedback`로 새로 만든 결과 객체를 넘김)가 바뀌면 새 결과로 본다. 새 결과마다 `status`를 비운 뒤 다음 프레임에 채우고, 직전 문구와 같으면 `\u00A0`를 붙인다(복사 버튼과 같은 방식, 보이지 않음). 같은 `result`로 다시 렌더링되면(입력 중 등) 효과가 실행되지 않아 내용이 바뀌지 않는다. `result`를 넘기지 않으면 문구가 바뀔 때만 안내한다(기존 동작). 11개 사용처 모두 `result`를 넘긴다.
  * 오류도 같은 문제(같은 오류가 연속되면 `alert` 요소가 그대로 남아 다시 읽히지 않음. 예: 로그인 실패 두 번)가 있어, 새 결과가 직전과 같은 오류면 `alert` 요소를 다시 마운트한다(`key` 변경). 처음 나타나는 오류는 기존처럼 렌더링 즉시 보이고, 다시 마운트는 반복 때만 일어난다.
  * 상태 갱신은 모두 `requestAnimationFrame` 안에서 한다(`react-hooks/set-state-in-effect` 규칙). 직전 문구 기록(ref)도 프레임 안에서 갱신해, 취소된 효과 실행(개발 모드 StrictMode의 이중 실행, 빠른 연속 결과)이 흔적을 남기지 않는다. 그 결과 성공 문구는 결과 도착 후 한두 프레임 뒤에 보인다.
  * 시각 변형: `box`(상자형, 기본) / `text`(작은 글씨형). 배치용 `className`(여백·최대 폭·정렬)은 두 메시지에 함께 붙는다.
  * 화면 문구는 바꾸지 않았다. 색은 공용 오류색 `#a22b38`로 통일(`content-status-actions`의 오류색 `#b33d4a` → `#a22b38`, 더 진함).
  * `portfolio-order-list.tsx`의 순서 저장 메시지는 별도 역할 판단(`getPortfolioOrderMessageRole`)과 테스트가 있어 이번에 옮기지 않았다.

### 2-8. 입력 필드 공통 클래스 + 16px + textarea 자동 높이 (`forms` 5절, `form-fields-automatically-fit-contents`)

* **대상**: `src/components/ui/field-classes.ts`(신규), 관리자 폼 전부, `markdown-editor.tsx`
* **Before**: 입력이 `text-sm`(14px)·`text-xs`(12px) 라벨의 글꼴을 물려받아 iOS에서 포커스 시 확대. 같은 클래스 문자열이 20곳 넘게 반복. textarea는 `rows` 고정 높이.
* **After**:
  * 글꼴: `font-size: max(1rem, 1em)`(`text-[length:max(1rem,1em)]`, 가이드 권장식). 입력·select·textarea 모두 16px 이상. 본문 편집기(14px → 16px)와 외부 링크 JSON textarea(`font-mono text-xs` 12px → 16px)도 포함.
  * 크기 변형 유지: `inputFieldClass`(min-h-12), `selectFieldClass`(+흰 배경), `inputFieldMediumClass`(min-h-11, 다이얼로그·업로드), `inputFieldCompactClass`(min-h-9, 미디어 카드), `fileFieldClass`(파일 선택, 글자 입력이 없어 기존 `text-sm` 유지). 포트폴리오의 작은 "저장 상태" select(min-h-10)는 모양을 그대로 두고 글꼴만 `fieldTextClass`를 붙였다.
  * textarea: `textareaFieldClass(rows)` = `field-sizing-content w-full` + 최소 높이 `calc(rows × lh + 1.5rem + 2px)`(미지원 브라우저의 `rows` 높이와 같음) + 최대 높이 `min(20lh, 70vh)`. `height`는 주지 않는다. `rows` 속성은 미지원 브라우저용으로 유지하고 JS 폴백은 넣지 않았다.
  * 본문 편집 textarea: `field-sizing-content`, `min-h-[calc(18lh+2rem)]`(18행 × 28px + 세로 여백 = 536px, 이전 기본 높이와 같음), `max-h-[80vh]`(뷰포트가 낮아 80vh가 최소 높이보다 작으면 최소 높이가 이긴다), `resize-y` 유지, 이전 `min-h-80`은 최소 높이에 흡수.
  * `:user-invalid` 스타일과 `aria-invalid` 동기화는 범위 밖(서버 액션이 필드별 오류를 주지 않음).

### 2-9. 미디어 화면 이미지 로딩 (`optimize-image-priority`)

* **대상**: `src/app/admin/(workspace)/media/page.tsx`
* **After**: 처음 3개(넓은 화면 첫 줄)는 `loading` 없음(기본), 나머지는 `loading="lazy"`. 모두 `decoding="async"`. `fetchpriority`는 붙이지 않았다.

### 2-10. URL 복사 버튼 피드백 (`copy-button`)

* **대상**: `src/components/admin/media-url-copy-button.tsx`
* **Before**: 한 번 복사하면 "복사했습니다"가 영구히 남고, 다시 눌러도 변화가 없음. 숨김 `role="status"`와 보이는 문구가 중복.
* **After**:
  * 버튼 바깥의 `<p role="status">` 하나가 보이는 문구이자 스크린리더 안내다. 비어 있을 때는 `sr-only`.
  * 성공·실패 시 버튼 아이콘이 `Copy` → `Check` / `TriangleAlert`로 바뀐다(`data-copy-status`도 갱신). 피드백 중에도 버튼을 비활성화하지 않는다.
  * `COPY_FEEDBACK_MS`(2000ms) 뒤 상태·문구를 지운다. 다시 누르면 기존 타이머·프레임을 취소하고 새로 시작한다. 문구는 먼저 비운 뒤 다음 프레임에 채운다.
  * 직전과 같은 문구면 `\u00A0`을 붙여 VoiceOver도 다시 읽게 한다. 마지막 문구는 컴포넌트별 ref로 추적한다(VoiceOver의 중복 생략은 같은 영역 안에서 일어나므로 영역별 추적으로 충분하다고 판단).
  * 언마운트 때 타이머·프레임을 정리한다.
  * Invoker Commands로 바꾸지 않았다(복사 대상이 요소가 아니라 prop 값).

---

## 3. 테스트

| 파일 | 내용 |
| :--- | :--- |
| `src/components/markdown-editor.test.ts` (보강) | jsdom용 다이얼로그 흉내 설치. 네이티브 모달로 열림·`role`/`aria-modal` 없음·`closedby="any"`·`aria-labelledby`·검색 입력 초기 포커스·썸네일 `loading`/`decoding`. 닫기 버튼으로 닫힘, 브라우저가 보낸 `close` 이벤트(Esc·바깥 클릭)만으로 상태 동기화 후 다시 열기. 삽입 후 textarea 포커스·커서 위치. |
| `src/components/markdown-editor.test.ts` (Enter 보완) | 콘텐츠 폼 안의 선택 창에서 검색·선택 이미지 대체 텍스트·새 이미지 대체 텍스트 입력의 Enter와 IME Enter(`keyCode: 229`, `isComposing`)는 기본 동작이 취소되고 창은 열린 채. 닫기 버튼 Enter·파일 선택 Enter·체크박스 Space·일반 글자는 취소되지 않음. 폼 `submit`·`requestSubmit` 0회. jsdom은 암묵적 제출을 구현하지 않으므로 이 테스트의 핵심은 "기본 동작 취소 여부"이고, 실제 제출 차단은 아래 브라우저 확인으로 보았다. |
| `src/components/admin/confirm-dialog.test.ts` | 이름·설명 연결, 취소 버튼 초기 포커스, `method="dialog"`, 확인 시에만 `onConfirm`, `returnValue` 초기화, Esc(값 없는 닫힘)는 이전 확인 뒤에도 취소. |
| `src/components/admin/content-status-actions.test.ts` | 휴지통: 확인 시 `moveToTrash(table, id)` 실행·성공 문구가 상시 `status`에 표시·`window.confirm` 미호출 / 취소·Esc 시 미실행 / 확인이 필요 없는 발행은 바로 실행. |
| `src/components/admin/chatbot-reindex-controls.test.ts` | 확인 후 같은 폼이 다시 제출되어 `confirmed=true`로 서버 액션 호출·확인 창이 제출 폼 밖에 있음 / 취소·Esc 시 미제출, 다음 클릭에 다시 확인. |
| `src/components/admin/form-status.test.ts` | 빈 `status`가 `sr-only`로 항상 존재, 성공 시 같은 요소의 내용이 바뀜, 오류는 `alert`. 같은 성공 문구의 서로 다른 결과 → 비웠다가 `\u00A0`이 붙은 문구로 다시 채움(내용 변경), 세 번째는 다시 원문. 같은 결과로 다시 렌더링 → `MutationObserver` 변경 0건. 같은 오류의 새 결과 → `alert`가 새 요소로 교체, 같은 결과 재렌더링 → 그대로. `result` 없이 같은 문구 → 변화 없음. |
| `src/components/admin/admin-sidebar.test.ts` | `getCurrentState` 규칙, 렌더링 시 `aria-current` 링크가 정확히 하나. |
| `src/components/admin/auth-forms.test.ts` | 로그인: `id`/`htmlFor`/`autocomplete=username`/`spellcheck=false`/`enterkeyhint`, 토글 `aria-pressed`·`type` 전환·미제출. 활성화: 비밀번호 입력 하나, 위쪽 안내문 `aria-describedby`, 한 번 입력으로 `updateUser`, 만료 상태 이메일 `name`/`id`와 상시 `status`. |
| `src/components/admin/media-url-copy-button.test.ts` | 성공·실패 문구와 단일 `status`, 시간 경과 후 정리, 재클릭 시 타이머 재시작과 `\u00A0` 교대, 언마운트 시 타이머 0개. |
| `e2e/admin-auth.spec.ts` (신규) | `/admin/login`: 라벨·자동 완성 속성·입력 글꼴 16px 이상·토글·붙여넣기 미차단. `/admin/activate`(세션 없음 → 만료 상태): 이메일 속성·16px·상시 `status`가 `position: absolute`. Supabase 환경 변수가 없으면(CI) 건너뛴다. |

---

## 4. 의도적으로 보류하거나 지시와 다르게 한 항목

> 1차 기록에서 보류·미수정으로 적었던 두 건(선택 창 Enter의 암묵적 제출, 같은 성공 문구 반복 시 미안내)은 검토 요청에 따라 보완했다(§2-1, §2-7).

1. **표 고정 머리글·좁은 화면 카드형 변환**: 디자인 결정이 필요해 보류(지시대로).
2. **`accent-color`, `content-visibility`, dnd-kit 교체**: 범위 밖(지시대로).
3. **`:user-invalid` / `aria-invalid` 동기화**: 서버 액션이 필드별 오류를 주지 않아 보류(지시대로).
4. **`aria-current="true"` 추가**: 지시는 "활성 링크에 `aria-current="page"`"였다. 하위 화면(새 글·편집)에서 메뉴 링크가 가리키는 페이지는 현재 페이지가 아니므로 그때는 `"true"`(현재 구역)를 쓴다. 스타일은 두 값 모두 같다.
5. **`portfolio-order-list.tsx` 메시지**: 별도 역할 판단 함수·테스트가 있어 `FormStatus`로 옮기지 않았다.
6. **활성화 폼의 숨은 사용자 이름 필드**: 비밀번호 관리자가 새 비밀번호를 계정과 묶도록 `autocomplete="username"` 숨은 필드를 두는 방법이 있으나, 세션의 이메일을 읽는 흐름이 추가되어 이번 범위(Supabase 흐름 유지)에서 제외했다.

---

## 5. 검증 명령어 및 결과 (이번 작업에서 직접 실행)

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e --grep-invert chatbot
npx -y modern-web-guidance@latest legacy-scan . --json
```

* `pnpm typecheck`: 오류 0건 — **확인함**.
* `pnpm lint`: 경고·오류 0건 — **확인함**.
* `pnpm test`: 55개 파일, 300개 통과(작업 전 48개 파일 268개 + 신규 7개 파일·보강 포함 32개) — **확인함**(검토 후 보완 반영 뒤 재실행).
* `pnpm build`: 성공 — **확인함**(보완 뒤 재실행).
* 보완 뒤 `pnpm exec playwright test e2e/admin-auth.spec.ts`: 3개 통과. 전체 e2e는 보완 뒤 다시 돌리지 않았다(변경이 관리자 컴포넌트에 한정됨).
* `pnpm test:e2e --grep-invert chatbot`(개발 서버, Chromium 151): 두 번 실행. 첫 실행은 16개 통과 1개 실패(`e2e/modern-web.spec.ts`의 명령 팔레트 테스트가 첫 클릭 직후 `toBeVisible`에서 실패), 같은 테스트만 3회 반복 실행은 3회 모두 통과, 전체 재실행은 17개 모두 통과. 개발 서버의 첫 컴파일 지연에 따른 일시적 실패로 보이나(추측) 원인을 확정하지는 않았다. 이 테스트는 공개 사이트 팔레트로, 이번 변경 파일과 직접 관련이 없다. 이름에 "chatbot"이 든 테스트는 실행하지 않았다.
* `legacy-scan`: 2건, 모두 관리자 밖의 기존 보류 항목(`chatbot-panel.tsx`의 `field-sizing` 미지원 폴백, `readiness.ts`의 `Promise.withResolvers`). 관리자 파일의 발견 사항 없음 — **확인함**.

### 브라우저(Chromium 151)로 확인한 것

* **로그인·활성화 화면(실제 페이지)**: 위 `e2e/admin-auth.spec.ts` 3개 통과. 입력 글꼴 16px, `autocomplete`·`id`·`spellcheck`, 토글 동작, 만료 상태의 상시 `status`(`position: absolute`).
* **실제 컴포넌트(임시 하네스 페이지)**: 관리자 로그인이 필요한 화면을 직접 열 수 없어, `MarkdownEditor`·`ContentStatusActions`·`ReindexAllControl`·`MediaUrlCopyButton`을 렌더링하는 임시 경로를 만들어 확인한 뒤 **삭제했다**. 확인 결과:
  * 이미지 선택 창: `showModal()`로 열려 `:modal`, `closedby="any"`, 초기 포커스는 검색 입력, Tab 12회 뒤에도 포커스가 창 안, Esc·배경 클릭으로 닫히고 포커스가 "이미지 넣기" 버튼으로 돌아옴, 다시 열면 제목이 다시 렌더링(상태 동기화), Ctrl+I로 열고 삽입하면 textarea에 포커스·커서가 삽입 문자열 뒤, 썸네일 `loading="lazy"`·`decoding="async"`, 검색 입력 16px.
  * 휴지통 확인 창: 모달로 열림, 제목으로 이름, `text-align: left`, 초기 포커스 "취소", 배경 클릭으로 닫히지 않음, Esc·취소 시 서버 요청 0건, Esc 뒤 포커스가 "휴지통" 버튼으로 복귀, 확인 시 서버 액션 요청 1건(로그인이 없어 서버가 `/admin/login`으로 보냄).
  * 전체 재인덱싱: 초기 포커스 "취소", 취소 시 요청 0건, 확인 시 요청 1건이고 본문에 `confirmed=true` 포함.
  * 복사 버튼: 클립보드에 URL이 들어가고 `status`에 문구, 재클릭 시 문구 끝에 `\u00A0`, 약 2초 뒤 문구가 비고 `sr-only`·`data-copy-status="idle"`. 콘솔 오류 없음.
* **CSS 동작(로그인 페이지에 같은 클래스의 마크업을 주입해 확인)**: 닫힌 `.admin-dialog`는 `display: none`, 열면 `block`. 1280px·390px 모두 좌우·상하 여백이 같아 가운데 정렬(390px에서 좌우 16px). `:modal`의 `overscroll-behavior: contain`, `::backdrop`의 `overflow: hidden`·`overscroll-behavior: contain`. 배경 위 휠, 다이얼로그 끝까지 스크롤 후 추가 휠 모두 뒤 페이지 `scrollY` 0 유지. textarea(3행): 빈 상태 95px, 한 글자 입력 시 폭 유지, 8줄에 211px, 60줄에서 최대 높이(457px)에 멈추고 내부 스크롤. 본문 편집기: 빈 상태 536px, 200줄에서 80vh(640px)에 멈춤, `resize: vertical`. 사이드바 현재 링크: 굵기 700, 390px에서 아래 막대·1280px에서 왼쪽 막대, 다른 링크는 500·막대 없음. 표 래퍼: Tab으로 초점, `outline 3px solid`, `outline-offset: -3px`. 행 머리글 `text-align: left`. 빈 `status`가 있는 grid 폼과 없는 폼의 높이가 같음(68px).

* **검토 후 보완(임시 하네스, 확인 후 삭제)**: 콘텐츠 폼 안에 `MarkdownEditor`를 두고 폼 `submit` 횟수를 셌다. 선택 창의 검색 입력·선택 이미지 대체 텍스트·새 이미지 대체 텍스트·체크박스에서 Enter → 제출 0회, 창은 열린 채. 체크박스 Space는 체크를 바꾸고, 닫기 버튼 Enter는 창을 닫음. 대조로 같은 폼에 가드 없는 텍스트 입력을 넣고 Enter → 제출 1회(실제로 암묵적 제출이 일어나는 구조임을 확인). `FormStatus`: 같은 문구의 새 결과 두 번째에 `status` 변경이 `""` → `"…저장했습니다.\u00A0"` 순으로 관찰되고, 그 사이 다른 입력에 타이핑해도 변경 0건.

### 확인하지 못한 것

* 실제 IME로 한글을 조합하며 선택 창에서 Enter를 누르는 동작(합성 이벤트로 `keyCode: 229`·`isComposing`만 jsdom에서 확인).
* 반복 성공·오류 문구가 실제 스크린리더에서 다시 읽히는지(DOM 변경까지만 확인).

* 로그인이 필요한 실제 관리자 화면(대시보드·목록·편집·미디어·챗봇) 전체 페이지에서의 표 스크롤·건너뛰기 링크 동작·사이드바 렌더링(사이드바는 jsdom 테스트, 표·막대 스타일은 주입 마크업으로만 확인).
* Safari·Firefox, 실제 iOS 기기에서의 확대 여부, 스크린리더(VoiceOver·NVDA)의 실제 안내.
* `field-sizing` 미지원 브라우저에서의 `rows` 고정 높이 동작(코드상 `rows`를 유지했을 뿐 실행 확인 안 함).
* 초대 링크 세션이 있는 활성화 폼(비밀번호 설정 상태)의 실제 브라우저 화면(jsdom 테스트로만 확인).
