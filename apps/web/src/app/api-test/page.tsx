'use client';

import { Button, Heading } from '@k8o/arte-odyssey';
import { useState } from 'react';

/**
 * Throwaway smoke-test page for the /api/generate endpoint added in M6. Posts
 * a short prompt, streams the response back, and dumps the raw JSONL stream
 * plus the parsed Spec patches into the page so we can confirm the LLM is
 * wired up before the proper chat UI lands in M7.
 *
 * Delete (or repurpose) once M7 ships.
 */
const ApiTestPage = () => {
  const [prompt, setPrompt] = useState('Build a primary submit button');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const append = (line: string) => {
    setLog((prev) => [...prev, line]);
  };

  const run = async () => {
    setLog([]);
    setBusy(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok || !res.body) {
        append(`HTTP ${res.status.toString()}: ${await res.text()}`);
        return;
      }
      // Async iteration over the byte stream is the canonical pattern; each
      // chunk inherently waits for the previous one, so a sequential await
      // here is intentional rather than a serialised parallel.
      for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
        append(chunk);
      }
      append('--- stream complete ---');
    } catch (err) {
      append(`exception: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-bg-base text-fg-base min-h-dvh space-y-4 p-6">
      <Heading type="h1">/api/generate smoke test</Heading>
      <textarea
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
        }}
        className="border-border-mute w-full rounded border p-2"
        rows={3}
      />
      <Button onAction={run} disabled={busy}>
        {busy ? 'Streaming…' : 'Generate'}
      </Button>
      <pre className="bg-bg-surface text-fg-mute max-h-96 overflow-auto rounded p-3 text-xs">
        {log.join('') || '(no output yet)'}
      </pre>
    </div>
  );
};

export default ApiTestPage;
