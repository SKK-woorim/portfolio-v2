import { Cpu } from "lucide-react";

/** 답변 단계가 6초를 넘길 때 위에서 내려오는 안내. */
export function ChatbotSlowNotice({ show }: { show: boolean }) {
  return (
    <div className="slow-notice" data-show={show}>
      <div>
        <div className="slow-notice-inner" role="status" aria-hidden={!show}>
          <Cpu size={16} aria-hidden="true" />
          <p><b>답변을 준비하고 있어요.</b> 조금 시간이 걸릴 수 있으니 잠시만 기다려 주세요.</p>
        </div>
      </div>
    </div>
  );
}
