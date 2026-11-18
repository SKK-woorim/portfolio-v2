# HyperCLOVA X 1.5B Q8_0 검증 및 모델명 표시 배포 기록

## 최종 결정

사용자가 품질 검증 결과를 확인하고 기존 Gemma 유지 및 모델명 표시 기능 배포를 선택했다. 운영 생성 모델은 Gemma 4 E2B Q4_0, 임베딩은 기존 EmbeddingGemma 300M을 유지한다. 운영 프롬프트도 시험 전 원본으로 복원했다. Q8 시험용 모델 서버와 API는 종료했으며, 내려받은 Q8 파일은 비활성 시험 파일로만 남겨 둔다.

## 시험 모델과 실행 설정

- 원본 모델: `naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-1.5B`
- GGUF 배포자: `cherryDavid/HyperCLOVAX-SEED-Text-Instruct-1.5B-Q8_0-GGUF`
- GGUF revision: `fda4577218ac3e345cd65ce6f16def669ca42a96`
- 양자화: `Q8_0`, 파일 크기 `1,929,646,944` bytes
- SHA-256: `bb698279be71986ac833c5e07830ff2a035dca51d74ac0a6122fc778a5d7f4fb`
- 설치 경로: `/opt/portfolio-rag/models/hyperclovax-seed-text-instruct-1.5b-q8_0-fda4577218ac.gguf`
- 런타임: 기존 llama.cpp `b9298-c0c7e147e`, ARM CPU 2코어
- 컨텍스트 8192, 생성 스레드 2, parallel 1, prompt cache 상한 512 MiB
- GGUF에 포함된 대화 템플릿을 `--jinja`로 적용
- API 생성 상한 200토큰, temperature 0.2, top-p 0.9

다운로드 URL과 배포 정보는 [model.json](../../deliverables/benchmarks/hyperclovax-1.5b-q8-2026-11-03/model.json)에 기록한다. 파일 전체 체크섬은 공개 LFS 체크섬과 일치했다. 이 파일은 입력 임베딩과 출력 행렬을 각각 저장하지만 두 Q8_0 행렬의 SHA-256이 같아, 중복 저장 여부도 확인했다.

임베딩은 기존 EmbeddingGemma 300M 고정 snapshot과 768차원을 유지한다. 검색 임계값 0.31, 청킹, DB 스키마와 인덱스는 변경하지 않는다.

## 답변 품질 검증

기존 시스템 지침, 질문 뒤의 짧은 지침, 네이티브 `tool_list` 입력, 축약 프롬프트, 출력 문법 제약을 점검했다. 출처에 없는 URL 생성과 자료가 있는데도 답변을 거절하는 문제가 남아 Q8을 운영에 적용하지 않았다. 시험 프롬프트 및 `--jinja` 변경은 최종 소스에서 제거했다.

## 로컬 모델명 확인

RAG API는 시작할 때 `LLAMA_MODEL_LABEL`을 읽어 `/health`의 `modelLabel`에 제공한다. 모델 ID나 로컬 파일 경로는 공개 응답에 추가하지 않는다.

공개 챗봇은 모델에 관계없이 같은 대기 안내를 표시한다. 로컬 모델 교체 배포 시에는 다음 순서를 따른다.

1. 새 모델의 파일·revision·체크섬을 검증한다.
2. `/etc/portfolio-rag.env`의 `LLAMA_MODEL_FILE`, `LLAMA_MODEL_ID`, `LLAMA_MODEL_SHA256`, `LLAMA_MODEL_LABEL`을 함께 변경한다.
3. 모델 서버와 RAG API를 재시작하고 `/health`의 준비 상태와 표시값을 확인한다.

Vercel 배포에는 `.vercelignore`를 적용해 별도 배포하는 Python 서비스, 가상환경, 문서, 검증 산출물과 비밀 환경 파일을 제외한다.

## 검증 결과

운영 Gemma와 시험 Q8은 내부 포트 8080/8081, RAG API는 8090/8091에서 비교했다. 동일한 `data/chatbot/evaluation-cases.json`을 사용한다.

