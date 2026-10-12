"use client";

import { useRef } from "react";
import { useCanvasScene, type SceneFrame } from "./use-canvas-scene";

const MONO_FONT = '500 9px "Martian Mono", "Pretendard Variable", monospace';

/* ── 꿀벌지키미: 벌집 격자 위 YOLO 탐지 박스 ───────────────────────── */
type Insect = { cx: number; cy: number; ax: number; ay: number; fx: number; fy: number; ph: number; s: number; conf?: string; hornet?: boolean };
const INSECTS: Insect[] = [
  { cx: .2, cy: .55, ax: .08, ay: .12, fx: .5, fy: .7, ph: 0, s: 1, conf: "0.97" },
  { cx: .38, cy: .35, ax: .06, ay: .1, fx: .8, fy: .55, ph: 1.3, s: 1, conf: "0.95" },
  { cx: .52, cy: .7, ax: .09, ay: .08, fx: .6, fy: .9, ph: 2.1, s: .9 },
  { cx: .82, cy: .6, ax: .05, ay: .1, fx: .7, fy: .6, ph: 3.4, s: 1, conf: "0.93" },
  { cx: .3, cy: .78, ax: .07, ay: .06, fx: .9, fy: .75, ph: 4.2, s: .85 },
  { cx: .64, cy: .42, ax: .12, ay: .14, fx: .32, fy: .45, ph: .8, s: 1.7, hornet: true },
];

function drawDetection({ ctx, width: w, height: h, time: t, color }: SceneFrame) {
  ctx.clearRect(0, 0, w, h);
  const radius = 15;
  const hexWidth = Math.sqrt(3) * radius;
  let index = 0;
  for (let row = -1; row * radius * 1.5 < h + radius; row += 1) {
    for (let column = -1; column * hexWidth < w + hexWidth; column += 1) {
      const x = column * hexWidth + (row % 2 ? hexWidth / 2 : 0);
      const y = row * radius * 1.5;
      ctx.beginPath();
      for (let corner = 0; corner < 6; corner += 1) {
        const angle = Math.PI / 3 * corner + Math.PI / 6;
        const px = x + radius * Math.cos(angle);
        const py = y + radius * Math.sin(angle);
        if (corner) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      const flicker = 0.5 + 0.5 * Math.sin(t * 0.8 + index * 1.7);
      ctx.fillStyle = color("hive", (index * 7) % 5 === 0 ? 0.02 + 0.06 * flicker : 0.02);
      ctx.fill();
      ctx.strokeStyle = color("hive", 0.16);
      ctx.lineWidth = 1;
      ctx.stroke();
      index += 1;
    }
  }
  const scanY = (t * 60) % (h + 40) - 20;
  const gradient = ctx.createLinearGradient(0, scanY - 30, 0, scanY);
  gradient.addColorStop(0, color("hive", 0));
  gradient.addColorStop(1, color("hive", 0.14));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, scanY - 30, w, 30);
  ctx.fillStyle = color("hive", 0.5);
  ctx.fillRect(0, scanY, w, 1);
  ctx.font = MONO_FONT;
  for (const insect of INSECTS) {
    const x = insect.cx * w + insect.ax * w * Math.sin(insect.fx * t + insect.ph);
    const y = insect.cy * h + insect.ay * h * Math.cos(insect.fy * t + insect.ph);
    const vx = insect.ax * w * insect.fx * Math.cos(insect.fx * t + insect.ph);
    const vy = -insect.ay * h * insect.fy * Math.sin(insect.fy * t + insect.ph);
    const length = 7 * insect.s;
    const bodyWidth = 4.2 * insect.s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(vy, vx));
    ctx.fillStyle = color("ink", 0.28);
    const flap = Math.sin(t * 40 + insect.ph) * 0.35;
    ctx.beginPath(); ctx.ellipse(-1, -bodyWidth, length * 0.55, bodyWidth * 0.7, -0.5 + flap, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-1, bodyWidth, length * 0.55, bodyWidth * 0.7, 0.5 - flap, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = insect.hornet ? color("danger") : color("hive");
    ctx.beginPath(); ctx.ellipse(0, 0, length, bodyWidth, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color("canvas", 0.75);
    for (const stripe of [-length * 0.45, -length * 0.05, length * 0.35]) ctx.fillRect(stripe, -bodyWidth * 0.9, length * 0.16, bodyWidth * 1.8);
    ctx.restore();
    if (insect.hornet) {
      const boxWidth = 44;
      const boxHeight = 34;
      const bx = x - boxWidth / 2;
      const by = y - boxHeight / 2;
      const corner = 8;
      ctx.strokeStyle = color("danger");
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const [px, py, dx, dy] of [[bx, by, 1, 1], [bx + boxWidth, by, -1, 1], [bx, by + boxHeight, 1, -1], [bx + boxWidth, by + boxHeight, -1, -1]]) {
        ctx.moveTo(px + dx * corner, py); ctx.lineTo(px, py); ctx.lineTo(px, py + dy * corner);
      }
      ctx.stroke();
      ctx.strokeStyle = color("danger", 0.35); ctx.lineWidth = 1; ctx.strokeRect(bx, by, boxWidth, boxHeight);
      const pulse = (t * 1.2) % 1;
      ctx.strokeStyle = color("danger", 0.5 * (1 - pulse));
      ctx.beginPath(); ctx.arc(x, y, 18 + pulse * 26, 0, Math.PI * 2); ctx.stroke();
      const label = "말벌 0.94";
      const labelWidth = ctx.measureText(label).width + 10;
      ctx.fillStyle = color("danger"); ctx.fillRect(bx, by - 15, labelWidth, 14);
      ctx.fillStyle = color("canvas"); ctx.fillText(label, bx + 5, by - 5);
    } else if (insect.conf) {
      const boxWidth = 26 * insect.s;
      const boxHeight = 20 * insect.s;
      ctx.strokeStyle = color("ink", 0.4); ctx.lineWidth = 1; ctx.strokeRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
      ctx.fillStyle = color("ink", 0.6); ctx.fillText(`꿀벌 ${insect.conf}`, x - boxWidth / 2, y - boxHeight / 2 - 4);
    }
  }
}

