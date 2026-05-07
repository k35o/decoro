'use client';

import {
  ATTACHMENT_MEDIA_TYPES,
  type AttachmentMediaType,
  type ImageAttachment,
} from './chat-types.ts';

/**
 * Client-side image compression pipeline.
 *
 * Browsers happily let users paste / drop arbitrary-sized images into
 * the chat input. The conversation `messages` JSONB row stores the
 * data URI directly (per ADR-015), so we need to keep each image
 * small enough that 50 turns of conversation don't end up as a 100MB
 * row. The compressor:
 *   - Loads the file via `createImageBitmap` (faster + safer than
 *     <img> + canvas; no DOM mount needed).
 *   - Downscales to fit within `MAX_DIMENSION` while preserving
 *     aspect ratio (skips upscaling — already-small images pass
 *     through unchanged).
 *   - Re-encodes as JPEG at quality `JPEG_QUALITY` for non-PNG
 *     sources. PNG sources stay PNG (preserves transparency in
 *     screenshots / mockups, which is the dominant attachment type
 *     for Decoro's use case).
 *   - Emits a base64 data URI plus measured dimensions for the chat
 *     pane to render thumbnails at the right aspect ratio.
 */

/** Longest edge after compression. 2048 is the sweet spot for vision
 * models (Anthropic / Gemini both downsample beyond this anyway) while
 * staying readable for design mockups. */
const MAX_DIMENSION = 2048;

/** JPEG quality target. 0.82 is the conventional "look correct, file
 * size goes down a lot" point. */
const JPEG_QUALITY = 0.82;

/** Hard ceiling on input file size before we even try to read it.
 * Pre-compression — the post-compression size will be much smaller. 10 MB. */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

const ACCEPTED_INPUT_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  // Pasting from macOS screenshot tools sometimes produces these.
  'image/heic',
  'image/heif',
]);

const newAttachmentId = (): string => crypto.randomUUID();

/**
 * Pick the output media type. PNG sources stay PNG to preserve
 * transparency (matters for design tool screenshots, where the alpha
 * channel often carries layout intent). Everything else becomes JPEG —
 * smaller for the photographic content typical of Figma exports.
 */
const pickOutputType = (input: string): AttachmentMediaType =>
  input === 'image/png' ? 'image/png' : 'image/jpeg';

/**
 * Compute target dimensions that fit inside `MAX_DIMENSION` × `MAX_DIMENSION`
 * while preserving aspect ratio. Images already smaller than the cap
 * pass through unchanged.
 */
const fitWithin = (
  width: number,
  height: number,
  cap: number,
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= cap) return { width, height };
  const scale = cap / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

const blobToDataUri = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const { result } = reader;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned a non-string result'));
        return;
      }
      resolve(result);
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('FileReader failed'));
    });
    reader.readAsDataURL(blob);
  });

export class AttachmentTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `Image is ${(bytes / (1024 * 1024)).toFixed(1)}MB; max is ${(MAX_INPUT_BYTES / (1024 * 1024)).toString()}MB.`,
    );
    this.name = 'AttachmentTooLargeError';
  }
}

export class UnsupportedAttachmentTypeError extends Error {
  constructor(mediaType: string) {
    super(`Unsupported image type "${mediaType}". Use PNG, JPEG, or WebP.`);
    this.name = 'UnsupportedAttachmentTypeError';
  }
}

/**
 * Compress + encode a `File` into a `ImageAttachment` ready to send
 * with a chat message. Throws `AttachmentTooLargeError` for files over
 * the input cap and `UnsupportedAttachmentTypeError` for unrecognized
 * MIME types — callers surface these in the upload UI.
 */
export const compressToAttachment = async (
  file: File,
): Promise<ImageAttachment> => {
  if (file.size > MAX_INPUT_BYTES) {
    throw new AttachmentTooLargeError(file.size);
  }
  // `file.type` is occasionally empty (drag-and-drop from certain
  // sources). Fall back to "looks like an image" via createImageBitmap
  // throwing if the bytes aren't decodable.
  if (file.type !== '' && !ACCEPTED_INPUT_MEDIA_TYPES.has(file.type)) {
    throw new UnsupportedAttachmentTypeError(file.type);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const fitted = fitWithin(bitmap.width, bitmap.height, MAX_DIMENSION);
    const canvas = document.createElement('canvas');
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to acquire 2D canvas context');
    ctx.drawImage(bitmap, 0, 0, fitted.width, fitted.height);

    const outputType = pickOutputType(file.type || 'image/jpeg');
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, JPEG_QUALITY);
    });
    if (!blob) throw new Error('Canvas failed to produce a blob');
    const dataUri = await blobToDataUri(blob);
    // Defense-in-depth: confirm the runtime-produced media type matches
    // our enum. Edge cases (Safari falling back to PNG when toBlob
    // can't encode JPEG) would otherwise produce a record the server
    // would reject at validation.
    const mediaType = ATTACHMENT_MEDIA_TYPES.includes(outputType)
      ? outputType
      : 'image/jpeg';

    return {
      id: newAttachmentId(),
      dataUri,
      mediaType,
      width: fitted.width,
      height: fitted.height,
    };
  } finally {
    bitmap.close();
  }
};

/**
 * Compress a batch of files concurrently, returning an array of
 * results aligned with the input order. Failures throw — callers
 * decide whether to surface or fall back.
 */
export const compressAll = (
  files: readonly File[],
): Promise<ImageAttachment[]> =>
  Promise.all(files.map((f) => compressToAttachment(f)));
