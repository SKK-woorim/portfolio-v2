# 상태 머신 지도

이 프로젝트에서 "지금 어떤 상태인가"를 다루는 코드를 모두 모아 둔 문서다.
상태를 추가하거나 전이 규칙을 바꾸기 전에 해당 항목을 먼저 읽는다.

작성 기준일: 2026-11-16

## 규칙

1. **전이 규칙은 한 곳에만 둔다.** 아래 표의 "전이 규칙이 있는 곳"이 그 한 곳이다. 화면이나 액션에서 `status === "..."` 조합으로 규칙을 다시 쓰지 않고, 그 모듈의 조회 함수(`isChatPhaseActive`, `isChatOffline`, `canTransitionContent` 등)를 쓴다.
2. **상태를 추가하면 타입이 빠진 곳을 알려 준다.** 라벨과 문구는 `Record<상태, …>`로, 분기는 `default` 없는 `switch`로 쓴다. 새 상태를 넣으면 `pnpm typecheck`가 고칠 곳을 모두 짚는다.
3. **전이 함수는 순수 함수다.** `(상태, 이벤트) → 상태` 꼴이고, 받아들일 수 없는 이벤트는 같은 값을 그대로 돌려준다. React·fetch 없이 테스트할 수 있다.
4. **DB가 확정하는 상태는 DB가 기준이다.** TypeScript 쪽 표는 사전 확인과 화면 표시에 쓰는 사본이다. DB 규칙을 바꾸면 사본과 그 테스트를 함께 바꾼다.
5. **화면 상태는 `data-*` 속성으로도 드러낸다.** E2E 테스트나 브라우저 자동화는 한국어 문구 대신 이 속성을 읽는다(아래 "화면에서 상태 읽기").

## 한눈에 보기

| # | 상태 머신 | 상태 | 전이 규칙이 있는 곳 | 테스트 |
|---|---|---|---|---|
| 1 | 챗봇 요청 단계 | `idle` `submitting` `searching` `generating` `streaming` `complete` `cancelled` `error` | `src/components/chatbot/chat-state.ts` `reduceChatStream` | `chat-state.test.ts`, `use-chat-stream-flow.test.ts` |
| 2 | 답변 전달 상태 | `streaming` `complete` `partial` `cancelled` `error` | 같은 파일 `reduceChatMessage` | `chat-state.test.ts` |
| 3 | 챗봇 연결 상태 | `checking` `enabled` `disabled` `unavailable` | `src/components/chatbot/runtime-availability.ts` `reduceRuntimeAvailability` | `runtime-availability.test.ts`, `chatbot-context.test.ts` |
| 4 | 진행 단계 표시 | `idle` `understanding` `searching` `grounding` `generating` `done` | `src/components/chatbot/use-chat-progress.ts` `deriveChatProgressStep` | `use-chat-progress.test.ts` |
| 5 | 느린 응답 안내 | 숨김 → 표시 → 숨김 | 같은 파일 `useSlowNotice` | `use-chat-progress.test.ts` |
| 6 | 챗봇 SSE 프로토콜 | `status` `sources` `token` `done` `error` 이벤트 순서 | `src/lib/chat/contracts.ts` `chatSseEventSchema` | `contracts.test.ts`, `route.test.ts` |
| 7 | 콘텐츠 발행 상태 | `draft` `published` `hidden` `private` `trashed` | DB `transition_content_status_atomic` (사본: `src/lib/content/status.ts`) | `status.test.ts`, `actions.test.ts` |
| 8 | 챗봇 색인 작업 | 작업 `queued` `processing` `done` `failed` / 문서 `pending` `processing` `ready` `failed` `disabled` | DB `claim_knowledge_sync_job` 외 | `services/rag-api/tests/test_sync.py`, `test_rpc_contracts.py` |
| 9 | 미디어 삭제 | 삭제 요청 → 파일 삭제 → 완료 / 재시도 보관 | `src/app/admin/actions.ts` `deleteMedia` + DB `media_deletion_outbox` | `actions.test.ts` |
| 10 | 미디어 업로드 | 파일 업로드 → 등록 → 확인 / 정리 | `src/app/admin/actions.ts` `uploadMedia` | `actions.test.ts` |
| 11 | 로그인 시도 | 예약 → `success` `failure` `abandoned` | `src/app/admin/login/actions.ts` + DB `reserve_login_attempt_trusted` | `login/actions.test.ts` |
| 12 | 관리자 폼 저장 | 대기 → 저장 중 → 성공 / 실패 | `useActionState` + `FormState` (`src/lib/validation/content.ts`) | `content-forms.test.ts` |
| 13 | 본문 임시 저장 | 불러오는 중 → 동일 / 변경됨 / 임시본 있음 | `src/components/markdown-editor.tsx` | `markdown-editor.test.ts` |
| 14 | 초대 링크 확인 | `checking` `ready` `expired` | `src/components/admin/invite-activation-form.tsx` | 없음 |
| 15 | 테마 | 선호 `system` `light` `dark` → 적용 `light` `dark` | `src/components/theme-toggle.tsx` + 루트 레이아웃 인라인 스크립트 | `e2e/accessibility-theme.spec.ts` |
| 16 | 복사 버튼 | `idle` `copied` `failed`(또는 `selected`) | 각 컴포넌트 | `contact-copy-button.test.ts` |
| 17 | 준비 상태 점검 | 구성 요소별 `ready` `not_ready` `disabled` | `src/lib/health/readiness.ts` | `readiness.test.ts` |
| 18 | 저장된 답변 유효성 | 현재 콘텐츠와 지문 일치 / 불일치 | `src/lib/chat/cached-answers.ts` `isCurrent` | `cached-answers.test.ts` |

