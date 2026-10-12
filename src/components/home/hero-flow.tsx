"use client";

import { useRef } from "react";
import { useCanvasScene } from "@/components/project-visuals/use-canvas-scene";

type Particle = { lane: number; x: number; speed: number; phase: number; square: boolean };
type FlowState = { particles: Particle[]; targetX: number; targetY: number };

/** 문서 조각이 히어로 챗봇 콘솔로 흘러드는 배경. */
export function HeroFlow({ targetId }: { targetId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasScene<FlowState>(ref, {
    setup: ({ width, height }) => {
      const canvas = ref.current;
      const target = document.getElementById(targetId);
      let targetX = width * 0.6;
      let targetY = height * 0.5;
      if (canvas && target) {
        const canvasRect = canvas.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        targetX = targetRect.left - canvasRect.left + 24;
        targetY = targetRect.top - canvasRect.top + targetRect.height / 2;
        if (targetX < width * 0.3) {
          targetX = width * 0.5;
          targetY = targetRect.top - canvasRect.top + 40;
        }
      }
      const count = Math.round(Math.min(110, width / 12));
      const particles = Array.from({ length: count }, (_, index) => ({ lane: Math.random(), x: Math.random() * targetX, speed: 26 + Math.random() * 46, phase: Math.random() * 6.28, square: index % 6 === 0 }));
      return { particles, targetX, targetY };
    },
    draw: ({ ctx, width, height, delta, color }, state) => {
      ctx.clearRect(0, 0, width, height);
      const { targetX, targetY } = state;
      const yAt = (particle: Particle, x: number) => {
        const k = Math.max(0, Math.min(1, x / targetX));
        const eased = k * k * (3 - 2 * k);
        const base = particle.lane * height;
        return base + (targetY - base) * eased * 0.92 + Math.sin(x * 0.012 + particle.phase) * 10 * (1 - eased);
      };
      for (const particle of state.particles) {
        particle.x += particle.speed * delta;
        if (particle.x > targetX) { particle.x = -20; particle.lane = Math.random(); }
        const progress = Math.max(0, particle.x / targetX);
        const y = yAt(particle, particle.x);
        const alpha = 0.08 + 0.55 * progress * progress;
        const tone = particle.square ? "water" : "primary";
        ctx.strokeStyle = color(tone, alpha * 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(particle.x - 22, yAt(particle, particle.x - 22)); ctx.lineTo(particle.x, y); ctx.stroke();
        ctx.fillStyle = color(tone, alpha);
        if (particle.square) ctx.fillRect(particle.x - 2, y - 2, 4, 4);
        else { ctx.beginPath(); ctx.arc(particle.x, y, 1.4, 0, Math.PI * 2); ctx.fill(); }
      }
    },
  });
  return <canvas ref={ref} className="hero-flow" aria-hidden="true" />;
}
