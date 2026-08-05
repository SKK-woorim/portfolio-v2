# Portfolio V2 디자인 기준

이 문서는 [VoltAgent awesome-design-md의 Coinbase DESIGN.md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/coinbase/DESIGN.md)를 읽고, Portfolio V2 기획서에 맞게 재해석한 구현 기준이다. 원본의 브랜드·콘텐츠·상표는 사용하지 않는다.

## 방향

- 밝고 신뢰감 있는 블루 기반의 편집형 포트폴리오.
- 넉넉한 섹션 여백, 단정한 정보 위계, 하나의 강한 CTA만 두는 흐름.
- 공개 영역은 흰 바탕과 옅은 블루 밴드를 중심으로, 첫 화면과 마지막 CTA만 짙은 네이비 배경을 사용한다.
- 표면은 평평하게 유지하며 구분선 또는 한 단계의 부드러운 그림자만 사용한다.

## 토큰

| 역할 | 값 | 사용 |
| --- | --- | --- |
| Primary | `#0B3A78` | 브랜드, 주 CTA, 링크 강조 |
| Primary Action | `#1463C3` | CTA hover/active |
| Primary Soft | `#EAF3FF` | 옅은 구획·태그 |
| Canvas | `#F5F9FF` | 페이지 바탕 |
| Surface | `#FFFFFF` | 카드·입력 영역 |
| Ink | `#172033` | 제목·중요 본문 |
| Body | `#5E6B80` | 기본 본문 |
| Border | `#D7E4F5` | 구분선 |
| Dark | `#0A1930` | 히어로·마지막 CTA |

## 구현 규칙

- CTA는 44px 이상 높이의 알약형 버튼으로 만든다.
- 카드는 24px 반경, 내부 여백 24~32px, 얇은 테두리를 기본으로 한다.
- 제목은 Pretendard Variable 400~600 굵기와 약한 음수 자간을 사용한다. 과도한 굵은 제목을 피한다.
- 넓은 화면에서는 콘텐츠 폭을 1200px로 제한하고, 섹션 위아래 여백은 96px를 기본으로 한다.
- 768px 미만에서는 메뉴를 햄버거로 바꾸고, 카드 그리드는 한 열로 축소한다.
- 포트폴리오 히어로에는 실제 프로젝트의 정보 구조를 암시하는 레이어드 카드만 사용하며, 장식적 그라데이션·유리 효과·강한 그림자는 쓰지 않는다.
