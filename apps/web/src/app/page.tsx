import { Heading } from '@k8o/arte-odyssey';

import { PreviewFrame } from '../components/preview-frame.tsx';
import { sampleSpec } from '../lib/sample-spec.ts';

const HomePage = () => (
  <div className="bg-bg-base text-fg-base flex h-dvh flex-col">
    <header className="border-border-mute border-b px-6 py-4">
      <Heading type="h1">Decoro</Heading>
    </header>
    <div className="flex flex-1 overflow-hidden">
      <section
        aria-label="Chat"
        className="border-border-mute w-1/2 border-r p-6"
      >
        <Heading type="h2">Chat</Heading>
        <p className="text-fg-mute mt-2">Conversation UI lands in M7.</p>
      </section>
      <section
        aria-label="Preview"
        className="flex w-1/2 flex-col overflow-hidden"
      >
        <div className="border-border-mute border-b px-6 py-4">
          <Heading type="h2">Preview</Heading>
        </div>
        <div className="flex-1 overflow-hidden">
          <PreviewFrame spec={sampleSpec} />
        </div>
      </section>
    </div>
  </div>
);

export default HomePage;
