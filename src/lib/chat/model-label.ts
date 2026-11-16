export function parseChatbotModelLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  if (!label || label.length > 80 || /[\p{Cc}]/u.test(label)) return null;
  return label;
}
