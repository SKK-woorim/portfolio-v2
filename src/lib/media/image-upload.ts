import { createHash } from "node:crypto";
import sharp from "sharp";

const MAX_INPUT_PIXELS = 40_000_000;
const MAX_INPUT_DIMENSION = 12_000;
const MAX_OUTPUT_DIMENSION = 2_560;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

export type SupportedImageFormat = "jpeg" | "png" | "webp" | "avif";

export type NormalizedImage = {
  bytes: Buffer;
  mimeType: "image/webp";
  extension: "webp";
  width: number;
  height: number;
  checksumSha256: string;
  sourceFormat: SupportedImageFormat;
};

export class InvalidImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageUploadError";
  }
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return Buffer.from(bytes.subarray(start, end)).toString("ascii");
}

function isAvif(bytes: Uint8Array) {
  if (bytes.length < 16 || ascii(bytes, 4, 8) !== "ftyp") return false;
  const declaredBoxSize = Buffer.from(bytes.subarray(0, 4)).readUInt32BE(0);
  const limit = Math.min(bytes.length, declaredBoxSize >= 16 ? declaredBoxSize : bytes.length, 64);
  const brands = [ascii(bytes, 8, 12)];
  for (let offset = 16; offset + 4 <= limit; offset += 4) brands.push(ascii(bytes, offset, offset + 4));
  return brands.some((brand) => brand === "avif" || brand === "avis");
}

export function detectImageFormat(bytes: Uint8Array): SupportedImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (isAvif(bytes)) return "avif";
  return null;
}

export async function normalizeImageUpload(input: Buffer): Promise<NormalizedImage> {
  const sourceFormat = detectImageFormat(input);
  if (!sourceFormat) throw new InvalidImageUploadError("지원하는 실제 이미지 형식이 아닙니다.");

  try {
    const source = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    });
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height) throw new InvalidImageUploadError("이미지 크기를 확인할 수 없습니다.");
    if (metadata.width > MAX_INPUT_DIMENSION || metadata.height > MAX_INPUT_DIMENSION) {
      throw new InvalidImageUploadError("이미지 한 변은 12,000px 이하여야 합니다.");
    }
    if ((metadata.pages ?? 1) > 1) throw new InvalidImageUploadError("움직이는 이미지는 업로드할 수 없습니다.");

    const { data, info } = await source
      .rotate()
      .resize({
        width: MAX_OUTPUT_DIMENSION,
        height: MAX_OUTPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, alphaQuality: 90, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    if (!info.width || !info.height || data.length > MAX_OUTPUT_BYTES) {
      throw new InvalidImageUploadError("최적화한 이미지가 허용 크기를 초과합니다.");
    }

    return {
      bytes: data,
      mimeType: "image/webp",
      extension: "webp",
      width: info.width,
      height: info.height,
      checksumSha256: createHash("sha256").update(data).digest("hex"),
      sourceFormat,
    };
  } catch (error) {
    if (error instanceof InvalidImageUploadError) throw error;
    throw new InvalidImageUploadError("손상되었거나 너무 큰 이미지입니다.");
  }
}
