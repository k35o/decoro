import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@decoro/adapter-arte-odyssey', '@decoro/adapter-spec'],
};

export default config;
