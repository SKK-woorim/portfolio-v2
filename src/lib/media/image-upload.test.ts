import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  detectImageFormat,
  InvalidImageUploadError,
  normalizeImageUpload,
} from "./image-upload";

describe("image upload normalization", () => {
  it("detects supported formats from their signatures", () => {
    const avif = Buffer.alloc(24);
    avif.writeUInt32BE(24, 0);
    avif.write("ftyp", 4, "ascii");
    avif.write("avif", 8, "ascii");
    avif.write("avif", 16, "ascii");
    expect(detectImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("jpeg");
    expect(detectImageFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(detectImageFormat(Buffer.from("RIFF0000WEBP", "ascii"))).toBe("webp");
    expect(detectImageFormat(avif)).toBe("avif");
    expect(detectImageFormat(Buffer.from("plain text", "utf8"))).toBeNull();
  });

  it("rejects content that only claims to be an image", async () => {
    await expect(normalizeImageUpload(Buffer.from("not an image"))).rejects.toBeInstanceOf(InvalidImageUploadError);
  });

  it("auto-orients, resizes, converts to WebP, and strips metadata", async () => {
    const source = await sharp({
      create: { width: 3_000, height: 1_500, channels: 3, background: "#2563eb" },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: "private-metadata" } } })
      .toBuffer();

    const normalized = await normalizeImageUpload(source);
    const metadata = await sharp(normalized.bytes).metadata();

    expect(normalized.mimeType).toBe("image/webp");
    expect(normalized.sourceFormat).toBe("jpeg");
    expect(normalized.width).toBe(2_560);
    expect(normalized.height).toBe(1_280);
    expect(normalized.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
  });
});
