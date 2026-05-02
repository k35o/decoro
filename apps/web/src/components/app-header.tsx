import { Heading, SparklesIcon } from '@k8o/arte-odyssey';
import type { ReactNode } from 'react';

type Props = {
  /** Tagline shown next to the wordmark. */
  tagline: string;
  /** Right-aligned slot — Share button on `/`, "Open Decoro" link on `/share/[id]`. */
  rightSlot?: ReactNode;
};

/**
 * Brand chrome shared by `/` (HomeShell) and `/share/[id]` (ShareView).
 * The wordmark + SparklesIcon are fixed; tagline and right-slot vary per page.
 */
export const AppHeader = ({ tagline, rightSlot }: Props) => (
  <header className="bg-bg-base border-border-subtle flex items-center justify-between border-b px-6 py-4">
    <div className="flex items-center gap-3">
      <span className="text-primary-fg" aria-hidden="true">
        <SparklesIcon size="lg" />
      </span>
      <div className="flex items-baseline gap-3">
        <Heading type="h1">Decoro</Heading>
        <p className="text-fg-mute text-sm">{tagline}</p>
      </div>
    </div>
    {rightSlot}
  </header>
);
