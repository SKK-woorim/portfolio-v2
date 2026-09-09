import type { SiteProfile } from "@/lib/content/types";

export const demoProfile: SiteProfile = {
  displayName: "송경근",
  roleTitle: "AI Agent & RAG Engineer",
  headline: "AI Agent와 RAG, 데이터를 연결해 실제로 작동하는 워크플로우를 만듭니다.",
  bio: "비정형 문서의 OCR·전처리·청킹부터 지식베이스 구축, NL2SQL, Python·SQL 기반 ETL까지 설계하고 구현하는 AI 엔지니어 송경근입니다.",
  email: "swoorim31@gmail.com",
  socialLinks: [
    { label: "GitHub", href: "https://github.com/SKK-woorim" },
  ],
  skills: ["Python", "AI Agent", "RAG", "Dify", "LLM", "NL2SQL", "SQL", "ETL", "ClickHouse", "OCR"],
};