## 1. 챗봇 요청 단계

질문 하나를 보내고 답변이 끝날 때까지의 단계. 한 번에 요청 하나만 진행된다.

```text
idle ──submitted──▶ submitting ──status──▶ searching ──status──▶ generating ──token──▶ streaming
                        │                      │                      │                   │
                        └──────────────────────┴──────────┬───────────┴───────────────────┘
                                                          ├─finished(stop|length)──▶ complete
                                                          ├─finished(cancelled) / cancelled──▶ cancelled
                                                          └─failed──▶ error
complete | cancelled | error ──submitted──▶ submitting
```

- 단계는 앞으로만 간다. 늦게 도착한 이전 단계 `status`는 문구까지 통째로 무시한다.
- 종료 뒤에 도착한 이벤트는 모두 버린다.
- 첫 `token`이 오면 상태 줄 문구를 비운다. 취소 버튼(`canCancel`)은 30초를 기다린 요청에만 보이고, 어떤 종료에서든 숨긴다.
- `done`이 와도 토큰이 하나도 없었거나 종료 사유를 모르면 `error`로 끝낸다.
- 종료 이벤트 없이 스트림이 닫히면 `error`로 끝낸다.

**누가 무엇을 맡는가**

| 역할 | 위치 |
|---|---|
| 전이표 | `chat-state.ts` `reduceChatStream` |
| 네트워크와 요청 자원(AbortController, 타이머) | `use-chat-stream.ts` `useChatStream` |
| "진행 중인 요청이 있는가"의 단일 기준 | `use-chat-stream.ts`의 `activeRequestIdRef`. `sendChat()`이 `false`를 돌려주면 요청이 시작되지 않은 것이다. |

진행 중인지 물을 때는 `isChatPhaseActive(phase)`를 쓴다. 네 단계를 `||`로 나열하지 않는다.

## 2. 답변 전달 상태

대화 목록에 남는 답변 한 건의 결과. 요청 단계와 달리 세션 저장소에 보관된다.

```text
streaming ──finished(stop)──▶ complete
          ──finished(length)──▶ partial
          ──finished(cancelled) / cancelled──▶ cancelled
          ──failed──▶ error
```

- 끝난 답변은 어떤 이벤트로도 바뀌지 않는다.
- 저장소에서 되살릴 때 `streaming`이던 답변은 `cancelled`로 읽는다(`restoreStoredDelivery`).
- 다시 시도 버튼은 `error`·`cancelled`·`partial`에만 보인다. 근거를 찾지 못한 답변(`NO_RELEVANT_CONTEXT`)은 다시 시도 대신 소개·연락처 링크를 보여 준다. 패널과 히어로 콘솔 모두 `canRetryChatMessage`를 쓴다.

## 3. 챗봇 연결 상태

```text
checking ──status-resolved──▶ enabled | disabled | unavailable
(모든 상태) ──status-failed / status-aborted(timeout)──▶ unavailable
disabled | unavailable ──panel-opened──▶ checking
enabled ──panel-opened──▶ enabled        (뒤에서 다시 확인한다)
(모든 상태) ──chat-rejected-as-disabled──▶ disabled
```

- 배포 설정으로 챗봇을 끈 경우 `disabled`에서 시작한다.
- 상태 확인 요청이 새 요청에 밀렸거나(`superseded`) 화면이 사라져(`unmount`) 취소된 경우에는 상태를 바꾸지 않는다.
- 이미 연결된 상태에서 패널을 열면 `checking`으로 돌아가지 않는다. 대화와 입력창이 가려지지 않고, 상태 확인은 뒤에서 계속된다.
- 질문과 함께 패널을 연 경우(`openPanel(question)`), `checking`이 끝난 뒤에 보낸다. 보낼 수 없으면 입력창에 남긴다.

