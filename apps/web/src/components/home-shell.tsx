'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

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
 *
 * URL is the source of truth for which conversation is active:
 * - `/` → fresh chat
 * - `/?conversation=<id>` → resume conversation `<id>`
 * - `/?from=<shareId>` → fork from share `<shareId>` (becomes
 *   `/?conversation=<newId>` after the first save mints a row)
 *
 * That makes refresh, browser back, and bookmarking behave the way
 * users expect.
 */
export const HomeShell = ({ tagline }: Props) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromShareId = searchParams.get('from');
  const conversationParam = searchParams.get('conversation');

  const [seed, setSeed] = useState<Seed>(FRESH_SEED);
  // Latest active conversation id seen in render — used to short-circuit
  // the resume effect when a URL change came from `router.replace` we
  // ourselves issued (e.g. after the chat hook minted a row up front).
  // Without this, the URL change would fire the resume effect, re-fetch
  // the freshly-created (still single-message) row, and clobber the
  // in-progress chat.
  const activeConversationIdRef = useRef<string | null>(seed.conversationId);
  activeConversationIdRef.current = seed.conversationId;

  // Resume an existing conversation when the URL points at one.
  useEffect(() => {
    if (conversationParam === null || conversationParam === '') {
      return undefined;
    }
    if (activeConversationIdRef.current === conversationParam) {
      // We already have this conversation loaded (most commonly: the
      // chat hook just created the row and bumped the URL). No re-fetch
      // needed.
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationParam}`);
        if (!res.ok) return;
        const record = (await res.json()) as ConversationRecord;
        // oxlint-disable-next-line typescript-eslint(no-unnecessary-condition)
        if (cancelled) return;
        setSeed({
          key: `convo-${conversationParam}`,
          initialState: {
            messages: record.messages,
            spec: toSpec(record.spec),
          },
          conversationId: record.id,
        });
      } catch {
        // Ignore failures; the user just sees a fresh workspace.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationParam]);

  // Fork from a share — `?from=<shareId>` seeds a brand-new conversation.
  // `?conversation=` takes precedence over `?from=` so a saved fork's URL
  // resolves to the conversation, not the original share.
  useEffect(() => {
    if (conversationParam !== null && conversationParam !== '') {
      return undefined;
    }
    if (fromShareId === null || fromShareId === '') {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/share/${fromShareId}`);
        if (!res.ok) return;
        const snapshot = (await res.json()) as SnapshotRecord;
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
  }, [conversationParam, fromShareId]);

  const handlePickConversation = useCallback(
    (id: string) => {
      router.replace(`/?conversation=${id}`);
    },
    [router],
  );

  const handleNewConversation = useCallback(() => {
    setSeed({ ...FRESH_SEED, key: `fresh-${Date.now().toString()}` });
    router.replace('/');
  }, [router]);

  const handleConversationCreated = useCallback(
    (id: string) => {
      // The chat hook just persisted a brand-new row. Two things have to
      // happen: reflect the id in the URL (so refresh / bookmark / share
      // works), AND update `seed.conversationId` so the resume effect
      // sees the URL change as one we initiated and skips the re-fetch
      // that would clobber the in-progress chat. Same key — we do NOT
      // want HomeWorkspace to remount.
      setSeed((prev) => ({ ...prev, conversationId: id }));
      router.replace(`/?conversation=${id}`);
    },
    [router],
  );

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
          <HomeWorkspace
            key={seed.key}
            seed={seed}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </main>
    </div>
  );
};
