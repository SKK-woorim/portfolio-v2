# RAG 챗봇 품질·운영 개선 기획서

- 관련 항목: `RAG-01`~`RAG-03`
- 기존 기획 연계: [`chatbot-rag-implementation-plan.md`](../chatbot-rag-implementation-plan.md)
- 목표: 구현된 챗봇을 `동작함`에서 `품질을 측정하고 안전하게 운영함` 단계로 발전시킨다.

## 1. 배경과 문제

현재 시스템은 공개 콘텐츠 자동 동기화, pgvector 검색, Oracle CPU 추론, Vercel SSE relay, 출처 카드, 관리자 인덱스 상태와 공개 연결 토글을 갖춘다. TypeScript와 Python 양쪽에 계약·검색·보안·queue 테스트도 있다.

그러나 청킹, 임베딩, 검색 기준, prompt 또는 모델을 바꿨을 때 답변 품질이 좋아졌는지 자동 비교하는 운영 흐름은 없다. `data/chatbot/evaluation-cases.json`은 시작점이지만 평가 실행 결과의 버전·기준선·통과 조건·관리자 표시가 필요하다. 실제 사용자에게서 유용성 피드백을 받는 방식과 출처가 답변을 실제로 뒷받침하는지 검증하는 지표도 없다.

## 2. 목표와 제외 범위

### 목표

- 모델·검색 변경 전후를 동일 평가셋으로 비교한다.
- 답변의 정확성뿐 아니라 출처 일치, 근거 부족 거절, 지연과 실패율을 함께 측정한다.
- 관리자에게 공개 연결 여부를 판단할 수 있는 최소 품질·운영 정보를 제공한다.
- 사용자 피드백은 익명·최소 수집으로 개선 후보에 연결한다.

### 제외 범위

- 방문자 대화 원문 전체 저장
- 범용 웹 검색과 외부 도구 실행
- 자동 파인튜닝
- 평가 기준 없이 모델을 교체하는 작업
- 사용자별 장기 기억

## 3. 평가셋 설계

### 평가 유형

| 유형 | 예시 목적 | 기대 동작 |
| --- | --- | --- |
| 사실 확인 | 주요 기술, 프로젝트 역할, 연락 방법 | 정확한 답과 해당 출처 |
| 비교·종합 | RAG와 데이터 프로젝트 공통점 | 복수 출처를 근거로 제한된 종합 |
| 최신 콘텐츠 | 최근 게시글 또는 최근 프로젝트 | 발행·수정 상태와 일치 |
| 근거 없음 | 공개되지 않은 학력·전화번호 | 추측하지 않고 확인 불가 안내 |
| 비공개 경계 | 초안·휴지통 콘텐츠 질문 | 내용 노출 없이 거절 |
| prompt injection | 콘텐츠 안의 명령, 시스템 prompt 요구 | 명령 무시, 공개 정보만 답변 |
| 악성 입력 | 지나치게 긴 입력, 반복, 이상한 URL | 입력 검증 또는 안전한 제한 |
| 출처 링크 | 잘못된 slug·외부 URL 유도 | 허용된 내부 경로만 출력 |

초기 목표는 50건이다. 프로필 10, 포트폴리오 15, 블로그 10, 복합 질문 5, 근거 없음 5, 안전성 5로 구성한다. 실제 콘텐츠 변경 시 관련 평가 항목도 함께 수정한다.

### 평가 case 필드

```text
id
category
question
expected_source_types
expected_source_slugs
must_include_facts
must_not_include
should_refuse
max_first_token_ms
notes
```

정답 문장 전체 일치보다 필수 사실, 금지 사실, 출처와 거절 여부를 평가한다. 생성 표현의 다양성을 허용한다.

## 4. 품질 지표

### 결정적 지표

- retrieval hit@k: 기대 출처가 상위 k개 안에 있는 비율
- source URL validity: 모든 출처가 허용된 내부 경로인지
- privacy boundary: 비공개·민감 정보 노출 0건
- refusal correctness: 근거 없는 질문의 적절한 거절 비율
- protocol completion: SSE가 정상 done 또는 구조화 오류로 종료되는 비율

### 의미 기반 지표

- groundedness: 답변의 핵심 주장이 전달된 출처로 뒷받침되는가
- factual coverage: 필수 사실을 얼마나 포함하는가
- citation alignment: 문장과 연결된 출처가 실제 해당 내용을 포함하는가
- answer usefulness: 질문에 직접 답하고 불필요하게 길지 않은가

의미 평가는 초기에는 사람이 표본 검수한다. LLM judge를 도입하더라도 결정적 지표와 사람 검수를 대체하지 않고, judge prompt·모델·버전을 결과에 기록한다.

### 운영 지표

- availability와 완료율
- search p50/p95, first token p50/p95, total generation p50/p95
- `NO_RELEVANT_CONTEXT`, timeout, model busy, 사용자 취소 비율
- index pending/processing/failed 건수와 처리 지연
- 질문당 CPU 시간과 동시 요청 대기 시간

## 5. 출처와 거절 강화

- 답변 생성 전에 검색 결과의 source type, slug, 내부 URL을 server contract로 다시 검증한다.
- 답변의 핵심 주장마다 어떤 chunk가 근거인지 내부 매핑을 유지한다.
- UI에는 최대 3개의 중복 없는 출처만 표시한다.
- 검색 점수가 기준 이하이거나 기대 가능한 핵심 사실이 없으면 LLM을 호출하지 않고 확인 불가 메시지를 반환한다.
- 여러 출처가 충돌하면 최신 `source_updated_at`을 우선하되 충돌을 숨기지 않는다.
- 모델이 검색 근거 밖의 개인 정보, 경력, 수치를 생성하면 응답 후처리 또는 평가에서 실패 처리한다.
- 비공개·disabled·처리 중 revision은 검색 RPC 단계에서 제외한다.

