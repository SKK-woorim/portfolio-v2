import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  level?: 1 | 2;
};

export function SectionHeading({ eyebrow, title, description, align = "left", level = 2 }: SectionHeadingProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <p className="eyebrow">{eyebrow}</p>
      <Heading className="display mt-3 text-4xl leading-[1.08] text-[var(--ink)] sm:text-5xl">{title}</Heading>
      {description ? <p className="mt-5 text-base leading-7 text-[var(--body)] sm:text-lg">{description}</p> : null}
    </div>
  );
}
