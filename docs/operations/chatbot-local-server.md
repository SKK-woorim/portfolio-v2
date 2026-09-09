# 포트폴리오 챗봇 로컬 서버 설치

이 문서는 Oracle ARM64 호스트에 llama.cpp, FastAPI RAG API, 동기화 워커와 Caddy를 배치하는 기준 절차다. 아래 값은 2026-08-24 운영 배포에서 고정·검증한 기준값이다.

## 1. 배포 전 고정값

다음 값을 변경 기록에 함께 남긴다.

- 공식 Gemma 4 E2B Instruct QAT Q4_0 GGUF의 라이선스 동의 계정, 정확한 파일명, 원 배포처 URL과 SHA-256
- EmbeddingGemma 300M 라이선스 동의 계정, 고정 snapshot revision과 로컬 snapshot 경로
- ARM64에서 빌드한 llama.cpp commit SHA와 빌드 옵션
- 챗봇 전용 DNS 이름, Supabase 프로젝트 ref, 초기 `RAG_MATCH_THRESHOLD`
- 빈 프롬프트/2K/4K 입력 첫 토큰 시간, 320토큰 전체 시간, RSS, 동시 모델 적재 RSS

현재 운영 고정값은 다음과 같다.

- llama.cpp commit: `c0c7e147e7efa6c5858754b47259ba4880f8a906` (b9298, ARM64 release build)
- 생성 모델 revision: `675cff42a74c774d6cb76f76d8eacb49b48c9b93`
- 생성 모델: `gemma-4-E2B_q4_0-it.gguf`, SHA-256 `fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634`
- 임베딩 revision: `57c266a740f537b4dc058e1b0cda161fd15afa75`
- PyTorch: `2.13.0+cpu`, ARM64 wheel SHA-256 `6f307c2c32d764ffc6ff6893b801fad6d4752f3e67966cb8abf1843427c02604`
- Python: `3.12.13`, sentence-transformers: `5.7.0`
- 임시 공개 주소: `portfolio-rag-168-107-39-176.nip.io`
- 운영 검색 임계값: `0.31` (2026-08-24 공개 데이터 평가 세트 기준)

모델 라이선스는 파일을 받기 전에 운영 주체가 직접 검토하고 동의한다. 저장소, 컨테이너 이미지, CI artifact에 모델을 커밋하지 않는다.

## 2. 호스트 준비

Python 3.12, Caddy, curl, Git, C/C++ 빌드 도구를 설치한다. 전용 계정과 디렉터리를 만들고 소유권을 제한한다.

```bash
sudo useradd --system --home /opt/portfolio-rag --shell /usr/sbin/nologin portfolio-rag
sudo install -d -o portfolio-rag -g portfolio-rag -m 0750 /opt/portfolio-rag/{current,models}
sudo python3.12 -m venv /opt/portfolio-rag/venv
sudo /opt/portfolio-rag/venv/bin/pip install --upgrade pip
sudo /opt/portfolio-rag/venv/bin/pip install '/opt/portfolio-rag/current/services/rag-api[test]'
```

RAM이 약 11GiB인 서버에서는 운영 전 4GiB swap 추가를 검토한다. 정상 생성이 지속적으로 swap을 사용하면 컨텍스트/출력 상한을 줄이거나 서버를 증설한다. 디스크는 모델·캐시·로그 외 8GiB 이상을 비워 둔다.

기본/test extra에는 의도적으로 `sentence-transformers`와 PyTorch를 넣지 않는다. ARM64 CPU 서버에서 일반 resolver가 약 2GB의 NVIDIA CUDA 패키지를 선택하는 일을 막기 위해, 공식 PyTorch 배포처에서 Python 3.12·Linux ARM64용으로 확인한 CPU-only wheel의 정확한 버전과 SHA-256을 먼저 고정한다. 검증한 wheel을 설치하고 CUDA 의존성이 없는지 확인한 다음 embedding extra를 설치한다.

