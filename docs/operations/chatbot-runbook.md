# 포트폴리오 챗봇 운영 Runbook

## 빠른 상태 확인

```bash
curl --fail --silent https://portfolio-rag-168-107-39-176.nip.io/health | jq
systemctl --no-pager --full status portfolio-llm portfolio-rag-api portfolio-rag-worker caddy
journalctl -u portfolio-rag-api -u portfolio-llm -u portfolio-rag-worker --since '15 minutes ago' --no-pager
free -h
df -h /opt/portfolio-rag
```

정상 `/health`는 `status=ok`, `embeddingReady=true`, `modelReady=true`와 generation의 `running`, `waiting`, `maxWaiters=5`를 반환한다. 질문·답변·HMAC 헤더·원문 전체는 로그에 남기지 않는다. request ID, 오류 유형, 지연, 청크 수만 장애 상관관계에 사용한다.

## 평상시 공개 연결 제어

관리자 `/admin/chatbot` 상단의 `챗봇 활성화` 또는 `챗봇 비활성화` 버튼을 사용한다. 이 스위치는 Supabase의 런타임 설정만 변경하며 Oracle의 모델, RAG API, 인덱싱 워커를 내리거나 다시 시작하지 않는다. 비활성화하면 새 `/api/chat` 요청은 즉시 `CHATBOT_DISABLED`로 차단되고 공개 위젯은 소개·연락처 안내만 표시한다. 열려 있는 위젯은 최대 15초 안에 상태를 다시 확인하며, 방문자는 `연결 상태 다시 확인`을 눌러 즉시 갱신할 수 있다.

`CHATBOT_ENABLED=false`는 데이터베이스 상태 조회까지 막는 비상용 상위 차단 장치다. 이 환경변수를 변경하면 Vercel 재배포가 필요하므로 평상시 온·오프에는 관리자 스위치를 사용한다. 상태 저장소 조회가 실패하는 경우에도 공개 중계는 안전하게 비활성화된다.

## 경보별 대응

### `/health` 5분 실패 또는 `MODEL_UNAVAILABLE`

1. Caddy가 아니라 `curl http://127.0.0.1:8090/health`로 내부 API를 확인한다.
2. `curl http://127.0.0.1:8080/health`와 `portfolio-llm` 로그를 확인한다.
3. OOM이면 `journalctl -k`에서 kill 기록과 RSS/swap을 확인한다. 모델 체크섬이 맞는 상태에서 llama.cpp만 한 번 재시작한다.
4. API가 모델보다 먼저 시작된 경우 llama.cpp가 ready가 된 뒤 API를 재시작한다.
5. 5분 내 복구되지 않으면 Vercel의 `CHATBOT_ENABLED=false`로 중계 API를 비활성화한다. 공개 사이트와 CMS는 계속 운영한다.

### `MODEL_BUSY` 증가

`/health`에서 실행 1개와 대기 5개가 지속되는지 확인한다. 임의로 Uvicorn worker나 llama.cpp parallel 수를 늘리지 않는다. first-token/전체 생성 지표를 보고 컨텍스트(`RAG_MAX_CONTEXT_TOKENS`)와 출력(`CHAT_MAX_OUTPUT_TOKENS`)을 먼저 낮춘다. 취소된 대기 요청은 큐에서 제거되고 연결 취소는 llama.cpp 스트림까지 전파되어야 한다.

### `FIRST_TOKEN_TIMEOUT` / `GENERATION_TIMEOUT`

첫 토큰 90초, 전체 240초가 기준이다. 입력 2K/4K 벤치마크와 현재 RSS, CPU steal, swap을 비교한다. 반복 초과면 검색 근거 토큰을 줄이고 최대 출력을 낮춘다. Vercel `maxDuration`보다 Oracle 전체 제한을 최소 15초 짧게 유지한다.

### `SEARCH_UNAVAILABLE`

Supabase 상태, DNS/TLS, service-role key rotation 여부와 `match_knowledge_chunks` RPC 권한을 확인한다. 키를 로그나 티켓에 붙이지 않는다. RPC는 `index_status='ready' AND active_revision=revision_id`를 DB 안에서 강제해야 한다.

### 인덱싱 `processing` 10분 초과

워커 상태와 Supabase 연결을 확인한다. claim RPC는 stale lock을 10분 후 회수한다. 작업을 수동 update하지 말고 워커를 정상화한 뒤 claim 재시도를 기다린다. 4번째 실패는 문서와 작업을 `failed`로 만들고 검색에서 제외한다.

