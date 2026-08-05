import type { BlogPost, PortfolioItem, SiteProfile } from "@/lib/content/types";

export const demoProfile: SiteProfile = {
  displayName: "Woorim Kim",
  roleTitle: "Product-minded Developer",
  headline: "복잡한 문제를 이해하기 쉬운 디지털 경험으로 바꿉니다.",
  bio: "사용자 맥락과 구현의 균형을 바탕으로, 오래 사용할 수 있는 웹 제품을 설계하고 만듭니다.",
  email: "hello@example.com",
  socialLinks: [
    { label: "GitHub", href: "https://github.com" },
    { label: "LinkedIn", href: "https://linkedin.com" },
  ],
  skills: ["Next.js", "TypeScript", "React", "Supabase", "Product Design"],
};

export const demoPortfolioItems: PortfolioItem[] = [
  {
    id: "project-portfolio-v2",
    slug: "portfolio-v2",
    title: "Portfolio V2",
    type: "Personal Project",
    period: "2026",
    summary: "콘텐츠 운영과 개인 브랜딩을 한 곳에서 관리하는 포트폴리오 플랫폼입니다.",
    body: [
      "정적인 소개 페이지를 넘어, 작업 기록과 글을 지속적으로 발행할 수 있는 개인 제품을 설계했습니다.",
      "공개 경험은 빠르고 편안한 읽기 흐름에 집중하고, 관리자는 로그인 후 콘텐츠를 안전하게 운영할 수 있도록 분리했습니다.",
    ],
    tags: ["Next.js", "Supabase", "CMS"],
    links: [{ label: "Project brief", href: "/portfolio/portfolio-v2" }],
    featured: true,
    accent: "navy",
  },
  {
    id: "project-design-system",
    slug: "design-system-foundation",
    title: "Design System Foundation",
    type: "Design Engineering",
    period: "2025",
    summary: "여러 화면에서 일관된 속도와 품질을 만드는 UI 토큰과 컴포넌트 기반입니다.",
    body: [
      "색상, 간격, 타이포그래피, 상태를 토큰으로 정리해 제품 전반의 의사결정을 단순화했습니다.",
      "접근성 있는 기본 컴포넌트를 만들고 반복 작업을 줄이는 데 초점을 맞췄습니다.",
    ],
    tags: ["Design Tokens", "React", "Accessibility"],
    links: [{ label: "Case study", href: "/portfolio/design-system-foundation" }],
    featured: true,
    accent: "blue",
  },
  {
    id: "project-data-dashboard",
    slug: "data-dashboard",
    title: "Data Dashboard",
    type: "Product Development",
    period: "2024",
    summary: "운영 데이터를 실행 가능한 인사이트로 연결하는 관리자용 대시보드입니다.",
    body: [
      "데이터가 많은 환경에서도 우선순위를 빠르게 판단할 수 있도록 정보 구조를 재설계했습니다.",
      "반응형 레이아웃과 명확한 상태 표현으로 운영 흐름을 안정적으로 지원했습니다.",
    ],
    tags: ["TypeScript", "Dashboard", "UX"],
    links: [{ label: "Case study", href: "/portfolio/data-dashboard" }],
    featured: true,
    accent: "sky",
  },
];

export const demoPosts: BlogPost[] = [
  {
    id: "post-building-calm-interfaces",
    slug: "building-calm-interfaces",
    title: "복잡한 제품을 차분하게 만드는 인터페이스의 기준",
    excerpt: "정보가 많은 화면에서도 사용자가 다음 행동을 빠르게 이해하도록 만드는 몇 가지 설계 원칙을 정리합니다.",
    body: [
      "좋은 인터페이스는 요소를 많이 보여주는 것이 아니라, 지금 필요한 정보를 가장 먼저 보이게 하는 데서 시작합니다.",
      "정보의 중요도, 문맥, 사용 빈도를 함께 고려하면 화면의 밀도는 유지하면서도 사용자는 덜 피로해집니다.",
    ],
    category: "Product",
    tags: ["UX", "Product Design"],
    publishedAt: "2026-07-18",
    readingMinutes: 4,
  },
  {
    id: "post-server-first-nextjs",
    slug: "server-first-nextjs",
    title: "Next.js에서 서버 중심으로 콘텐츠 경험 설계하기",
    excerpt: "공개 콘텐츠와 관리자 상호작용을 분리해 빠르고 안전한 웹을 구성하는 방법을 살펴봅니다.",
    body: [
      "공개 페이지는 서버에서 필요한 데이터를 준비하면 초기 화면을 더 단순하게 유지할 수 있습니다.",
      "관리자 화면의 변경 작업은 서버에서 권한과 입력값을 검증해 데이터 경계를 명확하게 만듭니다.",
    ],
    category: "Engineering",
    tags: ["Next.js", "Architecture"],
    publishedAt: "2026-06-30",
    readingMinutes: 6,
  },
  {
    id: "post-writing-case-studies",
    slug: "writing-better-case-studies",
    title: "작업을 설득력 있는 포트폴리오로 기록하는 법",
    excerpt: "결과만 나열하지 않고 문제, 역할, 판단, 결과를 연결해 작업의 맥락을 전달하는 방법입니다.",
    body: [
      "포트폴리오는 무엇을 만들었는지보다 왜 그 선택을 했는지에서 신뢰를 얻습니다.",
      "상황과 제약, 내가 맡은 역할, 바뀐 결과를 간결하게 연결하면 작업의 밀도가 높아집니다.",
    ],
    category: "Career",
    tags: ["Portfolio", "Writing"],
    publishedAt: "2026-06-12",
    readingMinutes: 5,
  },
];
