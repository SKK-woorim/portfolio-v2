import { createHmac, timingSafeEqual } from "node:crypto";

export function createChatSignature(secret: string, timestamp: number, requestId: string, rawBody: string) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${requestId}.${rawBody}`, "utf8")
    .digest("hex");
}

export function verifyChatSignature(
  secret: string,
  timestamp: number,
  requestId: string,
  rawBody: string,
  signature: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(createChatSignature(secret, timestamp, requestId, rawBody), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function createSignedChatHeaders(secret: string, rawBody: string, requestId = crypto.randomUUID(), timestamp = Math.floor(Date.now() / 1_000)) {
  return {
    requestId,
    timestamp,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Chat-Timestamp": String(timestamp),
      "X-Chat-Request-Id": requestId,
      "X-Chat-Signature": createChatSignature(secret, timestamp, requestId, rawBody),
    },
  };
}
