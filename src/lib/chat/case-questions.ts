/** 사례 상세의 "이 사례에 대해 묻기" 질문. 저장된 답변 생성 스크립트도 같은 문구를 쓴다. */
export function caseAskQuestions(title: string) {
  return [`${title}에서 맡은 역할은 무엇인가요?`, `${title}의 결과를 알려주세요.`];
}
