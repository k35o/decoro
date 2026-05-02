import type { Spec } from '@json-render/core';
import { z } from 'zod';

/**
 * Single source of truth for the spec / element / message limits enforced
 * at every API boundary that accepts user-controlled JSON. Both
 * `/api/generate` (request body) and `/api/share` (snapshot body) reuse
 * these so the limits stay in lockstep.
 *
 * Sized for "self-hosted, trusted-network MVP": generous enough that real
 * sessions never bump them, tight enough that a runaway client or hostile
 * insider cannot DoS the endpoint or rack up an unbounded LLM bill.
 */
export const MAX_MESSAGES = 50;
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_SPEC_ELEMENTS = 200;
export const MAX_ELEMENT_CHILDREN = 50;
export const MAX_COMPONENT_TYPE_CHARS = 50;

export const elementSchema = z.object({
  type: z.string().min(1).max(MAX_COMPONENT_TYPE_CHARS),
  props: z.record(z.string(), z.unknown()),
  children: z.array(z.string()).max(MAX_ELEMENT_CHILDREN),
  visible: z.unknown().optional(),
});

export const specSchema = z.object({
  root: z.string(),
  elements: z
    .record(z.string(), elementSchema)
    .refine(
      (e) => Object.keys(e).length <= MAX_SPEC_ELEMENTS,
      `spec exceeds max ${MAX_SPEC_ELEMENTS.toString()} elements`,
    ),
  state: z.unknown().optional(),
});

/**
 * Zod's inferred element type widens `visible` to `unknown`; the json-render
 * `Spec` contract narrows it to `VisibilityCondition`. The shape is
 * structurally compatible — anything our schema accepts is a valid Spec —
 * so this cast is the documented escape hatch. Centralized here so the
 * `as unknown as` pattern doesn't get sprinkled across callers.
 */
export const toSpec = (parsed: z.infer<typeof specSchema>): Spec =>
  parsed as unknown as Spec;
