# Portfolio V2 디자인 기준

이 문서는 [VoltAgent awesome-design-md의 Coinbase DESIGN.md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/coinbase/DESIGN.md)를 읽고, Portfolio V2 기획서에 맞게 재해석한 구현 기준이다. 원본의 브랜드·콘텐츠·상표는 사용하지 않는다.

## 방향

- OG 공유 카드와 연결되는 딥 네이비·전기 블루 기반의 기술 편집형 포트폴리오.
- 넉넉한 섹션 여백, 단정한 정보 위계, 하나의 강한 CTA만 두는 흐름.
- 공개 영역은 딥 네이비 캔버스와 한 단계 밝은 블루 표면을 중심으로 구성한다.
- 데이터 그리드, 연결선, 상태 점을 제한적으로 사용해 AI Agent·RAG·ETL 흐름을 암시한다.
- 표면은 얇은 푸른 테두리와 낮은 대비의 그림자만 사용하며 본문 가독성을 우선한다.

## 토큰

| 역할 | 값 | 사용 |
| --- | --- | --- |
| Primary | `#0B3A78` | 브랜드, 주 CTA, 링크 강조 |
| Primary Action | `#1463C3` | CTA hover/active |
| Primary Soft | `#EAF3FF` | 옅은 구획·태그 |
| Canvas | `#061426` | 공개 페이지 바탕 |
| Surface | `#0B203B` | 공개 카드·콘텐츠 표면 |
| Ink | `#F5F9FF` | 공개 제목·중요 본문 |
| Body | `#ADC2DD` | 공개 기본 본문 |
| Border | `#1B416E` | 공개 구분선 |
| Dark | `#041123` | 히어로·푸터 |

## 구현 규칙

- CTA는 44px 이상 높이의 알약형 버튼으로 만든다.
- 카드는 24px 반경, 내부 여백 24~32px, 얇은 테두리를 기본으로 한다.
- 제목은 Pretendard Variable 400~600 굵기와 약한 음수 자간을 사용한다. 과도한 굵은 제목을 피한다.
- 넓은 화면에서는 콘텐츠 폭을 1200px로 제한하고, 섹션 위아래 여백은 96px를 기본으로 한다.
- 768px 미만에서는 메뉴를 햄버거로 바꾸고, 카드 그리드는 한 열로 축소한다.
- 포트폴리오 히어로에는 OG 카드의 연결형 데이터 파이프라인과 같은 시각 언어를 사용하되, 강한 유리 효과나 과도한 광원은 피한다.