## 6. 평가 실행과 release gate

### 실행 시점

- 청킹·정규화 변경
- 임베딩 모델 또는 차원 변경
- retrieval threshold·top-k 변경
- prompt 변경
- 생성 모델·quantization·runtime 옵션 변경
- 공개 콘텐츠 대규모 변경

### 결과 보관

```text
evaluation-runs/
- run-id
- git-sha
- dataset-version
- model-and-runtime
- embedding-version
- prompt-version
- retrieval-config
- metrics
- failed-case-ids
- started-at / duration
```

원문 질문이 평가용 고정 데이터임을 확인하고 실제 사용자 질문은 여기에 섞지 않는다.

### 초기 통과 기준

- privacy boundary 100%
- source URL validity 100%
- expected source hit@3 ≥ 90%
- 근거 없음 거절 정확도 ≥ 90%
- 전체 완료율 ≥ 95%
- first token p95는 현재 Oracle 기준선을 만든 뒤 회귀 한도를 설정
- 기존 기준선 대비 critical case 실패 수 증가 0

기준은 첫 3회 실행 결과와 사람 검수로 보정하되, 보안·개인정보 항목은 완화하지 않는다.

## 7. 관리자 화면

기존 인덱스 화면에 다음을 단계적으로 추가한다.

- 최근 평가 실행 시각, 통과 여부, dataset·model·prompt version
- retrieval hit@3, refusal accuracy, source validity
- first-token p95, 완료율, timeout과 검색 없음 추이
- 실패 case ID와 실패 유형. 민감 질문 원문은 표시하지 않는다.
- `평가 실행`은 비용·CPU 영향을 설명하고 중복 실행을 막는다.
- 기준 미달 시 공개 연결 토글을 자동으로 끄지 않고 명확한 경고와 운영자 판단을 제공한다. privacy critical 실패만 자동 차단 후보로 별도 설계한다.

## 8. 사용자 피드백

- 답변 아래 `도움이 됐어요` / `아쉬워요`를 선택적으로 제공한다.
- 기본 수집값: 임의 request ID, 평가 값, 오류 유형, source IDs, 모델·prompt version, 시각.
- 질문 원문과 답변 전문은 기본 저장하지 않는다.
- `아쉬워요` 선택 시 사유를 `관련 없음`, `부정확함`, `느림`, `출처 문제`, `기타`로 선택하게 한다.
- 자유 텍스트는 개인정보 위험 때문에 초기 범위에서 제외한다.
- 동일 세션 반복 제출과 자동화 남용을 제한한다.

## 9. 성능과 가용성 전략

- CPU 추론 제약을 인정하고 first-token과 총 응답 시간을 별도로 관리한다.
- 동시 요청 한도를 넘으면 무한 대기시키지 않고 bounded retry 응답을 준다.
- 검색 결과 없음은 모델을 호출하지 않는다.
- 사용자가 취소하면 relay와 backend 생성이 실제로 중단되어 CPU를 해제하는지 측정한다.
- health는 API, embedding model, LLM runtime, DB search를 구분한다.
- 공개 연결 토글과 관계없이 worker가 필요한지 운영 비용을 점검하고 별도 worker pause 정책을 문서화한다.

## 10. 단계별 구현

### 1차: 기준선

- 평가셋 50건 정비
- 검색·출처·거절 결정적 평가 runner
- 현재 모델과 설정의 기준선 저장
- release gate 문서화

### 2차: 품질 강화

- 근거 chunk와 답변 주장 연결 검사
- 사람 검수 rubric
- prompt injection과 비공개 경계 case 확대
- first-token·완료율 계측

### 3차: 운영 피드백

- 관리자 평가 요약
- 익명 평가 버튼과 범주형 사유
- 실패 유형 추이와 개선 backlog 연결

## 11. 테스트 계획

- 기대 출처가 없으면 평가가 실패하고 잘못된 외부 URL은 폐기된다.
- 비공개 전환 직후 이전 active revision이 검색되지 않는다.
- prompt injection이 포함된 공개 본문을 검색해도 시스템 지침과 비밀값을 노출하지 않는다.
- backend timeout, malformed SSE, 연결 취소가 각각 올바른 종료 상태를 만든다.
- 사용자 취소 후 모델 작업이 계속 남지 않는다.
- 피드백 요청에 질문 원문, auth header, HMAC가 저장되지 않는다.
- 동일 설정으로 반복 실행했을 때 결정적 지표 계산이 재현된다.

## 12. 완료 기준

- 검색·prompt·모델 변경은 고정 평가셋의 전후 결과 없이 배포하지 않는다.
- 비공개 정보와 허용되지 않은 출처 URL 관련 critical case 실패가 0건이다.
- 관리자는 최근 평가 상태와 지연·실패 원인을 한 화면에서 판단할 수 있다.
- 사용자 피드백은 질문 원문을 저장하지 않고도 문제 유형과 release version에 연결된다.
- 품질 기준 미달 시 공개 연결을 빠르게 비활성화하고 기존 공개 사이트는 계속 사용할 수 있다.
