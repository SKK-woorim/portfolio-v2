import { UsersRound } from "lucide-react";
import type { ModelComparison as ModelComparisonData } from "@/lib/content/evidence";

function Change({ before, after }: { before: number; after: number }) {
  return (
    <span className="model-change tabular" data-better={after < before} aria-label={`${before}건에서 ${after}건`}>
      <s>{before}</s><span aria-hidden="true">→</span><b>{after}</b>
    </span>
  );
}

export function ModelComparison({ comparison }: { comparison: ModelComparisonData }) {
  return (
    <div className="model-comparison">
      <div className="model-comparison-head">
        <span className="evidence-kicker">{comparison.title}</span>
        <span className="evidence-owner" data-owner="team"><UsersRound size={12} aria-hidden="true" />팀 결과</span>
      </div>
      <p className="model-comparison-sub">{comparison.baselineLabel} → {comparison.proposedLabel}</p>
      <table>
        <thead>
          <tr><th scope="col">채점 기준</th><th scope="col">유출 (FN)</th><th scope="col">과검 (FP)</th></tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.anchor}>
              <th scope="row">{row.anchor}<small className="tabular">{row.condition}</small></th>
              <td><Change before={row.baseline.fn} after={row.proposed.fn} /></td>
              <td><Change before={row.baseline.fp} after={row.proposed.fp} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="model-comparison-summary">
        {comparison.rows.map((row) => <li key={row.anchor}><b>{row.anchor}</b> {row.summary}</li>)}
      </ul>
      <p className="evidence-cite">{comparison.testSet}{comparison.page ? ` · 완료보고서 ${comparison.page}` : ""}</p>
      <p className="model-comparison-note">{comparison.note}</p>
    </div>
  );
}
