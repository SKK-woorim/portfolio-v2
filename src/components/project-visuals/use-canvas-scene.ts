"use client";

import { useEffect, useRef, type RefObject } from "react";

export type ScenePalette = Record<"primary" | "ink" | "canvas" | "water" | "hive" | "clay" | "danger" | "ok", string>;

export type SceneFrame = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  delta: number;
  color: (key: keyof ScenePalette, alpha?: number) => string;
};

type SceneOptions<State> = {
  setup?: (frame: Omit<SceneFrame, "time" | "delta">) => State;
  draw: (frame: SceneFrame, state: State) => void;
};

const PALETTE_KEYS: (keyof ScenePalette)[] = ["primary", "ink", "canvas", "water", "hive", "clay", "danger", "ok"];

function readPalette(element: Element): ScenePalette {
  const style = getComputedStyle(element);
  const palette = {} as ScenePalette;
  for (const key of PALETTE_KEYS) palette[key] = style.getPropertyValue(`--${key}-rgb`).trim() || "128 160 200";
  return palette;
}

/**
 * Canvas 장면 공통 처리: 해상도 맞춤, 화면 밖 정지, 테마 색 다시 읽기, 움직임 줄이기 설정.
 * 움직임 줄이기에서는 완성된 한 장면만 그린다.
 */
export function useCanvasScene<State>(canvasRef: RefObject<HTMLCanvasElement | null>, { setup, draw }: SceneOptions<State>) {
  const drawRef = useRef(draw);
  const setupRef = useRef(setup);

  useEffect(() => {
    drawRef.current = draw;
    setupRef.current = setup;
  }, [draw, setup]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let palette = readPalette(canvas);
    let width = 0;
    let height = 0;
    let state: State | undefined;
    let visible = false;
    let frame = 0;
    let lastTime = 0;
    const color = (key: keyof ScenePalette, alpha = 1) => `rgb(${palette[key]} / ${alpha})`;

    const renderOnce = (time: number) => {
      if (!width || !height || state === undefined) return;
      const delta = Math.min(0.05, lastTime ? time - lastTime : 0);
      lastTime = time;
      drawRef.current({ ctx, width, height, time, delta, color }, state);
    };

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      state = setupRef.current ? setupRef.current({ ctx, width, height, color }) : ({} as State);
      renderOnce(reduceMotion ? 3 : lastTime);
    };

    const loop = (ms: number) => {
      frame = 0;
      if (!visible) return;
      renderOnce(ms / 1000);
      frame = window.requestAnimationFrame(loop);
    };

    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (reduceMotion) {
        if (visible) renderOnce(3);
        return;
      }
      if (visible && !frame) frame = window.requestAnimationFrame(loop);
    });
    intersectionObserver.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      palette = readPalette(canvas);
      renderOnce(reduceMotion ? 3 : lastTime);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-site-theme"] });

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [canvasRef]);
}
