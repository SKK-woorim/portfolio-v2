import { ArrowUpRight, BarChart3, Layers3, PanelsTopLeft } from "lucide-react";
import Image from "next/image";
import type { PortfolioItem } from "@/lib/content/types";
import { cn } from "@/lib/utils";

const tones = {
  navy: "bg-[#071a33] text-white",
  blue: "bg-[var(--primary)] text-white",
  sky: "bg-[#12365f] text-[#a9d1ff]",
};

export function ProjectVisual({ item, compact = false, priority = false }: { item: PortfolioItem; compact?: boolean; priority?: boolean }) {
  const Icon = item.accent === "navy" ? PanelsTopLeft : item.accent === "blue" ? Layers3 : BarChart3;

  if (item.coverImage) {
    return (
      <div className={cn("relative overflow-hidden rounded-[22px] bg-[var(--dark)]", compact ? "min-h-40" : "min-h-64")}>
        <Image src={item.coverImage.src} alt={item.coverImage.alt} fill priority={priority} sizes={compact ? "(max-width: 768px) 100vw, 33vw" : "(max-width: 1024px) 100vw, 55vw"} className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071a33]/80 via-transparent to-[#071a33]/20" />
        <span className="absolute left-5 top-5 rounded-full border border-white/35 bg-[#071a33]/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">{item.type}</span>
        <p className="absolute bottom-5 left-6 font-mono text-xs text-white/80">{item.period}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-[22px] border border-white/10 p-6", tones[item.accent], compact ? "min-h-40" : "min-h-64")}>
      <div className="relative z-10 flex items-start justify-between">
        <span className="rounded-full border border-current/25 px-3 py-1 text-xs font-semibold">{item.type}</span>
        <Icon size={20} strokeWidth={1.7} />
      </div>
      <div className={cn("absolute right-5 rounded-[18px] border border-white/15 bg-white/10 p-4 backdrop-blur-sm", compact ? "bottom-5 w-36" : "bottom-7 w-52")}>
        <div className="mb-3 h-2 w-2/5 rounded-full bg-white/50" />
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-white/80" />
          <div className="h-2 w-4/5 rounded-full bg-white/35" />
          <div className="h-2 w-3/5 rounded-full bg-white/20" />
        </div>
      </div>
      <div className={cn("absolute rounded-[18px] border border-white/10 bg-[#ffffff12]", compact ? "bottom-7 left-5 h-20 w-28" : "bottom-10 left-7 h-32 w-40")} />
      <p className="absolute bottom-5 left-6 font-mono text-xs text-[#d4e8ff]">{item.period}</p>
      <ArrowUpRight className={cn("absolute right-5 top-14 opacity-25", item.accent === "sky" ? "text-[var(--primary)]" : "text-white")} size={56} strokeWidth={1} />
    </div>
  );
}
