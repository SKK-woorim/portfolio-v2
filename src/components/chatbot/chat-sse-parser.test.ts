import { describe, expect, it } from "vitest";
import { ChatSseParser } from "./chat-sse-parser";

describe("ChatSseParser", () => {
  it("parses events split across arbitrary network chunks and ignores heartbeats", () => {
    const parser = new ChatSseParser();

    expect(parser.push('event: status\r\ndata: {"phase":"search')).toEqual([]);
    expect(parser.push('ing","message":"검색 중"}\r\n\r')).toEqual([]);
    expect(parser.push('\n: heartbeat\r\n\r\nevent: token\ndata: {"delta":"답"}\n\n')).toEqual([
      {
        event: "status",
        data: '{"phase":"searching","message":"검색 중"}',
      },
      {
        event: "token",
        data: '{"delta":"답"}',
      },
    ]);
  });

  it("joins multiple data lines and flushes a final unterminated event", () => {
    const parser = new ChatSseParser();
    parser.push("event: message\ndata: first\ndata: second");

    expect(parser.finish()).toEqual([{ event: "message", data: "first\nsecond" }]);
    expect(parser.finish()).toEqual([]);
  });

  it("keeps adjacent events separate in one chunk", () => {
    const parser = new ChatSseParser();
    expect(parser.push('event: token\ndata: {"delta":"A"}\n\nevent: done\ndata: {"requestId":"id"}\n\n')).toEqual([
      { event: "token", data: '{"delta":"A"}' },
      { event: "done", data: '{"requestId":"id"}' },
    ]);
  });
});