export function DetectionVisual() {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasScene(ref, { draw: drawDetection });
  return <canvas ref={ref} aria-hidden="true" />;
}

/* ── T2G: 아래에서 위로 생성되는 와이어프레임 ───────────────────────── */
type Mesh = { base: number[][]; edges: [number, number][] };

function buildMesh(): Mesh {
  const golden = (1 + Math.sqrt(5)) / 2;
  const normalize = (vector: number[]) => { const length = Math.hypot(...vector); return vector.map((value) => value / length); };
  const vertices = [[-1, golden, 0], [1, golden, 0], [-1, -golden, 0], [1, -golden, 0], [0, -1, golden], [0, 1, golden], [0, -1, -golden], [0, 1, -golden], [golden, 0, -1], [golden, 0, 1], [-golden, 0, -1], [-golden, 0, 1]].map(normalize);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const cache = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const existing = cache.get(key);
    if (existing !== undefined) return existing;
    vertices.push(normalize(vertices[a].map((value, index) => (value + vertices[b][index]) / 2)));
    cache.set(key, vertices.length - 1);
    return vertices.length - 1;
  };
  faces = faces.flatMap(([a, b, c]) => {
    const ab = midpoint(a, b); const bc = midpoint(b, c); const ca = midpoint(c, a);
    return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
  });
  const edgeMap = new Map<string, [number, number]>();
  for (const [a, b, c] of faces) for (const [x, y] of [[a, b], [b, c], [c, a]]) edgeMap.set(x < y ? `${x}_${y}` : `${y}_${x}`, [x, y]);
  const base = vertices.map(([x, y, z]) => {
    const radius = 1 + 0.06 * Math.sin(3 * Math.atan2(z, x)) + 0.05 * y;
    return [x * radius * 1.12, y * radius * 0.74, z * radius];
  });
  return { base, edges: [...edgeMap.values()] };
}

const MESH = buildMesh();

