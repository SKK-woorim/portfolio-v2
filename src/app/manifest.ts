import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "송경근 — AI Engineer Portfolio",
    short_name: "송경근 Portfolio",
    description: "AI Agent, RAG, NL2SQL과 ETL 워크플로우를 설계하고 구현하는 AI 엔지니어 포트폴리오",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#0a1930",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
