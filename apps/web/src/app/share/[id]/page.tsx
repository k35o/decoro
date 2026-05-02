import { notFound } from 'next/navigation';

import { ShareView } from '../../../components/share-view.tsx';
import { getSnapshot } from '../../../lib/share-store.ts';

type Params = { id: string };

const SharePage = async ({ params }: { params: Promise<Params> }) => {
  const { id } = await params;
  const snapshot = await getSnapshot(id);
  if (!snapshot) notFound();
  return <ShareView snapshot={snapshot} />;
};

export default SharePage;
