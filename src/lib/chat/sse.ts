import { chatSseEventSchema, type ChatSseEvent } from "@/lib/chat/contracts";

export const CHAT_SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export function encodeSse(event: ChatSseEvent["event"], data: ChatSseEvent["data"]) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function encodeHeartbeat() {
  return ": heartbeat\n\n";
}

export type ParsedBackendSseFrame = { type: "heartbeat" } | { type: "event"; value: ChatSseEvent };

function normalizeLines(frame: string) {
  return frame.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

export function parseBackendSseFrame(frame: string): ParsedBackendSseFrame | null {
  const lines = normalizeLines(frame);
  if (lines.every((line) => !line || line.startsWith(":"))) {
    return lines.some((line) => line.startsWith(":")) ? { type: "heartbeat" } : null;
  }

  let eventName = "";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") eventName = value;
    if (field === "data") dataLines.push(value);
  }
  if (!eventName || dataLines.length !== 1) throw new Error("Invalid backend SSE frame");

  let data: unknown;
  try {
    data = JSON.parse(dataLines[0]);
  } catch {
    throw new Error("Backend SSE data is not valid JSON");
  }
  const parsed = chatSseEventSchema.safeParse({ event: eventName, data });
  if (!parsed.success) throw new Error("Backend SSE event failed validation");
  return { type: "event", value: parsed.data };
}

export class BackendSseFrameBuffer {
  private buffer = "";
  private pendingCarriageReturn = false;

  private normalizeChunk(chunk: string) {
    let input = chunk;
    let normalized = "";
    if (this.pendingCarriageReturn) {
      normalized += "\n";
      if (input.startsWith("\n")) input = input.slice(1);
      this.pendingCarriageReturn = false;
    }
    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if (character !== "\r") {
        normalized += character;
        continue;
      }
      if (index === input.length - 1) {
        this.pendingCarriageReturn = true;
      } else {
        normalized += "\n";
        if (input[index + 1] === "\n") index += 1;
      }
    }
    return normalized;
  }

  push(chunk: string) {
    this.buffer += this.normalizeChunk(chunk);
    const frames: string[] = [];
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary !== -1) {
      frames.push(this.buffer.slice(0, boundary));
      this.buffer = this.buffer.slice(boundary + 2);
      boundary = this.buffer.indexOf("\n\n");
    }
    if (this.buffer.length > 64 * 1024) throw new Error("Backend SSE frame is too large");
    return frames;
  }

  finish() {
    if (this.pendingCarriageReturn) {
      this.buffer += "\n";
      this.pendingCarriageReturn = false;
    }
    if (this.buffer.trim()) throw new Error("Backend SSE stream ended mid-frame");
  }
}
