# 프로젝트 작업 지침

## 프로젝트 목적

이 저장소는 개인 포트폴리오 웹사이트를 제작·운영하기 위한 공간이다.

## 파일 및 산출물 정리

- 새 파일을 만들기 전, 기존 폴더 구조를 먼저 확인하고 가장 알맞은 위치에 저장한다. 프로젝트 루트에는 설정 파일, 최상위 안내 문서, 꼭 필요한 진입 파일만 둔다.
- 웹사이트 소스 코드는 사용하는 기술 구조에 맞는 소스 폴더(예: `src/`, `app/`, `components/`, `styles/`)에 역할별로 분리한다.
- 이미지·아이콘·폰트·영상 등 정적 리소스는 `public/assets/` 아래에 종류 또는 기능별 하위 폴더를 만들어 보관한다.
- 웹사이트에서 사용하는 JSON, 콘텐츠 원본, 구조화 데이터 등은 `data/` 아래에 목적별로 보관한다. 비밀 정보나 접근 토큰은 데이터 파일에 저장하거나 커밋하지 않는다.
- 기획 메모, 조사 자료, 운영 안내 등 문서는 `docs/` 아래에 주제별로 보관한다.
- 사용자에게 전달할 최종 파일, 내보낸 이미지·PDF 등 작업 과정에서 생기는 산출물은 `deliverables/` 아래에 유형별로 보관한다. 임시 파일은 필요한 경우 `tmp/` 또는 해당 작업 폴더의 임시 하위 폴더에 두고, 최종 산출물과 섞지 않는다.
- 작업 중 새로 생기는 데이터·자료·출력물도 성격에 맞는 기존 폴더에 넣고, 맞는 위치가 없으면 의미가 분명한 새 하위 폴더를 만든다. 관련 없는 파일을 한 폴더에 모아 두지 않는다.
- 파일과 폴더 이름은 특별한 사유가 없으면 소문자 `kebab-case`로 짓고, 무엇을 담는지 알 수 있게 이름을 정한다.
- 사용자가 이미 만든 파일이나 폴더는 요청 없이 대규모로 이동·이름 변경·삭제하지 않는다. 새 작업으로 만드는 파일과 명확히 안전한 정리만 적용한다.
- `HOB_GML_Implementation.md`는 현재 포트폴리오 프로젝트와 관련 없는 문서로 취급한다. 이 파일은 어떤 경우에도 삭제하지 않으며, 이동·이름 변경·내용 수정도 사용자의 명시적 요청이 있을 때만 한다.
- 작업을 마친 뒤 새로 만든 파일이 적절한 위치에 있는지 확인하고, 불필요한 중복 파일이나 루트에 남은 임시 파일이 없는지 점검한다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
