import type { Spec } from '@json-render/core';
import { z } from 'zod';

/**
 * Shared Zod schemas + types for share snapshots (see ADR-013, Tier 2).
 *
 * The schemas mirror the limits applied at `/api/generate` so a snapshot
 * cannot smuggle in payloads larger than the generator itself accepts.
 * Stored snapshots are validated on both ingest (POST) and read (GET) — read
 * validation is defense-in-depth in case the on-disk file is tampered with
 * outside the API.
 */

const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 4000;
const MAX_SPEC_ELEMENTS = 200;
const MAX_ELEMENT_CHILDREN = 50;
const MAX_COMPONENT_TYPE_CHARS = 50;

export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

/**
 * Lightweight URL-safe id (12 chars, ~71 bits of entropy). Short enough that
 * shared URLs stay readable; long enough that random-guess access is
 * astronomically unlikely. Distinct from `crypto.randomUUID()` (36 chars
 * with hyphens) which we use for in-process message IDs.
 */
export const newShareId = (): string => {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let str = '';
  for (const b of bytes) str += String.fromCodePoint(b);
  return btoa(str)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

const messageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(MAX_MESSAGE_CHARS),
});

const elementSchema = z.object({
  type: z.string().min(1).max(MAX_COMPONENT_TYPE_CHARS),
  props: z.record(z.string(), z.unknown()),
  children: z.array(z.string()).max(MAX_ELEMENT_CHILDREN),
  visible: z.unknown().optional(),
});

const specSchema = z.object({
  root: z.string(),
  elements: z
    .record(z.string(), elementSchema)
    .refine(
      (e) => Object.keys(e).length <= MAX_SPEC_ELEMENTS,
      `spec exceeds max ${MAX_SPEC_ELEMENTS.toString()} elements`,
    ),
  state: z.unknown().optional(),
});

export const snapshotInputSchema = z.object({
  messages: z.array(messageSchema).min(1).max(MAX_MESSAGES),
  spec: specSchema,
});

export const snapshotRecordSchema = snapshotInputSchema.extend({
  id: z.string().regex(SHARE_ID_PATTERN),
  createdAt: z.iso.datetime(),
  schemaVersion: z.literal(1),
});

export type SnapshotInput = z.infer<typeof snapshotInputSchema>;
export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;
export type SharedMessage = z.infer<typeof messageSchema>;
export type SharedSpec = Spec;
