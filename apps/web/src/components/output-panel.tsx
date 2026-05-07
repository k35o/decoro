'use client';

import type { Spec } from '@json-render/core';
import { ViewIcon } from '@k8o/arte-odyssey';
import { useState } from 'react';

import type { ChatMessage } from '../lib/chat-types.ts';
import { CodePanel } from './code-panel.tsx';
import { PreviewFrame } from './preview-frame.tsx';
import { PreviewPopoutButton } from './preview-popout-button.tsx';
import { ShareButton } from './share-button.tsx';
import {
  CodeBracketsIcon,
  type TabItem,
  TabSwitcher,
} from './tab-switcher.tsx';

type OutputTab = 'preview' | 'code';

const OUTPUT_TABS: ReadonlyArray<TabItem<OutputTab>> = [
  { id: 'preview', label: 'Preview', icon: <ViewIcon size="sm" /> },
  { id: 'code', label: 'Code', icon: <CodeBracketsIcon /> },
];

type Props = {
  spec: Spec | null;
  chatMessages: ChatMessage[];
  isStreaming: boolean;
};

/**
 * Right-pane shell: tab switcher (Preview / Code), the popout button when
 * Preview is active, and the Share button. Both tab contents are kept
 * mounted via `hidden` so the iframe's BroadcastChannel subscription
 * (and any popped-out window) survives tab switches.
 *
 * Lives in its own module so HomeWorkspace stays under the
 * max-dependencies lint cap.
 */
export const OutputPanel = ({ spec, chatMessages, isStreaming }: Props) => {
  const [tab, setTab] = useState<OutputTab>('preview');
  return (
    <section
      aria-label="Output"
      className="bg-bg-base flex flex-1 flex-col overflow-hidden rounded-xl shadow-sm"
    >
      <div className="border-border-subtle flex items-center justify-between border-b px-2 py-1">
        <TabSwitcher
          ariaLabel="Output"
          tabs={OUTPUT_TABS}
          value={tab}
          onChange={setTab}
        />
        <div className="flex items-center gap-1">
          {tab === 'preview' ? <PreviewPopoutButton /> : null}
          <ShareButton
            spec={spec}
            messages={chatMessages}
            isStreaming={isStreaming}
          />
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div hidden={tab !== 'preview'} className="h-full">
          <PreviewFrame />
        </div>
        <div hidden={tab !== 'code'} className="h-full overflow-auto">
          <CodePanel spec={spec} />
        </div>
      </div>
    </section>
  );
};
