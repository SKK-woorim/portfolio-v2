"use client";

import { useState } from "react";
import type { StorageChart as StorageChartData } from "@/lib/content/evidence";

const numberFormat = new Intl.NumberFormat("ko-KR");
const sizeFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

function reduction(row: { source: number; stored: number }) {
  return Math.round((1 - row.stored / row.source) * 100);
}

export function StorageChart({ chart }: { chart: StorageChartData }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...chart.rows.map((row) => row.source));
  const totalSource = chart.rows.reduce((sum, row) => sum + row.source, 0);
  const totalStored = chart.rows.reduce((sum, row) => sum + row.stored, 0);
  const activeRow = active === null ? null : chart.rows[active];

  return (
    <figure className="storage-chart">
      <figcaption className="storage-chart-head">
        <span className="evidence-kicker">{chart.title}</span>
        <ul className="storage-legend" aria-label="범례">
          <li><i data-series="source" aria-hidden="true" />{chart.series.source}</li>
          <li><i data-series="stored" aria-hidden="true" />{chart.series.stored}</li>
          <li className="storage-legend-note">오른쪽 숫자: 용량 감소율</li>
        </ul>
      </figcaption>
      <div className="storage-plot" onMouseLeave={() => setActive(null)}>
        {chart.rows.map((row, index) => (
          <div
            key={row.label}
            className="storage-row"
            data-active={active === index}
            tabIndex={0}
            aria-label={`${row.label}: ${chart.series.source} ${sizeFormat.format(row.source)}${chart.unit}, ${chart.series.stored} ${sizeFormat.format(row.stored)}${chart.unit}, ${reduction(row)}% 감소`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            <span className="storage-label">{row.label}<small>{row.tables}개 테이블</small></span>
            <span className="storage-bars" aria-hidden="true">
              <i data-series="source" style={{ width: `max(${(row.source / max) * 100}%, 3px)` }} />
              <i data-series="stored" style={{ width: `max(${(row.stored / max) * 100}%, 3px)` }} />
            </span>
            <span className="storage-delta tabular">−{reduction(row)}%</span>
            {activeRow === row ? (
              <span className="storage-tip" role="presentation">
                <b>{row.label}</b>
                <span><i data-series="source" />{chart.series.source} <em className="tabular">{sizeFormat.format(row.source)}{chart.unit}</em></span>
                <span><i data-series="stored" />{chart.series.stored} <em className="tabular">{sizeFormat.format(row.stored)}{chart.unit}</em></span>
                <span>{numberFormat.format(row.records)}건 · {row.tables}개 테이블</span>
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <p className="storage-total tabular">
        합계 {sizeFormat.format(totalSource)}{chart.unit} → {sizeFormat.format(totalStored)}{chart.unit} (−{Math.round((1 - totalStored / totalSource) * 100)}%)
      </p>
      <details className="storage-table">
        <summary>표로 보기</summary>
        <div className="storage-table-scroll">
          <table>
            <thead><tr><th scope="col">분류</th><th scope="col">테이블</th><th scope="col">건수</th><th scope="col">{chart.series.source}</th><th scope="col">{chart.series.stored}</th><th scope="col">감소율</th></tr></thead>
            <tbody>
              {chart.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="tabular">{row.tables}</td>
                  <td className="tabular">{numberFormat.format(row.records)}</td>
                  <td className="tabular">{sizeFormat.format(row.source)}{chart.unit}</td>
                  <td className="tabular">{sizeFormat.format(row.stored)}{chart.unit}</td>
                  <td className="tabular">{reduction(row)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="evidence-cite">{chart.caption}{chart.page ? ` 완료보고서 ${chart.page}.` : ""}</p>
    </figure>
  );
}
