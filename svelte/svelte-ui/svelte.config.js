import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.argv.includes('dev');

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    // GitHub Pages needs a static build + a fallback index.html for routing
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html'
    }),

    // Base path for GitHub Pages publishing
    paths: {
      base: dev ? '' : '/projectbaguette'
    },

    // Prevent SvelteKit from changing the build dir name
    appDir: 'app',

    // Pretty URLs fine on GH Pages
    trailingSlash: 'ignore'
  }
};

export default config;
