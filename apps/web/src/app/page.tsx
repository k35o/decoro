import { Suspense } from 'react';

import { adapter } from '../../decoro.config.ts';
import { HomeShell } from '../components/home-shell.tsx';

// HomeShell uses `useSearchParams` to read `?conversation=` and
// `?from=`, which forces a client-side bailout during static
// generation. The Suspense boundary is what tells Next.js to render
// the fallback during prerender and hydrate the search-params-aware
// shell on the client. Without it, `next build` fails with
// "useSearchParams() should be wrapped in a suspense boundary."
const HomePage = () => (
  <Suspense fallback={null}>
    <HomeShell
      tagline={`AI UI generation for ${adapter.metadata.displayName}`}
    />
  </Suspense>
);

export default HomePage;
