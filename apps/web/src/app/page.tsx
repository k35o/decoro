import { Heading } from '@k8o/arte-odyssey';

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
      <section aria-label="Preview" className="w-1/2 p-6">
        <Heading type="h2">Preview</Heading>
        <p className="text-fg-mute mt-2">
          The iframe-isolated preview lands in M5.
        </p>
      </section>
    </div>
  </div>
);

export default HomePage;
