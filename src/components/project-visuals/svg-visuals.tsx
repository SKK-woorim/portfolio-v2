"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type Edge = { id: string; d: string; tone?: "water" | "hive" };
type Pulse = { edge: string; tone?: "water" | "hive"; begin: number };

/** SMIL 신호 애니메이션을 쓰는 SVG 도식. 움직임 줄이기에서는 정지한다. */
function AnimatedGraph({ viewBox, edges, pulses, children }: { viewBox: string; edges: Edge[]; pulses: Pulse[]; children: ReactNode }) {
  const ref = useRef<SVGSVGElement>(null);
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) ref.current?.pauseAnimations();
  }, []);

  return (
    <svg ref={ref} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g>{edges.map((edge) => <path key={edge.id} id={`${prefix}-${edge.id}`} d={edge.d} className="pv-edge" data-hot={edge.tone ? "true" : undefined} />)}</g>
      {children}
      {pulses.map((pulse) => (
        <circle key={`${pulse.edge}-${pulse.begin}`} r={3} className="pv-pulse" data-tone={pulse.tone}>
          <animateMotion dur="1.6s" begin={`${pulse.begin}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".4 0 .2 1">
            <mpath href={`#${prefix}-${pulse.edge}`} />
          </animateMotion>
        </circle>
      ))}
    </svg>
  );
}

function Node({ x, y, width, height, label, sub, kind }: { x: number; y: number; width: number; height: number; label: string; sub?: string; kind?: "src" | "data" }) {
  return (
    <g className="pv-node" data-kind={kind}>
      <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={9} />
      <text className="pv-text" x={x} y={sub ? y - 5 : y}>{label}</text>
      {sub ? <text className="pv-sub" x={x} y={y + 10}>{sub}</text> : null}
    </g>
  );
}

function Core({ x, y, label, sub }: { x: number; y: number; label: string; sub: string }) {
  return (
    <g className="pv-node" data-kind="core">
      <circle className="pv-ring" cx={x} cy={y} r={50} />
      <circle className="pv-ring" cx={x} cy={y} r={44} strokeDasharray="2 6" />
      <circle cx={x} cy={y} r={38} />
      <text className="pv-text" x={x} y={y - 5}>{label}</text>
      <text className="pv-sub" x={x} y={y + 11}>{sub}</text>
    </g>
  );
}

/* ── AI Agent & RAG: 문서 → OCR → 청크 → 지식베이스 → Agent → SQL ─── */
export function PipelineVisual() {
  const edges: Edge[] = [
    { id: "e1", d: "M92 110C140 110 140 195 186 195", tone: "water" }, { id: "e2", d: "M92 195H186", tone: "water" }, { id: "e3", d: "M92 280C140 280 140 195 186 195", tone: "water" },
    { id: "e4", d: "M246 195C270 195 272 120 300 120" }, { id: "e5", d: "M246 195C270 195 272 170 300 170" }, { id: "e6", d: "M246 195C270 195 272 220 300 220" }, { id: "e7", d: "M246 195C270 195 272 270 300 270" },
    { id: "e8", d: "M322 120C350 120 350 195 380 195" }, { id: "e9", d: "M322 270C350 270 350 195 380 195" },
    { id: "e10", d: "M444 195H468" }, { id: "e11", d: "M510 70V150" },
    { id: "e12", d: "M548 185C580 185 580 120 604 120" }, { id: "e13", d: "M632 138V240", tone: "hive" }, { id: "e14", d: "M548 205C580 205 580 320 604 320" },
  ];
  const pulses: Pulse[] = [
    { edge: "e2", tone: "water", begin: 0 }, { edge: "e1", tone: "water", begin: .6 }, { edge: "e3", tone: "water", begin: 1.2 }, { edge: "e4", begin: .9 }, { edge: "e7", begin: 1.5 },
    { edge: "e8", begin: 1.6 }, { edge: "e9", begin: 2.1 }, { edge: "e10", begin: 2.4 }, { edge: "e11", begin: .2 }, { edge: "e12", begin: 2.9 }, { edge: "e13", tone: "hive", begin: 3.3 }, { edge: "e14", begin: 3.8 },
  ];
  return (
    <AnimatedGraph viewBox="0 0 680 390" edges={edges} pulses={pulses}>
      <Node x={56} y={110} width={72} height={34} label="PDF" kind="src" />
      <Node x={56} y={195} width={72} height={34} label="HWP" kind="src" />
      <Node x={56} y={280} width={72} height={34} label="HWPX" kind="src" />
      <Node x={216} y={195} width={60} height={34} label="OCR" />
      {[120, 170, 220, 270].map((y) => <rect key={y} className="pv-chunk" x={300} y={y - 9} width={22} height={18} rx={4} />)}
      <text className="pv-sub" x={311} y={300}>chunks</text>
      <g className="pv-node">
        <path d="M384 176a28 8 0 0 1 56 0v38a28 8 0 0 1 -56 0z" />
        <text className="pv-text" x={412} y={198}>KB</text>
      </g>
      <text className="pv-sub" x={412} y={238}>vector index</text>
      <Core x={510} y={195} label="Agent" sub="Dify" />
      <Node x={510} y={52} width={90} height={30} label="자연어 질의" />
      <Node x={632} y={120} width={64} height={34} label="SQL" />
      <Node x={632} y={258} width={84} height={34} label="ClickHouse" kind="data" />
      <Node x={632} y={330} width={64} height={34} label="답변" />
    </AnimatedGraph>
  );
}