### `failed` 문서

`last_error`의 짧은 유형과 워커 로그 request/job ID를 확인한다. 원문이나 비밀값은 복사하지 않는다. 원본 공개 상태·필수 평문·EmbeddingGemma 768차원·DB 공간을 고친 후 관리자 `다시 인덱싱`으로 새 revision을 만든다. 과거 failed job을 직접 queued로 바꾸지 않는다.

### 디스크 5GiB 미만 / 가용 RAM 1GiB 미만

Caddy/journald 보존량과 Hugging Face 임시 cache를 확인한다. 활성 또는 rollback 모델을 임의 삭제하지 않는다. 정상 생성이 swap을 지속 사용하면 기능 플래그를 끄고 서버 증설 또는 임베딩 프로세스 분리를 진행한다.

## 안전한 재시작 순서

```bash
sudo systemctl restart portfolio-llm
curl --fail --silent --retry 20 --retry-delay 3 http://127.0.0.1:8080/health
sudo systemctl restart portfolio-rag-api
sudo systemctl restart portfolio-rag-worker
curl --fail --silent http://127.0.0.1:8090/health | jq
```

진행 중 요청은 중단되므로 오류율이 낮은 시간에 수행한다. worker는 `FOR UPDATE SKIP LOCKED`와 stale lock 회수로 복구하며, atomic activation RPC가 `desired_revision`을 다시 확인하므로 중간 재시작으로 구 revision이 활성화되지 않는다.

## HMAC/SSE 진단

운영 비밀을 명령줄 인수나 shell history에 쓰지 않는다. 보호된 환경을 읽는 임시 진단 스크립트에서 `{timestamp}.{requestId}.{rawBody}`의 HMAC-SHA256을 만들고 다음을 확인한다.

- timestamp 허용 오차 60초, request ID UUID, 같은 ID 5분 재사용 거절
- `Content-Type: application/json`, `Accept: text/event-stream`, 본문 16KB 이하
- 성공은 `status(searching) → sources → status(generating) → token → done` 순서
- 근거 없음은 `sources(items:[]) → error(NO_RELEVANT_CONTEXT)`로 끝나며 LLM을 호출하지 않음
- 최대 10초 간격 `: heartbeat`, `done.requestId`가 서명 request ID와 동일
- 클라이언트 연결 취소 시 하위 llama.cpp 요청과 큐 대기가 정리됨

서명 오류의 외부 응답은 상세 원인을 숨긴 401이다. 서버 시간을 NTP로 동기화하고, secret rotation 시 Vercel과 Oracle을 짧은 유지보수 창에서 함께 바꾼다.

## 품질 평가와 릴리스 게이트

모델, 프롬프트, 임베딩, 검색 임계값 또는 청킹 규칙을 바꾸기 전후로 같은 `data/chatbot/evaluation-cases.json` 50건을 실행한다. 우선 `portfolio-rag-evaluate --dry-run`으로 평가셋 자체를 검증하고, staging API를 대상으로 실제 평가한다. 실행 명령과 비밀 관리 방식은 설치 문서의 “최초 인덱싱과 확인” 절을 따른다.

평가 JSON에는 다음을 릴리스 기록과 함께 보관한다.

- Git SHA와 평가셋 SHA-256
- 모델·임베딩·프롬프트 버전
- 검색 임계값, top K, 후보 수
- 출처·거절·개인정보 경계 통과율과 first-token/전체 지연
- 실패한 case ID와 검사 이름(질문·답변 원문은 저장하지 않음)

`releaseGate.passed=false`이거나 critical case가 하나라도 실패하면 공개 연결을 켜지 않는다. 실패 유형을 고친 뒤 같은 설정으로 재평가하고, 통과한 결과 파일을 이전 결과와 함께 보존한다.

## 롤백

1. `CHATBOT_ENABLED=false`로 중계 API를 끈다.
2. 위젯 공개 플래그를 끄고 Vercel을 배포한다.
3. 필요하면 `portfolio-rag-api`, `portfolio-rag-worker`, `portfolio-llm` 순으로 중지한다.
4. RAG 테이블과 원본 콘텐츠는 삭제하지 않는다.
5. 이전 검증 모델/코드 경로로 systemd를 되돌리고 daemon-reload 후 설치 문서의 smoke test를 반복한다.

장애 종료 후 request ID, 시작/복구 시각, 오류 코드 비율, RSS, 원인과 재발 방지를 기록하되 질문·답변 원문은 포함하지 않는다.
