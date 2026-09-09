export type ParsedServerSentEvent = {
  event: string;
  data: string;
  id?: string;
};

function parseFrame(frame: string): ParsedServerSentEvent | null {
  let event = "message";
  let id: string | undefined;
  const data: string[] = [];

  for (const line of frame.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n")) {
    if (!line || line.startsWith(":")) continue;

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value || "message";
    if (field === "data") data.push(value);
    if (field === "id" && !value.includes("\0")) id = value;
  }

  if (data.length === 0) return null;
  return { event, data: data.join("\n"), ...(id === undefined ? {} : { id }) };
}

export class ChatSseParser {
  private buffer = "";

  push(chunk: string): ParsedServerSentEvent[] {
    this.buffer += chunk;
    const events: ParsedServerSentEvent[] = [];

    while (this.buffer.length > 0) {
      const boundary = /\r?\n\r?\n/.exec(this.buffer);
      if (!boundary || boundary.index === undefined) break;

      const frame = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      const event = parseFrame(frame);
      if (event) events.push(event);
    }

    return events;
  }

  finish(): ParsedServerSentEvent[] {
    const frame = this.buffer;
    this.buffer = "";
    if (!frame.trim()) return [];
    const event = parseFrame(frame);
    return event ? [event] : [];
  }

  reset() {
    this.buffer = "";
  }
}