/* ── 삼성SDI: SHAP 기여도 → LLM 원인 설명 → 온톨로지·RAG → 대책 ─────── */
const SHAP_BARS = [0.92, 0.68, -0.52, 0.41, -0.3];

export function MultiAgentVisual() {
  const edges: Edge[] = [
    { id: "m1", d: "M178 195H234" },
    { id: "m2", d: "M330 195C362 195 362 120 396 120", tone: "water" },
    { id: "m3", d: "M330 195C362 195 362 270 396 270", tone: "water" },
    { id: "m4", d: "M496 120C528 120 528 195 560 195" },
    { id: "m5", d: "M496 270C528 270 528 195 560 195" },
    { id: "m6", d: "M610 222V292", tone: "hive" },
  ];
  const pulses: Pulse[] = [
    { edge: "m1", begin: 0 }, { edge: "m2", tone: "water", begin: .7 }, { edge: "m3", tone: "water", begin: 1 },
    { edge: "m4", begin: 1.6 }, { edge: "m5", begin: 1.9 }, { edge: "m6", tone: "hive", begin: 2.6 },
  ];
  return (
    <AnimatedGraph viewBox="0 0 680 390" edges={edges} pulses={pulses}>
      <g className="pv-node" data-kind="src">
        <rect x={30} y={110} width={148} height={170} rx={12} />
      </g>
      <text className="pv-text" x={104} y={130}>SHAP 기여도</text>
      {SHAP_BARS.map((value, index) => (
        <g key={index}>
          <line className="pv-grid" x1={104} x2={104} y1={148} y2={262} />
          <rect className="pv-bar" data-neg={value < 0 ? "true" : undefined} x={value < 0 ? 104 + value * 62 : 104} y={152 + index * 22} width={Math.abs(value) * 62} height={12} rx={3} />
        </g>
      ))}
      <text className="pv-sub" x={104} y={300}>FastAPI → Dify</text>
      <Core x={282} y={195} label="LLM" sub="원인 설명" />
      <Node x={446} y={120} width={100} height={46} label="온톨로지" sub="LOT 공정 흐름" kind="src" />
      <Node x={446} y={270} width={100} height={46} label="RAG" sub="조치 문서 4건" kind="src" />
      <Node x={610} y={195} width={100} height={52} label="대책 제시" sub="유사 조치 사례" />
      <Node x={610} y={316} width={100} height={46} label="GAP 분석" sub="지식 연계 전후" kind="data" />
      <text className="pv-sub" x={282} y={276}>사용자 선택</text>
    </AnimatedGraph>
  );
}

/* ── 지하수: 관측·예측 곡선과 테스트 구간 (도식 예시) ──────────────── */
function buildSeries() {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const count = 96;
  const split = 64;
  const observed: number[] = [];
  for (let index = 0; index < count; index += 1) {
    let value = 0.5 + 0.2 * Math.sin((index / count) * Math.PI * 2 - 1.3);
    for (const [center, amplitude] of [[20, .16], [45, .12], [71, .18], [86, .08]]) value += amplitude * Math.exp(-((index - center) ** 2) / 10) - amplitude * 0.2;
    observed.push(value + (random() - .5) * 0.035);
  }
  const predicted = observed.map((value, index) => (index < split ? null : (observed[index - 1] * 0.55 + value * 0.45) + (random() - .5) * 0.02));
  // 서버와 브라우저의 부동소수점 끝자리가 달라도 같은 문자열이 나오도록 좌표를 반올림한다.
  const x = (index: number) => (14 + (index / (count - 1)) * 492).toFixed(1);
  const y = (value: number) => (168 - ((value - 0.12) / 0.86) * 132).toFixed(1);
  const path = (values: (number | null)[], from: number) => values.map((value, index) => (value === null ? "" : `${index === from ? "M" : "L"}${x(index)} ${y(value)}`)).join("");
  const tail = predicted.slice(split) as number[];
  const band = `M${x(split)} ${y(tail[0] + .05)}${tail.map((value, offset) => `L${x(split + offset)} ${y(value + .05)}`).join("")}${[...tail].reverse().map((value, offset) => `L${x(count - 1 - offset)} ${y(value - .05)}`).join("")}Z`;
  return { observed: path(observed, 0), predicted: path(predicted, split), band, splitX: Number(x(split)), end: [x(count - 1), y(tail[tail.length - 1])] as const };
}

const SERIES = buildSeries();

export function TimeSeriesVisual() {
  return (
    <>
      <svg viewBox="0 0 520 196" preserveAspectRatio="none" aria-hidden="true">
        {[52, 92, 132].map((y) => <line key={y} className="pv-grid" x1={0} x2={520} y1={y} y2={y} />)}
        <rect className="pv-test" x={SERIES.splitX} y={0} width={520 - SERIES.splitX} height={196} />
        <line className="pv-split" x1={SERIES.splitX} x2={SERIES.splitX} y1={30} y2={176} />
        <text className="pv-label" x={SERIES.splitX + 8} y={86}>테스트 구간</text>
        <path className="pv-band" d={SERIES.band} />
        <path className="pv-obs" d={SERIES.observed} />
        <path className="pv-pred" d={SERIES.predicted} />
        <circle cx={SERIES.end[0]} cy={SERIES.end[1]} r={3.5} fill="rgb(var(--water-rgb))" />
      </svg>
      <div className="pv-legend"><span><i style={{ background: "rgb(var(--ink-rgb) / .45)" }} />관측</span><span><i style={{ background: "rgb(var(--water-rgb))" }} />예측</span></div>
    </>
  );
}
