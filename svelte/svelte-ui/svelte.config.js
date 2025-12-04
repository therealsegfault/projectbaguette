import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      strict: false       // don't complain about "dynamic routes"
    }),

    // GitHub Pages: repo is /projectbaguette so base must match
    paths: {
      base: process.env.NODE_ENV === 'production' ? '/projectbaguette' : ''
    }
  }
};

export default config;
