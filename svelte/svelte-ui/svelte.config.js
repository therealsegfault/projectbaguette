import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			fallback: 'index.html'
		}),
		paths: {
			base: process.env.NODE_ENV === 'production'
				? '/projectbaguette'
				: ''
		},
		prerender: {
			handleHttpError: 'ignore' // avoids 404 issues on GH pages
		}
	}
};

export default config;
