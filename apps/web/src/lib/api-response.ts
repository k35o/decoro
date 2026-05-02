/**
 * Standard JSON error response shape used across all `/api/*` routes.
 * Picked for consistency with the existing client expectations
 * (`useDecoroChat` already reads `data.message ?? data.error`).
 */
export const jsonError = (status: number, message: string): Response =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
