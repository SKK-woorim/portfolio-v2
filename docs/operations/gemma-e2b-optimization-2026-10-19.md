# Gemma 4 E2B CPU 서버 최적화 기록

## 실제 실행 환경

- 모델: `/opt/portfolio-rag/models/gemma-4-E2B_q4_0-it.gguf`
- 런타임: llama.cpp b9298, commit `c0c7e147e7efa6c5858754b47259ba4880f8a906`
- CPU: ARM Neoverse-N1, 2코어. RAM 약 11 GiB. NVIDIA GPU 없음.
- 서비스: `portfolio-llm`, `127.0.0.1:8080`. 컨텍스트 8192, 생성 스레드 2, parallel 1.
- 모델 양자화, reasoning 설정, API의 출력 상한은 변경하지 않는다.

## 검토한 vLLM PR

[KV-sharing fast prefill #60445](https://github.com/vllm-project/vllm/pull/60445),
[fused Triton kernels #60674](https://github.com/vllm-project/vllm/pull/60674),
[attention #60317](https://github.com/vllm-project/vllm/pull/60317),
[MTP #60689](https://github.com/vllm-project/vllm/pull/60689)를 검토했다.
이는 vLLM의 모델 구현과 GPU 실행 경로에 대한 변경이므로 현재 llama.cpp 서비스에
그대로 적용할 수 없다. 해당 PR의 A100 성능 수치를 현재 CPU 서버의 기대 성능으로 사용하지 않는다.
vLLM GPU 경로로 이전하려면 별도의 GPU 서버와 모델 배포 계획이 필요하다.

## 측정 방법

운영 서비스는 유지하고 동일한 바이너리와 모델을 사용하는 후보 서버를
`127.0.0.1:8081`에 하나씩 띄워 비교했다. 후보는 운영 서비스와 같은 전용 계정으로 실행했다.
캐시를 재사용하지 않는 합성 입력 128/768토큰, 생성 32토큰, greedy, seed 42로
각각 2회 측정했다. 별도 워밍업을 수행하고 생성된 토큰 ID도 기록했다.
이 측정은 설정 비교용이며 RAG 품질 평가나 실제 사용자 지연의 보장은 아니다.

재측정 도구:

```bash
python3 services/rag-api/deploy/benchmark_llm.py \
  --base-url http://127.0.0.1:8081 \
  --label candidate \
  --output /tmp/gemma-candidate.jsonl
```

공유 CPU에서 순차 측정하므로 몇 퍼센트 차이는 호스트 변동일 수 있다.
벤치마크는 요청을 생성하므로 유휴 시간에 실행한다.

## 프롬프트 캐시 메모리

기존 로그의 prompt-state cache 기본 상한은 8192 MiB였다. 모델과 KV 캐시를 포함한
서비스 전체 `MemoryMax=9G`와 별개로 책정되는 값이므로 캐시 상한을 512 MiB로 줄인다.
`--cache-ram 512`는 프롬프트 재사용 기능을 유지한다. 여러 대화의 누적 캐시가
512 MiB를 넘으면 더 이르게 퇴출될 수 있다. 모델 가중치나 KV 캐시 정밀도는 바꾸지 않는다.
이는 메모리 사용 상한의 조정이며, 현재 RSS가 즉시 수 GiB 줄어든다는 의미는 아니다.

## 비교 결과와 채택 결정

각 값은 2회 측정의 산술 평균이며 단위는 토큰/초다.

| 설정 | 입력 128 처리 | 입력 128 뒤 생성 | 입력 768 처리 | 입력 768 뒤 생성 |
| --- | ---: | ---: | ---: | ---: |
| 기존 설정, 최초 측정 | 39.98 | 9.67 | 38.68 | 8.79 |
| Flash Attention off | 40.76 | 9.57 | 38.84 | 7.86 |
| Flash Attention on, ubatch 128 | 41.60 | 9.75 | 38.39 | 8.71 |
| KleidiAI v1.24.0 | 42.03 | 10.40 | 38.55 | 9.64 |
| 기존 설정, 마지막 재측정 | 46.09 | 8.13 | 39.79 | 9.74 |

기준 재측정의 짧은 입력 뒤 생성은 개별 6.11/10.15 토큰/초로 변동이 컸다.
긴 입력 뒤 생성은 기존 설정 재측정 9.74, KleidiAI 9.64로 개선이 없었다.
따라서 Flash Attention, ubatch, CPU 커널은 기존 설정을 유지한다.
최초 측정만 비교해 KleidiAI가 빨라졌다고 결론내리지 않는다.
합성 입력에서 모든 후보의 생성 토큰 ID는 기존 설정과 일치했다.

KleidiAI는 같은 소스 커밋에서 `GGML_CPU_KLEIDIAI=ON`, `GGML_NATIVE=ON`,
Release 설정으로 `ggml-cpu` 타깃만 별도 빌드했다. 전용 계정이 접근 가능한
임시 디렉터리에서 로드했고 `/proc/<pid>/maps`와 `KLEIDIAI=1` 로그로 확인했다.
라이브러리 경로 권한 문제로 기존 커널이 로드되었던 예비 실행은 결과에서 제외했다.
실험용 라이브러리는 운영 `/opt` 바이너리에 설치하지 않았다.

원시 결과와 유효한 커널 로그는
[`deliverables/benchmarks/gemma-e2b-2026-10-19`](../../deliverables/benchmarks/gemma-e2b-2026-10-19)에 보관한다.
추가 속도 개선은 현재 2코어의 자원 한계를 고려해야 하며, 이 작업에서는 모델이나 서버를 교체하지 않았다.

## 적용 및 복원

적용 대상은 `services/rag-api/deploy/systemd/portfolio-llm.service`의
`--cache-ram 512` 한 설정이다. 서비스 유휴 상태와 RAG API 대기열이 비어 있음을
확인한 뒤 기존 unit을 백업하고 `portfolio-llm`을 재시작한다.
`portfolio-rag-api`는 모델 서비스에 대한 `Requires` 의존성 때문에 함께 재기동될 수 있다.
모델이 준비되면 API도 시작하고 임베딩 로딩이 끝나 건강 검사가 통과할 때까지 기다린다.
모델 건강 검사, 한국어 문맥 답변과 산술 답변의 기존 응답 일치,
RAG API의 `modelReady`/`embeddingReady`를 확인한다. 실패하면 기존 unit으로 자동 복원한다.
검증 결과와 정확한 백업 경로는 `deployment-validation.json`에 기록한다.
첫 적용에서는 API 로딩을 기다리지 않은 즉시 검사로 자동 복원이 실행되었다.
API 준비 대기를 추가한 뒤 재적용에 성공했으며, 모델 응답 오류로 인한 복원은 아니었다.
최종 한국어 문맥 답변과 산술 답변은 기존 응답과 모두 일치했고,
RAG API는 `status=ok`, `modelReady=true`, `embeddingReady=true`를 반환했다.
최종 백업은 `/var/backups/portfolio-llm/portfolio-llm-20261019T012454Z.service`다.

수동 복원이 필요할 때는 해당 JSON의 `backup` 경로를 사용한다.

```bash
sudo cp /var/backups/portfolio-llm/<RECORDED-BACKUP>.service /etc/systemd/system/portfolio-llm.service
sudo systemctl daemon-reload
sudo systemctl restart portfolio-llm
curl --fail --silent --retry 40 --retry-delay 3 http://127.0.0.1:8080/health
sudo systemctl start portfolio-rag-api
curl --fail --silent --retry 40 --retry-delay 3 --retry-connrefused http://127.0.0.1:8090/health
```
