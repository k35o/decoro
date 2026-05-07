import { z } from 'zod';

import { MAX_MESSAGE_CHARS } from './spec-schema.ts';

/**
 * Maximum number of image attachments a single user message may carry.
 * Kept low so a runaway client can't pile dozens of multi-MB images
 * into one row, and so the LLM provider's per-message vision budget
 * (Anthropic / Gemini both cap at ~5) is never exceeded.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

/**
 * Maximum size of the base64 data URI we'll accept on the server. The
 * client compresses to ~1MB typical (max 2048px / JPEG 80%); the
 * ceiling here is a guardrail against a hostile or buggy client. Three
 * megabytes after base64 encoding ≈ 2.2MB raw, comfortably above the
 * compression target while bounding the JSONB row size.
 */
export const MAX_ATTACHMENT_DATA_URI_CHARS = 3_000_000;

/**
 * Set of media types we'll accept. Limited to the formats every major
 * vision-capable LLM supports natively. SVG and animated formats are
 * deliberately excluded — SVG can carry script payloads and animation
 * frames are wasted on a vision pass.
 */
export const ATTACHMENT_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type AttachmentMediaType = (typeof ATTACHMENT_MEDIA_TYPES)[number];

const dataUriSchema = z
  .string()
  .min(1)
  .max(MAX_ATTACHMENT_DATA_URI_CHARS)
  .startsWith('data:image/', {
    message: 'attachment dataUri must be a data: URI for an image',
  });

/**
 * One image attached to a user message. We store the base64 data URI
 * directly inside the conversation `messages` JSONB (per the ADR-015
 * "single source of truth in Postgres" decision) — bandwidth-efficient
 * compared to a separate object store, no orphan-cleanup story to
 * maintain, and the share flow gets attachment-preservation for free.
 *
 * Width / height come from the client at compression time so the chat
 * pane can render thumbnails at the right aspect ratio without
 * decoding the image first.
 */
export const imageAttachmentSchema = z.object({
  id: z.string().min(1).max(64),
  dataUri: dataUriSchema,
  mediaType: z.enum(ATTACHMENT_MEDIA_TYPES),
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
});

export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;

/**
 * Single in-flight chat message shape — the canonical chat primitive.
 *
 * Used by:
 * - `useDecoroChat` (in-process React state)
 * - `<ChatPane>` (UI rendering)
 * - `<ShareView>` (read-only transcript)
 * - `snapshotInputSchema` (POST /api/share validates against this exact
 *   shape via `chatMessageSchema`)
 *
 * Attachments are an optional array of images, **only on user
 * messages**. We don't enforce that with role-conditional Zod (would
 * complicate the union); the server-side `/api/generate` handler
 * silently drops attachments on assistant messages, and the LLM never
 * produces them.
 *
 * The schema and the type live next to each other so `z.infer` keeps the
 * validator and the in-process type in lockstep — they cannot drift.
 */
export const chatMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(MAX_MESSAGE_CHARS),
  attachments: z
    .array(imageAttachmentSchema)
    .max(MAX_ATTACHMENTS_PER_MESSAGE)
    .optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