물을 때는 `isChatOffline(availability)`(꺼짐·확인 불가)와 `isChatOnline(availability)`를 쓴다.

## 4–5. 진행 단계 표시와 느린 응답 안내

화면에 보여 주는 단계는 요청 단계(1번)와 다르다. 앞의 세 단계는 연출 타이머로 넘기고, 실제 신호(근거 도착, 첫 토큰)가 오면 건너뛰거나 기다린다.

- 단계 이름은 `CHAT_PROGRESS_STEP`으로 읽는다. 숫자(`-1`~`4`)는 순서 비교에만 쓴다.
- 근거가 도착하기 전에는 `generating`으로 넘어가지 않는다.
- `generating`에서 6초가 지나면 안내를 보이고, 첫 토큰이 와도 최소 2초는 유지한다.

## 6. 챗봇 SSE 프로토콜

Python 서비스(`services/rag-api/app/service.py`) → Next 릴레이(`src/app/api/chat/route.ts`) → 브라우저 순으로 흐른다.

```text
status(accepted) → status(searching) → sources → status(generating) → token… → done
                                   (어느 시점에서든) error
```

- `accepted`와 `searching`은 릴레이가 직접 보낸다. 백엔드의 `status`는 `generating`만 통과시킨다.
- `done`과 `error`가 종료 이벤트다(`isTerminalChatSseEvent`).
- 릴레이가 백엔드 요청을 끊는 까닭은 `timeout`과 `client` 두 가지다. `client`면 오류를 보내지 않는다.
- 오류 코드와 사용자 문구는 `src/lib/chat/error-messages.ts` 한 곳에 있다. 코드를 추가하려면 `CHAT_ERROR_CODES`와 `CHAT_ERROR_MESSAGES`, 그리고 Python 쪽 `app/contracts.py`의 코드 목록을 함께 고친다.

## 7. 콘텐츠 발행 상태

```text
draft | hidden | private ──publish──▶ published
published ──unpublish──▶ draft
(휴지통이 아닌 상태) ──trash──▶ trashed        직전 상태를 status_before_trash에 남긴다
trashed ──restore──▶ 직전 상태 (없으면 draft)
```

- 포트폴리오는 `hidden`, 게시글은 `private`을 쓴다.
- 확정은 DB 함수가 한다. `p_expected_status`가 현재 상태와 다르면 충돌(`40001`)로 거절한다.
- 서버 액션 네 개(`publishContent`, `unpublishContent`, `moveToTrash`, `restoreContent`)는 모두 `transitionContent` 한 경로를 지난다. 전이별 문구는 `CONTENT_TRANSITION_COPY`에 있다.
- 관리자 목록의 버튼은 `availableContentTransitions(status)`가, 상태 이름은 `contentStatusLabel(status)`가 정한다.
- 편집 폼의 저장(`savePortfolio`, `savePost`)은 `trashed`로 저장할 수 없다. "즉시 발행"은 저장이 성공했을 때만 폼의 상태 선택을 발행으로 맞춘다.

## 8. 챗봇 색인 작업

콘텐츠가 바뀌면 DB 트리거가 작업을 넣고, 워커(`services/rag-api/worker/`)가 가져가 처리한다.

```text
작업:  queued ──claim──▶ processing ──complete──▶ done
                              │──fail(시도 1~3회)──▶ queued   (10초 · 30초 · 2분 뒤 재시도)
                              │──fail(4회째) / 잠금 만료(4회째)──▶ failed
       queued | processing ──문서의 목표 리비전이 바뀜──▶ done   (낡은 작업은 버린다)
       processing ──잠금 만료──▶ 다시 claim 가능

문서:  pending ──claim──▶ processing ──▶ ready | disabled | failed
       failed·ready ──콘텐츠 변경·재색인 요청──▶ pending
```

- 콘텐츠 상태에 따라 작업 종류가 정해진다: `published` → `upsert`, `trashed` → `delete`, 그 밖 → `disable`.
- 관리자 화면(`/admin/chatbot`)은 문서 상태를 `KnowledgeIndexStatus`(`src/lib/admin/queries.ts`)로 읽는다.
- 규칙은 SQL에만 있다(`supabase/migrations/202608210001_chatbot_rag.sql`, `202608240001_fix_claim_knowledge_sync_job.sql`).

## 9–11. 여러 저장소에 걸친 절차

