'use client';

import type { ReactNode } from 'react';

/**
 * Generic tab switcher matching ArteOdyssey's `Tabs` look (teal underline on
 * active, hover bg). Rolled by hand instead of using `Tabs.Root` because the
 * published `Tabs.Panel` returns `null` for the inactive tab — we need both
 * panels to stay mounted so the preview iframe's postMessage handshake
 * survives tab changes (see HomeShell + ShareView callers).
 */
export type TabItem<T extends string> = {
  id: T;
  label: string;
  icon: ReactNode;
};

type Props<T extends string> = {
  ariaLabel: string;
  tabs: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (next: T) => void;
};

export const TabSwitcher = <T extends string>({
  ariaLabel,
  tabs,
  value,
  onChange,
}: Props<T>) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className="border-border-subtle bg-bg-base flex gap-1 border-b px-3 pt-2"
  >
    {tabs.map((t) => {
      const active = value === t.id;
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => {
            onChange(t.id);
          }}
          className={[
            'relative flex cursor-pointer items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
            active
              ? 'text-primary-fg'
              : 'text-fg-mute hover:bg-primary-bg-subtle hover:text-primary-fg',
          ].join(' ')}
        >
          <span aria-hidden="true">{t.icon}</span>
          {t.label}
          {active ? (
            <span
              aria-hidden="true"
              className="bg-primary-border absolute right-0 -bottom-px left-0 h-0.5 rounded-full"
            />
          ) : null}
        </button>
      );
    })}
  </div>
);

/**
 * `< />` glyph for the Code tab. ArteOdyssey's icon set doesn't ship a
 * code/braces icon today; matches `size="sm"` (16px) to align with
 * ArteOdyssey icons in the same row.
 */
export const CodeBracketsIcon = () => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);
