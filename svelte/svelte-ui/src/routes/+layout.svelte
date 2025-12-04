<script lang="ts">
	import favicon from 'assets/favicon.png';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

// +layout.js
export const prerender = true;
export const ssr = false;
export const trailingSlash = 'never';