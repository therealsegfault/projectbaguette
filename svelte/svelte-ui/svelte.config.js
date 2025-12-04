import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html'
    }),

    // GitHub Pages subpath support
    paths: {
      base: process.env.NODE_ENV === 'production' ? '/projectbaguette' : ''
    },

    prerender: {
      handleHttpError: 'warn'
    }
  }
};

export default config;