function drawMesh({ ctx, width: w, height: h, time: t, color }: SceneFrame) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 + 4;
  const radius = Math.min(w, h) * 0.36;
  const yaw = t * 0.45;
  const tilt = 0.42;
  const [cosYaw, sinYaw, cosTilt, sinTilt] = [Math.cos(yaw), Math.sin(yaw), Math.cos(tilt), Math.sin(tilt)];
  const projected = MESH.base.map(([x, y, z]) => {
    const x1 = x * cosYaw + z * sinYaw;
    const z1 = -x * sinYaw + z * cosYaw;
    const y2 = y * cosTilt - z1 * sinTilt;
    const z2 = y * sinTilt + z1 * cosTilt;
    const perspective = 3.2 / (3.2 + z2);
    return [cx + x1 * radius * perspective, cy + y2 * radius * perspective, z2];
  });
  const cycle = 9;
  const phase = ((t + 5.5) % cycle) / cycle;
  const progress = Math.min(1, phase / 0.5);
  const scan = -0.85 + progress * 1.7;
  ctx.fillStyle = color("clay", 0.12);
  ctx.beginPath(); ctx.ellipse(cx, cy + radius * 0.78, radius * 0.9, radius * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  for (const [i, j] of MESH.edges) {
    const done = -Math.max(MESH.base[i][1], MESH.base[j][1]) < scan;
    const depth = (projected[i][2] + projected[j][2]) / 2;
    const alpha = done ? 0.3 + 0.55 * (1 - (depth + 1.2) / 2.4) : 0.14;
    ctx.strokeStyle = done ? color("clay", alpha) : color("ink", alpha);
    ctx.lineWidth = done ? 1.1 : 0.8;
    ctx.setLineDash(done ? [] : [2, 4]);
    ctx.beginPath(); ctx.moveTo(projected[i][0], projected[i][1]); ctx.lineTo(projected[j][0], projected[j][1]); ctx.stroke();
  }
  ctx.setLineDash([]);
  projected.forEach(([x, y, z], index) => {
    if (-MESH.base[index][1] >= scan) return;
    ctx.fillStyle = color("clay", 0.5 + 0.5 * (1 - (z + 1.2) / 2.4));
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
  });
  if (progress < 1) {
    const scanY = cy + -scan * radius * 0.74 * cosTilt;
    ctx.strokeStyle = color("clay", 0.8); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, scanY, radius * 1.05, radius * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color("clay", 0.06); ctx.fill();
  }
}

export function MeshVisual() {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasScene(ref, { draw: drawMesh });
  return <canvas ref={ref} aria-hidden="true" />;
}

/* ── 연세대: MSSQL → ClickHouse 분할 조회·즉시 적재 ─────────────────── */
type Batch = { lane: number; x: number; speed: number };

function drawCylinder(frame: SceneFrame, x: number, y: number, width: number, height: number, tone: "hive" | "water", label: string, sub: string) {
  const { ctx, color } = frame;
  const ry = Math.max(5, width * 0.14);
  ctx.fillStyle = color(tone, 0.1);
  ctx.strokeStyle = color(tone, 0.6);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x, y, width / 2, ry, 0, Math.PI, 0);
  ctx.lineTo(x + width / 2, y + height);
  ctx.ellipse(x, y + height, width / 2, ry, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y, width / 2, ry, 0, 0, Math.PI * 2); ctx.stroke();
  for (let line = 1; line <= 2; line += 1) {
    ctx.strokeStyle = color(tone, 0.25);
    ctx.beginPath(); ctx.ellipse(x, y + (height * line) / 3, width / 2, ry, 0, 0, Math.PI); ctx.stroke();
  }
  ctx.fillStyle = color("ink", 0.9);
  ctx.font = '500 10px "Martian Mono", "Pretendard Variable", monospace';
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + height + ry + 16);
  ctx.fillStyle = color("ink", 0.5);
  ctx.font = MONO_FONT;
  ctx.fillText(sub, x, y + height + ry + 29);
  ctx.textAlign = "start";
}

type MigrationMetric = { value: string; label: string } | undefined;