```bash
/opt/portfolio-rag/venv/bin/pip install /opt/portfolio-rag/packages/<PINNED-PYTORCH-CPU-ARM64>.whl
/opt/portfolio-rag/venv/bin/python -c 'import torch; assert torch.version.cuda is None; print(torch.__version__)'
/opt/portfolio-rag/venv/bin/pip install '/opt/portfolio-rag/current/services/rag-api[embedding,observability]'
/opt/portfolio-rag/venv/bin/pip check
```

`pip` 출력에 `nvidia-*`, `cuda`, `cublas`, `cudnn` 패키지가 보이면 설치를 중단한다. wheel과 서비스 dependency를 고정한 뒤 staging에서 EmbeddingGemma 로드와 768차원 출력을 확인한다.

## 3. 모델과 llama.cpp

공식 배포처에서 승인된 정확한 파일을 `/opt/portfolio-rag/models/`에 저장하고 symlink나 `latest` 이름을 사용하지 않는다. EmbeddingGemma도 고정 revision을 snapshot 디렉터리로 내려받아 운영에서는 offline 모드로 로드한다.

llama.cpp는 기록한 commit으로 ARM64 release build를 만들고 `/opt/llama.cpp/<PINNED-BUILD>/`에 설치한다. 다음 검증을 10회 연속 통과해야 서비스를 켠다.

```bash
LLAMA_MODEL_FILE=/opt/portfolio-rag/models/<EXACT-MODEL-FILENAME>.gguf \
LLAMA_MODEL_SHA256=<PUBLISHER-VERIFIED-64-HEX-SHA256> \
/opt/portfolio-rag/venv/bin/python services/rag-api/deploy/verify_model.py
```

검증 스크립트는 placeholder, symlink, 누락 파일과 체크섬 불일치를 시작 전에 거절한다. EmbeddingGemma는 API/워커 시작 시 로드하고 768차원이 아니면 시작에 실패한다.

## 4. 환경 변수

[`rag.env.example`](../../services/rag-api/deploy/rag.env.example)을 `/etc/portfolio-rag.env`로 복사하고 모든 placeholder를 실제 배포값으로 바꾼다.

```bash
sudo install -o root -g portfolio-rag -m 0640 \
  services/rag-api/deploy/rag.env.example /etc/portfolio-rag.env
sudoedit /etc/portfolio-rag.env
```

필수 비밀값은 Supabase 서버 전용 secret key(`sb_secret_...`, 레거시 환경은 service-role key)와 Vercel 중계기와 공유하는 HMAC secret이다. 브라우저/Vercel 공개 변수/로그에 서버 전용 키를 복사하지 않는다. `SUPABASE_SERVICE_ROLE_KEY` 환경 변수 이름은 기존 배포 계약을 유지하지만 두 키 형식을 모두 지원한다. 설정은 Pydantic Settings가 프로세스 시작 시 URL, 비밀 길이, placeholder, 모델 ID, 검색 임계값과 timeout 관계를 검증한다.

## 5. systemd 설치

[`deploy/systemd`](../../services/rag-api/deploy/systemd/)의 세 unit이 고정 llama.cpp 경로를 사용하는지 확인한다. Gemma 4의 reasoning 전용 출력이 사용자 답변을 비우지 않도록 llama.cpp는 `--reasoning off`로 실행한다.

```bash
sudo cp services/rag-api/deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio-llm portfolio-rag-api portfolio-rag-worker
sudo systemctl status portfolio-llm portfolio-rag-api portfolio-rag-worker
```

API는 반드시 Uvicorn worker 한 개로 실행한다. 그래야 실행 1개+대기 5개 FIFO 큐와 5분 replay cache가 프로세스 전체에서 일관된다. 여러 API 프로세스로 확장하려면 먼저 공유 큐와 공유 replay 저장소를 도입한다. llama.cpp와 FastAPI는 `127.0.0.1`에만 bind한다.

