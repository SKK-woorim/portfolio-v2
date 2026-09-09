import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type HeaderReader = Pick<Headers, "get">;

function ipv4Prefix(address: string) {
  const octets = address.split(".");
  return `${octets.slice(0, 3).join(".")}.0/24`;
}

function expandIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;

  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => group.padStart(4, "0"));
}

export function normalizeIpPrefix(rawAddress: string) {
  let address = rawAddress.split(",")[0]?.trim() ?? "";
  const bracketed = address.match(/^\[([^\]]+)](?::\d+)?$/);
  if (bracketed) address = bracketed[1];
  address = address.split("%")[0] ?? "";

  if (isIP(address) === 4) return ipv4Prefix(address);
  if (isIP(address) === 6) {
    // Treat an IPv4-mapped address like IPv4 instead of grouping every mapped
    // client into the same all-zero IPv6 /64 bucket.
    const mappedIpv4 = address.slice(address.lastIndexOf(":") + 1);
    if (isIP(mappedIpv4) === 4) return ipv4Prefix(mappedIpv4);
    const groups = expandIpv6(address);
    if (groups) return `${groups.slice(0, 4).join(":")}::/64`;
  }

  const ipv4WithPort = address.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPort && isIP(ipv4WithPort[1]) === 4) return ipv4Prefix(ipv4WithPort[1]);
  return "unknown/0";
}

export function getLoginClientIpPrefix(headers: HeaderReader) {
  const address = headers.get("x-vercel-forwarded-for")
    ?? headers.get("cf-connecting-ip")
    ?? headers.get("x-real-ip")
    ?? headers.get("x-forwarded-for")
    ?? "";
  return normalizeIpPrefix(address);
}

export function createLoginRateLimitHashes(email: string, ipPrefix: string, secret: string) {
  const keyedHash = (scope: string, value: string) => createHmac("sha256", secret)
    .update(`${scope}:${value}`, "utf8")
    .digest("hex");
  return {
    emailHash: keyedHash("login-email", email.trim().toLowerCase()),
    ipHash: keyedHash("login-ip-prefix", ipPrefix),
  };
}