- 기존 Gemma: 50건 중 36건 통과. 기존 검색 출처 누락, 필수 표현 누락과 거절 판정 실패를 포함한다. 기존 전체 릴리스 게이트도 통과하지 않는다.
- 초기 Q8: 형식 지시 누락을 확인한 16건 부분 평가를 보관하고 중단했다.
- 시험 API 파일 교체 후 그룹 소유권 누락으로 기동 실패가 한 번 발생했다. 읽기 권한을 수정하고 서비스 계정의 import와 API 준비 상태를 확인했다. 기동 전 연결 실패 50건은 모델 품질 평가에서 제외한다.
- 보정 Q8: 50건 중 32건 통과. 로컬 웹 빌드와 겹친 검색 timeout 1건이 포함된다. 출처에 없는 URL 생성과 자료가 있어도 거절하는 응답이 남았고, 후속 입력 형식·프롬프트·출력 제약 점검에서도 해결되지 않아 운영 모델 전환을 취소했다.
- Python API·설정·스트리밍·프롬프트 테스트 21건 통과.
- 웹 모델명 탐색·준비 상태·상태 API·위젯 테스트 28건 통과.
- TypeScript 검사와 변경 파일 ESLint 및 웹 production 빌드가 통과했다.

보고서에는 질문·답변 원문 대신 판정, 해시, 지연과 형식 검사 결과를 저장한다. 짧은 별도 모델 확인에는 공개 합성 문맥만 사용한다. 공유 2코어 서버에서 웹 빌드 등도 수행하므로 지연 측정은 운영 성능 보장으로 해석하지 않는다.

## 백업과 복원

전환 전 백업 디렉터리: `/var/backups/portfolio-llm/hyperclovax-20261103T021800Z`.

이 디렉터리는 root 전용이며 운영 환경 파일, 기존 systemd unit과 변경 전 `config.py`, `main.py`, `prompting.py`를 보관한다. 비밀 환경 파일은 저장소와 검증 산출물에 복사하지 않는다. 기존 Gemma GGUF 파일도 유지한다.

이번 배포에서는 대기열이 비어 있는지 확인한 뒤 API만 재시작했다. LLM 서버는 재시작하거나 모델을 교체하지 않았다. 환경 파일에는 `LLAMA_MODEL_LABEL="Gemma 4 E2B · Q4_0"`만 추가했다. API의 `config.py`·`main.py`에 표시 기능을 반영하고 원본 프롬프트 및 Gemma 모델 경로를 확인했다. API 적용 실패 시 원본 환경·API 파일을 복원하도록 배포했다.

웹의 전환 전 production 배포: `https://portfolio-j93wwjo8r-skk-woorim1.vercel.app`.

## 표시 기능 배포 완료

기존 `skk-woorim1/portfolio` 프로젝트에 승인된 소스 중 333개(6,706,859바이트)만 격리한 경로에서 업로드했다. production 설정으로 빌드한 배포를 도메인 할당 전에 검증하고 같은 빌드를 승격했다.

- 공개 주소: https://portfolio-three-chi-dgdi7wj28c.vercel.app
- 배포: `dpl_5tVCWK8V29U8dCFPJT8Kj8t9SURn` / `portfolio-bcx5erngj-skk-woorim1.vercel.app`
- 공개 readiness 전체 `ready`, 챗봇 `enabled`, 브라우저 번들 표시 `Gemma 4 E2B · Q4_0` 확인.
- 서버 실제 검색·생성 2건 통과, 웹 중계기 SSE 답변 1건 정상 종료 및 출처 확인. 이는 표시 기능 배포 확인이며 기존 50건 품질 평가 실패를 해소했다는 의미는 아니다.
- 최근 15분 배포 runtime error 로그 0건. 운영 LLM/API/워커 active, Q8 시험 서비스 inactive.
- 최종 결과: [웹 배포 검증](../../deliverables/benchmarks/hyperclovax-1.5b-q8-2026-11-03/web-label-deployment.json), [서버 적용 기록](../../deliverables/benchmarks/hyperclovax-1.5b-q8-2026-11-03/backend-label-deployment.json).
