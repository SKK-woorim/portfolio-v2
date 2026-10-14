import { FileCheck2, UserRound, UsersRound } from "lucide-react";
import type { ProjectEvidence } from "@/lib/content/evidence";
import { EvidenceGallery } from "./evidence-gallery";
import { ModelComparison } from "./model-comparison";
import { StorageChart } from "./storage-chart";

const OWNER_LABEL = { me: "본인 담당", team: "팀 결과" } as const;

export function CaseEvidence({ evidence }: { evidence: ProjectEvidence }) {
  return (
    <section className="case-evidence section" aria-labelledby="case-evidence-title">
      <div className="container">
        <div className="case-evidence-head">
          <div>
            <p className="eyebrow">근거 자료</p>
            <h2 id="case-evidence-title" className="case-evidence-title">완료보고서로 확인하는 결과</h2>
          </div>
          <p className="case-evidence-source"><FileCheck2 size={16} aria-hidden="true" />{evidence.source}</p>
        </div>

        <ul className="evidence-metrics">
          {evidence.metrics.map((metric) => (
            <li key={metric.value} data-owner={metric.owner}>
              <span className="evidence-owner">
                {metric.owner === "me" ? <UserRound size={12} aria-hidden="true" /> : <UsersRound size={12} aria-hidden="true" />}
                {OWNER_LABEL[metric.owner]}
              </span>
              <b className="tabular">{metric.value}</b>
              <span className="evidence-metric-label">{metric.label}</span>
              {metric.page ? <span className="evidence-page">보고서 {metric.page}</span> : null}
            </li>
          ))}
        </ul>

        <div className="evidence-detail" data-has-chart={Boolean(evidence.storageChart || evidence.modelComparison)}>
          {evidence.storageChart ? <StorageChart chart={evidence.storageChart} /> : null}
          {evidence.modelComparison ? <ModelComparison comparison={evidence.modelComparison} /> : null}
          <div className="evidence-timeline">
            <span className="evidence-kicker">수행 일정</span>
            <ol>
              {evidence.timeline.map((milestone) => (
                <li key={`${milestone.date}-${milestone.label}`}>
                  <time className="tabular">{milestone.date}</time>
                  <span>{milestone.label}</span>
                </li>
              ))}
            </ol>
            {evidence.timelinePage ? <p className="evidence-cite">완료보고서 {evidence.timelinePage} 수행 일정 기준</p> : null}
          </div>
        </div>

        <EvidenceGallery figures={evidence.figures} />
        {evidence.scope ? <p className="evidence-scope">공개 범위 · {evidence.scope} 고객 식별 정보와 내부 주소는 가림 처리했습니다.</p> : null}
      </div>
    </section>
  );
}
