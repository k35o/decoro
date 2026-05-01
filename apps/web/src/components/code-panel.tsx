'use client';

import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import type { Spec } from '@json-render/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { codeToHtml } from 'shiki';

type Props = {
  spec: Spec | null;
};

const PLACEHOLDER = 'Generated TSX appears here.';

type CodeState =
  | { kind: 'empty' }
  | { kind: 'ok'; value: string }
  | { kind: 'error'; message: string };

/**
 * Renders the current Spec as TSX, syntax-highlighted with Shiki. Updates
 * incrementally as the spec changes. M10 will add the copy-to-clipboard
 * button.
 *
 * Streaming sometimes hands us an inconsistent intermediate spec — a child
 * key that hasn't landed yet, an unknown component type, or (theoretically)
 * a cycle. The adapter's `generate` throws in those cases; we catch here so
 * the failure stays scoped to this panel and the live preview / chat keep
 * running.
 */
export const CodePanel = ({ spec }: Props) => {
  const code = useMemo<CodeState>(() => {
    if (spec === null) return { kind: 'empty' };
    try {
      const value = arteOdysseyAdapter.codeOutput.generate(spec);
      return value === '' ? { kind: 'empty' } : { kind: 'ok', value };
    } catch (err) {
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }, [spec]);
  const [html, setHtml] = useState('');

  const generationRef = useRef(0);
  useEffect(() => {
    if (code.kind !== 'ok') {
      setHtml('');
      return;
    }
    const source = code.value;
    const generation = ++generationRef.current;
    void (async () => {
      const result = await codeToHtml(source, {
        lang: 'tsx',
        theme: 'github-light',
      });
      if (generation === generationRef.current) setHtml(result);
    })();
  }, [code]);

  if (code.kind === 'empty') {
    return <p className="text-fg-mute p-4 text-sm">{PLACEHOLDER}</p>;
  }
  if (code.kind === 'error') {
    return (
      <p className="text-fg-mute p-4 text-sm" role="alert">
        Code generation paused: {code.message}
      </p>
    );
  }

  // Shiki output is HTML we generated ourselves from a string we generated
  // ourselves; it never contains user-controlled content. Disabling
  // dangerouslySetInnerHTML's lint here is the canonical Shiki integration.
  return (
    <div
      className="text-sm [&_pre]:overflow-auto [&_pre]:p-4"
      // oxlint-disable-next-line eslint(react/no-danger)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
