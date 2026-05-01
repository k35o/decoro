import { ArteOdysseyProvider } from '@k8o/arte-odyssey';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Decoro',
  description:
    'AI tool for collaboratively creating UI in your own design system.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body>
      <ArteOdysseyProvider>{children}</ArteOdysseyProvider>
    </body>
  </html>
);

export default RootLayout;
