import { getSnapshot } from '../../../../lib/share-store.ts';

/**
 * GET /api/share/[id]
 *
 * Returns the stored snapshot or 404. The snapshot is re-validated against
 * the schema on read; tampered files surface as 404.
 */
export const GET = async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params;
  const snapshot = await getSnapshot(id);
  if (!snapshot) {
    return new Response(JSON.stringify({ message: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Snapshots are immutable, so a long cache is safe; share URLs are
      // unguessable, so private/public has no privacy implication beyond
      // the URL itself.
      'cache-control': 'public, max-age=3600, immutable',
    },
  });
};