한 번에 되돌릴 수 없는 단계가 섞여 있어, 실패 지점마다 다음 행동이 정해져 있다.

**미디어 삭제** (`deleteMedia`)

```text
delete_media_atomic(삭제 대기 기록) ─▶ Storage 파일 삭제 ─▶ complete_media_deletion ─▶ 완료
        │ 사용 중(23503) → 거절                │ 실패 → record_media_deletion_failure → 재시도 목록
                                                                │ 완료 기록 실패 → 다시 누르면 정리
```

**미디어 업로드** (`uploadMedia`)

```text
검사·최적화 ─▶ Storage 업로드 ─▶ register_media_atomic ─▶ 완료
                                        │ 응답이 애매함 → storage_key로 다시 조회
                                        │   있음 → 완료
                                        │   없음 + DB가 명확히 거절 → 파일 정리
                                        │   없음 + 확인 불가 → 파일을 지우지 않고 새로고침 안내
```

**로그인 시도** (`login`)

```text
reserve(예약) ─▶ signInWithPassword ─▶ finalize(success | failure | abandoned)
```

- 인증은 성공했는데 `finalize`가 실패하면 로그아웃시키고 실패로 답한다.
- 인증 오류가 자격 증명 문제가 아니면 `abandoned`로 닫아 실패 횟수에 넣지 않는다.

## 12–18. 손대지 않은 것과 그 까닭

| 항목 | 지금 모습 | 그대로 둔 까닭 |
|---|---|---|
| 관리자 폼 저장(`FormState`) | `{ error?, success? }` — 둘 다 있거나 둘 다 없는 값도 타입상 가능 | 관리자 서버 액션과 폼 전체가 이 모양을 쓴다. 판별 유니온으로 바꾸면 변경 범위가 넓고, 지금 모든 액션은 둘 중 하나만 돌려준다. |
| 본문 임시 저장 | `draftReady` `recoveryDraft` `dirty` `localSavedAt` `draftStorageError` 조합 | 관리자 전용이고 기존 테스트가 동작을 고정하고 있다. 상태 줄 문구를 바꿀 일이 생기면 그때 `(입력) → 표시 상태` 순수 함수로 뽑는다. |
| 초대 링크 확인 | `checking` `ready` `expired` + `pending` + `message` | 이미 이름 붙은 상태이고 화면 하나에만 쓰인다. |
| 테마 | 저장된 선호 + `data-site-theme` | 토글은 `light`↔`dark`만 오가고 `system`으로 돌아가는 길이 없다. 의도된 단순화로 보고 두었다. |
| 복사 버튼 3종 | 컴포넌트마다 상태 이름이 조금씩 다름 | 실패했을 때 하는 일이 서로 다르다(안내만 / 주소 선택). 공통 훅으로 묶을 만큼 겹치지 않는다. |
| Python 서비스 | 검색 → 생성 대기열 → 생성 → 스트림을 한 코루틴이 순서대로 진행 | 별도 호스트에 배포된 서비스다. 프로토콜(6번)만 문서로 고정했다. |

## 화면에서 상태 읽기

E2E 테스트와 브라우저 자동화는 문구 대신 아래 속성을 읽는다.

| 요소 | 속성 | 값 |
|---|---|---|
| 챗봇 패널 `#portfolio-chatbot-panel` | `data-availability` | 연결 상태(3번) |
| | `data-phase` | 요청 단계(1번) |
| 히어로 콘솔 `#hero-chat` | `data-availability`, `data-phase` | 위와 같음 |
| 답변·질문 `article.chatbot-message` | `data-delivery` | 전달 상태(2번) |
| 히어로 답변 `.console-answer` | `data-delivery` | 전달 상태(2번) |
| 플로팅 버튼 `.chatbot-trigger` | `data-availability` | 연결 상태(3번) |
| 플로팅 버튼의 상태 점 `.chatbot-state-dot` | `data-state` | `disabled` `unavailable` |
| 관리자 목록의 상태 버튼 묶음 | `data-status` | 발행 상태(7번) |

## 상태를 추가하거나 바꿀 때

1. 위 표에서 해당 머신의 "전이 규칙이 있는 곳"을 연다.
2. 상태·이벤트 타입과 전이 함수를 고친다.
3. `pnpm typecheck`로 빠진 라벨·분기를 찾아 채운다.
4. 그 머신의 테스트에 새 전이와, 받아들이면 안 되는 전이를 함께 넣는다.
5. DB가 기준인 머신(7·8·9·11)은 마이그레이션을 먼저 쓰고 `pnpm verify:migrations`를 돌린다.
6. 이 문서의 표와 그림을 고친다.