API와 워커가 EmbeddingGemma를 각각 적재하므로 실제 동시 RSS를 벤치마크한다. 메모리 한계를 넘으면 동기화 시간대에 worker를 timer/oneshot 방식으로 운영하거나 별도 내부 임베딩 서비스로 분리한 뒤 적용한다.

## 6. Caddy와 방화벽

[`Caddyfile.example`](../../services/rag-api/deploy/Caddyfile.example)을 실제 DNS 이름으로 수정하고 검증 후 reload한다.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy는 `/v1/chat` POST와 `/health` GET만 프록시하며 요청 본문을 16KB로 제한하고 SSE buffering을 끈다. 보안 그룹과 호스트 방화벽은 외부 80/443만 허용하고 8080/8090은 열지 않는다. TLS 인증서가 발급된 뒤 Vercel의 `CHAT_BACKEND_URL`을 `https://portfolio-rag-168-107-39-176.nip.io`로 지정한다. 이 호스트명은 초기 운영용 임시 주소이므로 개인 도메인과 예약 공인 IP를 준비하면 교체한다.

## 7. 최초 인덱싱과 확인

DB 마이그레이션 후 관리자 전체 재인덱싱 RPC로 작업을 등록한다. service-role key를 셸 명령줄에 직접 넣지 말고 보호된 환경 파일을 읽는 관리 스크립트나 Supabase 관리 콘솔을 사용한다.

```bash
curl --fail --silent https://portfolio-rag-168-107-39-176.nip.io/health | jq
journalctl -u portfolio-rag-worker --since '10 minutes ago' --no-pager
```

모든 공개 문서가 `ready`인지, 초안·private·hidden·trashed가 제외됐는지 확인한다. 고정 평가셋 50건의 형식과 그룹은 외부 요청 없이 먼저 검증한다.

```bash
cd /opt/portfolio-rag/current/services/rag-api
/opt/portfolio-rag/venv/bin/portfolio-rag-evaluate --dry-run
```

그다음 보호된 환경 파일에 있는 HMAC 비밀을 사용해 실제 API 평가를 실행한다. 비밀값을 명령줄 인수로 전달하지 않는다.

```bash
set -a
. /etc/portfolio-rag.env
set +a
/opt/portfolio-rag/venv/bin/portfolio-rag-evaluate \
  --url https://portfolio-rag-168-107-39-176.nip.io/v1/chat \
  --target-label staging \
  --model-id "$LLAMA_MODEL_ID" \
  --model-runtime "llama.cpp-c0c7e147" \
  --embedding-version "$EMBEDDING_MODEL_ID@57c266a" \
  --prompt-version "rag-v1" \
  --retrieval-threshold "$RAG_MATCH_THRESHOLD" \
  --output /var/lib/portfolio-rag/evaluations/pre-release.json
```

결과에는 질문·답변 원문이나 비밀값 대신 해시, 통과 항목, 지연, 소스 패턴 일치 여부만 남는다. `releaseGate.passed=true`, critical 실패 0건, 출처 URL 유효성 100%, 기대 출처 적중 90% 이상을 확인한 뒤 기능 플래그를 켠다.

## 8. 백업과 갱신

원본 콘텐츠와 RAG 테이블은 Supabase의 정기 백업/PITR 정책에 포함한다. 벡터 청크는 원본에서 재생성 가능하지만 복구 시간 단축을 위해 DB 백업에 유지한다. 모델 파일은 재다운로드 경로·라이선스·SHA-256을 운영 기록에 남기며 비밀 환경 파일은 비밀 관리 시스템에서 별도 복구한다.

새 모델/llama.cpp/EmbeddingGemma revision은 기존 경로를 덮어쓰지 말고 새 버전 경로에 설치한다. 체크섬 검증, 10회 생성, 품질 평가를 마친 뒤 systemd 경로를 바꾸고 rollback용 이전 파일을 한 릴리스 동안 보존한다.
