const CITATION_TOKEN = /(\[S[1-9]\d?\])/g;

/** 답변의 [S1] 출처 표시를 번호 칩으로 바꿔 보여준다. */
export function CitedText({ text }: { text: string }) {
  return (
    <>
      {text.split(CITATION_TOKEN).map((part, index) => {
        const match = part.match(/^\[S([1-9]\d?)\]$/);
        return match
          ? <span className="cite" key={index} aria-label={`출처 ${match[1]}`}>{match[1]}</span>
          : part;
      })}
    </>
  );
}
