/**
 * Hosts the `/preview` route in an iframe so the adapter's style space
 * stays isolated from Decoro's own UI (ADR-006).
 *
 * Spec sync runs over a BroadcastChannel rather than parent↔iframe
 * postMessage — see `lib/use-preview-broadcast.ts`. Both the embedded
 * iframe and any popped-out preview window subscribe to the same
 * channel, so this component just renders the iframe and otherwise has
 * nothing to wire up.
 */
export const PreviewFrame = () => (
  // The iframe exists for style-space isolation (ADR-006), not for security
  // sandboxing — both sides are first-party Decoro routes, so an HTML
  // sandbox would only obstruct messaging without buying anything.
  // oxlint-disable-next-line react/iframe-missing-sandbox
  <iframe
    src="/preview"
    title="Decoro preview"
    className="size-full border-0"
  />
);
