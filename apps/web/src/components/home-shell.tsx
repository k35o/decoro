'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { ConversationRecord } from '../lib/conversation-types.ts';
import type { SnapshotRecord } from '../lib/share-types.ts';
import { toSpec } from '../lib/spec-schema.ts';
import { AppHeader } from './app-header.tsx';
import { ConversationsSidebar } from './conversations-sidebar.tsx';
import { HomeWorkspace, type WorkspaceSeed } from './home-workspace.tsx';

type Seed = WorkspaceSeed & {
  /** React key — bumping it remounts the workspace so the chat hook re-seeds. */
  key: string;
};

const FRESH_SEED: Seed = {
  key: 'fresh',
  initialState: null,
  conversationId: null,
};

type Props = {
  /**
   * Header tagline. Built by the server-side page from
   * `adapter.metadata.displayName` so this client component doesn't need
   * to import the adapter binding.
   */
  tagline: string;
};

/**
 * Top-level client shell for `/`. Owns the seed state for the chat
 * workspace (which conversation is loaded, or whether we're forking from
 * a share) and the conversation sidebar; delegates the actual chat /
 * preview / code rendering to `<HomeWorkspace />` so swapping seeds is
 * just a key bump.
 */
export const HomeShell = ({ tagline }: Props) => {
  const searchParams = useSearchParams();
  const fromShareId = searchParams.get('from');

  const [seed, setSeed] = useState<Seed>(FRESH_SEED);

  useEffect(() => {
    if (fromShareId === null || fromShareId === '') {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/share/${fromShareId}`);
        if (!res.ok) return;
        const snapshot = (await res.json()) as SnapshotRecord;
        // Cleanup may flip `cancelled` while the await is in flight; lint
        // narrows the literal `false` initializer and can't see that.
        // oxlint-disable-next-line typescript-eslint(no-unnecessary-condition)
        if (cancelled) return;
        setSeed({
          key: `from-share-${fromShareId}`,
          initialState: {
            messages: snapshot.messages,
            spec: toSpec(snapshot.spec),
          },
          // Forks deliberately do NOT inherit a conversation id — the
          // first save mints a new conversation row, leaving the source
          // share immutable.
          conversationId: null,
        });
      } catch {
        // Ignore failures; the user just sees a fresh workspace.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromShareId]);

  const handlePickConversation = (id: string) => {
    void (async () => {
      try {
        const res = await fetch(`/api/conversations/${id}`);
        if (!res.ok) return;
        const record = (await res.json()) as ConversationRecord;
        setSeed({
          key: `convo-${id}`,
          initialState: {
            messages: record.messages,
            spec: toSpec(record.spec),
          },
          conversationId: record.id,
        });
      } catch {
        // Ignore — sidebar's error path will show on next refresh.
      }
    })();
  };

  const handleNewConversation = () => {
    setSeed({ ...FRESH_SEED, key: `fresh-${Date.now().toString()}` });
  };

  return (
    <div className="bg-bg-surface text-fg-base flex h-dvh flex-col">
      <AppHeader tagline={tagline} />
      <main className="flex flex-1 gap-4 overflow-hidden p-4">
        <ConversationsSidebar
          activeId={seed.conversationId}
          onPickConversation={handlePickConversation}
          onNewConversation={handleNewConversation}
        />
        <div className="flex flex-1 gap-4 overflow-hidden">
          <HomeWorkspace key={seed.key} seed={seed} />
        </div>
      </main>
    </div>
  );
};
