'use client';

import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import type { Spec } from '@json-render/core';
import { Button, CopyIcon } from '@k8o/arte-odyssey';
import { useEffect, useMemo, useRef, useState } from 'react';
import { codeToHtml } from 'shiki';

type Props = {
  spec: Spec | null;
};

const COPY_FEEDBACK_MS = 2000;

type CodeState =
  | { kind: 'empty' }
  | { kind: 'ok'; value: string }
  | { kind: 'error'; message: string };

/**
 * Renders the current Spec as TSX, syntax-highlighted with Shiki. Updates
 * incrementally as the spec changes. The Copy button writes the raw TSX to
 * the clipboard and shows "Copied!" inline for a couple of seconds.
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
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

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

  useEffect(() => {
    const timer =
      copyState === 'idle'
        ? null
        : setTimeout(() => {
            setCopyState('idle');
          }, COPY_FEEDBACK_MS);
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [copyState]);

  const onCopy = async () => {
    if (code.kind !== 'ok') return;
    try {
      await navigator.clipboard.writeText(code.value);
      setCopyState('copied');
    } catch {
      // Permission revoked, document not focused, http (no clipboard API), …
      // Surface inline so the user knows to fall back to manual copy rather
      // than silently looking at unchanged button text.
      setCopyState('failed');
    }
  };

  const copyLabel =
    copyState === 'copied'
      ? 'Copied!'
      : copyState === 'failed'
        ? 'Copy failed'
        : 'Copy';

  if (code.kind === 'empty') {
    return (
      <div className="text-fg-subtle flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm">
          Generated TSX will appear here once you describe a UI.
        </p>
      </div>
    );
  }
  if (code.kind === 'error') {
    return (
      <p className="text-fg-mute p-6 text-sm" role="alert">
        Code generation paused: {code.message}
      </p>
    );
  }

  return (
    <div className="bg-bg-surface relative h-full">
      <div className="absolute top-3 right-3 z-10">
        <Button
          size="sm"
          variant="outlined"
          color="gray"
          onAction={onCopy}
          startIcon={<CopyIcon size="sm" />}
        >
          {copyLabel}
        </Button>
      </div>
      {/*
        Shiki output is HTML we generated ourselves from a string we
        generated ourselves; it never contains user-controlled content.
        Disabling dangerouslySetInnerHTML's lint here is the canonical
        Shiki integration.
      */}
      <div
        className="text-sm [&_pre]:overflow-auto [&_pre]:p-6"
        // oxlint-disable-next-line eslint(react/no-danger)
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