function drawMigration(frame: SceneFrame, batches: Batch[], metric: MigrationMetric) {
  const { ctx, width: w, height: h, delta, time: t, color } = frame;
  ctx.clearRect(0, 0, w, h);
  const roomy = h >= 300;
  // 위쪽 태그 줄(약 50px)과 아래 라벨 줄을 비워 두고 원통을 그린다.
  const cylinderHeight = Math.min(h * (roomy ? 0.38 : 0.36), 150);
  const top = Math.max(roomy ? 110 : 66, h * 0.5 - cylinderHeight / 2);
  const cylinderWidth = Math.min(86, w * 0.16);
  const leftX = w * 0.15;
  const rightX = w * 0.85;
  const laneTop = top + 12;
  const laneGap = (cylinderHeight - 24) / 4;
  const startX = leftX + cylinderWidth / 2 + 8;
  const endX = rightX - cylinderWidth / 2 - 8;
  for (let lane = 0; lane < 5; lane += 1) {
    const y = laneTop + lane * laneGap;
    ctx.strokeStyle = color("primary", 0.12);
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const batch of batches) {
    batch.x += batch.speed * delta;
    if (batch.x > 1) batch.x -= 1;
    const x = startX + (endX - startX) * batch.x;
    const y = laneTop + batch.lane * laneGap;
    const fade = Math.min(1, batch.x * 6, (1 - batch.x) * 6);
    ctx.fillStyle = color("hive", 0.25 + 0.6 * fade);
    ctx.fillRect(x - 9, y - 3, 18, 6);
  }
  drawCylinder(frame, leftX, top, cylinderWidth, cylinderHeight, "hive", "MSSQL", "26 tables");
  drawCylinder(frame, rightX, top, cylinderWidth, cylinderHeight, "water", "ClickHouse", "분석용 DB");
  ctx.textAlign = "center";
  if (metric) {
    ctx.fillStyle = color("hive");
    ctx.font = `500 ${roomy ? 26 : 18}px "Martian Mono", "Pretendard Variable", monospace`;
    ctx.fillText(metric.value, w / 2, top - (roomy ? 40 : 18));
    if (roomy) {
      ctx.fillStyle = color("ink", 0.55);
      ctx.font = MONO_FONT;
      ctx.fillText(metric.label, w / 2, top - 22);
    }
  }
  const progress = (t * 0.12) % 1.2;
  const checked = Math.min(26, Math.floor(Math.min(progress, 1) * 26));
  const barWidth = Math.min(w * 0.36, 240);
  const barY = top + cylinderHeight + 22;
  ctx.fillStyle = color("primary", 0.14);
  ctx.fillRect(w / 2 - barWidth / 2, barY, barWidth, 4);
  ctx.fillStyle = color("ok", 0.85);
  ctx.fillRect(w / 2 - barWidth / 2, barY, (barWidth * checked) / 26, 4);
  ctx.font = MONO_FONT;
  ctx.fillStyle = color("ink", 0.55);
  ctx.fillText(`정합성 검증 ${checked}/26`, w / 2, barY - 8);
  if (roomy) ctx.fillText("JDBC 분할 조회 → 즉시 적재", w / 2, barY + 20);
  ctx.textAlign = "start";
}

export function MigrationVisual({ metric }: { metric?: MigrationMetric }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasScene<Batch[]>(ref, {
    setup: () => Array.from({ length: 14 }, (_, index) => ({ lane: index % 5, x: (index * 0.37) % 1, speed: 0.16 + ((index * 7) % 5) * 0.03 })),
    draw: (frame, batches) => drawMigration(frame, batches, metric),
  });
  return <canvas ref={ref} aria-hidden="true" />;
}

/* ── 기본 패턴: slug로 정해지는 노드 격자 ──────────────────────────── */
type PatternNode = { x: number; y: number; r: number; ph: number };

function seeded(seedText: string) {
  let seed = 0;
  for (const character of seedText) seed = (seed * 31 + character.charCodeAt(0)) % 2147483647;
  seed = seed || 7;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export function PatternVisual({ seed }: { seed: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasScene<PatternNode[]>(ref, {
    setup: () => {
      const random = seeded(seed);
      return Array.from({ length: 18 }, () => ({ x: 0.08 + random() * 0.84, y: 0.18 + random() * 0.7, r: 2 + random() * 3, ph: random() * Math.PI * 2 }));
    },
    draw: ({ ctx, width: w, height: h, time: t, color }, nodes) => {
      ctx.clearRect(0, 0, w, h);
      const points = nodes.map((node) => [node.x * w + Math.sin(t * 0.4 + node.ph) * 6, node.y * h + Math.cos(t * 0.35 + node.ph) * 5]);
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const distance = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
          if (distance > w * 0.22) continue;
          ctx.strokeStyle = color("primary", 0.3 * (1 - distance / (w * 0.22)));
          ctx.beginPath(); ctx.moveTo(points[i][0], points[i][1]); ctx.lineTo(points[j][0], points[j][1]); ctx.stroke();
        }
      }
      points.forEach(([x, y], index) => {
        ctx.fillStyle = color("primary", 0.55 + 0.35 * Math.sin(t + nodes[index].ph));
        ctx.beginPath(); ctx.arc(x, y, nodes[index].r, 0, Math.PI * 2); ctx.fill();
      });
    },
  });
  return <canvas ref={ref} aria-hidden="true" />;
}
