/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW_NOTICE_DELAY_MS, SLOW_NOTICE_MIN_VISIBLE_MS, useChatProgress, useSlowNotice } from "./use-chat-progress";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.45);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const base = { requestKey: "request-1", active: true, hasSources: false, hasToken: false, generating: false };

describe("useChatProgress", () => {
  it("walks the cosmetic steps but waits for sources before the answer step", () => {
    const { result, rerender } = renderHook((props) => useChatProgress(props), { initialProps: base });
    expect(result.current.step).toBe(0);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.step).toBe(2);
    rerender({ ...base, hasSources: true });
    expect(result.current.step).toBe(3);
    expect(result.current.waiting).toBe(true);
  });

  it("skips the remaining steps when the first token arrives early", () => {
    const { result, rerender } = renderHook((props) => useChatProgress(props), { initialProps: base });
    rerender({ ...base, hasSources: true, hasToken: true });
    expect(result.current.step).toBe(4);
  });

  it("reports finished requests as complete", () => {
    const { result } = renderHook(() => useChatProgress({ ...base, active: false }));
    expect(result.current.step).toBe(4);
  });
});

describe("useSlowNotice", () => {
  it("shows after six seconds of waiting", () => {
    const { result } = renderHook(({ waiting }) => useSlowNotice(waiting), { initialProps: { waiting: true } });
    act(() => vi.advanceTimersByTime(SLOW_NOTICE_DELAY_MS - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it("stays visible for at least two seconds when the answer arrives right away", () => {
    const { result, rerender } = renderHook(({ waiting }) => useSlowNotice(waiting), { initialProps: { waiting: true } });
    act(() => vi.advanceTimersByTime(SLOW_NOTICE_DELAY_MS));
    act(() => vi.advanceTimersByTime(300));
    rerender({ waiting: false });
    act(() => vi.advanceTimersByTime(SLOW_NOTICE_MIN_VISIBLE_MS - 301));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(2));
    expect(result.current).toBe(false);
  });

  it("never shows when the answer arrives within six seconds", () => {
    const { result, rerender } = renderHook(({ waiting }) => useSlowNotice(waiting), { initialProps: { waiting: true } });
    act(() => vi.advanceTimersByTime(SLOW_NOTICE_DELAY_MS - 500));
    rerender({ waiting: false });
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(false);
  });
});
