import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

export function SectionHeading({ eyebrow, title, description, align = "left" }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display mt-3 text-4xl leading-[1.08] text-[var(--ink)] sm:text-5xl">{title}</h2>
      {description ? <p className="mt-5 text-base leading-7 text-[var(--body)] sm:text-lg">{description}</p> : null}
    </div>
  );
}
