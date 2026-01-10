import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import vue from "@astrojs/vue";
import { loadEnv } from "vite";

const vercelUrl =
	process.env.VERCEL_URL ||
	(process.env.NODE_ENV === "development"
		? loadEnv("development", process.cwd(), "").VERCEL_URL
		: undefined);

const isCI = process.env.CI === "true";

if (!vercelUrl && !isCI) {
	throw new Error(
		"VERCEL_URL is not configured. VERCEL_URL is automatically set by Vercel. For local development, set VERCEL_URL=http://localhost:4321 in your .env.local file.",
	);
}

// VERCEL_URL from Vercel is just the hostname (e.g., "stocktextalerts.com")
// Locally, it should include the protocol (e.g., "http://localhost:4321")
// In CI, use an explicit placeholder if VERCEL_URL is not available
const site = isCI && !vercelUrl
	? "https://placeholder.example.com"
	: vercelUrl!.startsWith("http://") || vercelUrl!.startsWith("https://")
		? vercelUrl!
		: `https://${vercelUrl!}`;

// https://astro.build/config
export default defineConfig({
    output: "server",
    adapter: vercel({
        // Enable if you later use edge middleware helpers; keep serverless for Supabase SSR consistency
        edgeMiddleware: false,
    }),

	site,

	integrations: [
		sitemap({}),
		vue(),
	],

	vite: {
		plugins: [tailwindcss()] as unknown as any,
		optimizeDeps: {
			include: ['vue', '@vueuse/core', 'fuse.js', 'libphonenumber-js'],
		},
	},
});
