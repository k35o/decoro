'use client';

import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import type { Spec } from '@json-render/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { codeToHtml } from 'shiki';

type Props = {
  spec: Spec | null;
};

const PLACEHOLDER = 'Generated TSX appears here.';

/**
 * Renders the current Spec as TSX, syntax-highlighted with Shiki. Updates
 * incrementally as the spec changes. M10 will add the copy-to-clipboard
 * button.
 */
export const CodePanel = ({ spec }: Props) => {
  const code = useMemo(
    () => (spec ? arteOdysseyAdapter.codeOutput.generate(spec) : ''),
    [spec],
  );
  const [html, setHtml] = useState('');

  const generationRef = useRef(0);
  useEffect(() => {
    if (code === '') {
      setHtml('');
      return;
    }
    const generation = ++generationRef.current;
    void (async () => {
      const result = await codeToHtml(code, {
        lang: 'tsx',
        theme: 'github-light',
      });
      if (generation === generationRef.current) setHtml(result);
    })();
  }, [code]);

  if (code === '') {
    return <p className="text-fg-mute p-4 text-sm">{PLACEHOLDER}</p>;
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
