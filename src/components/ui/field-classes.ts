/**
 * 관리자 입력 필드의 공용 클래스.
 *
 * - 글꼴은 `max(1rem, 1em)`: 라벨(text-sm·text-xs)의 크기를 물려받아도 16px 아래로 내려가지 않아
 *   iOS가 포커스 때 화면을 확대하지 않는다. 더 큰 문맥에서는 그 크기를 따른다.
 * - 크기 변형(min-h-12 / min-h-11 / min-h-9)과 모양은 기존 화면과 같다.
 */

/** 입력·select·textarea 공통 글꼴. */
export const fieldTextClass = "font-normal text-[length:max(1rem,1em)]";

const outlineClass = "border border-[var(--border)] outline-none focus:border-2 focus:border-[var(--primary-action)]";

/** 기본 입력(로그인·콘텐츠 폼): 48px. */
export const inputFieldClass = `min-h-12 rounded-xl px-4 ${outlineClass} ${fieldTextClass}`;

/** 기본 select. 입력과 같은 크기에 흰 배경. */
export const selectFieldClass = `${inputFieldClass} bg-white`;

/** 다이얼로그·업로드 패널 안의 입력: 44px, 흰 배경. */
export const inputFieldMediumClass = `min-h-11 rounded-xl bg-white px-3 ${outlineClass} ${fieldTextClass} disabled:cursor-not-allowed disabled:bg-[#eef1f5]`;

/** 미디어 카드처럼 좁은 곳의 입력: 36px. */
export const inputFieldCompactClass = `min-h-9 rounded-lg bg-white px-2.5 ${outlineClass} ${fieldTextClass} disabled:bg-[#eef1f5]`;

/** 파일 선택. 글자를 입력받지 않아 확대 문제가 없으므로 기존 크기를 유지한다. */
export const fileFieldClass = "min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-60";

/**
 * textarea 최소 높이(빈 상태). 미지원 브라우저의 `rows` 높이와 같게 `줄 수 × lh + 세로 여백 + 테두리`로 잡는다.
 * Tailwind가 정적 문자열만 읽으므로 쓰는 줄 수만 나열한다.
 */
const textareaMinHeight = {
  2: "min-h-[calc(2lh+1.5rem+2px)]",
  3: "min-h-[calc(3lh+1.5rem+2px)]",
  5: "min-h-[calc(5lh+1.5rem+2px)]",
} as const;

export type TextareaRows = keyof typeof textareaMinHeight;

/**
 * 내용에 맞춰 늘어나는 textarea(`field-sizing: content`).
 * - 가로 폭을 `w-full`로 고정해 긴 placeholder가 첫 글자 입력 때 가로로 줄어들지 않게 한다.
 * - `height`를 주면 field-sizing이 무력화되므로 최소·최대 높이만 준다.
 * - 미지원 브라우저는 `rows` 고정 높이로 동작한다(JS 폴백 없음). 같은 `rows` 값을 함께 넘긴다.
 */
export function textareaFieldClass(rows: TextareaRows) {
  return `${textareaMinHeight[rows]} max-h-[min(20lh,70vh)] w-full field-sizing-content rounded-xl px-4 py-3 ${outlineClass} ${fieldTextClass}`;
}
